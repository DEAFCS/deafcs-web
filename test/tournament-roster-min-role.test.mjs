import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tournament.min_role is now enforced by the backend against the TARGET
// player being added to tournament_team_roster, not just the acting
// captain/organizer (see tbi_tournament_team_roster / target_meets_min_role
// in api-deafcs). These tests are static source-inspection checks, matching
// this suite's existing pattern (test/tournament-join-form-country-flag.test.mjs,
// test/roster-image-permissions-ui.test.mjs) -- there is no Vue Test Utils /
// component-mounting harness in this repo, so behavior is verified by
// asserting the real computed/method bodies implement the right guard
// conditions, rather than by mounting and interacting with the component.

const authStoreSource = await readFile(
  new URL("../stores/AuthStore.ts", import.meta.url),
  "utf8",
);
const joinFormSource = await readFile(
  new URL("../components/tournament/TournamentJoinForm.vue", import.meta.url),
  "utf8",
);
const playerSearchSource = await readFile(
  new URL("../components/PlayerSearch.vue", import.meta.url),
  "utf8",
);
const teamSource = await readFile(
  new URL("../components/tournament/TournamentTeam.vue", import.meta.url),
  "utf8",
);
const enLocale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

// --- AuthStore: single canonical role-order source -------------------------

test("AuthStore declares one roleOrder array, reused by both isRoleAbove and isRoleAtLeast", () => {
  const roleOrderMatches = authStoreSource.match(/const roleOrder = \[/g);
  assert.equal(
    roleOrderMatches?.length,
    1,
    "roleOrder must be declared exactly once -- no second hardcoded role array",
  );

  assert.match(
    authStoreSource,
    /function isRoleAtLeast\(\s*actualRole[^)]*requiredRole[^)]*\)\s*\{/,
  );
  const isRoleAtLeastBlock = authStoreSource.slice(
    authStoreSource.indexOf("function isRoleAtLeast"),
    authStoreSource.indexOf("function isRoleAbove"),
  );
  assert.match(isRoleAtLeastBlock, /roleOrder\.indexOf\(requiredRole\)/);
  assert.match(isRoleAtLeastBlock, /roleOrder\.indexOf\(actualRole\)/);

  // isRoleAbove must now delegate to isRoleAtLeast (using me.value.role as
  // the actual role) rather than duplicating the comparison -- existing
  // behavior (false when logged out, false for an unmatched role) must
  // still hold, which isRoleAtLeast's own fail-closed checks preserve.
  const isRoleAboveBlock = authStoreSource.slice(
    authStoreSource.indexOf("function isRoleAbove"),
    authStoreSource.indexOf("function setMe"),
  );
  assert.match(isRoleAboveBlock, /if \(!me\.value\)/);
  assert.match(isRoleAboveBlock, /isRoleAtLeast\(me\.value\.role, role\)/);

  // Exported on the store so components can compare an arbitrary player's
  // role, not just the acting session's.
  assert.match(authStoreSource, /isRoleAtLeast,?\s*\n\s*\};/);
});

test("isRoleAtLeast fails closed for a missing/unknown actual role or required role", () => {
  const block = authStoreSource.slice(
    authStoreSource.indexOf("function isRoleAtLeast"),
    authStoreSource.indexOf("function isRoleAbove"),
  );
  // Required role not recognized -> deny.
  assert.match(block, /requiredIndex === -1/);
  // Missing actual role (undefined/null) -> deny, not grant.
  assert.match(block, /if \(!actualRole\)/);
  // Unrecognized actual role -> deny.
  assert.match(block, /actualIndex === -1/);
});

// --- TournamentJoinForm: permanent-team roster picker -----------------------

test("fetchTeamRoster's nested player selection includes role", () => {
  const queryBlock = joinFormSource.slice(
    joinFormSource.indexOf("team_roster: ["),
    joinFormSource.indexOf("team_roster: [") + 1300,
  );
  const playerBlock = queryBlock.slice(
    queryBlock.indexOf("player: {"),
    queryBlock.indexOf("},", queryBlock.indexOf("player: {")),
  );
  assert.match(playerBlock, /role: true,/);
});

test("memberMeetsMinRole is unrestricted for NULL min_role (higher role and plain user both selectable)", () => {
  const block = joinFormSource.slice(
    joinFormSource.indexOf("memberMeetsMinRole(member) {"),
    joinFormSource.indexOf("teamRosterImageFor(member: any)"),
  );
  assert.match(block, /if \(!this\.tournament\.min_role\)/);
  assert.match(block, /return true;/);
});

