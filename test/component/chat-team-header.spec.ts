import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, onMounted, reactive } from "vue";
import { createMemoryHistory, createRouter, RouterLink } from "vue-router";
import fs from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  matchLobbyStore: null as any,
  route: { params: {} as Record<string, string>, query: {} as any, fullPath: "/" },
  routerPush: vi.fn(),
  emptyComponent: async () => {
    const { defineComponent, h } = await import("vue");
    return { default: defineComponent({ setup: () => () => h("div") }) };
  },
}));

vi.mock("~/composables/useHubState", () => ({
  setActiveHub: vi.fn(),
  currentHub: () => "chat",
}));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => mocks.matchLobbyStore,
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("#app", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({
    resolve: () => ({ href: "/chat/x" }),
    push: mocks.routerPush,
  }),
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: { steam_id: "1" }, isRoleAbove: () => false }),
}));
vi.mock("@vue/apollo-composable", () => ({ useApolloClient: () => ({}) }));
vi.mock("~/utilities/teamAvatar", () => ({
  default: (team: { avatar_url?: string | null } | null | undefined) =>
    team?.avatar_url ? `https://api.test/${team.avatar_url}` : null,
}));
vi.mock("~/components/chat/ChatLobby.vue", mocks.emptyComponent);
vi.mock("~/components/chat/ChatParticipantsList.vue", mocks.emptyComponent);
vi.mock("~/components/LiveAvatarImg.vue", mocks.emptyComponent);
vi.mock(
  "~/components/matchmaking-lobby/LobbyCallPanel.vue",
  mocks.emptyComponent,
);
vi.mock("~/composables/useTournamentWebcamStatus", async () => {
  const vue = await import("vue");
  return { useTournamentWebcamStatus: () => ({ participants: vue.ref([]) }) };
});
vi.mock("~/composables/useIncomingDirectMessages", () => ({
  markDirectMessagesRead: vi.fn(),
}));

import ChatPanel from "../../components/hub/ChatPanel.vue";
import ChatTeamProfileLink from "../../components/chat/ChatTeamProfileLink.vue";
import { useChatTabs } from "../../composables/useChatTabs";
import { useDockShortcutPrefs } from "../../composables/useDockShortcutPrefs";
import {
  hideTeamChat,
  isTeamChatHidden,
  openTeamChatRoom,
  teamChatTab,
  teamChatTabId,
  unhideTeamChat,
} from "../../composables/useTeamChatRoom";
import {
  MOBILE_CHAT_HUB_QUERY,
  useRightSidebar,
} from "../../composables/useRightSidebar";

const read = (p: string) =>
  fs
    .readFileSync(path.resolve(__dirname, "../..", p), "utf8")
    .replace(/\r\n/g, "\n");

const TEAM = {
  id: "dc480251-9396-4b29-89a3-4295a0b83bef",
  name: "ADMIN",
  short_name: "ADM",
  avatar_url: "avatars/teams/admin.png",
};

function makeRouter() {
  const Blank = defineComponent({ render: () => null });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "index", component: Blank },
      { path: "/teams/:id", name: "teams-id", component: Blank },
      { path: "/players/:id", name: "players-id", component: Blank },
    ],
  });
}

function setViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === MOBILE_CHAT_HUB_QUERY ? mobile : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

const PassThrough = defineComponent({
  setup: (_p, { slots }) => () => h("div", slots.default?.()),
});

async function mountLink(props: Record<string, unknown> = {}) {
  const router = makeRouter();
  await router.push("/");
  await router.isReady();
  const wrapper = mount(ChatTeamProfileLink, {
    attachTo: document.body,
    props: {
      teamId: TEAM.id,
      name: "ADMIN",
      subtitle: "chat_room_subtitles.team",
      avatarUrl: "https://api.test/avatars/teams/admin.png",
      ...props,
    },
    global: { plugins: [router], components: { NuxtLink: RouterLink } },
  });
  return { wrapper, router };
}

