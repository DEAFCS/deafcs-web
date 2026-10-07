import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const detail = await read("pages/teams/[id].vue");
const list = await read("pages/teams/index.vue");
const startingFive = await read("components/team/TeamStartingFive.vue");
const teamMember = await read("components/teams/TeamMember.vue");
const teamMembers = await read("components/teams/TeamMembers.vue");
const teamMatches = await read("components/team/TeamMatches.vue");
const hero = await read("components/team/TeamHero.vue");
const stage = await read("components/team/TeamStage.vue");
const overview = await read("components/team/TeamOverview.vue");
const ticker = await read("components/team/TeamResultsTicker.vue");

test("team detail composes the current 5Stack page", () => {
  for (const component of ["TeamHero", "TeamStage", "TeamResultsTicker", "TeamOverview", "TeamMatches", "TeamCareerStats", "TeamVetoStats", "TeamHighlights", "TeamScrimManager", "MobileTabSelect"]) {
    assert.match(detail, new RegExp(`<${component}\\b`), `${component} must be on the team page`);
  }
  // The old hero, award case row and paged MatchesTable are gone.
  assert.doesNotMatch(detail, /teamHeroClasses|<AwardCase|MatchesTable|TeamCalendarButton/);
  // 5Stack's Utility library and award composer do not exist in DEAFCS.
  assert.doesNotMatch(detail, /TeamUtilityUtility|AwardComposer|canSeeUtility/);
  assert.match(detail, /const VALID_TABS = \[\s*"overview",\s*"matches",\s*"stats",\s*"veto",\s*"highlights",\s*"scrim",?\s*\];/);
});

test("phones get a tab select, wider screens the tab strip", async () => {
  assert.match(detail, /<MobileTabSelect v-model="tab"/);
  assert.match(detail, /overflow-x-auto max-md:hidden/);
  assert.match(await read("components/common/MobileTabSelect.vue"), /class="md:hidden"/);
});

