import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive } from "vue";
import fs from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  hubCalls: [] as string[],
  matchLobbyStore: null as any,
  auth: null as any,
}));

vi.mock("~/composables/useHubState", () => ({
  setActiveHub: (hub: string) => mocks.hubCalls.push(hub),
  currentHub: () => "chat",
}));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => mocks.matchLobbyStore,
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => mocks.auth,
}));
vi.mock("~/utilities/teamAvatar", () => ({
  default: (team: { avatar_url?: string | null } | null | undefined) =>
    team?.avatar_url ? `https://api.test/${team.avatar_url}` : null,
}));

import socket from "../../web-sockets/Socket";
import { useChatTabs } from "../../composables/useChatTabs";
import { useChatTabSetup } from "../../composables/useChatTabSetup";
import { useRightSidebar } from "../../composables/useRightSidebar";
import {
  useDockShortcutPrefs,
  isDefaultDockRoomType,
} from "../../composables/useDockShortcutPrefs";
import {
  findChatTeam,
  formatTeamChatUnread,
  hideTeamChat,
  isTeamChatHidden,
  openTeamChatRoom,
  teamChatTab,
  teamChatTabId,
  unhideTeamChat,
} from "../../composables/useTeamChatRoom";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const ME = "76561190000000001";
const ALPHA = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Alpha",
  short_name: "ALP",
  avatar_url: "avatars/alpha.png",
};
const BRAVO = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Bravo",
  short_name: "BRV",
  avatar_url: null,
};

function setRole(role: string) {
  const order = [
    "user",
    "verified_user",
    "streamer",
    "moderator",
    "match_organizer",
    "tournament_organizer",
    "administrator",
  ];
  mocks.auth.isRoleAbove = (required: string) =>
    order.indexOf(role) >= order.indexOf(required);
}

beforeEach(() => {
  mocks.hubCalls.length = 0;
  localStorage.clear();
  mocks.auth = reactive({ me: { steam_id: ME }, isRoleAbove: () => false });
  setRole("verified_user");
  mocks.matchLobbyStore = reactive({
    myMatches: [],
    currentMatch: undefined,
    chatTournaments: [],
    chatTournamentsLoaded: true,
    chatTeams: [],
    chatTeamsLoaded: true,
  });
  // The hidden set is cached per account for the page's lifetime; start clean.
  unhideTeamChat(ALPHA.id);
  unhideTeamChat(BRAVO.id);
  useChatTabs().clearAll();
  useDockShortcutPrefs().prefs.value.pinned = [];
  useDockShortcutPrefs().prefs.value.dismissed = {};
  useDockShortcutPrefs().prefs.value.hidden = [];
  useDockShortcutPrefs().prefs.value.maxRooms = 2;
});

afterEach(() => {
  useRightSidebar().setRightSidebarOpen(false);
});

describe("Team Chat room helpers", () => {
  it("uses team:<id> as the one tab id, like every Chat Hub room (type:id)", () => {
    expect(teamChatTabId(ALPHA.id)).toBe(`team:${ALPHA.id}`);
  });

  it("only exists for teams in the Chat Hub's own team list", () => {
    expect(findChatTeam([ALPHA], ALPHA.id)).toEqual(ALPHA);
    expect(findChatTeam([BRAVO], ALPHA.id)).toBeNull();
    expect(findChatTeam([], ALPHA.id)).toBeNull();
    expect(findChatTeam(undefined, ALPHA.id)).toBeNull();
    expect(findChatTeam([ALPHA], undefined)).toBeNull();
  });

  it("shows the count exactly like the tournament Chat Room: empty at 0, capped at 99+", () => {
    expect(formatTeamChatUnread(0)).toBe("");
    expect(formatTeamChatUnread(undefined)).toBe("");
    expect(formatTeamChatUnread(1)).toBe("1");
    expect(formatTeamChatUnread(5)).toBe("5");
    expect(formatTeamChatUnread(100)).toBe("99+");
  });

  it("builds the tab from the team's own name and logo, closable (not 'pinned')", () => {
    expect(teamChatTab(ALPHA)).toEqual({
      id: `team:${ALPHA.id}`,
      label: "Alpha",
      instance: "team",
      type: "team",
      lobbyId: ALPHA.id,
      avatarUrl: "https://api.test/avatars/alpha.png",
      pinned: false,
    });
    expect(teamChatTab(BRAVO).avatarUrl).toBeUndefined();
  });
});

