import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// /teams independently recalculated its AVG ELO card from
// roster[].player.elo.competitive -- a raw field that can fall back to a
// player's lifetime ELO outside the active season (the same class of bug
// v_team_ranks was fixed for). The team detail page already correctly
// reads teams.ranks.avg_elo (v_team_ranks via _team_rank_competitive_elo).
// This fix makes /teams read that same source instead of recomputing.

const pageSource = await readFile(
  new URL("../pages/teams/index.vue", import.meta.url),
  "utf8",
);
const tableSource = await readFile(
  new URL("../components/TeamsTable.vue", import.meta.url),
  "utf8",
);

test("the main teams list query requests ranks.avg_elo", () => {
  const teamsBlock = pageSource.slice(
    pageSource.indexOf("teams: ["),
    pageSource.indexOf("teams: [") + 1200,
  );
  assert.match(teamsBlock, /ranks:\s*\{\s*avg_elo:\s*true,?\s*\}/);
});

test("the 'My Teams Only' query also requests ranks.avg_elo, so that filter shows the same corrected average", () => {
  const myTeamsBlock = pageSource.slice(
    pageSource.indexOf("myTeams: {"),
    pageSource.indexOf("myTeams: {") + 900,
  );
  assert.match(myTeamsBlock, /teams:\s*\[/);
  assert.match(myTeamsBlock, /ranks:\s*\{\s*avg_elo:\s*true,?\s*\}/);
});

test("TeamsTable.avgElo reads team.ranks.avg_elo directly", () => {
  assert.match(
    tableSource,
    /avgElo\(team: \{ ranks\?: \{ avg_elo\?: number \| null \} \| null \}\): number \| null \{\s*\n\s*return team\.ranks\?\.avg_elo \?\? null;\s*\n\s*\},/,
  );
});

test("raw roster player.elo is no longer used to compute the average ELO", () => {
  // topStarters() (avatar selection) is allowed to keep reading
  // player.elo.competitive -- that's a separate, unrelated concern this
  // fix explicitly leaves alone. What must NOT exist anymore is any
  // averaging/reduce over those values.
  assert.doesNotMatch(
    tableSource,
    /roster\s*\.map\(\(r\) => r\.player\?\.elo\?\.competitive\)/,
  );
  assert.doesNotMatch(
    tableSource,
    /values\.reduce\(\(a, b\) => a \+ b, 0\) \/ values\.length/,
  );
});

test("topStarters (featured roster avatars) is untouched -- still sorts by player.elo.competitive, unrelated to the avg-ELO fix", () => {
  assert.match(
    tableSource,
    /topStarters\(team: \{ roster\?: RosterEntry\[\] \}\): RosterEntry\[\] \{/,
  );
  assert.match(
    tableSource,
    /const aElo = a\.player\?\.elo\?\.competitive \?\? 0;/,
  );
  assert.match(
    tableSource,
    /const bElo = b\.player\?\.elo\?\.competitive \?\? 0;/,
  );
  assert.match(tableSource, /\.slice\(0, 5\);/);
});

test("the avg-ELO badge template is unchanged in shape -- still guarded by avgElo(team) !== null", () => {
  assert.match(tableSource, /v-if="avgElo\(team\) !== null"/);
  assert.match(tableSource, /\{\{ avgElo\(team\) \}\}/);
});

test("other team-card data (roster count, FACEIT/Premier via playerFields, trophies, avatar) is untouched", () => {
  assert.match(tableSource, /rosterCount\(team: \{ roster\?: RosterEntry\[\] \}\): number \{/);
  assert.match(tableSource, /teamAvatarSrc\(team: \{ avatar_url\?: string \| null \}\): string \| null \{/);
  assert.match(tableSource, /teamTrophies\(team: \{ id: string \}\): TrophyEntry\[\] \{/);
  assert.match(pageSource, /player: playerFields/);
});

test("search, My Teams Only, tournament-winner and scrim filters, and pagination wiring are unchanged", () => {
  assert.match(pageSource, /form\.values\.teamQuery/);
  assert.match(pageSource, /showOnlyMyTeams/);
  assert.match(pageSource, /tournamentWinnersOnly/);
  assert.match(pageSource, /scrimsOnly/);
  assert.match(pageSource, /teams_aggregate:/);
  assert.match(pageSource, /onPageChange\(newPage: number\)/);
});

test("team card and 'view top team' navigation still target the team page route", () => {
  assert.match(pageSource, /this\.\$router\.push\(`\/teams\/\$\{team\.id\}`\)/);
  assert.match(tableSource, /:to="\{ name: 'teams-id', params: \{ id: team\.id \} \}"/);
});
