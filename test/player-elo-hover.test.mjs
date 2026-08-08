import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression coverage for the ELO hover card (PlayerElo.vue's HoverCardContent,
// mounted via PlayerDisplay.vue, LineupOverviewRow.vue's mobile row,
// pages/players/index.vue's search table, and draft-games/PlayerRanks.vue).
//
// Bug 1 (fixed previously): the hover collapsed to a single-mode object once
// a match finished, hiding the other two modes' ratings. Fixed by always
// passing the player's full current per-mode ELO object through.
//
// Bug 2 (fixed here): the "full current per-mode ELO object" was
// `player.elo` -- the players.elo computed field, whose season branch
// (get_player_elo.sql's get_player_season_elo_by_type) falls back to a
// player's lifetime-latest player_elo row when they have no row for the
// active season. This showed a stale/previous-season rating in the hover
// (e.g. TricoN's Competitive: 4905) even after the profile summary was
// fixed to show the season starting ELO (5000) for the same case.
//
// Fix: every direct PlayerElo mount now sources its `elo` prop through the
// shared usePlayerActiveSeasonElo() composable's eloForPlayer(player)
// instead of reading player.elo directly -- reusing the same
// season-row-wins / else-5000 / else-passthrough logic already proven on
// the profile page, rather than duplicating a second implementation. No new
// SQL/schema/migration/write-path change; read-only, batched + cached
// per-player-per-season to avoid a query-per-badge storm on list-heavy
// pages.

const composableSource = await readFile(
  new URL("../composables/usePlayerActiveSeasonElo.ts", import.meta.url),
  "utf8",
);
const playerDisplaySource = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);
const lineupRowSource = await readFile(
  new URL("../components/match/LineupOverviewRow.vue", import.meta.url),
  "utf8",
);
const playersIndexSource = await readFile(
  new URL("../pages/players/index.vue", import.meta.url),
  "utf8",
);
const playerRanksSource = await readFile(
  new URL("../components/draft-games/PlayerRanks.vue", import.meta.url),
  "utf8",
);
const eloChangeBadgeSource = await readFile(
  new URL("../components/EloChangeBadge.vue", import.meta.url),
  "utf8",
);

test("usePlayerActiveSeasonElo passes player.elo through unchanged when seasons are disabled", () => {
  assert.match(
    composableSource,
    /if \(!appSettings\.seasonsEnabled\) \{\s*\n\s*return player\?\.elo;\s*\n\s*\}/,
  );
});

test("usePlayerActiveSeasonElo passes player.elo through unchanged when there is no active season", () => {
  assert.match(
    composableSource,
    /if \(!seasonId \|\| !player\?\.steam_id\) \{\s*\n\s*return player\?\.elo;\s*\n\s*\}/,
  );
});

test("usePlayerActiveSeasonElo resolves a season row's updated_elo, or exactly 5000 per mode when there is none -- never the lifetime value", () => {
  assert.match(composableSource, /const SEASON_ELO_DISPLAY_DEFAULT = 5000;/);
  assert.match(
    composableSource,
    /competitive:\s*\n\s*typeof entry\.data\.Competitive === "number"\s*\n\s*\? entry\.data\.Competitive\s*\n\s*: SEASON_ELO_DISPLAY_DEFAULT,/,
  );
  assert.match(
    composableSource,
    /wingman:\s*\n\s*typeof entry\.data\.Wingman === "number"\s*\n\s*\? entry\.data\.Wingman\s*\n\s*: SEASON_ELO_DISPLAY_DEFAULT,/,
  );
  assert.match(
    composableSource,
    /duel:\s*\n\s*typeof entry\.data\.Duel === "number"\s*\n\s*\? entry\.data\.Duel\s*\n\s*: SEASON_ELO_DISPLAY_DEFAULT,/,
  );
});

