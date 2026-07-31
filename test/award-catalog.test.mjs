import assert from "node:assert/strict";
import test from "node:test";
import {
  activeGrantCount,
  filterAwards,
  groupAwards,
} from "../utilities/awardCatalog.ts";

const awards = [
  { id: "g", name: "Community Hero", description: "Helpful player", tier: "special" },
  {
    id: "t",
    name: "Cup Champion",
    description: "Summer cup winner",
    tier: "gold",
    tournament_id: "t1",
    tournament: { id: "t1", name: "Summer Cup" },
  },
  {
    id: "e",
    name: "Event MVP",
    tier: "mvp",
    event_id: "e1",
    event: { id: "e1", name: "LAN Finals" },
  },
  {
    id: "s",
    name: "Season Star",
    tier: "silver",
    elo_season_id: "s1",
    elo_season: { id: "s1", number: 4 },
  },
  {
    id: "l",
    name: "League Winner",
    tier: "bronze",
    league_season_id: "l1",
    league_season: { id: "l1", name: "Premier Season", season_number: 2 },
  },
  { id: "x", name: "Old Award", tier: "gold", archived_at: "2026-01-01" },
];

test("groups active awards by all supported scopes", () => {
  const groups = groupAwards(filterAwards(awards, "", "all"));
  assert.deepEqual(groups.map((group) => group.kind), [
    "global",
    "tournament",
    "event",
    "elo_season",
    "league_season",
  ]);
  assert.equal(groups[1].ownerName, "Summer Cup");
});

test("filters awards by tier", () => {
  assert.deepEqual(filterAwards(awards, "", "gold").map(({ id }) => id), ["t"]);
});

test("searches award names and descriptions case-insensitively", () => {
  assert.deepEqual(filterAwards(awards, "HELPFUL", "all").map(({ id }) => id), ["g"]);
  assert.deepEqual(filterAwards(awards, "season star", "all").map(({ id }) => id), ["s"]);
});

test("excludes archived awards", () => {
  assert.equal(filterAwards(awards, "", "all").some(({ id }) => id === "x"), false);
});

test("sums only active recipient aggregates across occurrences", () => {
  const award = {
    id: "counted",
    name: "Counted",
    tier: "special",
    occurrences: [
      { recipients_aggregate: { aggregate: { count: 2 } } },
      { recipients_aggregate: { aggregate: { count: 3 } } },
    ],
  };
  assert.equal(activeGrantCount(award), 5);
});

test("catalog query contract filters revoked recipients before counting", async () => {
  const page = await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../pages/awards/index.vue", import.meta.url), "utf8"),
  );
  assert.match(page, /recipients_aggregate\s*\(\s*where:\s*\{\s*revoked_at:\s*\{\s*_is_null:\s*true/);
  assert.doesNotMatch(page, /\n\s+(player_steam_id|team_id)\b/);
});