beforeEach(() => {
  localStorage.clear();
  setViewport(false);
  useChatTabs().clearAll();
  unhideTeamChat(TEAM.id);
  useRightSidebar().setRightSidebarOpen(false);
  mocks.matchLobbyStore = reactive({ myMatches: [], lobbyChat: {} });
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useAuthStore", () => ({
    me: { steam_id: "1" },
    isRoleAbove: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  useRightSidebar().setRightSidebarOpen(false);
});

describe("Team Chat header: ChatTeamProfileLink", () => {
  it("links the logo and the name to the team page by the team's id", async () => {
    const { wrapper } = await mountLink();
    const name = wrapper.get('[data-testid="chat-team-profile-link"]');
    const logo = wrapper.get('[data-testid="chat-team-profile-avatar"]');
    expect(name.element.tagName).toBe("A");
    expect(logo.element.tagName).toBe("A");
    expect(name.attributes("href")).toBe(`/teams/${TEAM.id}`);
    expect(logo.attributes("href")).toBe(`/teams/${TEAM.id}`);
    expect(name.attributes("aria-label")).toBe("View ADMIN team page");
    expect(name.text()).toBe("ADMIN");
    wrapper.unmount();
  });

  it("keeps resolving after the team is renamed: the id is the link, not the name", async () => {
    const { wrapper } = await mountLink({ name: "ADMIN Prime" });
    expect(
      wrapper.get('[data-testid="chat-team-profile-link"]').attributes("href"),
    ).toBe(`/teams/${TEAM.id}`);
    expect(wrapper.html()).not.toContain("/teams/ADMIN");
    wrapper.unmount();
  });

  it("keeps the Team Chat subtitle outside the link", async () => {
    const { wrapper } = await mountLink();
    expect(wrapper.text()).toContain("chat_room_subtitles.team");
    expect(
      wrapper.get('[data-testid="chat-team-profile-link"]').text(),
    ).not.toContain("chat_room_subtitles");
    wrapper.unmount();
  });

  it("uses the same hover as the private-message header: amber name with underline, amber logo ring", async () => {
    const { wrapper } = await mountLink();
    const name = wrapper.get('[data-testid="chat-team-profile-link"]');
    const logo = wrapper.get('[data-testid="chat-team-profile-avatar"]');
    expect(name.classes()).toEqual(
      expect.arrayContaining([
        "hover:text-[hsl(var(--tac-amber))]",
        "hover:underline",
        "focus-visible:ring-2",
        "focus-visible:ring-[hsl(var(--tac-amber))]",
      ]),
    );
    expect(logo.classes()).toContain("hover:ring-2");
    // No card, tooltip or block highlight to get stuck.
    expect(read("components/chat/ChatTeamProfileLink.vue")).not.toMatch(
      /Tooltip|Popover|HoverCard|hover:bg-/,
    );
    wrapper.unmount();
  });

  it("is one keyboard stop and focusable with a visible focus state", async () => {
    const { wrapper, router } = await mountLink();
    const logo = wrapper.get('[data-testid="chat-team-profile-avatar"]');
    const name = wrapper.get('[data-testid="chat-team-profile-link"]');
    expect(logo.attributes("tabindex")).toBe("-1");
    expect(logo.attributes("aria-hidden")).toBe("true");
    expect(name.attributes("tabindex")).toBeUndefined();
    (name.element as HTMLAnchorElement).focus();
    expect(document.activeElement).toBe(name.element);
    (name.element as HTMLAnchorElement).click(); // what Enter does on a link
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/teams/${TEAM.id}`);
    wrapper.unmount();
  });

  it("clicking either opens the team page and does nothing else", async () => {
    const { wrapper, router } = await mountLink();
    const tabs = useChatTabs();
    tabs.openTab(teamChatTab(TEAM), { setActive: false });
    const before = JSON.stringify(tabs.tabs.value);
    const prefs = JSON.stringify(useDockShortcutPrefs().prefs.value);

    await wrapper
      .get('[data-testid="chat-team-profile-avatar"]')
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/teams/${TEAM.id}`);
    await router.push("/");
    await wrapper
      .get('[data-testid="chat-team-profile-link"]')
      .trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(`/teams/${TEAM.id}`);
    expect(wrapper.emitted("navigate")).toHaveLength(2);

    // No room closed, pinned, hidden or reordered by the navigation.
    expect(JSON.stringify(tabs.tabs.value)).toBe(before);
    expect(JSON.stringify(useDockShortcutPrefs().prefs.value)).toBe(prefs);
    expect(isTeamChatHidden(TEAM.id)).toBe(false);
    wrapper.unmount();
  });

  it("closes the hub first on a phone and leaves it open on desktop", async () => {
    useRightSidebar().setRightSidebarOpen(true);
    let { wrapper } = await mountLink();
    await wrapper
      .get('[data-testid="chat-team-profile-link"]')
      .trigger("click");
    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    wrapper.unmount();

    setViewport(true);
    ({ wrapper } = await mountLink());
    await wrapper
      .get('[data-testid="chat-team-profile-link"]')
      .trigger("click");
    expect(useRightSidebar().rightSidebarOpen.value).toBe(false);
    wrapper.unmount();
  });

  it("shows the logo exactly as uploaded: no frame, ring, tile or crop", async () => {
    const { wrapper } = await mountLink();
    const logo = wrapper.get('[data-testid="chat-team-profile-avatar"]');
    const img = logo.get("img");
    expect(img.attributes("src")).toBe(
      "https://api.test/avatars/teams/admin.png",
    );
    expect(img.classes()).toContain("object-contain");
    expect(img.classes()).not.toContain("object-cover");
    expect(logo.classes().join(" ")).not.toMatch(
      /(^| )ring-1|ring-inset|border|bg-zinc/,
    );
    expect(logo.classes()).toContain("bg-transparent");
    wrapper.unmount();
  });

  it("falls back to the team's initials when there is no logo", async () => {
    const { wrapper } = await mountLink({
      avatarUrl: undefined,
      name: "Bravo",
    });
    expect(
      wrapper.get('[data-testid="chat-team-profile-avatar"]').text(),
    ).toBe("BR");
    wrapper.unmount();
  });
});

