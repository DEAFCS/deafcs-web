import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  draftAvgRank,
  draftPlayerElo,
  filterDraftRooms,
  defaultDraftFilters,
} from "../../components/play/draftRoomRow";
import { HOST_TYPES, hostModes } from "../../components/play/draftHost";
import { waysLayout, pickServerTiles } from "../../utilities/playMoreWays";

// The full /play page (5Stack's structure) and the DEAFCS rules kept in it.

const read = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");

describe("/play page structure", () => {
  const page = read("pages/play/index.vue");

  it("has no PLAY banner and follows upstream's section order", () => {
    expect(page).not.toContain("TacticalPageHeader");
    const order = [
      "<PlayMatchmaking",
      "<OpenLobbiesList",
      "<PlaySchedule",
      "<PlayDraftRooms",
      "<PlayMoreWays",
    ].map((tag) => page.indexOf(tag));
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("keeps DEAFCS's open lobbies (self-join) under the hero, in one root", () => {
    expect(page).toMatch(
      /<PageTransition>\s*<div>[\s\S]*?<h1 class="sr-only">[\s\S]*?<PlayMatchmaking \/>\s*<OpenLobbiesList[\s\S]*?<\/div>\s*<\/PageTransition>/,
    );
  });

  it("drops the old sections it replaces", () => {
    for (const old of ["MyUpcoming", "DraftGames", "TournamentFeatureCard"]) {
      expect(page).not.toContain(old);
    }
    for (const file of [
      "components/MyUpcoming.vue",
      "components/draft-games/DraftGames.vue",
      "components/draft-games/DraftGameCard.vue",
    ]) {
      expect(fs.existsSync(path.resolve(__dirname, "../..", file))).toBe(false);
    }
  });

  // Utility Library Phase 2: upstream's practice tile is back, but only shows
  // while public.utility_practice_enabled is "true" (seeded "false" in DEAFCS).
  it("shows upstream's practice tile only when practice is enabled", () => {
    expect(read("components/play/PlayMoreWaysView.vue")).toMatch(
      /<PlayPracticeTile v-if="practiceEnabled" \/>/,
    );
    expect(read("components/play/PlayMoreWays.vue")).toMatch(
      /setting\.name === "public\.utility_practice_enabled",\s*\)\?\.value === "true"/,
    );
  });
});

describe("draft rooms: DEAFCS mode-specific ELO", () => {
  const room = (type: string, ratings: Array<number | undefined>) => ({
    type,
    capacity: 10,
    players: ratings.map((rating, index) => ({
      status: "Accepted",
      steam_id: `p${index}`,
      elo_snapshot: 9999,
      player: { steam_id: `p${index}`, elo: rating },
    })),
  });
  // What usePlayerActiveSeasonElo hands back: one ladder per mode.
  const eloFor = (player: any) =>
    player.elo === undefined
      ? null
      : { competitive: player.elo, wingman: player.elo + 100, duel: 1 };

  it("averages the room mode's active-season ELO, never the join-time snapshot", () => {
    expect(draftAvgRank(room("Competitive", [1000, 2000]), eloFor)).toBe(1500);
    expect(draftAvgRank(room("Wingman", [1000, 2000]), eloFor)).toBe(1600);
    // Unrated players count at 5000, like the old Play-Draft cards.
    expect(draftAvgRank(room("Competitive", [1000, undefined]), eloFor)).toBe(
      3000,
    );
  });

  it("one player's rating follows the room mode too", () => {
    const game = room("Duel", [1234]);
    expect(draftPlayerElo(game, game.players[0], eloFor)).toBe(1);
  });

  it("filters and sorts by the same rating", () => {
    const low = { ...room("Competitive", [1000]), id: "low" };
    const high = { ...room("Competitive", [3000]), id: "high" };
    const filters = { ...defaultDraftFilters(), sort: "rank_high" as const };
    expect(
      filterDraftRooms([low, high], filters, eloFor).map((g: any) => g.id),
    ).toEqual(["high", "low"]);
    const ranged = { ...defaultDraftFilters(), rankRange: [2000, 4000] };
    expect(
      filterDraftRooms([low, high], ranged, eloFor).map((g: any) => g.id),
    ).toEqual(["high"]);
  });
});

describe("draft rooms: hosting", () => {
  it("offers only DEAFCS formats (5v5, 2v2, 1v1), never Rush", () => {
    expect(HOST_TYPES.map((option) => option.type)).toEqual([
      "Competitive",
      "Wingman",
      "Duel",
    ]);
    expect(hostModes("Duel")).toEqual(["Pug"]);
  });

  it("only players who may create custom matches, unrestricted, can host", () => {
    for (const file of [
      "components/play/PlayDraftRooms.vue",
      "components/play/PlayDraftHostBar.vue",
    ]) {
      const source = read(file);
      expect(source).toMatch(
        /settings\.canCreateMatch &&\s*settings\.canCreateCustomMatch &&\s*!useWebsiteRestrictionStore\(\)\.isRestricted/,
      );
    }
    const bar = read("components/play/PlayDraftHostBar.vue");
    expect(bar).toContain("if (!canHost.value) return;");
    expect(bar).toContain('v-else-if="canHost || !auth.me"');
    expect(read("components/play/PlayDraftRooms.vue")).toContain(
      '<PlayDraftHostBar\n      v-if="showHostBar"',
    );
  });

  it("has no LAN play-where calls (not part of DEAFCS)", () => {
    for (const file of [
      "components/play/PlayDraftRooms.vue",
      "components/play/PlayDraftHostBar.vue",
    ]) {
      expect(read(file)).not.toMatch(/ensurePlayWhere|onLan|playWhere/);
    }
  });
});

describe("more ways to play (upstream layout rules)", () => {
  it("lays out a tournament with tiles, and tiles alone", () => {
    expect(waysLayout(true, 1)).toEqual({ kind: "wide" });
    expect(waysLayout(true, 3)).toEqual({ kind: "feature", railColumns: 2 });
    expect(waysLayout(false, 2)).toEqual({ kind: "tiles", columns: 2 });
  });

  it("shows the busiest three servers", () => {
    const servers = [1, 5, 3, 9].map((players, id) => ({ id, players }));
    expect(pickServerTiles(servers).map((server) => server.id)).toEqual([
      3, 1, 2,
    ]);
  });
});
