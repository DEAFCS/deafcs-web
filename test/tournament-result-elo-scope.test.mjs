import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

const resultsSource = await read("components/tournament/TournamentResults.vue");
const matchRowSource = await read("components/MatchTableRow.vue");

// Tournament Results tab scopes elo_changes to the logged-in viewer only,
// so the badge shown on a match card is the viewer's own delta -- never an
// arbitrary participant's. This mirrors RecentGamesPanel.vue's matches
// subscription, which uses the same player_steam_id-scoped filter for the
// homepage's "my recent games" widget.
assert.match(
  resultsSource,
  /player_steam_id:\s*\{\s*_eq:\s*\$\("viewerSteamId",\s*"bigint"\)\s*,?\s*\}/,
);
assert.match(resultsSource, /viewerSteamId:\s*useAuthStore\(\)\.me\?\.steam_id\s*\?\?\s*null/);

// The old unfiltered, two-field-only selection (no where clause, and no
// `type`, which is why MatchTableRow's type-matching .find() always fell
// through to elo_changes[0] -- an arbitrary player) must be gone.
const eloChangesBlockMatch = resultsSource.match(
  /elo_changes:\s*\[([\s\S]*?)\n\s{14}\],/,
);
assert.ok(eloChangesBlockMatch, "expected an elo_changes selection block");
assert.doesNotMatch(eloChangesBlockMatch[1], /^\s*\{\},\s*$/m);
assert.match(eloChangesBlockMatch[1], /where:\s*\{/);

// Reuses the shared eloFields selector (same as RecentGamesPanel.vue) rather
// than hand-rolling a narrower field list.
assert.match(resultsSource, /import \{ eloFields \} from "~\/graphql\/eloFields";/);
assert.match(eloChangesBlockMatch[1], /eloFields/);

// No team-average, winner's-change, or other substitute logic was
// introduced -- the fix is purely a query-level participant filter.
assert.doesNotMatch(resultsSource, /team_avg_elo|winnerElo|averageElo/i);

// MatchTableRow's own elo-picking logic is untouched: with elo_changes now
// pre-scoped to 0-or-1 rows by the caller's query, its existing
// find(type match) ?? at(0) fallback naturally resolves to the viewer's row
// (participant) or undefined (non-participant) with no changes needed here.
assert.match(
  matchRowSource,
  /this\.match\.elo_changes\?\.find\(\(ec: any\) => ec\.type === matchType\) \?\?\s*\n\s*this\.match\.elo_changes\?\.at\(0\)/,
);

// Winner/loser score coloring is a separate, viewer-independent concern and
// must remain wired to winning_lineup_id, untouched by this fix.
assert.match(matchRowSource, /getScoreColorClasses\(lineupId: string\)/);
assert.match(matchRowSource, /this\.match\.winning_lineup_id === lineupId/);

console.log("tournament result ELO viewer-scoping checks passed");
