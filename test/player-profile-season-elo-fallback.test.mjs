import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression coverage for the profile ELO summary's active-season fallback:
// players.elo's season branch (get_player_season_elo_by_type, in
// get_player_elo.sql) falls back to the player's lifetime-latest row when
// they have no player_elo row for the active season, instead of the season
// starting ELO. This showed a stale/lifetime rating (e.g. 4905) paired with
// "Unranked" for a mode the player hadn't played this season, instead of
// the season default (5000) paired with "Unranked".
//
// Fix is web-only, scoped to pages/players/[id].vue: a new query reads
// v_player_elo (the same canonical player_elo table) directly, scoped to
// the active season, to decide the profile ELO summary's display value --
// get_player_elo.sql, PlayerLeaderboardRank.vue, and every other consumer
// of the players.elo computed field are untouched.

const profilePageSource = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);

test("SEASON_ELO_QUERY reads v_player_elo scoped by season_id, one row per type", () => {
  assert.match(
    profilePageSource,
    /query PlayerActiveSeasonElo\(\$where: v_player_elo_bool_exp!\) \{/,
  );
  assert.match(profilePageSource, /distinct_on: \[type\]/);
  assert.match(
    profilePageSource,
    /order_by: \[\{ type: asc \}, \{ match_created_at: desc \}\]/,
  );
});

test("fetchSeasonElo filters v_player_elo by the active season and the current player", () => {
  assert.match(
    profilePageSource,
    /player_steam_id: \{ _eq: playerIdRef\.value \},\s*\n\s*season_id: \{ _eq: activeSeason\.value\.id \},/,
  );
});

test("fetchSeasonElo is a no-op (and clears prior state) when seasons are disabled, no active season, or no player", () => {
  assert.match(
    profilePageSource,
    /if \(\s*\n\s*!seasonsEnabled\.value \|\|\s*\n\s*!activeSeason\.value\?\.id \|\|\s*\n\s*!playerIdRef\.value\s*\n\s*\) \{\s*\n\s*return;\s*\n\s*\}/,
  );
  assert.match(
    profilePageSource,
    /async function fetchSeasonElo\(\) \{\s*\n\s*const gen = \+\+seasonEloFetchGen;\s*\n\s*seasonEloByType\.value = \{\};/,
  );
});

test("fetchSeasonElo re-runs whenever the player, active season, or seasons-enabled flag changes", () => {
  assert.match(
    profilePageSource,
    /watch\(\s*\n\s*\(\) => \[playerIdRef\.value, activeSeason\.value\?\.id, seasonsEnabled\.value\],\s*\n\s*fetchSeasonElo,\s*\n\s*\{ immediate: true \},\s*\n\s*\);/,
  );
});

test("eloSummaryValue preserves the existing player.elo value when seasons are disabled or no season is active", () => {
  assert.match(
    profilePageSource,
    /if \(!seasonsEnabled\.value \|\| !activeSeason\.value\) \{\s*\n\s*return lifetimeOrSeasonValue \?\? null;\s*\n\s*\}/,
  );
});

test("eloSummaryValue shows the season-scoped row when one exists, and exactly 5000 otherwise -- never the lifetime fallback", () => {
  assert.match(profilePageSource, /const SEASON_ELO_DEFAULT = 5000;/);
  assert.match(
    profilePageSource,
    /const seasonValue = seasonEloByType\.value\[mode\.type\];\s*\n\s*return typeof seasonValue === "number" \? seasonValue : SEASON_ELO_DEFAULT;/,
  );
  // The season branch never reads lifetimeOrSeasonValue (the raw
  // player.elo[mode] value) -- confirming no lifetime/previous-season
  // fallback path exists once seasons are enabled and a season is active.
});

test("the ELO summary card sources its value/color from eloSummaryValue, not the raw players.elo field", () => {
  assert.match(
    profilePageSource,
    /formatEloSummaryValue\(\s*\n\s*eloSummaryValue\(mode, player\.elo\?\.\[mode\.key\]\),\s*\n\s*\)/,
  );
  assert.match(
    profilePageSource,
    /color: eloTierColor\(\s*\n\s*eloSummaryValue\(mode, player\.elo\?\.\[mode\.key\]\),\s*\n\s*\)/,
  );
});

test("PlayerLeaderboardRank wiring (the Unranked/rank badge) is untouched by this change", () => {
  assert.match(
    profilePageSource,
    /<PlayerLeaderboardRank\s*\n\s*:player-steam-id="player\.steam_id"\s*\n\s*:match-type="mode\.type"\s*\n\s*:season-id="seasonsEnabled \? \(activeSeason\?\.id \?\? null\) : null"/,
  );
});

test("the ELO history chart's query and where-clause are unchanged (still unscoped by season_id -- windowed/lifetime history, not this fix's concern)", () => {
  assert.match(
    profilePageSource,
    /query PlayerWindowedEloHistory\(\$where: v_player_elo_bool_exp!\) \{/,
  );
  assert.match(
    profilePageSource,
    /const whereClause = computed\(\(\) => \{\s*\n\s*const w: Record<string, any> = \{\s*\n\s*player_steam_id: \{ _eq: playerIdRef\.value \},\s*\n\s*\};\s*\n\s*if \(excludeTournaments\.value\) \{\s*\n\s*w\.match = \{ is_tournament_match: \{ _eq: false \} \};\s*\n\s*\}\s*\n\s*return w;\s*\n\s*\}\);/,
  );
});

test("no mutation is introduced -- the fetch is a read-only apolloClient.query against v_player_elo", () => {
  assert.match(
    profilePageSource,
    /query: SEASON_ELO_QUERY,\s*\n\s*variables: \{/,
  );
  const seasonEloBlockStart = profilePageSource.indexOf(
    "async function fetchSeasonElo",
  );
  const seasonEloBlockEnd = profilePageSource.indexOf(
    "\n}",
    seasonEloBlockStart,
  );
  const seasonEloBlock = profilePageSource.slice(
    seasonEloBlockStart,
    seasonEloBlockEnd,
  );
  assert.doesNotMatch(seasonEloBlock, /apolloClient\.mutate/);
  assert.doesNotMatch(seasonEloBlock, /insert_player_elo/);
});
