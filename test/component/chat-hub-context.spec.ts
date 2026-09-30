import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";
import { draftAfter, makeDraft } from "./fixtures/captainPick";

const mocks = vi.hoisted(() => ({
  hubCalls: [] as string[],
  matchLobbyStore: null as any,
}));

vi.mock("~/composables/useHubState", () => ({
  setActiveHub: (hub: string) => mocks.hubCalls.push(hub),
}));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => mocks.matchLobbyStore,
}));

import { useChatTabs } from "../../composables/useChatTabs";
import { useRightSidebar } from "../../composables/useRightSidebar";
import {
  captainPickChatHubContext,
  draftChatHubContext,
  isChatTabHeldByContext,
  matchChatHubContext,
  requestChatHubFocus,
  useChatHubContext,
  type ChatHubContext,
} from "../../composables/useChatHubContext";

const t = (key: string, params?: Record<string, unknown>) =>
  params?.name ? `${key}(${params.name})` : key;

const MATCH_ID = "m1";
const MY_LINEUP = { id: "l1", name: "Team Alpha", is_on_lineup: true };
const OPPONENT = { id: "l2", name: "Team Bravo", is_on_lineup: false };
const match = (overrides: Record<string, unknown> = {}) => ({
  id: MATCH_ID,
  label: null,
  lineup_1: MY_LINEUP,
  lineup_2: OPPONENT,
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  ...overrides,
});

const wrappers: ReturnType<typeof mount>[] = [];

// A page that owns a Chat Hub context, like the match page or Captain Pick.
function mountContext(initial: ChatHubContext | null) {
  const context = ref<ChatHubContext | null>(initial);
  const Page = defineComponent({
    setup() {
      useChatHubContext(() => context.value);
      return () => h("div");
    },
  });
  const wrapper = mount(Page);
  wrappers.push(wrapper);
  return { context, wrapper };
}

const tabIds = () => useChatTabs().tabs.value.map((tab) => tab.id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  localStorage.clear();
  useChatTabs().clearAll();
  useRightSidebar().setRightSidebarOpen(false);
  mocks.hubCalls.length = 0;
  mocks.matchLobbyStore = reactive({ myMatches: [] as any[] });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("match context", () => {
  it("a participant gets Match Chat plus their own Team Chat, never the opponent's", () => {
    const context = matchChatHubContext(match(), true, MY_LINEUP, t)!;
    expect(context.key).toBe("match:m1");
    expect(context.rooms).toEqual([
      { type: "match", lobbyId: "m1", label: "Team Alpha vs Team Bravo" },
      { type: "match_team", lobbyId: "m1:l1", label: "Team Alpha" },
    ]);
  });

  it("an admin observer gets the shared Match Chat only", () => {
    const context = matchChatHubContext(match(), true, null, t)!;
    expect(context.rooms.map((r) => r.type)).toEqual(["match"]);
  });

  it("an admin who is actually on a lineup gets their Team Chat like any player", () => {
    const context = matchChatHubContext(match(), true, MY_LINEUP, t)!;
    expect(context.rooms.map((r) => `${r.type}:${r.lobbyId}`)).toContain(
      "match_team:m1:l1",
    );
  });

  it("offers nothing for a match the viewer cannot chat in (e.g. finished)", () => {
    expect(matchChatHubContext(match(), false, MY_LINEUP, t)).toBeNull();
    expect(matchChatHubContext(undefined, true, null, t)).toBeNull();
  });

  it("treats a tournament match exactly like any other match", () => {
    const context = matchChatHubContext(
      match({ is_tournament_match: true, label: "Cup Final" }),
      true,
      MY_LINEUP,
      t,
    )!;
    expect(context.key).toBe("match:m1");
    expect(context.rooms[0].label).toBe("Cup Final");
    expect(context.rooms.map((r) => r.type)).toEqual(["match", "match_team"]);
  });
});

describe("auto-open", () => {
  it("opens the right sidebar on Chat with Match Chat selected when a match page is entered", () => {
    mountContext(matchChatHubContext(match(), true, MY_LINEUP, t));

    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useRightSidebar().isPinned.value).toBe(true);
    expect(mocks.hubCalls).toEqual(["chat"]);
    expect(useChatTabs().activeTabId.value).toBe("match:m1");
    expect(tabIds()).toEqual(["match:m1", "match_team:m1:l1"]);
    expect(tabIds()).not.toContain("match_team:m1:l2");
  });

  it("respects a manual close and room switch while the same match updates", async () => {
    const { context } = mountContext(
      matchChatHubContext(match(), true, MY_LINEUP, t),
    );
    const sidebar = useRightSidebar();
    sidebar.setRightSidebarOpen(false);
    useChatTabs().setActiveTab("match_team:m1:l1");

    // Live match updates recompute the context again and again.
    for (const status of ["Veto", "WaitingForServer", "Live"]) {
      context.value = matchChatHubContext(
        match({ status }),
        true,
        MY_LINEUP,
        t,
      );
      await flush();
    }

    expect(sidebar.rightSidebarOpen.value).toBe(false);
    expect(useChatTabs().activeTabId.value).toBe("match_team:m1:l1");
    expect(mocks.hubCalls).toEqual(["chat"]);
  });

  it("opens again when another match is entered", async () => {
    const { context } = mountContext(
      matchChatHubContext(match(), true, MY_LINEUP, t),
    );
    useRightSidebar().setRightSidebarOpen(false);

    context.value = matchChatHubContext(
      match({ id: "m2" }),
      true,
      null,
      t,
    );
    await flush();

    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useChatTabs().activeTabId.value).toBe("match:m2");
    // The previous match's rooms went with it (not a participant anymore).
    expect(tabIds()).toEqual(["match:m2"]);
  });

  it("opens again after F5 without duplicating rooms", () => {
    const first = mountContext(matchChatHubContext(match(), true, MY_LINEUP, t));
    useRightSidebar().setRightSidebarOpen(false);
    first.wrapper.unmount();

    // Reload: module state survives in this test, a fresh page instance
    // mounts for the same match.
    mountContext(matchChatHubContext(match(), true, MY_LINEUP, t));

    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(tabIds()).toEqual(["match:m1", "match_team:m1:l1"]);
  });
});