test("memberMeetsMinRole compares the member's own role via the shared AuthStore helper, not a duplicated hierarchy", () => {
  const block = joinFormSource.slice(
    joinFormSource.indexOf("memberMeetsMinRole(member) {"),
    joinFormSource.indexOf("teamRosterImageFor(member: any)"),
  );
  assert.match(block, /useAuthStore\(\)\.isRoleAtLeast\(/);
  assert.match(block, /member\.player\?\.role/);
  assert.match(block, /this\.tournament\.min_role/);
  // No second hardcoded role-order array anywhere in this component.
  assert.doesNotMatch(joinFormSource, /\[\s*["']user["']\s*,\s*["']verified_user["']/);
});

test("an ineligible member cannot be toggled into selection", () => {
  const block = joinFormSource.slice(
    joinFormSource.indexOf("togglePlayer(member)"),
    joinFormSource.indexOf("async fetchTeamRoster"),
  );
  assert.match(
    block,
    /if \(this\.isTaken\(member\) \|\| !this\.memberMeetsMinRole\(member\)\) \{\s*return;/,
  );
});

test("an ineligible member stays visible but disabled (checkbox + row styling), not removed from the list", () => {
  const rosterLi = joinFormSource.slice(
    joinFormSource.indexOf('v-for="member in group.members"'),
    joinFormSource.indexOf("</li>"),
  );
  // The roster <li> still renders every member -- it doesn't filter
  // ineligible ones out of the v-for.
  assert.match(rosterLi, /v-for="member in group\.members"/);
  // Checkbox disables on ineligibility.
  assert.match(rosterLi, /!memberMeetsMinRole\(member\)/);
  // rosterItemClass dims/blocks-cursor for ineligible rows the same way it
  // already does for an already-taken row.
  const classBlock = joinFormSource.slice(
    joinFormSource.indexOf("rosterItemClass(member) {"),
    joinFormSource.indexOf("togglePlayer(member) {"),
  );
  assert.match(
    classBlock,
    /if \(this\.isTaken\(member\) \|\| !this\.memberMeetsMinRole\(member\)\) \{\s*return "cursor-not-allowed opacity-40";/,
  );
});

test("the ineligible-member reason uses the tournament's configured min_role dynamically, not a hardcoded role name", () => {
  const rosterLi = joinFormSource.slice(
    joinFormSource.indexOf('v-for="member in group.members"'),
    joinFormSource.indexOf("</li>"),
  );
  assert.match(rosterLi, /v-else-if="!memberMeetsMinRole\(member\)"/);
  assert.match(
    rosterLi,
    /\$t\("tournament\.join\.member_role_required", \{ role: minRoleLabel \}\)/,
  );
  // No literal "Verified" (or any other role name) hardcoded into the template.
  assert.doesNotMatch(rosterLi, /Verified or higher required/);

  const minRoleLabelBlock = joinFormSource.slice(
    joinFormSource.indexOf("minRoleLabel()"),
    joinFormSource.indexOf("minRoleLabel()") + 250,
  );
  assert.match(minRoleLabelBlock, /\$t\(`player_roles\.\$\{this\.tournament\.min_role\}`\)/);

  assert.equal(
    enLocale.tournament.join.member_role_required,
    "{role} or higher required",
  );
});

test("auto-select on team change never pre-selects an ineligible member into the lineup", () => {
  const start = joinFormSource.indexOf("const prioritized = [...this.teamRoster]");
  const block = joinFormSource.slice(start, start + 400);
  assert.match(block, /this\.memberMeetsMinRole\(member\)/);
});

// --- Regression: acting-user gate and unrelated flows untouched ------------

test("belowMinRole (the acting captain's own gate) is unchanged: still session-role-based, organizer bypass intact", () => {
  const block = joinFormSource.slice(
    joinFormSource.indexOf("belowMinRole()"),
    joinFormSource.indexOf("joinRestrictionMessage()"),
  );
  assert.match(block, /!this\.tournament\.is_organizer/);
  assert.match(block, /useAuthStore\(\)\.isRoleAbove\(this\.tournament\.min_role\)/);
});

test("individual signup mutation is untouched by this change", () => {
  assert.match(
    joinFormSource,
    /insert_tournament_individual_signups_one/,
  );
});

// --- Tournament-only team / "Add Player" PlayerSearch selectors ------------

test("PlayerSearch accepts an optional minRole prop, unrestricted by default", () => {
  assert.match(playerSearchSource, /minRole:\s*\{\s*\n\s*type: String,/);
  const propBlock = playerSearchSource.slice(
    playerSearchSource.indexOf("minRole:"),
    playerSearchSource.indexOf("minRole:") + 200,
  );
  assert.match(propBlock, /default: null,/);
});

test("PlayerSearch filters ineligible players out of every result source (search results, self, friends)", () => {
  assert.match(playerSearchSource, /meetsMinRole\(role: string \| undefined \| null\)/);
  const methodBlock = playerSearchSource.slice(
    playerSearchSource.indexOf("meetsMinRole(role:"),
    playerSearchSource.indexOf("meetsMinRole(role:") + 250,
  );
  assert.match(methodBlock, /if \(!this\.minRole\) return true;/);
  assert.match(methodBlock, /useAuthStore\(\)\.isRoleAtLeast\(/);

  assert.match(playerSearchSource, /this\.meetsMinRole\(this\.me\.role\)/); // canSelectSelf
  assert.match(playerSearchSource, /if \(!this\.meetsMinRole\(f\.role\)\) return false;/); // friendsForSearch
  assert.match(playerSearchSource, /this\.meetsMinRole\(p\.role\)/); // otherPlayers / displayPlayers
});

test("TournamentJoinForm's tournament-only team-owner PlayerSearch is wired with the tournament's min_role", () => {
  const block = joinFormSource.slice(
    joinFormSource.indexOf("$t('tournament.join.team_owner')") - 50,
    joinFormSource.indexOf("</PlayerSearch>") + 20,
  );
  assert.match(block, /:min-role="tournament\.min_role"/);
});

test("TournamentTeam's Add Player PlayerSearch is wired with the tournament's min_role", () => {
  const block = teamSource.slice(
    teamSource.indexOf("$t('tournament.team.add_player')") - 50,
    teamSource.indexOf("@selected=\"addMember\"") + 30,
  );
  assert.match(block, /:min-role="tournament\?\.min_role"/);
});

console.log("tournament roster min_role checks passed");
