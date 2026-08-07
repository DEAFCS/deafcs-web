import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression coverage for the profile-vs-leaderboard rank/percentile
// inconsistency: PlayerLeaderboardRank.vue (mounted in the player profile's
// per-mode ELO cards) called get_player_leaderboard_rank without a
// _season_id argument at all, so the profile's rank/percentile were always
// computed against the player's all-time-latest row across every player
// (unscoped), while the leaderboard page scopes the same function to the
// active named season. This let the profile show a confident-looking
// rank/percentile for a mode the player hadn't played all season, and
// produced off-by-a-few ranks even when the ELO value happened to match.
//
// Fix: PlayerLeaderboardRank now accepts a seasonId prop and sends it as
// _season_id, and the profile page (players/[id].vue) passes its own
// existing `activeSeason` computed -- the same "season containing now"
// source the page's own season quick-filter already uses -- rather than
// introducing a second, independent way to resolve the active season.

const rankComponentSource = await readFile(
  new URL("../components/PlayerLeaderboardRank.vue", import.meta.url),
  "utf8",
);
const profilePageSource = await readFile(
  new URL("../pages/players/[id].vue", import.meta.url),
  "utf8",
);

test("RANK_QUERY declares and sends $season_id / _season_id, matching the leaderboard page's own PLAYER_RANK_QUERY shape", () => {
  assert.match(rankComponentSource, /\$season_id:\s*uuid/);
  assert.match(rankComponentSource, /_season_id:\s*\$season_id/);
});

test("the seasonId prop exists and is sent as season_id in the query variables", () => {
  assert.match(rankComponentSource, /seasonId\?:\s*string \| null;/);
  assert.match(
    rankComponentSource,
    /season_id:\s*props\.seasonId \?\? null,/,
  );
});

test("changing seasonId re-fetches the rank, exactly like playerSteamId/matchType already do", () => {
  assert.match(
    rankComponentSource,
    /watch\(\s*\(\) => \[props\.playerSteamId, props\.matchType, props\.seasonId\],/,
  );
});

test("no Source argument is sent -- the backend's default ('overall') is preserved, matching the leaderboard's default (no explicit Source filter)", () => {
  assert.doesNotMatch(rankComponentSource, /\$source/);
  assert.doesNotMatch(rankComponentSource, /_source:\s*\$source/);
  assert.doesNotMatch(rankComponentSource, /\bsource:\s*(props\.source|"[a-z]+")/);
});

test("mode (match_type) handling is untouched", () => {
  assert.match(
    rankComponentSource,
    /match_type:\s*props\.matchType \?\? "Competitive",/,
  );
});

test("percentile still derives purely from the returned rank/total, no other change to that computed", () => {
  assert.match(
    rankComponentSource,
    /const percentile = computed\(\(\) => \{\s*if \(!rank\.value \|\| !total\.value\) return null;\s*return Math\.max\(1, Math\.ceil\(\(rank\.value \/ total\.value\) \* 100\)\);\s*\}\);/,
  );
});

test("the profile page passes its own existing activeSeason (gated on seasonsEnabled), not a new/separate season source", () => {
  // activeSeason / seasonsEnabled are the page's pre-existing computeds
  // (already used by its own season quick-filter) -- reused here, not
  // redefined.
  assert.match(
    profilePageSource,
    /const activeSeason = computed\(\(\) => \{/,
  );
  assert.match(
    profilePageSource,
    /const seasonsEnabled = computed\(\(\) => appSettings\.seasonsEnabled\);/,
  );
  assert.match(
    profilePageSource,
    /<PlayerLeaderboardRank\s*\n\s*:player-steam-id="player\.steam_id"\s*\n\s*:match-type="mode\.type"\s*\n\s*:season-id="seasonsEnabled \? \(activeSeason\?\.id \?\? null\) : null"/,
  );
});

test("when seasons are disabled, season-id is explicitly null -- same null-season_id behavior the leaderboard falls back to", () => {
  assert.match(
    profilePageSource,
    /:season-id="seasonsEnabled \? \(activeSeason\?\.id \?\? null\) : null"/,
  );
});
