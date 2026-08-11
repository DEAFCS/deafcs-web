import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The team detail page's ELO tooltip only ever showed Competitive -- Wingman
// and Duel rendered as "--" -- because v_team_ranks (teams.ranks) only ever
// exposed avg_elo. The view now also exposes avg_wingman_elo/avg_duel_elo
// (same current-roster, active-season, coach-excluded semantics as avg_elo,
// see api-deafcs hasura/views/v_team_ranks.sql), and this fix wires those
// through to the same PlayerElo/PlayerRanks display already used elsewhere.

const pageSource = await readFile(
  new URL("../pages/teams/[id].vue", import.meta.url),
  "utf8",
);
const summarySource = await readFile(
  new URL("../components/team/TeamRankSummary.vue", import.meta.url),
  "utf8",
);

test("the team detail query's ranks selection requests avg_elo, avg_wingman_elo, and avg_duel_elo", () => {
  const ranksBlock = pageSource.slice(
    pageSource.indexOf("ranks: {"),
    pageSource.indexOf("ranks: {") + 400,
  );
  assert.match(ranksBlock, /avg_elo:\s*true/);
  assert.match(ranksBlock, /avg_wingman_elo:\s*true/);
  assert.match(ranksBlock, /avg_duel_elo:\s*true/);
  // roster_size still gates whether the summary renders at all -- unchanged.
  assert.match(ranksBlock, /roster_size:\s*true/);
});

test("TeamRankSummary's ranks prop type includes the two new mode fields", () => {
  assert.match(summarySource, /avg_wingman_elo\?:\s*number\s*\|\s*null;/);
  assert.match(summarySource, /avg_duel_elo\?:\s*number\s*\|\s*null;/);
});

test("TeamRankSummary maps all three modes into the synthetic player.elo object handed to PlayerRanks", () => {
  const eloBlockMatch = summarySource.match(/elo:\s*\{([\s\S]*?)\},/);
  assert.ok(eloBlockMatch, "expected an elo: { ... } object in the player computed");
  assert.match(
    eloBlockMatch[1],
    /competitive:\s*props\.ranks\?\.avg_elo\s*\?\?\s*undefined,/,
  );
  assert.match(
    eloBlockMatch[1],
    /wingman:\s*props\.ranks\?\.avg_wingman_elo\s*\?\?\s*undefined,/,
  );
  assert.match(
    eloBlockMatch[1],
    /duel:\s*props\.ranks\?\.avg_duel_elo\s*\?\?\s*undefined,/,
  );
});

test("PlayerRanks/PlayerElo rendering and tooltip wiring are untouched -- only the ranks data source was widened", () => {
  assert.match(summarySource, /<PlayerRanks :player="player" \/>/);
  assert.match(summarySource, /const hasRanks = computed\(/);
  assert.match(summarySource, /v-if="hasRanks"/);
});

console.log("team detail mode-ELO wiring checks passed");
