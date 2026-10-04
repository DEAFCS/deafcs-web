import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import fs from "node:fs";
import path from "node:path";
import { makeDraft } from "./fixtures/captainPick";

// Mobile match pages: the Chat Hub covers the whole page on the mobile
// layout, so entering a match page offers the rooms without opening the
// Hub (every viewer role). Desktop keeps opening it once per match.

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
import {
  isMobileChatHubLayout,
  MOBILE_CHAT_HUB_QUERY,
  useRightSidebar,
} from "../../composables/useRightSidebar";
import {
  captainPickChatHubContext,
  matchChatHubContext,
  requestChatHubFocus,
  useChatHubContext,
  withoutMobileAutoOpen,
  type ChatHubContext,
} from "../../composables/useChatHubContext";

const t = (key: string, params?: Record<string, unknown>) =>
  params?.name ? `${key}(${params.name})` : key;

const MY_LINEUP = { id: "l1", name: "Team Alpha", is_on_lineup: true };
const match = () => ({
  id: "m1",
  label: null,
  lineup_1: MY_LINEUP,
  lineup_2: { id: "l2", name: "Team Bravo", is_on_lineup: false },
  lineup_1_id: "l1",
  lineup_2_id: "l2",
});

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

const wrappers: ReturnType<typeof mount>[] = [];

// Same shape as the match page: decide the layout once on entry, then hand
// the (possibly) mobile-adjusted context to useChatHubContext.
function enterMatchPage(build: () => ChatHubContext | null) {
  const Page = defineComponent({
    setup() {
      const mobile = isMobileChatHubLayout();
      useChatHubContext(() => withoutMobileAutoOpen(build(), mobile));
      return () => h("div");
    },
  });
  const wrapper = mount(Page);
  wrappers.push(wrapper);
  return wrapper;
}

const tabIds = () => useChatTabs().tabs.value.map((tab) => tab.id);
const hubOpen = () => useRightSidebar().rightSidebarOpen.value;

beforeEach(() => {
  localStorage.clear();
  useChatTabs().clearAll();
  useRightSidebar().setRightSidebarOpen(false);
  mocks.hubCalls.length = 0;
  mocks.matchLobbyStore = reactive({ myMatches: [] as any[] });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

const ROLES: Array<[string, () => ChatHubContext | null, string[]]> = [
  [
    "participant",
    () => matchChatHubContext(match(), true, MY_LINEUP, t),
    ["match:m1", "match_team:m1:l1"],
  ],
  ["admin / spectating organizer", () => matchChatHubContext(match(), true, null, t), ["match:m1"]],
  [
    "captain (Captain Pick)",
    // Player 2 captains lineup 1 in the fixture.
    () => captainPickChatHubContext({ ...makeDraft(), matchId: "m1" }, "2", t),
    ["match:m1", "captain_pick_team:draft-1:1"],
  ],
];

describe("mobile match page: Chat Hub does not auto-open", () => {
  it.each(ROLES)("%s on mobile: match visible first, rooms still offered", (_role, build, rooms) => {
    setViewport(true);
    enterMatchPage(build);

    expect(hubOpen()).toBe(false);
    expect(useRightSidebar().isPinned.value).toBe(false);
    expect(mocks.hubCalls).toEqual([]);
    // Rooms (and so unread badges) are unchanged.
    expect(tabIds()).toEqual(rooms);
  });

  it("chat stays manually accessible on mobile", () => {
    setViewport(true);
    enterMatchPage(ROLES[0][1]);
    expect(hubOpen()).toBe(false);

    // The chat icon / a notification click still opens the room.
    requestChatHubFocus("match_team:m1:l1");
    expect(hubOpen()).toBe(true);
    expect(useChatTabs().activeTabId.value).toBe("match_team:m1:l1");
  });

  it("an unchanged context on mobile does not pop the Hub open later", async () => {
    setViewport(true);
    enterMatchPage(ROLES[0][1]);
    setViewport(false); // e.g. rotating past the breakpoint
    await new Promise((r) => setTimeout(r, 0));
    expect(hubOpen()).toBe(false);
  });
});

describe("desktop match page: current auto-open preserved", () => {
  it.each(ROLES)("%s on desktop opens the Hub on Match Chat", (_role, build, rooms) => {
    setViewport(false);
    enterMatchPage(build);

    expect(hubOpen()).toBe(true);
    expect(useRightSidebar().isPinned.value).toBe(true);
    expect(mocks.hubCalls).toEqual(["chat"]);
    expect(useChatTabs().activeTabId.value).toBe("match:m1");
    expect(tabIds()).toEqual(rooms);
  });
});

describe("withoutMobileAutoOpen", () => {
  it("only switches off the automatic open, nothing else", () => {
    const context = matchChatHubContext(match(), true, MY_LINEUP, t)!;
    expect(withoutMobileAutoOpen(context, false)).toBe(context);
    expect(withoutMobileAutoOpen(context, true)).toEqual({ ...context, autoOpen: false });
    expect(withoutMobileAutoOpen(null, true)).toBeNull();
  });

  it("uses the Chat Hub's own mobile breakpoint", () => {
    expect(MOBILE_CHAT_HUB_QUERY).toBe("(max-width: 768px)");
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");
    expect(read("layouts/components/RightHub.vue")).toContain('useMediaQuery("(max-width: 768px)")');
    expect(read("components/hub/ChatPanel.vue")).toContain('useMediaQuery("(max-width: 768px)")');
  });
});

describe("match page wiring", () => {
  const page = fs.readFileSync(
    path.resolve(__dirname, "../../pages/matches/[id]/index.vue"),
    "utf8",
  );

  it("reads the layout once on entry and applies it to both Match and Captain Pick contexts", () => {
    expect(page).toMatch(
      /this\.chatHubMobileLayout = isMobileChatHubLayout\(\);\s+this\.chatHub = useChatHubContext\(\(\) => this\.chatHubContext\);/,
    );
    expect(page).toContain("? captainPickChatHubContext(");
    expect(page).toContain(": matchChatHubContext(");
    expect(page).toContain(
      "return withoutMobileAutoOpen(context, !!this.chatHubMobileLayout);",
    );
  });

  it("keeps the same chat permission inputs (canUseMatchChat, myLineup)", () => {
    expect(page).toMatch(/matchChatHubContext\(\s+this\.match,\s+this\.canUseMatchChat,\s+this\.myLineup,/);
  });
});