test("DEAFCS keeps its award model: occurrences flattened by one adapter", async () => {
  assert.match(detail, /recipientToGrant\(recipient, this\.teamAwardSlots/);
  assert.match(detail, /tournament_award_slots: \[/);
  assert.match(detail, /player_steam_id: \{\s*_is_null: true/);
  // Renders through AwardArtwork (uploaded artwork, silhouette or tier icon),
  // and AwardCase/AwardModal still take DEAFCS trophies.
  assert.match(hero, /<AwardArtwork/);
  assert.doesNotMatch(hero, /AwardBadge/);
  assert.match(hero, /:trophies="awards\.map\(\(grant\) => grant\.trophy\)"/);
  assert.match(hero, /:trophy="selectedAward\.trophy"/);
  assert.doesNotMatch(await read("components/teams/TeamsAwardShelf.vue"), /AwardBadge/);
});

test("last-admin protection is intact on every path the page exposes", () => {
  // Leave goes through the DEAFCS guard, never straight to the dialog.
  assert.match(detail, /@click="requestLeaveTeam"/);
  assert.doesNotMatch(detail, /@click="leaveTeamAlertDialog = true"/);
  const request = detail.slice(detail.indexOf("requestLeaveTeam() {"), detail.indexOf("async leaveTeam() {"));
  assert.match(request, /if \(this\.isLastAdmin\)/);
  assert.match(request, /team\.admin\.last_admin/);
  assert.match(request, /return;/);
  assert.match(detail, /isLastAdmin\(\): boolean \{\s*return \(\s*this\.currentTeamMembership\?\.role === "Admin" && this\.adminCount === 1/);
  // The database's own refusal is translated, not swallowed.
  assert.match(detail, /message\.includes\("last team Admin"\)/);
  // Admin leaving still gets the stronger confirmation text.
  assert.match(detail, /team\.admin\.leave_confirmation/);
  // Existing editing stays unchanged; owner/site-admin deletion now matches
  // the local Hasura permissions.
  assert.match(detail, /<template v-if="isAdmin \|\| isTeamOwner">/);
  assert.match(detail, /<template v-if="canDeleteTeam">\s*<DropdownMenuSeparator \/>/);
  assert.match(detail, /canDeleteTeam\(\)\s*\{\s*return this\.isTeamOwner \|\| this\.isAdmin;/);
  assert.match(detail, /@click="deleteTeamAlertDialog = true"/);
});

test("the roster components keep their role guards; Starting Five only invites", () => {
  assert.match(teamMember, /requestRoleChange/);
  assert.match(teamMember, /isLastAdmin/);
  assert.match(teamMember, /showLastAdminError/);
  assert.match(teamMember, /last team Admin/);
  assert.match(teamMembers, /:is-last-admin="member\.role === 'Admin' && adminCount === 1"/);
  // Presentation only: its single mutation is the same invite insert the full
  // roster uses, with no role/status/coach/delete path.
  const mutations = [...startingFive.matchAll(/(insert|update|delete)_[a-z_]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(mutations)], ["insert_team_roster_one"]);
  const mutation = startingFive.slice(
    startingFive.indexOf("mutation: generateMutation({"),
    startingFive.indexOf("function rosterImage"),
  );
  assert.match(mutation, /team_id: props\.team\.id,\s*player_steam_id: player\.steam_id,?\s*\}/);
  assert.doesNotMatch(mutation, /role|coach|status|delete_|update_/);
  assert.match(startingFive, /teamRosterBuckets\(roster\.value\)/);
  assert.match(startingFive, /<TeamMembers :team-id="team\.id" \/>/);
  // Only registered players can be invited, same as the full roster.
  assert.match(startingFive, /:registeredOnly="true"/);
});

test("team matches use the shared DEAFCS match rows", () => {
  assert.match(teamMatches, /import PlayerMatchesTable from "~\/components\/player\/PlayerMatchesTable\.vue"/);
  assert.match(teamMatches, /\.\.\.simpleMatchFields/);
  assert.doesNotMatch(teamMatches, /matchRowFields|(?<!Player)MatchesTable from/);
  // The results ticker and stage cards are DEAFCS match cards (map backgrounds,
  // mode badges, tournament names), not upstream's ticker cell.
  assert.match(ticker, /WatchMatchCard/);
  assert.match(stage, /tickerCell/);
  assert.doesNotMatch(ticker + stage, /WatchTickerCell/);
});

test("scrolling stays inside the page's own scroll rows", () => {
  assert.match(ticker, /<HorizontalScrollRow/);
  assert.match(overview, /min-w-0/);
});

test("navigation is client-side", () => {
  for (const source of [detail, list, hero, stage, overview, ticker, startingFive, teamMatches]) {
    // No hard navigation. (The page's tab sync reads location.href for
    // history.replaceState, which is not a navigation.)
    assert.doesNotMatch(source, /location\.(assign|replace|reload)\(|location\.href\s*=/);
  }
  assert.match(detail, /window\.history\.replaceState\(window\.history\.state/);
  // The hero summary no longer carries the captain (5Stack): players, matches,
  // founded. The captain stays in the Starting Five and the roster.
  assert.doesNotMatch(hero, /captain|PlayerDisplay/i);
  assert.match(hero, /team\.pulse\.hero\.founded/);
  assert.match(startingFive, /team\.roles\.captain/);
  assert.match(detail, /this\.\$router\.push\("\/teams"\)/);
});

test("fields the DEAFCS API does not have are not selected", async () => {
  for (const file of [
    "pages/teams/[id].vue",
    "components/teams/TeamsLookingForScrims.vue",
    "composables/useLiveTeamMatches.ts",
    "graphql/teamPulseFields.ts",
  ]) {
    const source = await read(file);
    assert.doesNotMatch(source, /avg_rush_elo|is_league: true/, file);
  }
});

test("the veto simulator stays removed; real veto stats stay", async () => {
  // Intentional DEAFCS deviation: 5Stack's TeamVetoSimulator does not return.
  assert.doesNotMatch(detail, /TeamVetoSimulator/);
  await assert.rejects(read("components/team/TeamVetoSimulator.vue"));
  const en = JSON.parse(await read("i18n/locales/en.json"));
  assert.equal(en.pages.teams.veto_sim, undefined);
  // The Map Veto tab is the real historical stats.
  assert.match(detail, /<TabsTrigger value="veto">/);
  assert.match(detail, /<TeamVetoStats\s+v-if="visitedTabs\.includes\('veto'\)"/);
  assert.match(await read("components/team/TeamVetoStats.vue"), /teamVetoStatsQuery/);
});

test("team highlights are the shared ClipTile, ordered by top play", async () => {
  const highlights = await read("components/team/TeamHighlights.vue");
  assert.match(highlights, /import ClipTile from "~\/components\/clips\/ClipTile\.vue"/);
  assert.doesNotMatch(highlights, /HighlightCard/);
  assert.match(highlights, /order_by: topPlayOrderBy/);
});

test("removal tells the admin why it is blocked or ignored", async () => {
  assert.match(teamMember, /removeBlockedAsLastAdmin/);
  assert.match(teamMember, /data-testid="remove-blocked-reason"/);
  assert.match(teamMember, /team\.admin\.last_admin_remove/);
  assert.match(teamMember, /!data\?\.delete_team_roster_by_pk/);
  assert.match(teamMember, /team\.admin\.remove_not_permitted/);
  // The guard itself is unchanged: a last Admin is never offered Remove.
  assert.match(teamMember, /this\.team\.can_remove && !this\.isSelf && !this\.isLastAdmin/);
});