describe("admin observer lifecycle", () => {
  it("removes the context-only Match Chat and its unread count when the admin leaves", () => {
    const { wrapper } = mountContext(matchChatHubContext(match(), true, null, t));
    expect(tabIds()).toEqual(["match:m1"]);
    expect(isChatTabHeldByContext("match:m1")).toBe(true);
    useChatTabs().setUnread("match:m1", 3);

    wrapper.unmount();

    expect(tabIds()).toEqual([]);
    expect(isChatTabHeldByContext("match:m1")).toBe(false);
    expect(useChatTabs().unreadCounts.value["match:m1"]).toBeUndefined();
    expect(localStorage.getItem("chat-unread-counts") ?? "").not.toContain(
      "match:m1",
    );
  });

  it("keeps a participant's rooms after leaving the page (they are still playing)", () => {
    mocks.matchLobbyStore.myMatches = [match()];
    const { wrapper } = mountContext(
      matchChatHubContext(match(), true, MY_LINEUP, t),
    );

    wrapper.unmount();

    expect(tabIds()).toEqual(["match:m1", "match_team:m1:l1"]);
  });

  it("does not touch unrelated rooms such as a tournament chat", () => {
    useChatTabs().openTab(
      {
        id: "tournament:t1",
        label: "Cup",
        instance: "tournament",
        type: "tournament",
        lobbyId: "t1",
        pinned: true,
      },
      { setActive: false },
    );
    useChatTabs().setUnread("tournament:t1", 2);
    const { wrapper } = mountContext(
      matchChatHubContext(match({ is_tournament_match: true }), true, MY_LINEUP, t),
    );
    wrapper.unmount();

    expect(tabIds()).toEqual(["tournament:t1"]);
    expect(useChatTabs().unreadCounts.value["tournament:t1"]).toBe(2);
  });
});