describe("Team Chat tabs in the Chat Hub session", () => {
  function mountSetup() {
    return mount(
      defineComponent({
        setup() {
          useChatTabSetup();
          return () => h("div");
        },
      }),
    );
  }
  const teamTabIds = () =>
    useChatTabs()
      .tabs.value.filter((tab) => tab.type === "team")
      .map((tab) => tab.id);

  it("opens a room for every team the player is on, without taking focus", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA, BRAVO];
    const wrapper = mountSetup();
    await flushPromises();

    expect(teamTabIds()).toEqual([`team:${ALPHA.id}`, `team:${BRAVO.id}`]);
    expect(useChatTabs().activeTabId.value ?? "").not.toMatch(/^team:/);
    wrapper.unmount();
  });

  it("opens a new team's room as soon as the player joins it", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA];
    const wrapper = mountSetup();
    await flushPromises();
    expect(teamTabIds()).toEqual([`team:${ALPHA.id}`]);

    mocks.matchLobbyStore.chatTeams = [ALPHA, BRAVO];
    await flushPromises();
    expect(teamTabIds()).toEqual([`team:${ALPHA.id}`, `team:${BRAVO.id}`]);
    wrapper.unmount();
  });

  it("never duplicates a room when the team list updates", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA];
    const wrapper = mountSetup();
    await flushPromises();
    mocks.matchLobbyStore.chatTeams = [{ ...ALPHA }];
    await flushPromises();
    mocks.matchLobbyStore.chatTeams = [{ ...ALPHA }, BRAVO];
    await flushPromises();
    expect(teamTabIds().filter((id) => id === `team:${ALPHA.id}`)).toHaveLength(
      1,
    );
    wrapper.unmount();
  });

  it("follows a renamed team and a changed logo without losing unread or order", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA];
    const wrapper = mountSetup();
    await flushPromises();
    useChatTabs().incrementUnread(`team:${ALPHA.id}`);

    mocks.matchLobbyStore.chatTeams = [
      { ...ALPHA, name: "Alpha Prime", avatar_url: "avatars/new.png" },
    ];
    await flushPromises();

    const tab = useChatTabs().tabs.value.find(
      (candidate) => candidate.id === `team:${ALPHA.id}`,
    );
    expect(tab?.label).toBe("Alpha Prime");
    expect(tab?.avatarUrl).toBe("https://api.test/avatars/new.png");
    expect(useChatTabs().unreadCounts.value[`team:${ALPHA.id}`]).toBe(1);
    wrapper.unmount();
  });

  it("keeps a closed room closed: not on the next update, not on the next load", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA, BRAVO];
    let wrapper = mountSetup();
    await flushPromises();

    hideTeamChat(ALPHA.id);
    useChatTabs().closeTab(`team:${ALPHA.id}`);
    mocks.matchLobbyStore.chatTeams = [{ ...ALPHA }, BRAVO];
    await flushPromises();
    expect(teamTabIds()).toEqual([`team:${BRAVO.id}`]);

    // "F5": nothing in memory but the saved choice.
    wrapper.unmount();
    useChatTabs().clearAll();
    expect(
      JSON.parse(localStorage.getItem(`chat-hidden-team-rooms:${ME}`)!),
    ).toEqual([ALPHA.id]);
    wrapper = mountSetup();
    await flushPromises();
    expect(teamTabIds()).toEqual([`team:${BRAVO.id}`]);
    wrapper.unmount();
  });

  it("closing one team's room does not touch another team's", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA, BRAVO];
    const wrapper = mountSetup();
    await flushPromises();
    hideTeamChat(BRAVO.id);
    expect(isTeamChatHidden(BRAVO.id)).toBe(true);
    expect(isTeamChatHidden(ALPHA.id)).toBe(false);
    wrapper.unmount();
  });

  it("keeps the choice per account on a shared browser", () => {
    hideTeamChat(ALPHA.id);
    mocks.auth.me = { steam_id: "76561190000000002" };
    expect(isTeamChatHidden(ALPHA.id)).toBe(false);
    mocks.auth.me = { steam_id: ME };
    expect(isTeamChatHidden(ALPHA.id)).toBe(true);
  });

  it("removes the room and its unread count once the player leaves the team", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA, BRAVO];
    const wrapper = mountSetup();
    await flushPromises();
    useChatTabs().incrementUnread(`team:${ALPHA.id}`);
    useChatTabs().incrementUnread(`team:${BRAVO.id}`);

    mocks.matchLobbyStore.chatTeams = [BRAVO];
    await flushPromises();

    expect(teamTabIds()).toEqual([`team:${BRAVO.id}`]);
    expect(useChatTabs().unreadCounts.value[`team:${ALPHA.id}`]).toBeUndefined();
    expect(useChatTabs().unreadCounts.value[`team:${BRAVO.id}`]).toBe(1);
    wrapper.unmount();
  });

  it("does not drop rooms before the team list has actually loaded", async () => {
    useChatTabs().openTab(teamChatTab(ALPHA), { setActive: false });
    mocks.matchLobbyStore.chatTeams = [];
    mocks.matchLobbyStore.chatTeamsLoaded = false;
    const wrapper = mountSetup();
    await flushPromises();
    expect(teamTabIds()).toEqual([`team:${ALPHA.id}`]);
    wrapper.unmount();
  });

  it("a team room never stops the player's other rooms (Global, Announcements)", async () => {
    mocks.matchLobbyStore.chatTeams = [ALPHA];
    const wrapper = mountSetup();
    await flushPromises();
    const ids = useChatTabs().tabs.value.map((tab) => tab.id);
    expect(ids).toEqual(
      expect.arrayContaining(["global", "announcement", `team:${ALPHA.id}`]),
    );
    wrapper.unmount();
  });
});

