import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// TeamSearch.vue was a third independent implementation of "team average
// ELO", computing it from raw roster player.elo.competitive via
// utilities/teamElo.ts's teamAvgElo() -- the same class of stale-value bug
// already fixed for the team detail page and /teams (both now read
// teams.ranks.avg_elo / v_team_ranks). This makes TeamSearch read that same
// canonical field instead of recomputing.

const searchSource = await readFile(
  new URL("../components/teams/TeamSearch.vue", import.meta.url),
  "utf8",
);
const lineupOverviewSource = await readFile(
  new URL("../components/match/LineupOverview.vue", import.meta.url),
  "utf8",
);
const teamEloSource = await readFile(
  new URL("../utilities/teamElo.ts", import.meta.url),
  "utf8",
);

test("TeamSearch's enrichTeams query requests ranks.avg_elo", () => {
  const enrichTeamsBlock = searchSource.slice(
    searchSource.indexOf("async enrichTeams()"),
    searchSource.indexOf("async enrichTeams()") + 1200,
  );
  assert.match(enrichTeamsBlock, /ranks:\s*\{\s*avg_elo:\s*true,?\s*\}/);
});

test("TeamSearch assigns avg_elo from details.ranks.avg_elo, not teamAvgElo(roster)", () => {
  assert.match(searchSource, /avg_elo:\s*details\?\.ranks\?\.avg_elo\s*\?\?\s*null,/);
  assert.doesNotMatch(searchSource, /avg_elo:\s*teamAvgElo\(roster\)/);
});

test("TeamSearch no longer imports teamAvgElo -- only teamAvgPremier, which is unrelated to this fix", () => {
  assert.doesNotMatch(searchSource, /import \{ teamAvgElo, teamAvgPremier \}/);
  assert.match(searchSource, /import \{ teamAvgPremier \} from "~\/utilities\/teamElo";/);
  assert.doesNotMatch(searchSource, /\bteamAvgElo\(/);
});

test("raw player.elo is no longer fetched for TeamSearch's roster enrichment (it was only used for the removed avg_elo computation)", () => {
  const enrichTeamsBlock = searchSource.slice(
    searchSource.indexOf("async enrichTeams()"),
    searchSource.indexOf("async enrichTeams()") + 1200,
  );
  assert.doesNotMatch(enrichTeamsBlock, /steam_id:\s*true,\s*elo:\s*true,/);
  // premier_rank is still needed for the unrelated, untouched avg_premier path.
  assert.match(enrichTeamsBlock, /premier_rank:\s*true,/);
});

test("avg_premier still uses teamAvgPremier(roster) -- Premier averaging is unrelated to this fix and untouched", () => {
  assert.match(searchSource, /avg_premier:\s*teamAvgPremier\(roster\),/);
});

test("teamElo.ts itself is untouched -- teamAvgElo still exists, still used by LineupOverview.vue's per-match-lineup average (a different, mode-aware concept from a persistent team's v_team_ranks average)", () => {
  assert.match(teamEloSource, /export function teamAvgElo\(/);
  assert.match(teamEloSource, /export function teamAvgPremier\(/);
  assert.match(lineupOverviewSource, /import \{ teamAvgElo \} from "~\/utilities\/teamElo";/);
  assert.match(lineupOverviewSource, /teamAvgElo\(lp\?\.lineup_players \?\? \[\], eloKey\)/);
});

test("TeamSearch workflow behavior is unchanged: search, selection, eligibility, my-teams-only, and player_count all still wired the same way", () => {
  assert.match(searchSource, /async searchTeams\(query\?: string\)/);
  assert.match(searchSource, /debouncedSearch: debounce\(\(query: string\) => \{/);
  assert.match(searchSource, /select\(team: Team\)/);
  assert.match(searchSource, /canSelectTeam\(team: Team\): boolean/);
  assert.match(searchSource, /toggleMyTeamsOnly\(\)/);
  assert.match(searchSource, /player_count:\s*roster\.length,/);
  assert.match(searchSource, /status:\s*\{\s*_in:\s*\["Starter",\s*"Substitute"\]\s*\}/);
});

test("team logos, names, and navigation-relevant fields are unchanged", () => {
  assert.match(searchSource, /teamAvatarSrc\(team: \{ avatar_url\?: string \| null \}\): string \| null \{/);
  assert.match(searchSource, /short_name: true,/);
  assert.match(searchSource, /\$emit\("selected", team\)/);
  assert.match(searchSource, /\$emit\("update:modelValue", team\)/);
});