describe("Team Chat in the hub panel", () => {
  const mountPanel = async () => {
    const router = makeRouter();
    await router.push("/");
    await router.isReady();
    return mount(ChatPanel, {
      props: { isSidebarOpen: true, isTabActive: true },
      global: {
        plugins: [router],
        components: { NuxtLink: RouterLink },
        stubs: {
          Tooltip: PassThrough,
          TooltipProvider: PassThrough,
          TooltipTrigger: PassThrough,
          TooltipContent: PassThrough,
          Empty: PassThrough,
          ChatMatchHeader: true,
        },
        mocks: { $t: (key: string) => key },
      },
    });
  };
  const globalTab = {
    id: "global",
    label: "Global",
    instance: "global",
    type: "global" as const,
    lobbyId: "global",
    pinned: true,
  };

  it("shows a linked team logo and name in the header when a team room is open", async () => {
    const chat = useChatTabs();
    chat.openTab(teamChatTab(TEAM), { setActive: false });
    chat.openTab(globalTab, { setActive: false });
    const wrapper = await mountPanel();
    chat.setActiveTab(teamChatTabId(TEAM.id));
    await flushPromises();

    const link = wrapper.get('[data-testid="chat-team-profile-link"]');
    expect(link.attributes("href")).toBe(`/teams/${TEAM.id}`);
    expect(link.text()).toBe("ADMIN");
    expect(wrapper.text()).toContain("chat_room_subtitles.team");
    wrapper.unmount();
  });

  it("other rooms keep their plain title, with no team link", async () => {
    const chat = useChatTabs();
    chat.openTab(globalTab, { setActive: true });
    const wrapper = await mountPanel();
    await flushPromises();
    expect(
      wrapper.find('[data-testid="chat-team-profile-link"]').exists(),
    ).toBe(false);
    wrapper.unmount();
  });

  it("the rail shows the logo itself, with no tile, ring or crop of our own", async () => {
    const chat = useChatTabs();
    chat.openTab(teamChatTab(TEAM), { setActive: false });
    const wrapper = await mountPanel();
    await flushPromises();
    const button = wrapper.get(`[data-chat-tab-id="${teamChatTabId(TEAM.id)}"]`);
    const img = button.get("img");
    expect(img.classes()).toEqual(
      expect.arrayContaining(["w-7", "h-7", "object-contain"]),
    );
    expect(img.classes()).not.toContain("object-cover");
    expect(img.element.parentElement).toBe(button.element);
    expect(button.html()).not.toMatch(/ring-inset|bg-zinc-900\/80/);
    wrapper.unmount();
  });

  it("closing the room still hides it, and the team page entry reopens it", async () => {
    const chat = useChatTabs();
    chat.openTab(teamChatTab(TEAM), { setActive: false });
    const wrapper = await mountPanel();
    await flushPromises();
    hideTeamChat(TEAM.id);
    chat.closeTab(teamChatTabId(TEAM.id));
    expect(chat.tabs.value.some((tab) => tab.type === "team")).toBe(false);

    openTeamChatRoom(TEAM);
    await flushPromises();
    expect(isTeamChatHidden(TEAM.id)).toBe(false);
    expect(
      chat.tabs.value.filter((tab) => tab.id === teamChatTabId(TEAM.id)),
    ).toHaveLength(1);
    expect(chat.activeTabId.value).toBe(teamChatTabId(TEAM.id));
    wrapper.unmount();
  });

  it("the dock shortcut is still a default team room, shows the logo uncropped, and unpin/repin still work", () => {
    const hub = read("layouts/components/RightHub.vue");
    expect(hub).toMatch(
      /v-else-if="tab\.type === 'team' && tab\.avatarUrl"[\s\S]*?object-contain/,
    );
    const prefs = useDockShortcutPrefs();
    const id = teamChatTabId(TEAM.id);
    prefs.prefs.value.dismissed = {};
    prefs.prefs.value.pinned = [];
    prefs.prefs.value.maxRooms = 2;
    expect(prefs.isOnDock(id, true)).toBe(true);
    prefs.togglePin(id, true, true);
    expect(prefs.isOnDock(id, true)).toBe(false);
    prefs.togglePin(id, true, true);
    expect(prefs.isOnDock(id, true)).toBe(true);
  });
});

