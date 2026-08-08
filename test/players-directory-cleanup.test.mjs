import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// /players is now a directory: Player | Team | Competitive ELO for everyone,
// plus Privilege | Last Sign In for staff. Wins/Losses/KDR moved out (they
// belong on the leaderboard/player profile). Regression coverage for the
// exact column set and the new Team column's data source.

const source = await readFile(
  new URL("../pages/players/index.vue", import.meta.url),
  "utf8",
);

test("Wins, Losses, and KDR columns are gone -- header cells, row cells, and the calculation helper", () => {
  assert.doesNotMatch(source, /common\.stats\.wins/);
  assert.doesNotMatch(source, /common\.stats\.losses/);
  assert.doesNotMatch(source, /pages\.players\.table\.kdr/);
  assert.doesNotMatch(source, /calculateKDR/);
  assert.doesNotMatch(source, /player\.wins/);
  assert.doesNotMatch(source, /player\.losses/);
  assert.doesNotMatch(source, /StatChevron/);
});

test("Team column header is present, positioned between Player and ELO", () => {
  assert.match(source, /pages\.players\.table\.team/);
  const playerIdx = source.indexOf('@click="toggleSort(\'name\')"');
  const teamIdx = source.indexOf('$t("pages.players.table.team")');
  const eloIdx = source.indexOf("@click=\"toggleSort('elo')\"");
  assert.ok(playerIdx > -1 && teamIdx > -1 && eloIdx > -1);
  assert.ok(
    playerIdx < teamIdx && teamIdx < eloIdx,
    "Team header must sit between Player and Elo headers",
  );
});

test("Team cell resolves the player's CURRENT team only -- excludes pending invites, matches the profile page's own current-team query", () => {
  // team_roster has no soft-delete/removed status; a row existing there is
  // by definition current membership. The one thing that isn't real
  // membership yet is a pending invite, so it's excluded the same way
  // pages/players/[id].vue's playerTeamMemberships query already does.
  assert.match(source, /team_roster:\s*\[/);
  assert.match(source, /role:\s*\{\s*_neq:\s*e_team_roles_enum\.Invite\s*\}/);
  assert.match(source, /player_steam_id:\s*\{\s*_in:\s*steamIds\s*\}/);
});

test("no-team players show an em dash, not a blank cell or an error", () => {
  assert.match(source, /<span v-else class="text-muted-foreground">—<\/span>/);
});

test("the Team link targets the team page route", () => {
  assert.match(
    source,
    /:to="\{ name: 'teams-id', params: \{ id: teamFor\(player\)\.id \} \}"/,
  );
});

test("the player row link still targets the player profile route, for both the Player and ELO cells", () => {
  const matches = source.match(/name: 'players-id',\s*\n\s*params: \{ id: String\(player\.steam_id\) \},/g);
  assert.equal(
    matches?.length,
    2,
    "expected two player-profile links (Player cell wrapper, ELO cell wrapper) now that Team sits between them unwrapped",
  );
});

test("Competitive ELO cell is untouched -- still sourced via the shared usePlayerActiveSeasonElo composable, competitive/wingman/duel fields intact", () => {
  assert.match(source, /const \{ eloForPlayer \} = usePlayerActiveSeasonElo\(\);/);
  assert.match(
    source,
    /eloForPlayer\(\{\s*\n\s*steam_id: player\.steam_id,\s*\n\s*elo: \{\s*\n\s*competitive: player\.elo_competitive,\s*\n\s*wingman: player\.elo_wingman,\s*\n\s*duel: player\.elo_duel,\s*\n\s*\},\s*\n\s*\}\)/,
  );
});

test("admin-only Privilege and Last Sign In columns are unchanged -- still gated by canViewAdditionalDetails", () => {
  assert.match(source, /canViewAdditionalDetails\(\)\s*\{\s*\n\s*return useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.match_organizer\);/);
  const privilegeCol = source.match(/v-if="canViewAdditionalDetails"[^]*?pages\.players\.table\.privilege/);
  const lastSignInCol = source.match(/v-if="canViewAdditionalDetails"[\s\S]*?toggleSort\('last_sign_in_at'\)/);
  assert.ok(privilegeCol, "Privilege header must still be gated behind canViewAdditionalDetails");
  assert.ok(lastSignInCol, "Last Sign In header must still be gated behind canViewAdditionalDetails");
  assert.match(source, /<PlayerRoleForm/);
  assert.match(source, /<TimeAgo/);
});

test("search and filters are untouched -- name search field and the filter form fields still drive searchPlayers", () => {
  assert.match(source, /id="player-name-search"/);
  assert.match(source, /form\.setFieldValue\('name', value as string\)/);
  assert.match(source, /queueSearch: debounce\(\(\) => this\.searchPlayers\(\), 150\)/);
  assert.match(source, /roles:\s*\n\s*this\.form\.values\.roles/);
  assert.match(source, /elo_min:/);
  assert.match(source, /elo_max:/);
  assert.match(source, /countries:/);
  assert.match(source, /sanctions_min:/);
});

test("team lookup is batched (not one query per row) and re-fetched after each search, keyed off the same searchToken race guard as the player list", () => {
  assert.match(source, /async fetchTeams\(steamIds: Array<string \| number>, token: number\)/);
  assert.match(source, /await this\.fetchTeams\(\s*\n\s*this\.players\.map\(\(p\) => p\.steam_id\),\s*\n\s*token,\s*\n\s*\);/);
  assert.match(source, /if \(token !== this\.searchToken\) \{\s*\n\s*return;\s*\n\s*\}/);
});
