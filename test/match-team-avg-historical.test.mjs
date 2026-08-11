import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The TEAM AVG header on /matches/[id] previously averaged live/current
// player.elo (utilities/teamElo.ts's teamAvgElo), so an old match's header
// drifted upward as its players played more matches later -- while the same
// match's ELO Change Details popup already correctly showed the historical
// pre-match team average via the stored player_team_elo_avg column. This
// makes the header read that same already-computed, already-selected value
// instead of re-averaging live ELO client-side.

const lineupOverview = await readFile(
  new URL("../components/match/LineupOverview.vue", import.meta.url),
  "utf8",
);
const lineupOverviewRow = await readFile(
  new URL("../components/match/LineupOverviewRow.vue", import.meta.url),
  "utf8",
);
const eloChangeBadge = await readFile(
  new URL("../components/EloChangeBadge.vue", import.meta.url),
  "utf8",
);
const playerElo = await readFile(
  new URL("../components/PlayerElo.vue", import.meta.url),
  "utf8",
);
const playerDisplay = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);

function extractMethod(source, name) {
  const start = source.indexOf(`${name}(lp: any): number | null {`);
  assert.ok(start !== -1, `expected to find ${name}(lp) in the file`);
  const end = source.indexOf("\n    },", start);
  return source.slice(start, end);
}

// 1 & 2. Reads player_team_elo_avg from match.elo_changes, matched against
// this lineup's own players (not a global/unscoped lookup).
test("teamAvgRank reads player_team_elo_avg from match.elo_changes, scoped to this lineup's players", () => {
  const method = extractMethod(lineupOverview, "teamAvgRank");
  assert.match(method, /lp\?\.lineup_players/);
  assert.match(
    method,
    /member\?\.steam_id \?\? member\?\.player\?\.steam_id/,
    "expected the same steam-id fallback style used by memberEloChange",
  );
  assert.match(method, /this\.match\?\.elo_changes\?\.find\?\./);
  assert.match(method, /steamIds\.includes\(String\(ec\.player_steam_id\)\)/);
  assert.match(method, /eloChange\?\.player_team_elo_avg/);
});

// 3. Math.round is used on the resolved value.
test("teamAvgRank rounds the resolved team average", () => {
  const method = extractMethod(lineupOverview, "teamAvgRank");
  assert.match(method, /Math\.round\(teamAvg\)/);
});

// 4. No matching historical row -> null, and the template already hides on
// null (unchanged).
test("teamAvgRank returns null with no matching historical row, and the template still hides on null", () => {
  const method = extractMethod(lineupOverview, "teamAvgRank");
  assert.match(
    method,
    /if \(rawAvg === null \|\| rawAvg === undefined\) \{\s*\n\s*return null;\s*\n\s*\}/,
  );
  assert.match(lineupOverview, /v-if="teamAvgRank\(lp\) !== null"/);
});

// 5. teamAvgElo / live player.elo is no longer used for this header.
test("teamAvgElo and the live teamElo.ts import are no longer used in LineupOverview.vue", () => {
  assert.doesNotMatch(lineupOverview, /teamAvgElo/);
  assert.doesNotMatch(
    lineupOverview,
    /import \{ teamAvgElo \} from "~\/utilities\/teamElo";/,
  );
  const method = extractMethod(lineupOverview, "teamAvgRank");
  assert.doesNotMatch(method, /\.player\?\.elo\?\./);
});

// 6. EloChangeBadge's TEAM ELO popup logic is completely untouched.
test("EloChangeBadge's player_team_elo_avg / opponent_team_elo_avg TEAM ELO logic is untouched", () => {
  assert.match(
    eloChangeBadge,
    /const playerTeamElo = computed\(\(\) =>\s*\n\s*Math\.round\(toNum\(props\.eloChange\?\.player_team_elo_avg\)\),\s*\n\);/,
  );
  assert.match(
    eloChangeBadge,
    /const opponentTeamElo = computed\(\(\) =>\s*\n\s*Math\.round\(toNum\(props\.eloChange\?\.opponent_team_elo_avg\)\),\s*\n\);/,
  );
});

// 7. The prior individual historical-ELO fix (desktop/mobile current_elo
// wiring, PlayerElo's historicalElo override) remains untouched.
test("the prior individual historical player ELO fix is untouched", () => {
  assert.match(
    lineupOverviewRow,
    /:historical-elo="memberEloChange\?\.current_elo"/,
  );
  assert.match(
    playerElo,
    /primaryElo\(\): number \| undefined \{\s*\n\s*if \(this\.historicalElo != null\) \{\s*\n\s*return this\.historicalElo;\s*\n\s*\}/,
  );
  assert.match(playerDisplay, /:historical-elo="historicalElo"/);
});

console.log("match TEAM AVG historical checks passed");
