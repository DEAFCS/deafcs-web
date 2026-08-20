import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the new shared "tournament attendance" check-in UI: compact
// CHECK-IN window badges on the list/card variants, status-aware Solo
// Random messaging in TournamentJoinForm.vue, the team check-in control in
// TournamentTeam.vue, and the utilities/tournamentAttendance.ts helper they
// all share. Static source-inspection, matching this suite's established
// pattern -- no component mounting.

const attendanceUtilSource = await readFile(
  new URL("../utilities/tournamentAttendance.ts", import.meta.url),
  "utf8",
);
const featureCardSource = await readFile(
  new URL("../components/tournament/TournamentFeatureCard.vue", import.meta.url),
  "utf8",
);
const compactCardSource = await readFile(
  new URL("../components/tournament/TournamentCompactCard.vue", import.meta.url),
  "utf8",
);
const joinFormSource = await readFile(
  new URL("../components/tournament/TournamentJoinForm.vue", import.meta.url),
  "utf8",
);
const individualPlayersSource = await readFile(
  new URL("../components/tournament/TournamentIndividualPlayers.vue", import.meta.url),
  "utf8",
);
const teamSource = await readFile(
  new URL("../components/tournament/TournamentTeam.vue", import.meta.url),
  "utf8",
);
const tournamentTeamFieldsSource = await readFile(
  new URL("../graphql/tournamentTeamFields.ts", import.meta.url),
  "utf8",
);
const simpleTournamentFieldsSource = await readFile(
  new URL("../graphql/simpleTournamentFields.ts", import.meta.url),
  "utf8",
);
const informationFormSource = await readFile(
  new URL("../components/tournament/TournamentInformationForm.vue", import.meta.url),
  "utf8",
);
const enLocale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

test("attendanceWindow derives open/close purely from start + the two configurable offsets, with 60/15 defaults", () => {
  assert.match(attendanceUtilSource, /DEFAULT_OPEN_BEFORE_MINUTES = 60/);
  assert.match(attendanceUtilSource, /DEFAULT_CLOSE_BEFORE_MINUTES = 15/);
  assert.match(
    attendanceUtilSource,
    /opensAt: new Date\(start\.getTime\(\) - openBefore \* 60_000\)/,
  );
  assert.match(
    attendanceUtilSource,
    /closesAt: new Date\(start\.getTime\(\) - closeBefore \* 60_000\)/,
  );
});

test("formatAttendanceWindowRange produces a compact opens-closes range", () => {
  assert.match(
    attendanceUtilSource,
    /`\$\{formatClockTime\(window\.opensAt\)\}–\$\{formatClockTime\(window\.closesAt\)\}`/,
  );
});

test("simpleTournamentFields and tournamentTeamFields query the new attendance columns", () => {
  assert.match(simpleTournamentFieldsSource, /attendance_check_in_open_before_minutes: true/);
  assert.match(simpleTournamentFieldsSource, /attendance_check_in_close_before_minutes: true/);
  assert.match(simpleTournamentFieldsSource, /status: true/);
  assert.match(tournamentTeamFieldsSource, /checked_in_at: true/);
  assert.match(tournamentTeamFieldsSource, /created_at: true/);
});

test("TournamentFeatureCard shows the compact check-in window only while registration is open", () => {
  assert.match(featureCardSource, /from "~\/utilities\/tournamentAttendance"/);
  const computedBlock = featureCardSource.slice(
    featureCardSource.indexOf("const attendanceWindowLabel"),
    featureCardSource.indexOf("const attendanceWindowLabel") + 300,
  );
  assert.match(computedBlock, /statusVariant !== "registration"/);
  assert.match(featureCardSource, /v-if="attendanceWindowLabel"/);
  assert.match(
    featureCardSource,
    /\$t\("tournament\.feature_card\.check_in_window", \{ window: attendanceWindowLabel \}\)/,
  );
});

test("TournamentCompactCard shows the compact check-in window only while registration is open", () => {
  assert.match(compactCardSource, /from "~\/utilities\/tournamentAttendance"/);
  const computedBlock = compactCardSource.slice(
    compactCardSource.indexOf("const attendanceWindowLabel"),
    compactCardSource.indexOf("const attendanceWindowLabel") + 200,
  );
  assert.match(computedBlock, /isRegistration\.value \? formatAttendanceWindowRange/);
  assert.match(compactCardSource, /v-if="attendanceWindowLabel"/);
});