test("usePlayerActiveSeasonElo reads v_player_elo (the same canonical player_elo table) scoped to the active season -- read-only, no mutation", () => {
  assert.match(
    composableSource,
    /query PlayersActiveSeasonElo\(\$where: v_player_elo_bool_exp!\) \{/,
  );
  assert.match(composableSource, /distinct_on: \[player_steam_id, type\]/);
  assert.doesNotMatch(composableSource, /mutation/i);
  assert.doesNotMatch(composableSource, /insert_player_elo/);
});

test("requests for distinct players are coalesced into one batched query per tick, not one query per badge", () => {
  assert.match(composableSource, /player_steam_id: \{ _in: ids \}/);
  assert.match(composableSource, /queueMicrotask\(\(\) => flush\(apolloClient\)\)/);
  assert.match(composableSource, /if \(inFlight\.has\(key\)\) return;/);
});

test("cached results carry a fetchedAt timestamp and are keyed module-wide by steamId+seasonId, so repeated mounts of the same fresh player share one fetch", () => {
  assert.match(
    composableSource,
    /type CacheEntry = \{ data: SeasonEloByType; fetchedAt: number \};/,
  );
  assert.match(
    composableSource,
    /const resultCache = reactive\(new Map<string, CacheEntry>\(\)\);/,
  );
});

test("cached results are NOT cached indefinitely -- they expire on a short TTL instead of relying on polling or a manual invalidation hook", () => {
  assert.match(composableSource, /const CACHE_TTL_MS = 30_000;/);
  assert.match(
    composableSource,
    /function isFresh\(entry: CacheEntry \| undefined\): boolean \{\s*\n\s*return !!entry && Date\.now\(\) - entry\.fetchedAt < CACHE_TTL_MS;\s*\n\s*\}/,
  );
  // No timers anywhere in the file -- staleness is checked lazily on read,
  // never polled in the background.
  assert.doesNotMatch(composableSource, /setInterval/);
  assert.doesNotMatch(composableSource, /setTimeout/);
});

test("an expired entry triggers exactly one background refetch on next read (via the same inFlight dedup as a first-time fetch), while still rendering the last known value instead of flickering", () => {
  assert.match(
    composableSource,
    /const entry = resultCache\.get\(key\);\s*\n\s*if \(!isFresh\(entry\)\) \{/,
  );
  assert.match(
    composableSource,
    /requestSeasonElo\(apolloClient, steamId, seasonId\);\s*\n\s*\}\s*\n\s*if \(!entry\) \{\s*\n\s*return player\?\.elo; \/\/ nothing resolved yet at all\s*\n\s*\}/,
  );
});

test("PlayerDisplay.vue's PlayerElo mounts source elo from the shared composable, not player.elo directly", () => {
  assert.match(
    playerDisplaySource,
    /const \{ eloForPlayer \} = usePlayerActiveSeasonElo\(\);/,
  );
  assert.match(playerDisplaySource, /:elo="eloForPlayer\(player\)"/);
  const eloForPlayerMatches = playerDisplaySource.match(
    /:elo="eloForPlayer\(player\)"/g,
  );
  assert.equal(
    eloForPlayerMatches?.length,
    2,
    "both PlayerElo mounts (matchRank branch and default branch) must use eloForPlayer",
  );
  assert.doesNotMatch(playerDisplaySource, /eloForDisplay/);
});

test("LineupOverviewRow.vue's mobile PlayerElo mount sources elo from the shared composable, not member.player.elo directly", () => {
  assert.match(
    lineupRowSource,
    /const \{ eloForPlayer \} = usePlayerActiveSeasonElo\(\);/,
  );
  assert.match(lineupRowSource, /:elo="eloForPlayer\(member\?\.player\)"/);
  assert.doesNotMatch(lineupRowSource, /mobileEloForDisplay/);
});

test("pages/players/index.vue's table PlayerElo mount sources elo from the shared composable, mapping in the Typesense-mirrored fields", () => {
  assert.match(
    playersIndexSource,
    /const \{ eloForPlayer \} = usePlayerActiveSeasonElo\(\);/,
  );
  assert.match(
    playersIndexSource,
    /eloForPlayer\(\{\s*\n\s*steam_id: player\.steam_id,\s*\n\s*elo: \{\s*\n\s*competitive: player\.elo_competitive,\s*\n\s*wingman: player\.elo_wingman,\s*\n\s*duel: player\.elo_duel,\s*\n\s*\},\s*\n\s*\}\)/,
  );
});

test("draft-games/PlayerRanks.vue's PlayerElo mount sources elo from the shared composable, not player.elo directly", () => {
  assert.match(
    playerRanksSource,
    /const \{ eloForPlayer \} = usePlayerActiveSeasonElo\(\);/,
  );
  assert.match(playerRanksSource, /:elo="eloForPlayer\(player\)"/);
});

test("the match row's historical ELO result (EloChangeBadge) is untouched by this fix", () => {
  assert.match(eloChangeBadgeSource, /eloChange/);
  assert.doesNotMatch(eloChangeBadgeSource, /eloForPlayer/);
  assert.doesNotMatch(eloChangeBadgeSource, /usePlayerActiveSeasonElo/);
});

test("memberEloChange (the row's historical source) is still wired from match.elo_changes, unrelated to the hover fix", () => {
  assert.match(
    lineupRowSource,
    /memberEloChange\(\)[\s\S]{0,300}this\.match\.elo_changes\?\.find\?\./,
  );
});
