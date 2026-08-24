import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the UX pass that followed live-testing the deployed attendance
// system: public per-participant check-in status, the public "Tournament
// Check-in" explainer on the detail page, and the organizer Solo Random
// Add Player control (along with the removal of the obsolete manual
// check-in panel). Static source inspection, matching this suite's
// established pattern.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const attendanceUtilSource = await read("../utilities/tournamentAttendance.ts");
const badgeSource = await read(
  "../components/tournament/TournamentAttendanceBadge.vue",
);
const checkInInfoSource = await read(
  "../components/tournament/TournamentCheckInInfo.vue",
);
const teamSource = await read("../components/tournament/TournamentTeam.vue");
const individualPlayersSource = await read(
  "../components/tournament/TournamentIndividualPlayers.vue",
);
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

// --- Shared visibility lifecycle --------------------------------------------

test("attendance status visibility is a single shared helper, not per-component logic", () => {
  assert.match(
    attendanceUtilSource,
    /export function showAttendanceStatuses\(/,
  );
  assert.match(
    attendanceUtilSource,
    /const ATTENDANCE_VISIBLE_STATUSES = \["RegistrationOpen", "RegistrationClosed"\]/,
  );
  // Both surfaces consume the helper rather than re-deriving the lifecycle.
  assert.match(teamSource, /showAttendanceStatuses\(this\.tournament as any\)/);
  assert.match(
    individualPlayersSource,
    /showAttendanceStatuses\(this\.tournament as any\)/,
  );
});

test("the window-open check is shared too, so the button and the badge cannot drift apart", () => {
  assert.match(attendanceUtilSource, /export function attendanceCheckInOpen\(/);
  assert.match(
    attendanceUtilSource,
    /export function attendanceCheckInOpened\(/,
  );
  // attendanceCheckInOpened accepts either the backend stamp or the derived
  // schedule, so the badges appear the moment the window is due.
  const openedBlock = attendanceUtilSource.slice(
    attendanceUtilSource.indexOf("export function attendanceCheckInOpened"),
  );
  assert.match(openedBlock, /individual_check_in_ends_at/);
  assert.match(openedBlock, /window\.opensAt <= new Date\(\)/);

  // TournamentTeam no longer hand-rolls its own copy.
  assert.match(teamSource, /attendanceCheckInOpen\(this\.tournament as any\)/);
});

// --- Public per-team / per-player status -------------------------------------

test("the status badge is green when checked in and orange while pending", () => {
  assert.match(badgeSource, /border-emerald-400\/40 bg-emerald-400\/10 text-emerald-400/);
  assert.match(
    badgeSource,
    /border-\[hsl\(var\(--tac-amber\)\/0\.4\)\] bg-\[hsl\(var\(--tac-amber\)\/0\.1\)\] text-\[hsl\(var\(--tac-amber\)\)\]/,
  );
  // Colour follows checked-in state only -- a waitlisted-but-checked-in
  // player stays green and only the hover text changes.
  assert.match(badgeSource, /checkedIn\s*\n\s*\? 'border-emerald/);
  assert.match(
    badgeSource,
    /variant === "waitlisted"\s*\n?\s*\? "tournament\.attendance\.status\.checked_in_waitlisted_hint"/,
  );
});

test("badge copy is the compact requested wording", () => {
  assert.equal(enLocale.tournament.attendance.status.checked_in, "Checked-in");
  assert.equal(
    enLocale.tournament.attendance.status.pending,
    "Pending check-in",
  );
  // The long "Your team is checked in" banner is gone -- the completed state
  // is the same compact badge every other team gets.
  assert.equal(
    enLocale.tournament.attendance.team_checked_in_badge,
    undefined,
  );
  assert.doesNotMatch(teamSource, /team_checked_in_badge/);
});

test("TournamentTeam: own team keeps the action while pending, everyone else sees a status", () => {
  // The actionable button wins when it applies...
  const actionBlock = teamSource.slice(
    teamSource.indexOf('v-if="showTeamCheckIn"'),
    teamSource.indexOf('v-if="showTeamCheckIn"') + 400,
  );
  assert.match(actionBlock, /tournament\.attendance\.team_check_in_button/);
  // ...and otherwise the public badge renders, for ANY team, not just
  // one the viewer can manage.
  assert.match(
    teamSource,
    /v-else-if="showAttendanceStatus"\s*\n\s*:checked-in="!!team\.checked_in_at"/,
  );
  const showBlock = teamSource.slice(
    teamSource.indexOf("showTeamCheckIn()"),
    teamSource.indexOf("showTeamCheckIn()") + 250,
  );
  assert.match(showBlock, /this\.team\.can_manage/);
  assert.match(showBlock, /!this\.team\.checked_in_at/);
  // The public badge is deliberately NOT gated on can_manage.
  const badgeComputed = teamSource.slice(
    teamSource.indexOf("showAttendanceStatus()"),
    teamSource.indexOf("showAttendanceStatus()") + 200,
  );
  assert.doesNotMatch(badgeComputed, /can_manage/);
});

test("Solo Random players list shows public attendance state, waitlist included", () => {
  assert.match(
    individualPlayersSource,
    /<TournamentAttendanceBadge\s*\n\s*v-if="showAttendanceStatus"\s*\n\s*:checked-in="!!signup\.checked_in_at"\s*\n\s*\/>/,
  );
  assert.match(individualPlayersSource, /variant="waitlisted"/);
  // Removed players keep their existing destructive styling and carry no
  // attendance badge.
  assert.match(individualPlayersSource, /border-destructive\/30 bg-destructive\/5/);
});

// --- Public tournament check-in information ---------------------------------

test("the check-in explainer renders real clock times, not the raw offsets", () => {
  assert.match(
    checkInInfoSource,
    /from "~\/utilities\/tournamentAttendance"/,
  );
  assert.match(checkInInfoSource, /attendanceWindow\(props\.tournament as any\)/);
  assert.match(checkInInfoSource, /formatClockTime\(window\.value\.opensAt\)/);
  assert.match(checkInInfoSource, /formatClockTime\(window\.value\.closesAt\)/);
  assert.match(checkInInfoSource, /\{\{ opensAt \}\}–\{\{ closesAt \}\}/);
  // No "60"/"15" style raw configuration is surfaced here.
  assert.doesNotMatch(checkInInfoSource, /attendance_check_in_open_before_minutes/);
});

test("the explainer only runs while attendance is still relevant", () => {
  assert.match(
    checkInInfoSource,
    /const RELEVANT_STATUSES = \["RegistrationOpen", "RegistrationClosed"\]/,
  );
  assert.match(checkInInfoSource, /v-if="visible"/);
});

test("the explainer's rules differ by registration type", () => {
  assert.match(
    checkInInfoSource,
    /tournament\.attendance\.info\.individual\.teams_generated/,
  );
  assert.match(
    checkInInfoSource,
    /tournament\.attendance\.info\.team\.representative/,
  );

  const info = enLocale.tournament.attendance.info;
  assert.equal(
    info.team.pre_registered,
    "Teams registered before check-in opens must check in.",
  );
  assert.match(info.team.representative, /captain/i);
  assert.match(info.team.late_registered, /automatically/i);
  assert.equal(
    info.individual.pre_registered,
    "Players registered before check-in opens must check in.",
  );
  assert.match(info.individual.teams_generated, /generated automatically/i);
  assert.match(info.closes_at, /\{time\}/);
});

test("the explainer is on the public overview tab, keyed off the raw option", () => {
  assert.match(detailSource, /import TournamentCheckInInfo from/);
  assert.match(
    detailSource,
    /<TournamentCheckInInfo[\s\S]{0,220}individual_registration_enabled/,
  );
  // isIndividualRegistration flips to false once Solo Random teams exist,
  // which would swap the panel to the wrong rules.
  assert.doesNotMatch(
    detailSource.slice(
      detailSource.indexOf("<TournamentCheckInInfo"),
      detailSource.indexOf("</TournamentCheckInInfo>"),
    ),
    /"isIndividualRegistration"/,
  );
});

test("DEAFCS writing style: no em dashes in the new user-facing copy", () => {
  const copy = JSON.stringify([
    enLocale.tournament.attendance.info,
    enLocale.tournament.attendance.status,
    {
      add_player: enLocale.tournament.players.add_player,
      add_player_added: enLocale.tournament.players.add_player_added,
      add_player_waitlisted: enLocale.tournament.players.add_player_waitlisted,
      add_player_failed: enLocale.tournament.players.add_player_failed,
    },
  ]);
  assert.doesNotMatch(copy, /—/);
});

// --- Solo Random organizer Add Player ---------------------------------------

test("the obsolete manual Solo Random check-in panel is gone from the players tab", () => {
  assert.doesNotMatch(individualPlayersSource, /startTournamentIndividualCheckIn/);
  assert.doesNotMatch(individualPlayersSource, /stopTournamentIndividualCheckIn/);
  assert.doesNotMatch(
    individualPlayersSource,
    /tournament\.players\.check_in\.(start|stop|description|requires_closed_registration)/,
  );
  // The backend actions themselves are intentionally left in place for
  // emergency/manual use, so their strings stay in the locale file.
  assert.ok(enLocale.tournament.players.check_in.start);
  assert.ok(enLocale.tournament.players.check_in.stop);
});

test("Add Player is organizer-only and only while registration is open", () => {
  // The two conditions are now named guards shared with the check-in/remove
  // actions, rather than inlined here -- same rules, one definition each.
  const canAdd = individualPlayersSource.slice(
    individualPlayersSource.indexOf("canAddPlayers()"),
    individualPlayersSource.indexOf("canAddPlayers()") + 200,
  );
  assert.match(canAdd, /this\.isOrganizer/);
  assert.match(canAdd, /this\.participantsEditable/);

  const isOrganizer = individualPlayersSource.slice(
    individualPlayersSource.indexOf("isOrganizer()"),
    individualPlayersSource.indexOf("isOrganizer()") + 120,
  );
  assert.match(isOrganizer, /this\.tournament\?\.is_organizer/);

  const editable = individualPlayersSource.slice(
    individualPlayersSource.indexOf("participantsEditable()"),
    individualPlayersSource.indexOf("participantsEditable()") + 160,
  );
  assert.match(editable, /status === "RegistrationOpen"/);

  assert.match(individualPlayersSource, /v-if="canAddPlayers"/);
});

test("Add Player reuses the existing PlayerSearch, including its min_role filtering", () => {
  assert.match(individualPlayersSource, /import PlayerSearch from/);
  const search = individualPlayersSource.slice(
    individualPlayersSource.indexOf("<PlayerSearch"),
    individualPlayersSource.indexOf("@selected=\"addPlayer\""),
  );
  assert.match(search, /:min-role="tournament\?\.min_role"/);
  assert.match(search, /:registeredOnly="true"/);
  assert.match(search, /:match-type="tournament\?\.options\?\.type"/);
  // Already-signed-up players are excluded rather than offered and rejected.
  assert.match(search, /:exclude="signedUpSteamIds"/);
  const exclude = individualPlayersSource.slice(
    individualPlayersSource.indexOf("signedUpSteamIds()"),
    individualPlayersSource.indexOf("signedUpSteamIds()") + 200,
  );
  assert.match(exclude, /this\.signups\.map/);
});

test("Add Player calls the dedicated backend action, never a direct signup insert", () => {
  assert.match(individualPlayersSource, /addTournamentIndividualPlayer: \[/);
  assert.match(individualPlayersSource, /tournament_id: this\.tournament\.id/);
  assert.match(
    individualPlayersSource,
    /player_steam_id: String\(player\.steam_id\)/,
  );
  assert.doesNotMatch(
    individualPlayersSource,
    /insert_tournament_individual_signups/,
  );
  // The resulting status is surfaced, so an organizer sees when the player
  // landed on the waitlist instead of silently assuming a spot.
  assert.match(individualPlayersSource, /status === "Waitlisted"/);
  assert.match(
    individualPlayersSource,
    /tournament\.players\.add_player_waitlisted/,
  );
  assert.match(individualPlayersSource, /tournament\.players\.add_player_failed/);
});