describe("team page Chat entry typography", () => {
  const page = read("pages/teams/[id].vue");
  const trigger = read("components/ui/tabs/TabsTrigger.vue");
  const entryClasses = () =>
    /const teamChatEntryClasses =\s*"([^"]+)"/.exec(page)![1];

  it("uses exactly the TabsTrigger base classes, so it looks like Overview, Matches, Stats, Map Veto and Highlights", () => {
    const base = /cn\(\s*'([^']+)'/.exec(trigger)![1].split(/\s+/);
    // The tab's own classes minus the disabled and active-state ones.
    const expected = base.filter(
      (cls) =>
        !cls.startsWith("disabled:") && !cls.startsWith("data-[state=active]"),
    );
    expect(entryClasses().split(/\s+/).sort()).toEqual(expected.sort());
  });

  it("does not carry the tactical uppercase styling, and reads Chat, not CHAT", () => {
    expect(entryClasses()).not.toMatch(
      /uppercase|tracking-|text-\[0\.7rem\]|font-semibold|font-sans|hover:text-foreground/,
    );
    expect(entryClasses()).toContain("text-sm");
    expect(entryClasses()).toContain("font-medium");
    expect(read("i18n/locales/en.json")).toContain('"chat": "Chat"');
    const start = page.indexOf('data-testid="team-chat-tab"');
    const markup = page.slice(start, page.indexOf("</button>", start));
    expect(markup).toContain('<span class="truncate">');
    expect(markup).not.toMatch(/uppercase/);
  });

  it("keeps the unread count next to the label like the Scrim Finder tab, and still opens the Chat Hub", () => {
    expect(page).toContain("{{ chatRoomUnreadLabel }}");
    expect(page).toContain("[teamChatUnreadClasses, 'ml-1.5']");
    expect(page).toContain('@click="openChatRoom"');
    expect(page).toContain("openTeamChatRoom(this.chatRoomTeam)");
  });

  it("the phone entry keeps the tab text style", () => {
    const at = page.indexOf('data-testid="team-chat-tab-mobile"');
    const mobile = page.slice(at - 400, at);
    expect(mobile).toContain("text-sm font-medium");
    expect(mobile).not.toMatch(/uppercase/);
  });
});