describe("Captain Pick", () => {
  // The real match exists from 10/10; the draft carries its id.
  const MATCH = "match-7";
  const MATCH_ROOM = `match:${MATCH}`;
  const withMatch = <T extends object>(draft: T) => ({ ...draft, matchId: MATCH });
  const ids = (context: ChatHubContext | null) =>
    context!.rooms.map((r) => `${r.type}:${r.lobbyId}`);

  it("uses the real match's Match Chat, never the site-wide Global Chat or a separate draft room", () => {
    for (const steamId of ["3", "2", "1"]) {
      const context = captainPickChatHubContext(
        withMatch(makeDraft()),
        steamId,
        t,
      )!;
      expect(context.rooms[0]).toEqual({
        type: "match",
        lobbyId: MATCH,
        label: "chat.match_chat",
      });
      // Only the real match room and, with a side, the team room.
      expect(
        context.rooms.every(
          (r) => r.type === "match" || r.type === "captain_pick_team",
        ),
      ).toBe(true);
      expect(context.focus ?? null).toBeNull();
      expect(context.autoOpen).toBe(true);
    }
  });

  it("has Match Chat but no Team Chat before a side is assigned", () => {
    // Player 3 is still in the pool.
    expect(ids(captainPickChatHubContext(withMatch(makeDraft()), "3", t))).toEqual([
      MATCH_ROOM,
    ]);
  });

  it("gives a captain Match Chat and their own Team Chat immediately", () => {
    // Player 2 captains lineup 1, player 1 captains lineup 2.
    const context = captainPickChatHubContext(withMatch(makeDraft()), "2", t)!;
    expect(ids(context)).toEqual([MATCH_ROOM, "captain_pick_team:draft-1:1"]);
    expect(context.rooms[1].label).toBe(
      "matchmaking.captain_pick.team_of(Player 2)",
    );
    expect(ids(captainPickChatHubContext(withMatch(makeDraft()), "1", t))).toEqual([
      MATCH_ROOM,
      "captain_pick_team:draft-1:2",
    ]);
  });

  it("keeps Match Chat and adds Team Chat as soon as the server has a picked player on a side", () => {
    const draft = withMatch(draftAfter([{ steam_id: "3" }, { steam_id: "4" }]));
    expect(ids(captainPickChatHubContext(draft, "3", t))).toEqual([
      MATCH_ROOM,
      "captain_pick_team:draft-1:1",
    ]);
    expect(ids(captainPickChatHubContext(draft, "4", t))).toEqual([
      MATCH_ROOM,
      "captain_pick_team:draft-1:2",
    ]);
  });

  it("gives the final auto-assigned player their Team Chat", () => {
    const draft = withMatch(
      draftAfter(["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id }))),
    );
    expect(ids(captainPickChatHubContext(draft, "10", t))).toEqual([
      MATCH_ROOM,
      "captain_pick_team:draft-1:1",
    ]);
  });

  it("offers an outsider or admin no team room (and without a draft of their own, nothing)", () => {
    // The server only sends the draft to its ten players.
    expect(captainPickChatHubContext(null, "999", t)).toBeNull();
    // Even with a draft on screen: no team room; the API refuses the
    // match's chat to anyone outside the ten while picking.
    expect(ids(captainPickChatHubContext(withMatch(makeDraft()), "999", t))).toEqual([
      MATCH_ROOM,
    ]);
  });

  it("waits for the match before opening the Hub", () => {
    const context = captainPickChatHubContext(makeDraft(), "3", t)!;
    expect(context.rooms).toEqual([]);
    expect(context.autoOpen).toBe(false);
  });

  it("focuses Match Chat on entry, keeps Global separate, adds Team Chat without stealing focus", async () => {
    const { openTab } = useChatTabs();
    openTab(
      {
        id: "global",
        label: "Global Chat",
        instance: "global",
        type: "global",
        lobbyId: "global",
        pinned: true,
      },
      { setActive: true },
    );

    const { context } = mountContext(
      captainPickChatHubContext(withMatch(makeDraft()), "3", t),
    );
    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useChatTabs().activeTabId.value).toBe(MATCH_ROOM);
    expect(tabIds()).toEqual(["global", MATCH_ROOM]);

    context.value = captainPickChatHubContext(
      withMatch(draftAfter([{ steam_id: "3" }])),
      "3",
      t,
    );
    await flush();
    expect(tabIds()).toEqual(["global", MATCH_ROOM, "captain_pick_team:draft-1:1"]);
    expect(tabIds()).not.toContain("captain_pick_team:draft-1:2");
    expect(useChatTabs().activeTabId.value).toBe(MATCH_ROOM);
  });

  it("opens once the match id arrives if it wasn't there on entry", async () => {
    const { context } = mountContext(captainPickChatHubContext(makeDraft(), "3", t));
    expect(useRightSidebar().rightSidebarOpen.value).toBe(false);

    context.value = captainPickChatHubContext(withMatch(makeDraft()), "3", t);
    await flush();

    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useChatTabs().activeTabId.value).toBe(MATCH_ROOM);
  });

  it("carries the same Match Chat into the match page; only the Captain Pick team room goes", () => {
    // Once the teams are seated the player is a real participant.
    mocks.matchLobbyStore.myMatches = [
      match({ id: MATCH, lineup_1: { ...MY_LINEUP }, lineup_1_id: "l1" }),
    ];
    const { wrapper } = mountContext(
      captainPickChatHubContext(withMatch(makeDraft()), "2", t),
    );
    expect(tabIds()).toEqual([MATCH_ROOM, "captain_pick_team:draft-1:1"]);

    // MatchCreated: the draft page routes to /matches/<id> and unmounts.
    wrapper.unmount();
    expect(tabIds()).toEqual([MATCH_ROOM]);

    mountContext(matchChatHubContext(match({ id: MATCH }), true, MY_LINEUP, t));
    // The very same room, plus the normal match Team Chat. No second
    // shared room, nothing to migrate.
    expect(tabIds()).toEqual([MATCH_ROOM, `match_team:${MATCH}:l1`]);
  });
});