test("TournamentJoinForm: Solo Random attendance messaging covers pre-open, open, auto-checked-in, and waitlisted-checked-in states", () => {
  assert.match(joinFormSource, /from "~\/utilities\/tournamentAttendance"/);

  const messageBlock = joinFormSource.slice(
    joinFormSource.indexOf("individualAttendanceMessage()"),
    joinFormSource.indexOf("attendanceExplainer()"),
  );
  assert.match(messageBlock, /tournament\.attendance\.waitlisted_checked_in/);
  assert.match(messageBlock, /tournament\.attendance\.auto_checked_in/);
  assert.match(messageBlock, /tournament\.join\.individual\.waitlisted/);
  assert.match(messageBlock, /tournament\.attendance\.check_in_by/);
  assert.match(messageBlock, /tournament\.attendance\.opens_at/);

  // A checked-in signup can still check in again via the leave button's
  // sibling -- the button swaps to Check In only while genuinely eligible
  // and not yet checked in.
  const showCheckInBlock = joinFormSource.slice(
    joinFormSource.indexOf("showIndividualCheckIn()"),
    joinFormSource.indexOf("showIndividualCheckIn()") + 250,
  );
  assert.match(showCheckInBlock, /checkInWindowOpen/);
  assert.match(showCheckInBlock, /!this\.myIndividualSignup\.checked_in_at/);

  assert.match(joinFormSource, /checkIntoTournament: \[/);
});

test("TournamentIndividualPlayers: waitlisted rows also show a check-in indicator, and a public closes-at note exists", () => {
  const waitlistBlock = individualPlayersSource.slice(
    individualPlayersSource.indexOf('$t("tournament.players.waitlist"'),
    individualPlayersSource.indexOf("</section>", individualPlayersSource.indexOf('$t("tournament.players.waitlist"')),
  );
  assert.match(waitlistBlock, /signup\.checked_in_at/);
  assert.match(waitlistBlock, /tournament\.attendance\.waitlisted_checked_in/);

  assert.match(individualPlayersSource, /from "~\/utilities\/tournamentAttendance"/);
  assert.match(individualPlayersSource, /v-if="closesAtNote"/);
  assert.match(individualPlayersSource, /tournament\.status !== "RegistrationOpen"/);
});

test("TournamentTeam: captain/authorized representative can check the team in, reusing can_manage -- no per-player check-in required", () => {
  assert.match(teamSource, /checkInTournamentTeam: \[/);
  assert.match(teamSource, /tournament_team_id: this\.team\.id/);

  const showBlock = teamSource.slice(
    teamSource.indexOf("showTeamCheckIn()"),
    teamSource.indexOf("showTeamCheckIn()") + 250,
  );
  assert.match(showBlock, /this\.team\.can_manage/);
  assert.match(showBlock, /this\.attendanceCheckInOpen/);
  assert.match(showBlock, /!this\.team\.checked_in_at/);

  // Uses the shared attendance window field, not a new/duplicate one.
  assert.match(teamSource, /individual_check_in_ends_at/);
});

test("organizer settings: both timing fields live in the existing Schedule section of the tournament information form", () => {
  assert.match(informationFormSource, /name="attendance_open_before"/);
  assert.match(informationFormSource, /name="attendance_close_before"/);
  // Reuses the existing FormField/FormItem/Input pattern, not a new UI shell.
  assert.match(informationFormSource, /tournament\.form\.attendance\.open_before/);
  assert.match(informationFormSource, /tournament\.form\.attendance\.close_before/);
  // Sits in the Schedule section, immediately after the start picker.
  const scheduleBlock = informationFormSource.slice(
    informationFormSource.indexOf('name="start"'),
    informationFormSource.indexOf("Classification & Venue") > -1
      ? informationFormSource.indexOf("Classification & Venue")
      : informationFormSource.indexOf('name="categories"'),
  );
  assert.match(scheduleBlock, /attendance_open_before/);
  assert.match(scheduleBlock, /attendance_close_before/);
});

test("organizer settings: client validation mirrors the backend CHECK constraints exactly", () => {
  const schemaBlock = informationFormSource.slice(
    informationFormSource.indexOf("attendance_open_before: z"),
    informationFormSource.indexOf("attendanceWindowPreview()"),
  );
  // open 15-240
  assert.match(schemaBlock, /\.min\(15\)[\s\S]{0,40}\.max\(240\)/);
  // close 5-60
  assert.match(schemaBlock, /\.min\(5\)[\s\S]{0,40}\.max\(60\)/);
  // difference >= 5 (which also enforces open > close)
  assert.match(
    schemaBlock,
    /attendance_open_before - values\.attendance_close_before >= 5/,
  );
  // Input elements carry matching native bounds.
  assert.match(informationFormSource, /type="number" min="15" max="240"/);
  assert.match(informationFormSource, /type="number" min="5" max="60"/);
});

test("organizer settings: calculated window preview is driven by live form values and suppressed when invalid", () => {
  const previewBlock = informationFormSource.slice(
    informationFormSource.indexOf("attendanceWindowPreview()"),
    informationFormSource.indexOf("attendanceWindowPreview()") + 900,
  );
  assert.match(previewBlock, /this\.form\.values\.start/);
  assert.match(previewBlock, /this\.form\.values\.attendance_open_before/);
  assert.match(previewBlock, /this\.form\.values\.attendance_close_before/);
  assert.match(previewBlock, /openBefore - closeBefore < 5/);
  assert.match(previewBlock, /formatAttendanceWindowRange/);
  assert.match(informationFormSource, /v-if="attendanceWindowPreview"/);
  assert.equal(
    enLocale.tournament.form.attendance.preview,
    "Check-in window: {window}",
  );
});

test("organizer settings: both columns are persisted by the existing save mutation", () => {
  assert.match(
    informationFormSource,
    /attendance_check_in_open_before_minutes: \$\(\s*"attendance_open_before",\s*"Int",\s*\)/,
  );
  assert.match(
    informationFormSource,
    /attendance_check_in_close_before_minutes: \$\(\s*"attendance_close_before",\s*"Int",\s*\)/,
  );
  // Populated from the saved tournament, defaulting to 60/15.
  assert.match(informationFormSource, /attendance_check_in_open_before_minutes \?\? 60/);
  assert.match(informationFormSource, /attendance_check_in_close_before_minutes \?\? 15/);
});

test("tournament attendance wording stays distinct from match check-in wording (separate systems, not reused state)", () => {
  assert.ok(enLocale.tournament.attendance);
  assert.ok(enLocale.match.check_in);
  const attendanceStrings = JSON.stringify(enLocale.tournament.attendance);
  const matchCheckInStrings = JSON.stringify(enLocale.match.check_in);
  // Distinct copy, not literally identical objects/keys reused verbatim.
  assert.notEqual(attendanceStrings, matchCheckInStrings);
  assert.equal(enLocale.tournament.attendance.team_check_in_button, "Check in for tournament");
  assert.equal(enLocale.match.check_in.check_in, "Check In");
});