describe("opening Team Chat from the team page", () => {
  it("opens the hub on that team's room, hub first and then the room", () => {
    const chat = useChatTabs();
    openTeamChatRoom(ALPHA);
    const id = teamChatTabId(ALPHA.id);

    expect(chat.tabs.value.find((tab) => tab.id === id)).toMatchObject({
      type: "team",
      lobbyId: ALPHA.id,
      label: "Alpha",
      pinned: false,
    });
    expect(chat.activeTabId.value).toBe(id);
    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(mocks.hubCalls).toEqual(["chat"]);
  });

  it("reopens a room the player closed, and clears the close", () => {
    hideTeamChat(ALPHA.id);
    openTeamChatRoom(ALPHA);
    expect(isTeamChatHidden(ALPHA.id)).toBe(false);
    expect(
      useChatTabs().tabs.value.some((tab) => tab.id === `team:${ALPHA.id}`),
    ).toBe(true);
  });

  it("reuses an existing room instead of adding a second", () => {
    openTeamChatRoom(ALPHA);
    openTeamChatRoom(ALPHA);
    expect(
      useChatTabs().tabs.value.filter((tab) => tab.id === `team:${ALPHA.id}`),
    ).toHaveLength(1);
  });

  it("is selected by ChatPanel's handleSelectRoom, which is what clears unread", () => {
    const src = read("composables/useTeamChatRoom.ts");
    expect(src.indexOf('setActiveHub("chat");')).toBeLessThan(
      src.indexOf("setActiveTab(tab.id);"),
    );
    const panel = read("components/hub/ChatPanel.vue");
    expect(panel).toMatch(
      /function handleSelectRoom\(tab: ChatTab\) \{\s*activeChatId\.value = viewId\(tab\);\s*setActiveTab\(viewId\(tab\)\);\s*resetUnread\(tab\.id\);/,
    );
  });

  it("closing a team room in the hub remembers it, through the shared close path", () => {
    const panel = read("components/hub/ChatPanel.vue");
    expect(panel).toMatch(
      /if \(tab\.type === "team"\) hideTeamChat\(tab\.lobbyId\);\s*closeTab\(tabId\);/,
    );
    // Team rooms stay closable: they are never "pinned" standing rooms.
    expect(teamChatTab(ALPHA).pinned).toBe(false);
  });
});

describe("Team Chat unread", () => {
  it("one count per room, shared with the team page: no second counter", () => {
    const { incrementUnread, unreadCounts, resetUnread } = useChatTabs();
    const id = teamChatTabId(ALPHA.id);
    incrementUnread(id);
    incrementUnread(id);
    expect(formatTeamChatUnread(unreadCounts.value[id])).toBe("2");
    // Another team's messages never change this team's number.
    incrementUnread(teamChatTabId(BRAVO.id));
    expect(formatTeamChatUnread(unreadCounts.value[id])).toBe("2");
    // Opening the room (handleSelectRoom -> resetUnread) clears it.
    resetUnread(id);
    expect(formatTeamChatUnread(unreadCounts.value[id])).toBe("");
    expect(formatTeamChatUnread(unreadCounts.value[teamChatTabId(BRAVO.id)])).toBe(
      "1",
    );
  });

  it("survives a refresh the way every room's count does", () => {
    const id = teamChatTabId(ALPHA.id);
    useChatTabs().incrementUnread(id);
    expect(
      JSON.parse(localStorage.getItem("chat-unread-counts")!)[id],
    ).toBe(1);
  });

  it("a live ping registers an eligible room and counts once; a hidden room neither returns nor counts", () => {
    // Socket.ts reaches these through Nuxt auto-imports, which this unit
    // environment does not provide.
    vi.stubGlobal("useChatTabs", useChatTabs);
    vi.stubGlobal("useAuthStore", () => mocks.auth);
    vi.stubGlobal("useRightSidebar", useRightSidebar);
    vi.stubGlobal("currentHub", () => "chat");
    vi.stubGlobal("useSound", () => ({ playNotificationSound() {} }));
    const chat = useChatTabs();
    const id = teamChatTabId(ALPHA.id);
    const ping = (teamId: string) =>
      socket.emit("chat:new-message", {
        type: "team",
        id: teamId,
        senderSteamId: "76561190000000009",
        senderName: "Someone",
        message: "gg",
      });

    ping(ALPHA.id);
    expect(chat.tabs.value.some((tab) => tab.id === id)).toBe(true);
    expect(chat.unreadCounts.value[id]).toBe(1);

    hideTeamChat(BRAVO.id);
    ping(BRAVO.id);
    expect(
      chat.tabs.value.some((tab) => tab.id === teamChatTabId(BRAVO.id)),
    ).toBe(false);
    expect(chat.unreadCounts.value[teamChatTabId(BRAVO.id)]).toBeUndefined();

    unhideTeamChat(BRAVO.id);
    vi.unstubAllGlobals();
  });
});

describe("Team Chat on the dock", () => {
  it("is a default dock room, like Global, Announcements and Organizers", () => {
    for (const type of ["global", "announcement", "organizers", "team"]) {
      expect(isDefaultDockRoomType(type)).toBe(true);
    }
    for (const type of ["direct", "tournament", "match", "matchmaking"]) {
      expect(isDefaultDockRoomType(type)).toBe(false);
    }
    expect(read("layouts/components/RightHub.vue")).toContain(
      "isDefaultDockRoomType(tab.type) &&",
    );
  });

  it("starts on the dock, can be unpinned, and can be pinned again", () => {
    const prefs = useDockShortcutPrefs();
    const id = teamChatTabId(ALPHA.id);
    expect(prefs.isOnDock(id, true)).toBe(true);

    prefs.togglePin(id, true, true);
    expect(prefs.isOnDock(id, true)).toBe(false);
    expect(prefs.prefs.value.dismissed[id]).toBeDefined();

    prefs.togglePin(id, true, true);
    expect(prefs.isOnDock(id, true)).toBe(true);
    expect(prefs.isPinned(id)).toBe(true);
    expect(prefs.prefs.value.dismissed[id]).toBeUndefined();
  });

  it("an unpin is remembered across refreshes and never silently undone", async () => {
    const prefs = useDockShortcutPrefs();
    const id = teamChatTabId(ALPHA.id);
    prefs.togglePin(id, true, true);
    await nextTick();
    const saved = JSON.parse(localStorage.getItem("hub-dock-shortcuts")!);
    expect(saved.dismissed[id]).toBeDefined();
    expect(saved.pinned).not.toContain(id);
    // Nothing in the team session setup touches dock preferences.
    const setup = read("composables/useChatTabSetup.ts");
    expect(setup).not.toContain("useDockShortcutPrefs");
  });

  it("each team's shortcut is independent", () => {
    const prefs = useDockShortcutPrefs();
    prefs.togglePin(teamChatTabId(ALPHA.id), true, true);
    expect(prefs.isOnDock(teamChatTabId(ALPHA.id), true)).toBe(false);
    expect(prefs.isOnDock(teamChatTabId(BRAVO.id), true)).toBe(true);
  });

  it("does not claim rooms are on the dock when the dock allows no rooms", () => {
    const prefs = useDockShortcutPrefs();
    prefs.prefs.value.maxRooms = 0;
    expect(prefs.isOnDock(teamChatTabId(ALPHA.id), true)).toBe(false);
  });

  it("the dock and the hub menus offer Unpin on a default room and Pin after an unpin", () => {
    const hub = read("layouts/components/RightHub.vue");
    const panel = read("components/hub/ChatPanel.vue");
    for (const src of [hub, panel]) {
      expect(src).toContain("isDefaultDockRoomType(");
      expect(src).toContain("isShortcutOnDock(");
    }
    // The dock shows the team's logo, with the initials as the fallback.
    expect(hub).toContain("v-else-if=\"tab.type === 'team' && tab.avatarUrl\"");
    expect(hub).toContain("shortcutInitials(tab)");
  });
});

describe("Team Chat on the team page", () => {
  const page = read("pages/teams/[id].vue").replace(/\r\n/g, "\n");

  it("adds Chat after Highlights, as an action beside the tabs rather than a tab", () => {
    const list = page.slice(
      page.indexOf("<TabsList"),
      page.indexOf("</TabsList>"),
    );
    expect(list.indexOf('value="highlights"')).toBeLessThan(
      list.indexOf('data-testid="team-chat-tab"'),
    );
    expect(list).toContain('@click="openChatRoom"');
    // Not a TabsTrigger: selecting it never swaps the page's panel.
    expect(list).not.toContain('value="chat"');
    expect(page).not.toContain('<TabsContent value="chat"');
    expect(page).toContain('"highlights",\n  "scrim",');
  });

  it("only shows for a member: gated by the Chat Hub's own list of the player's teams", () => {
    expect(page).toContain('v-if="chatRoomTeam"');
    expect(page).toMatch(
      /findChatTeam\(useMatchLobbyStore\(\)\.chatTeams, this\.team\?\.id\)/,
    );
  });

  it("shows the room's unread count as Chat (N), styled like the tournament badge, reusing the hub's count", () => {
    expect(page).toContain("{{ chatRoomUnreadLabel }}");
    expect(page).toContain("useChatTabs().unreadCounts.value[");
    expect(page).toContain("teamChatTabId(this.chatRoomTeam.id)");
    expect(page).toContain("formatTeamChatUnread(this.chatRoomUnread)");
    const tournament = read("components/tournament/TournamentDetail.vue");
    const badge = /tournamentChatRoomUnreadClasses =\s*"([^"]+)"/.exec(
      tournament,
    )![1];
    expect(page).toContain(badge);
  });

  it("keeps the player on the team page: opening the room never navigates", () => {
    const src = read("composables/useTeamChatRoom.ts");
    expect(src).not.toMatch(/navigateTo|router\.push|useRouter/);
  });

  it("has a phone version of the same entry, since the tab strip is hidden there", () => {
    expect(page).toContain('data-testid="team-chat-tab-mobile"');
    expect(page).toContain("md:hidden");
  });
});