describe("Draft room", () => {
  const room = {
    id: "d1",
    match_id: null as string | null,
    host: { name: "Host" },
  };
  const base = {
    room,
    match: null as any,
    matchChatReady: false,
    signedIn: true,
    canChat: true,
    inLineup: false,
    isOrganizer: false,
    isParticipant: true,
    myLineupNumber: null as number | null,
    t,
  };

  it("offers the Draft chat with the draft room id before a match exists", () => {
    const context = draftChatHubContext(base);
    expect(context.key).toBe("draft:d1");
    expect(context.rooms).toEqual([
      {
        type: "draft",
        lobbyId: "d1",
        label: "draft_games.room.host_room(Host)",
      },
    ]);
    expect(context.autoOpen).toBe(true);
  });

  it("does not open the Hub by itself for a spectator", () => {
    expect(draftChatHubContext({ ...base, isParticipant: false }).autoOpen).toBe(
      false,
    );
    expect(
      draftChatHubContext({ ...base, isParticipant: false, canChat: false })
        .rooms,
    ).toEqual([]);
  });

  it("hands over to Match Chat plus own Team Chat once the match is ready", () => {
    const ready = {
      ...base,
      room: { ...room, match_id: MATCH_ID },
      match: match(),
      matchChatReady: true,
      inLineup: true,
      myLineupNumber: 2,
    };
    expect(draftChatHubContext(ready).rooms).toEqual([
      { type: "match", lobbyId: "m1", label: "Team Alpha vs Team Bravo" },
      { type: "match_team", lobbyId: "m1:l2", label: "Team Bravo" },
    ]);

    // An organizer who is not playing: Match Chat only.
    expect(
      draftChatHubContext({
        ...ready,
        inLineup: false,
        isOrganizer: true,
        isParticipant: false,
        myLineupNumber: null,
      }).rooms.map((r) => r.type),
    ).toEqual(["match"]);
  });

  it("moves a reader of the Draft chat to the Match Chat when it takes over", async () => {
    const { context } = mountContext(draftChatHubContext(base));
    expect(useChatTabs().activeTabId.value).toBe("draft:d1");
    useRightSidebar().setRightSidebarOpen(false);

    context.value = draftChatHubContext({
      ...base,
      room: { ...room, match_id: MATCH_ID },
      match: match(),
      matchChatReady: true,
      inLineup: true,
      myLineupNumber: 1,
    });
    await flush();

    expect(tabIds()).toEqual(["match:m1", "match_team:m1:l1"]);
    expect(useChatTabs().activeTabId.value).toBe("match:m1");
    // Same context: the manual close stands.
    expect(useRightSidebar().rightSidebarOpen.value).toBe(false);
  });
});

describe("notification focus", () => {
  it("focuses a room right away when it is already in the Hub", () => {
    mocks.matchLobbyStore.myMatches = [match()];
    mountContext(matchChatHubContext(match(), true, MY_LINEUP, t));
    useRightSidebar().setRightSidebarOpen(false);

    requestChatHubFocus("match_team:m1:l1");

    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useChatTabs().activeTabId.value).toBe("match_team:m1:l1");
  });

  it("focuses the requested room once its page offers it", () => {
    requestChatHubFocus("captain_pick_team:draft-1:1");
    mountContext(
      captainPickChatHubContext({ ...makeDraft(), matchId: "match-7" }, "2", t),
    );
    expect(useChatTabs().activeTabId.value).toBe(
      "captain_pick_team:draft-1:1",
    );
  });
});
