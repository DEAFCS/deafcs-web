import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Two consistency/safety fixes from the final live test:
//
//   1. The attendance schedule (start + both offsets) freezes once check-in
//      has opened, on the frontend and in the database.
//   2. Every "leave this Solo Random tournament" control shares one
//      eligibility rule, so the header button and the player-row action can
//      no longer disagree.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const attendanceUtilSource = await read("../utilities/tournamentAttendance.ts");
const infoFormSource = await read(
  "../components/tournament/TournamentInformationForm.vue",
);
const dateTimePickerSource = await read(
  "../components/tournament/DateTimePicker.vue",
);
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const joinFormSource = await read(
  "../components/tournament/TournamentJoinForm.vue",
);
const playersSource = await read(
  "../components/tournament/TournamentIndividualPlayers.vue",
);
const triggerSource = await read(
  "../../api-deafcs/hasura/triggers/tournaments.sql",
);
const attendanceStartedSource = await read(
  "../../api-deafcs/hasura/functions/tournaments/tournament_attendance_started.sql",
);
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

// --- 1. Schedule freeze: frontend --------------------------------------------

test("the frozen state is one shared helper, not a re-derived calculation", () => {
  assert.match(
    attendanceUtilSource,
    /export function isAttendanceScheduleFrozen\(/,
  );
  const block = attendanceUtilSource.slice(
    attendanceUtilSource.indexOf("export function isAttendanceScheduleFrozen"),
  );
  // Delegates to the existing window helper rather than recomputing.
  assert.match(block, /return attendanceCheckInOpened\(tournament\);/);
});

test("all four schedule values are locked by that single helper", () => {
  assert.match(infoFormSource, /isAttendanceScheduleFrozen/);
  assert.match(infoFormSource, /scheduleFrozen\(\)/);
  // start (one datetime control) + both offsets = 3 bindings.
  assert.equal(
    (infoFormSource.match(/:disabled="scheduleFrozen"/g) ?? []).length,
    3,
  );
});

test("the datetime control locks date and time together", () => {
  // Both halves of the single start value must lock as one.
  assert.match(dateTimePickerSource, /disabled: \{/);
  assert.equal(
    (dateTimePickerSource.match(/:disabled="disabled"/g) ?? []).length,
    2,
  );
});

test("the lock reads persisted state, never live form values", () => {
  // Deriving from form values would let an organizer push the start into the
  // future and unfreeze themselves.
  const frozen = infoFormSource.slice(
    infoFormSource.indexOf("scheduleFrozen()"),
    infoFormSource.indexOf("scheduleFrozen()") + 160,
  );
  assert.match(frozen, /this\.tournament/);
  assert.doesNotMatch(frozen, /this\.form\.values/);
});

test("one helper notice explains the lock, not four", () => {
  assert.match(infoFormSource, /v-if="scheduleFrozen"/);
  assert.equal(
    (infoFormSource.match(/tournament\.form\.attendance\.locked/g) ?? []).length,
    1,
  );
  const copy = enLocale.tournament.form.attendance.locked;
  assert.match(copy, /check-in has started/i);
  assert.doesNotMatch(copy, /—/);
});

test("unrelated settings are not locked by attendance", () => {
  // Only the three schedule inputs carry the binding; name/description and the
  // rest keep their existing lifecycle rules.
  assert.doesNotMatch(infoFormSource, /name="name"[\s\S]{0,200}scheduleFrozen/);
  assert.doesNotMatch(
    infoFormSource,
    /name="description"[\s\S]{0,200}scheduleFrozen/,
  );
});

// --- 1. Schedule freeze: backend ---------------------------------------------

test("the database freezes the same three columns", () => {
  const guard = triggerSource.slice(
    triggerSource.indexOf("CREATE OR REPLACE FUNCTION public.tbu_tournaments"),
    triggerSource.indexOf("DROP TRIGGER IF EXISTS tbu_tournaments"),
  );
  assert.match(guard, /NEW\.start IS DISTINCT FROM OLD\.start/);
  assert.match(
    guard,
    /NEW\.attendance_check_in_open_before_minutes\s*\n?\s*IS DISTINCT FROM OLD\.attendance_check_in_open_before_minutes/,
  );
  assert.match(
    guard,
    /NEW\.attendance_check_in_close_before_minutes\s*\n?\s*IS DISTINCT FROM OLD\.attendance_check_in_close_before_minutes/,
  );
  assert.match(guard, /RAISE EXCEPTION/);
});

test("the backend decides from OLD, closing the move-the-start bypass", () => {
  const guard = triggerSource.slice(
    triggerSource.indexOf("CREATE OR REPLACE FUNCTION public.tbu_tournaments"),
    triggerSource.indexOf("DROP TRIGGER IF EXISTS tbu_tournaments"),
  );
  assert.match(guard, /tournament_attendance_started\(OLD\)/);
  assert.doesNotMatch(guard, /tournament_attendance_started\(NEW\)/);
});

test("the backend predicate mirrors the frontend one", () => {
  // Backend stamp OR derived open time reached, with the same 60-minute
  // default the web side uses.
  assert.match(
    attendanceStartedSource,
    /individual_check_in_ends_at IS NOT NULL/,
  );
  assert.match(attendanceStartedSource, /now\(\) >= tournament\.start/);
  assert.match(
    attendanceStartedSource,
    /COALESCE\(tournament\.attendance_check_in_open_before_minutes, 60\)/,
  );
  // Takes a row so a trigger can pass OLD.
  assert.match(
    attendanceStartedSource,
    /tournament public\.tournaments/,
  );
});

test("the freeze is not keyed off registration type", () => {
  const guard = triggerSource.slice(
    triggerSource.indexOf("CREATE OR REPLACE FUNCTION public.tbu_tournaments"),
    triggerSource.indexOf("DROP TRIGGER IF EXISTS tbu_tournaments"),
  );
  assert.doesNotMatch(guard, /individual_registration_enabled/);
  assert.doesNotMatch(
    attendanceUtilSource.slice(
      attendanceUtilSource.indexOf("export function isAttendanceScheduleFrozen"),
    ),
    /individual_registration_enabled/,
  );
});

// --- 2. Shared leave eligibility ---------------------------------------------

test("leave eligibility is one shared rule mirroring the backend action", () => {
  assert.match(
    attendanceUtilSource,
    /export function canLeaveIndividualTournament\(/,
  );
  const block = attendanceUtilSource.slice(
    attendanceUtilSource.indexOf(
      "export function canLeaveIndividualTournament",
    ),
  );
  assert.match(block, /tournament\.status !== "RegistrationOpen"/);
  assert.match(block, /signup\.tournament_team_id/);
  assert.match(
    block,
    /signup\.status === "Registered" \|\| signup\.status === "Waitlisted"/,
  );
  // Being checked in must never block leaving.
  assert.doesNotMatch(block, /checked_in_at/);
});

test("all three leave surfaces consume the same rule", () => {
  for (const source of [detailSource, joinFormSource, playersSource]) {
    assert.match(source, /canLeaveIndividualTournament/);
  }
});

test("the header button no longer disables itself for the whole window", () => {
  // The reported bug: checkInCurrentlyActive gated the header Leave, so a
  // checked-in player saw it disabled while their row offered it.
  assert.match(detailSource, /:disabled="individualActionBusy \|\| !canLeaveIndividually"/);
  const button = detailSource.slice(
    detailSource.indexOf('v-if="isIndividualRegistration && myIndividualSignup"') - 400,
    detailSource.indexOf('@click="leaveIndividually"'),
  );
  assert.doesNotMatch(button, /checkInCurrentlyActive/);
});

test("the join form no longer excludes waitlisted players", () => {
  assert.match(joinFormSource, /:disabled="!canLeaveIndividually"/);
  assert.doesNotMatch(
    joinFormSource,
    /myIndividualSignup\.status !== 'Registered'/,
  );
});

test("the player row delegates to the shared rule too", () => {
  const canRemove = playersSource.slice(
    playersSource.indexOf("canRemove(signup: any)"),
    playersSource.indexOf("canRemove(signup: any)") + 320,
  );
  assert.match(
    canRemove,
    /canLeaveIndividualTournament\(signup, this\.tournament as any\)/,
  );
  // Who may act is the only extra condition.
  assert.match(canRemove, /this\.isOrganizer \|\| this\.isSelf\(signup\)/);
});

test("every leave surface calls the canonical backend action", () => {
  for (const source of [detailSource, joinFormSource, playersSource]) {
    assert.match(source, /removeTournamentIndividualPlayer: \[/);
    // No direct Hasura deletes remain.
    assert.doesNotMatch(source, /delete_tournament_individual_signups/);
  }
});

test("normal team tournament leave behaviour is untouched", () => {
  // The team leave control lives in TournamentTeam and is not part of this
  // rule; the shared helper is only consumed by individual-signup surfaces.
  assert.doesNotMatch(
    attendanceUtilSource.slice(
      attendanceUtilSource.indexOf(
        "export function canLeaveIndividualTournament",
      ),
    ),
    /tournament_teams/,
  );
  assert.equal(
    enLocale.tournament.team.leave_tournament,
    "Leave Tournament",
  );
});
