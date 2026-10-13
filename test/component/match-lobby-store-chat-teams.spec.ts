import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import fs from "node:fs";
import path from "node:path";

// Regression for the production bug where Team Chat never appeared: the store
// used chatTeams / chatTeamsLoaded without declaring or returning them, and
// every earlier test replaced the store with a mock, so nothing noticed. These
// tests use the REAL MatchLobbyStore; only the network client and the signed-in
// user are faked.

const mocks = vi.hoisted(() => ({
  auth: null as any,
  queries: [] as any[],
  listeners: [] as Array<{ next: (v: any) => void; error: (e: any) => void }>,
  unsubscribed: 0,
}));

vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    subscribe: ({ query }: { query: any }) => {
      mocks.queries.push(query);
      return {
        subscribe: (observer: any) => {
          mocks.listeners.push(observer);
          return {
            unsubscribe: () => {
              mocks.unsubscribed++;
            },
          };
        },
      };
    },
  }),
}));
vi.mock("~/composables/useHubState", () => ({
  setActiveHub: vi.fn(),
  currentHub: () => "chat",
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/utilities/teamAvatar", () => ({
  default: (team: { avatar_url?: string | null } | null | undefined) =>
    team?.avatar_url ? `https://api.test/${team.avatar_url}` : null,
}));

import { useMatchLobbyStore } from "../../stores/MatchLobbyStore";
import { useSubscriptionManager } from "../../composables/useSubscriptionManager";
import { useChatTabs } from "../../composables/useChatTabs";
import { useChatTabSetup } from "../../composables/useChatTabSetup";
import {
  findChatTeam,
  formatTeamChatUnread,
  teamChatTabId,
  unhideTeamChat,
} from "../../composables/useTeamChatRoom";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const TRICON = "76561198029293543";
const ADMIN_TEAM = {
  id: "dc480251-9396-4b29-89a3-4295a0b83bef",
  name: "ADMIN",
  short_name: "ADMIN",
  avatar_url: null,
};

const sentText = (query: any) =>
  String(query?.loc?.source?.body ?? query?.loc?.source ?? query);

beforeEach(() => {
  mocks.queries.length = 0;
  mocks.listeners.length = 0;
  mocks.unsubscribed = 0;
  mocks.auth = reactive({
    me: { steam_id: TRICON },
    isRoleAbove: () => false,
  });
  setActivePinia(createPinia());
  useSubscriptionManager().unsubscribeAll();
  localStorage.clear();
  unhideTeamChat(ADMIN_TEAM.id);
  useChatTabs().clearAll();
  mocks.unsubscribed = 0;
});

describe("real MatchLobbyStore: chatTeams", () => {
  it("declares and returns chatTeams and chatTeamsLoaded", () => {
    const store = useMatchLobbyStore();
    expect(store.chatTeams).toEqual([]);
    expect(store.chatTeamsLoaded).toBe(false);
    expect(typeof store.subscribeToChatTeams).toBe("function");
  });

  it("every state name the store assigns is declared and returned", () => {
    const src = read("stores/MatchLobbyStore.ts").replace(/\r\n/g, "\n");
    for (const name of ["chatTeams", "chatTeamsLoaded"]) {
      expect(src).toMatch(new RegExp(`const ${name} = ref`));
      expect(src).toMatch(new RegExp(`\\n    ${name},\\n`));
    }
  });

  it("subscribes for the signed-in player's own teams (owner or roster)", async () => {
    await useMatchLobbyStore().subscribeToChatTeams();
    expect(mocks.queries).toHaveLength(1);
    const query = sentText(mocks.queries[0]);
    expect(query).toContain("subscription");
    expect(query).toContain("teams");
    expect(query).toContain("owner_steam_id");
    expect(query).toContain("roster");
    expect(query).toContain("player_steam_id");
    expect(query).toContain(TRICON);
    for (const field of ["id", "name", "short_name", "avatar_url"])
      expect(query).toContain(field);
  });

  it("an ADMIN team payload populates chatTeams and marks it loaded", async () => {
    const store = useMatchLobbyStore();
    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });

    expect(store.chatTeams).toEqual([ADMIN_TEAM]);
    expect(store.chatTeamsLoaded).toBe(true);
    expect(findChatTeam(store.chatTeams, ADMIN_TEAM.id)).toEqual(ADMIN_TEAM);
  });

  it("an empty answer is a confirmed 'no teams', and updates replace the list", async () => {
    const store = useMatchLobbyStore();
    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [] } });
    expect(store.chatTeams).toEqual([]);
    expect(store.chatTeamsLoaded).toBe(true);
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });
    mocks.listeners[0].next({ data: undefined });
    expect(store.chatTeams).toEqual([]);
  });

  it("a subscription error is logged, never thrown, and leaves the list untouched", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = useMatchLobbyStore();
    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });
    expect(() => mocks.listeners[0].error(new Error("boom"))).not.toThrow();
    expect(store.chatTeams).toEqual([ADMIN_TEAM]);
    spy.mockRestore();
  });

  it("does nothing without a signed-in player", async () => {
    mocks.auth.me = undefined;
    const store = useMatchLobbyStore();
    await store.subscribeToChatTeams();
    expect(mocks.queries).toHaveLength(0);
    expect(store.chatTeamsLoaded).toBe(false);
  });

  it("resubscribing replaces the old subscription and starts clean for a new sign-in", async () => {
    const store = useMatchLobbyStore();
    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });

    mocks.auth.me = { steam_id: "76561190000000002" };
    await store.subscribeToChatTeams();
    expect(mocks.unsubscribed).toBe(1);
    expect(store.chatTeams).toEqual([]);
    expect(store.chatTeamsLoaded).toBe(false);
    expect(sentText(mocks.queries[1])).toContain("76561190000000002");
  });

  it("is started with the other post-sign-in subscriptions", () => {
    const auth = read("stores/AuthStore.ts");
    expect(auth).toContain("useMatchLobbyStore().subscribeToChatTeams();");
  });
});

