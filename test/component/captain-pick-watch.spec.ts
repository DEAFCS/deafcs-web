import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("~/composables/useHubState", () => ({ setActiveHub: vi.fn() }));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => ({ myMatches: [] }),
}));

import { matchChatHubContext } from "../../composables/useChatHubContext";

// A Captain Pick match exists as an ordinary Competitive match in
// PickingPlayers from 10/10 (see api-deafcs CaptainPickService
// ensureMatchShell), and must show wherever active matches show.

const read = (p: string) =>
  fs
    .readFileSync(path.resolve(__dirname, "../..", p), "utf8")
    .split("\r\n")
    .join("\n");

// The status list passed to a given status array literal, in source order.
const statusesIn = (source: string, marker: string) => {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("]", start);
  return [...source.slice(start, end).matchAll(/e_match_status_enum\.(\w+)/g)].map(
    (m) => m[1],
  );
};

describe("Captain Pick matches while players are picked", () => {
  it("/watch lists PickingPlayers in the active (Live) row, not Upcoming", async () => {
    // The /watch match rail (components/watch): the live subscription takes
    // the same five statuses as before (and as the Watch badge below), the
    // upcoming one only Scheduled.
    const { TICKER_LIVE_STATUSES, tickerKind } = await import(
      "../../components/watch/watchTicker"
    );
    expect([...TICKER_LIVE_STATUSES].sort()).toEqual(
      ["Live", "WaitingForCheckIn", "WaitingForServer", "Veto", "PickingPlayers"].sort(),
    );
    expect(tickerKind({ status: "PickingPlayers" })).toBe("pre");
    const rail = read("components/watch/WatchMatchRail.vue");
    expect(rail).toContain("variables: { statuses: [...TICKER_LIVE_STATUSES] }");
    expect(rail).toContain('{ query: upcomingQuery, variables: { status: "Scheduled" } }');
    expect(read("pages/watch/index.vue")).toContain("<WatchMatchRail");
  });

  it("counts PickingPlayers in the Watch badge (same live subscription)", () => {
    const store = read("stores/MatchLobbyStore.ts");
    const start = store.indexOf("const subscribeToLiveMatches");
    const counted = statusesIn(store.slice(start), "_in: [");
    expect(counted).toEqual([
      "Live",
      "Veto",
      "WaitingForCheckIn",
      "WaitingForServer",
      "PickingPlayers",
    ]);
    expect(store.slice(start)).toContain('"matchLobby:liveMatches"');
  });

  it("/matches keeps PickingPlayers in Upcoming/Live", () => {
    const matches = read("pages/matches/index.vue");
    expect(statusesIn(matches, "upcomingLive: [")).toContain("PickingPlayers");
  });

  it("the match page lets admins/organizers into the chat while picking, not spectators", () => {
    const page = read("pages/matches/[id]/index.vue");
    const start = page.indexOf("canJoinLobby() {");
    const body = page.slice(start, page.indexOf("hasGameStreamer", start));
    expect(body).toContain("e_match_status_enum.PickingPlayers");
    expect(body).toContain("this.match.is_organizer");
    // No redirect away from a PickingPlayers match.
    expect(page).not.toMatch(/PickingPlayers[^\n]*navigateTo/);
  });

  const pickingMatch = {
    id: "m1",
    status: "PickingPlayers",
    label: null,
    lineup_1: { id: "l1", name: "Team 1" },
    lineup_2: { id: "l2", name: "Team 2" },
  };
  const t = (key: string) => key;

  it("an admin opening the picking match gets its Match Chat and no Team Chat", () => {
    // canJoinLobby: PickingPlayers + is_organizer; not on a lineup.
    const context = matchChatHubContext(pickingMatch, true, null, t)!;
    expect(context.rooms).toEqual([
      { type: "match", lobbyId: "m1", label: "Team 1 vs Team 2" },
    ]);
  });

  it("a spectator gets no chat context at all", () => {
    expect(matchChatHubContext(pickingMatch, false, null, t)).toBeNull();
  });
});