describe("Organizer Chat for moderators", () => {
  function mountSetup() {
    return mount(
      defineComponent({
        setup() {
          useChatTabSetup();
          return () => h("div");
        },
      }),
    );
  }
  const has = (id: string) =>
    useChatTabs().tabs.value.some((tab) => tab.id === id);

  it.each(["moderator", "match_organizer", "tournament_organizer", "administrator"])(
    "offers the Organizer room to %s",
    async (role) => {
      setRole(role);
      const wrapper = mountSetup();
      await flushPromises();
      expect(has("organizers")).toBe(true);
      wrapper.unmount();
    },
  );

  it.each(["user", "verified_user", "streamer"])(
    "does not offer it to %s",
    async (role) => {
      setRole(role);
      const wrapper = mountSetup();
      await flushPromises();
      expect(has("organizers")).toBe(false);
      wrapper.unmount();
    },
  );

  it("pins the Organizer room by default for newly eligible staff, as the dock default", async () => {
    setRole("moderator");
    const wrapper = mountSetup();
    await flushPromises();
    const tab = useChatTabs().tabs.value.find((t) => t.id === "organizers");
    expect(tab?.pinned).toBe(true);
    expect(isDefaultDockRoomType("organizers")).toBe(true);
    wrapper.unmount();
  });

  it("an unpinned Organizer shortcut stays unpinned when the moderator signs in again", async () => {
    setRole("moderator");
    const prefs = useDockShortcutPrefs();
    prefs.togglePin("organizers", true, true);
    const wrapper = mountSetup();
    await flushPromises();
    expect(prefs.isOnDock("organizers", true)).toBe(false);
    wrapper.unmount();
  });

  it("drops the room when the moderator role is removed", async () => {
    setRole("moderator");
    const wrapper = mountSetup();
    await flushPromises();
    expect(has("organizers")).toBe(true);

    setRole("verified_user");
    mocks.auth.me = { steam_id: ME, role: "verified_user" };
    await flushPromises();
    expect(has("organizers")).toBe(false);
    wrapper.unmount();
  });

  it("the organizer page and the @-mention list agree with the API's moderator-and-above rule", () => {
    expect(read("pages/organizers/chat.vue")).toContain(
      "e_player_roles_enum.moderator",
    );
    expect(read("components/chat/ChatInput.vue")).toMatch(
      /ORGANIZER_MENTION_ROLES = \[\s*"moderator",\s*"match_organizer",/,
    );
  });
});