describe("real MatchLobbyStore + useChatTabSetup + team page", () => {
  const mountSetup = () =>
    mount(
      defineComponent({
        setup() {
          useChatTabSetup();
          return () => h("div");
        },
      }),
    );
  const teamTabs = () =>
    useChatTabs().tabs.value.filter((tab) => tab.type === "team");

  it("creates the ADMIN Team Chat room once the subscription answers", async () => {
    const store = useMatchLobbyStore();
    const wrapper = mountSetup();
    await flushPromises();
    expect(teamTabs()).toHaveLength(0);

    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });
    await flushPromises();

    expect(teamTabs()).toEqual([
      expect.objectContaining({
        id: teamChatTabId(ADMIN_TEAM.id),
        label: "ADMIN",
        type: "team",
        instance: "team",
        lobbyId: ADMIN_TEAM.id,
        pinned: false,
      }),
    ]);
    wrapper.unmount();
  });

  it("the team page's Chat entry becomes available, with the room's own unread count", async () => {
    const store = useMatchLobbyStore();
    // Exactly what pages/teams/[id].vue computes.
    const entry = () => findChatTeam(store.chatTeams, ADMIN_TEAM.id);
    expect(entry()).toBeNull();

    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });
    expect(entry()).toEqual(ADMIN_TEAM);

    const chat = useChatTabs();
    chat.incrementUnread(teamChatTabId(ADMIN_TEAM.id));
    chat.incrementUnread(teamChatTabId(ADMIN_TEAM.id));
    expect(
      formatTeamChatUnread(chat.unreadCounts.value[teamChatTabId(ADMIN_TEAM.id)]),
    ).toBe("2");

    const page = read("pages/teams/[id].vue");
    expect(page).toContain(
      "findChatTeam(useMatchLobbyStore().chatTeams, this.team?.id)",
    );
  });

  it("a player on no team gets no room and no Chat entry", async () => {
    const store = useMatchLobbyStore();
    const wrapper = mountSetup();
    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [] } });
    await flushPromises();
    expect(teamTabs()).toHaveLength(0);
    expect(findChatTeam(store.chatTeams, ADMIN_TEAM.id)).toBeNull();
    wrapper.unmount();
  });

  it("leaving the team removes the room; joining another adds it", async () => {
    const other = { ...ADMIN_TEAM, id: "22222222-2222-4222-8222-222222222222", name: "Bravo" };
    const store = useMatchLobbyStore();
    const wrapper = mountSetup();
    await store.subscribeToChatTeams();
    mocks.listeners[0].next({ data: { teams: [ADMIN_TEAM] } });
    await flushPromises();
    expect(teamTabs().map((tab) => tab.label)).toEqual(["ADMIN"]);

    mocks.listeners[0].next({ data: { teams: [other] } });
    await flushPromises();
    expect(teamTabs().map((tab) => tab.label)).toEqual(["Bravo"]);
    wrapper.unmount();
  });
});
