import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const calls: string[] = [];
vi.mock("~/composables/useHubState", () => ({
  setActiveHub: vi.fn((hub: string) => calls.push(`hub:${hub}`)),
}));

import { useChatTabs } from "../../composables/useChatTabs";
import { useRightSidebar } from "../../composables/useRightSidebar";
import {
  findChatTournament,
  formatChatRoomUnread,
  openTournamentChatRoom,
  tournamentChatTabId,
} from "../../composables/useTournamentChatRoom";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const T1 = { id: "11111111-1111-4111-8111-111111111111", name: "5v5 Cup" };
const T2 = { id: "22222222-2222-4222-8222-222222222222", name: "Other" };

describe("tournament Chat Room tab", () => {
  beforeEach(() => {
    calls.length = 0;
    useChatTabs().clearAll();
  });

  it("uses the same tab id as the Chat Hub's tournament tabs", () => {
    expect(tournamentChatTabId(T1.id)).toBe(`tournament:${T1.id}`);
    const setup = read("composables/useChatTabSetup.ts");
    expect(setup).toContain("const tabId = `tournament:${t.id}`;");
  });

  it("is only available for tournaments in the Chat Hub's eligibility list", () => {
    expect(findChatTournament([T1], T1.id)).toEqual(T1);
    expect(findChatTournament([T2], T1.id)).toBeNull();
    expect(findChatTournament([], T1.id)).toBeNull();
    expect(findChatTournament(undefined, T1.id)).toBeNull();
    expect(findChatTournament([T1], undefined)).toBeNull();
  });

  it("shows (N) only when N > 0, capped like the Chat Hub badge", () => {
    expect(formatChatRoomUnread(0)).toBe("");
    expect(formatChatRoomUnread(undefined)).toBe("");
    expect(formatChatRoomUnread(1)).toBe("1");
    expect(formatChatRoomUnread(5)).toBe("5");
    expect(formatChatRoomUnread(100)).toBe("100");
    expect(formatChatRoomUnread(101)).toBe("100+");
  });

  it("reads the existing Chat Hub unread count (no second counter)", () => {
    const { incrementUnread, unreadCounts } = useChatTabs();
    const id = tournamentChatTabId(T1.id);
    incrementUnread(id);
    incrementUnread(id);
    expect(unreadCounts.value[id]).toBe(2);
    expect(formatChatRoomUnread(unreadCounts.value[id])).toBe("2");
  });

  it("opens the Chat Hub on this exact room: hub first, then the room", () => {
    const chat = useChatTabs();
    openTournamentChatRoom(T1);
    const id = tournamentChatTabId(T1.id);

    const tab = chat.tabs.value.find((t) => t.id === id);
    expect(tab).toMatchObject({
      id,
      type: "tournament",
      instance: "tournament",
      lobbyId: T1.id,
      pinned: true,
    });
    expect(chat.activeTabId.value).toBe(id);
    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(calls).toEqual(["hub:chat"]);
  });

  it("reuses an existing tournament tab instead of adding a duplicate", () => {
    const chat = useChatTabs();
    const id = tournamentChatTabId(T1.id);
    chat.openTab(
      {
        id,
        label: T1.name,
        instance: "tournament",
        type: "tournament",
        lobbyId: T1.id,
        pinned: true,
      },
      { setActive: false },
    );
    openTournamentChatRoom(T1);
    expect(chat.tabs.value.filter((t) => t.id === id)).toHaveLength(1);
    expect(chat.activeTabId.value).toBe(id);
  });

  it("the helper selects the room after switching hubs (source order)", () => {
    const src = read("composables/useTournamentChatRoom.ts");
    const hub = src.indexOf('setActiveHub("chat");');
    const select = src.indexOf("setActiveTab(id);");
    expect(hub).toBeGreaterThan(-1);
    expect(select).toBeGreaterThan(hub);
  });

  it("ChatPanel applies a pending explicit room before the unread auto-pick", () => {
    const panel = read("components/hub/ChatPanel.vue");
    const requested = panel.indexOf(
      "if (requested && requested.id !== activeChatId.value) {",
    );
    const unreadPick = panel.indexOf("const unreadTab = orderedTabs.value.find(");
    expect(requested).toBeGreaterThan(-1);
    expect(unreadPick).toBeGreaterThan(requested);
    // Selecting still goes through handleSelectRoom, which resets unread.
    expect(panel).toMatch(
      /function handleSelectRoom\(tab: ChatTab\) \{\s*activeChatId\.value = tab\.id;\s*setActiveTab\(tab\.id\);\s*resetUnread\(tab\.id\);/,
    );
  });

  it("the tournament page renders Chat Room in the tab bar, gated by Chat Hub eligibility", () => {
    const detail = read("components/tournament/TournamentDetail.vue");
    const list = detail.slice(
      detail.indexOf("<TabsList"),
      detail.indexOf("</TabsList>"),
    );
    expect(list).toContain('data-testid="tournament-chat-room-tab"');
    expect(list).toContain('v-if="chatRoomTournament"');
    expect(list).toContain('@click="openChatRoom"');
    expect(list).toContain("({{ chatRoomUnreadLabel }})");
    expect(detail).toMatch(
      /findChatTournament\(\s*useMatchLobbyStore\(\)\.chatTournaments,\s*this\.tournament\?\.id,\s*\)/,
    );
    expect(detail).toMatch(
      /useChatTabs\(\)\.unreadCounts\.value\[\s*tournamentChatTabId\(this\.chatRoomTournament\.id\)\s*\]/,
    );
  });

  it("eligibility list is participants or organizers (incl. admins) plus the 24h grace window", () => {
    const store = read("stores/MatchLobbyStore.ts");
    expect(store).toContain("{ joined_tournament: { _eq: true } },");
    expect(store).toContain("{ is_organizer: { _eq: true } },");
    expect(store).toContain("Date.now() - 24 * 60 * 60 * 1000");
  });
});
