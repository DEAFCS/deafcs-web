import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the UX polish that followed the successful Solo Random live test:
// duplicate join copy, the misleading "Pending check-in" on generated teams,
// the public "Not selected" list under the generated team grid, the
// inconsistent SOLO RANDOM badge, and the attendance popup adopting the match
// popup's visual shell without altering the match popup itself.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Assertions below check CODE, not prose: several of these files discuss the
// very strings being asserted absent (e.g. explaining why no "not_selected"
// status was invented), so comments are stripped first.
const stripComments = (src) =>
  src
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "");

const attendanceUtilSource = await read("../utilities/tournamentAttendance.ts");
const joinFormSource = await read(
  "../components/tournament/TournamentJoinForm.vue",
);
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const teamSource = await read("../components/tournament/TournamentTeam.vue");
const notSelectedSource = await read(
  "../components/tournament/TournamentNotSelectedSection.vue",
);
const soloBadgeSource = await read(
  "../components/tournament/TournamentSoloRandomBadge.vue",
);
const featureCardSource = await read(
  "../components/tournament/TournamentFeatureCard.vue",
);
const attendancePopupSource = await read(
  "../components/tournament/TournamentCheckInOverlay.vue",
);
const matchPopupSource = await read("../components/match/MatchActiveAlert.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

// --- 1. Join drawer duplicate copy -------------------------------------------

test("the individual sign-up explanation appears exactly once", () => {
  // The drawer header keeps it; the form's own duplicate paragraph is gone.
  assert.doesNotMatch(joinFormSource, /tournament\.join\.individual\.description/);
  assert.match(detailSource, /tournament\.join\.individual\.sheet_description/);
  assert.equal(enLocale.tournament.join.individual.description, undefined);
});

test("the surviving copy is current and carries no player count", () => {
  const copy = enLocale.tournament.join.individual.sheet_description;
  assert.match(copy, /no team needed/i);
  assert.match(copy, /generated automatically after registration and check-in close/i);
  // The stale claim that the organizer generates the teams is gone.
  assert.doesNotMatch(copy, /organizer generates/i);
  assert.doesNotMatch(copy, /at least/i);
});

test("normal team tournament join copy is untouched", () => {
  assert.equal(
    enLocale.tournament.join.requirements,
    "You need at least {count} players to join this tournament",
  );
});

// --- 2. Generated Solo Random teams ------------------------------------------

test("generated teams are identified from signup data, never from team names", () => {
  assert.match(attendanceUtilSource, /export function generatedTeamIds\(/);
  const block = attendanceUtilSource.slice(
    attendanceUtilSource.indexOf("export function generatedTeamIds"),
    attendanceUtilSource.indexOf("export function soloRandomTeamsGenerated"),
  );
  assert.match(block, /signup\?\.tournament_team_id/);
  // No name-based guessing anywhere.
  assert.doesNotMatch(attendanceUtilSource, /startsWith\("Team/);
  assert.doesNotMatch(teamSource, /startsWith\("Team/);
});

test("the signup query selects tournament_team_id so the derivation has data", () => {
  const block = detailSource.slice(
    detailSource.indexOf("individual_signups: ["),
    detailSource.indexOf("individual_signups: [") + 1200,
  );
  assert.match(block, /tournament_team_id: true/);
});

test("a generated Solo Random team shows no attendance badge and no second check-in", () => {
  assert.match(teamSource, /isGeneratedTeam\(\)/);
  const badge = teamSource.slice(
    teamSource.indexOf("showAttendanceStatus()"),
    teamSource.indexOf("showAttendanceStatus()") + 220,
  );
  assert.match(badge, /if \(this\.isGeneratedTeam\) \{\s*\n\s*return false;/);

  const checkIn = teamSource.slice(
    teamSource.indexOf("showTeamCheckIn()"),
    teamSource.indexOf("showTeamCheckIn()") + 260,
  );
  assert.match(checkIn, /!this\.isGeneratedTeam/);
});

test("normal team tournaments keep their attendance badges", () => {
  // The badge is only suppressed for generated teams; the shared lifecycle
  // helper still drives every other tournament.
  assert.match(teamSource, /showAttendanceStatuses\(this\.tournament as any\)/);
  assert.match(teamSource, /<TournamentAttendanceBadge/);
  assert.match(teamSource, /tournament\.attendance\.team_check_in_button/);
});

// --- 3/4/5. Public "Not selected" section -------------------------------------

test("not-selected is derived from existing state, with no new status invented", () => {
  assert.match(attendanceUtilSource, /export function isFinalizedSitOut\(/);
  const block = attendanceUtilSource.slice(
    attendanceUtilSource.indexOf("export function isFinalizedSitOut"),
  );
  // Waitlisted + no assigned team + teams generated. Nothing else.
  assert.match(block, /signup\.tournament_team_id/);
  assert.match(block, /signup\.status !== "Waitlisted"/);
  assert.match(block, /soloRandomTeamsGenerated\(signups\)/);
  // No new DB status was introduced -- "not_selected" exists only as copy.
  assert.doesNotMatch(stripComments(attendanceUtilSource), /not_selected/);
});

test("the section is public, under the generated team grid, not on Overview", () => {
  const teamsTab = detailSource.slice(
    detailSource.indexOf('<TabsContent value="teams">'),
    detailSource.indexOf('<TabsContent value="information"'),
  );
  assert.match(teamsTab, /<TournamentNotSelectedSection/);
  assert.ok(
    teamsTab.indexOf('v-for="team of visibleTeams"') <
      teamsTab.indexOf("<TournamentNotSelectedSection"),
    "must render after the generated team grid",
  );

  // The Overview-only personal notice is gone entirely.
  assert.doesNotMatch(detailSource, /TournamentSitOutNotice/);
  assert.doesNotMatch(detailSource, /:my-signup=/);
});

test("it takes the whole tournament, not just the viewer's own signup", () => {
  // Public list: driven by every signup, so any viewer sees who sat out.
  assert.match(notSelectedSource, /tournament: Record<string, any>/);
  assert.doesNotMatch(notSelectedSource, /mySignup/);
  assert.match(notSelectedSource, /signups\.value\.filter/);
  assert.match(
    notSelectedSource,
    /isFinalizedSitOut\(signup, signups\.value\)/,
  );
});

test("it stays hidden before finalization and for team tournaments", () => {
  // isFinalizedSitOut requires generated teams, so an empty list hides the
  // whole section -- covering both "still waiting" and normal team events.
  assert.match(notSelectedSource, /v-if="notSelected\.length"/);
  assert.match(
    attendanceUtilSource,
    /export function soloRandomTeamsGenerated\(/,
  );
});

test("rows reuse the canonical player display, with no second system", () => {
  assert.match(notSelectedSource, /import PlayerDisplay from/);
  const row = notSelectedSource.match(/<PlayerDisplay[\s\S]*?\/>/);
  assert.ok(row, "expected a PlayerDisplay row");
  assert.match(row[0], /:linkable="true"/);
  assert.match(row[0], /:match-type="matchType"/);
  // No bespoke flag or profile-link handling.
  assert.doesNotMatch(notSelectedSource, /players-id|TimezoneFlag/);
});

test("rows carry a neutral status and no action controls", () => {
  assert.match(
    notSelectedSource,
    /tournament\.attendance\.not_selected\.status/,
  );
  // Neutral grey, not an attendance colour.
  assert.match(notSelectedSource, /text-muted-foreground/);
  assert.doesNotMatch(notSelectedSource, /emerald|tac-amber/);
  // Nothing actionable once the pool is final.
  assert.doesNotMatch(notSelectedSource, /<button|@click|DropdownMenu/);
  assert.doesNotMatch(
    notSelectedSource,
    /check_in_player|remove_player|team_check_in_button/,
  );
});

test("removed / no-show players are never mixed in", () => {
  // isFinalizedSitOut only accepts Waitlisted, so Removed rows cannot appear.
  const block = stripComments(
    attendanceUtilSource.slice(
      attendanceUtilSource.indexOf("export function isFinalizedSitOut"),
    ),
  );
  assert.match(block, /signup\.status !== "Waitlisted"/);
  assert.doesNotMatch(block, /"Removed"/);
});

test("section copy is concise, mode-agnostic and never says no-show", () => {
  const copy = enLocale.tournament.attendance.not_selected;
  assert.equal(copy.status, "Not selected");
  assert.equal(enLocale.tournament.page.not_selected_section, "Not selected");
  assert.match(copy.description, /registration order/i);
  // No hardcoded mode or counts.
  assert.doesNotMatch(copy.description, /wingman|competitive|duel/i);
  assert.doesNotMatch(copy.description, /\d/);
  for (const value of Object.values(copy)) {
    assert.doesNotMatch(value, /no.?show/i);
    assert.doesNotMatch(value, /did not check in/i);
    assert.doesNotMatch(value, /spot may|may receive/i);
  }
});

test("after finalization the waitlist message stops promising a spot", () => {
  const message = joinFormSource.slice(
    joinFormSource.indexOf("individualAttendanceMessage()"),
    joinFormSource.indexOf("finalizedSitOut()"),
  );
  // The finalized branch is checked BEFORE the waitlist branches.
  assert.ok(
    message.indexOf("this.finalizedSitOut") <
      message.indexOf("waitlisted_checked_in"),
    "finalized sit-out must take precedence over waitlist copy",
  );
  assert.match(message, /tournament\.attendance\.not_selected\.short/);

  // The pre-cutoff waitlist copy itself is unchanged and still says a spot
  // may open -- correct while the pool is not yet final.
  assert.match(
    enLocale.tournament.attendance.waitlisted_checked_in,
    /may receive a tournament spot/i,
  );
});

// --- 6. Solo Random badge -----------------------------------------------------

test("SOLO RANDOM is one shared badge, mode-coloured and squared", () => {
  assert.match(soloBadgeSource, /matchTypeColorStyle\(matchType\)/);
  assert.match(soloBadgeSource, /rounded border/);
  assert.match(soloBadgeSource, /rgb\(var\(--mode-rgb\)/);
  // Not the amber status/action treatment, and not a pill.
  assert.doesNotMatch(soloBadgeSource, /rounded-full/);
  assert.doesNotMatch(soloBadgeSource, /tac-amber/);
});

test("both surfaces use the shared badge instead of hand-rolled markup", () => {
  assert.match(detailSource, /<TournamentSoloRandomBadge/);
  assert.match(featureCardSource, /<TournamentSoloRandomBadge/);
  assert.doesNotMatch(
    featureCardSource,
    /rounded-full[^"]*tac-amber[^"]*"\s*>\s*\{\{ \$t\("tournament\.feature_card\.solo_random"\)/,
  );
});

test("amber stays available for status meaning on the card", () => {
  // Registration status chip and the check-in window badge keep their colours.
  assert.match(featureCardSource, /--tac-amber\)\/0\.22/);
  assert.match(featureCardSource, /check_in_window/);
});

// --- 7-10. Attendance popup ---------------------------------------------------

// The shell is mirrored rather than extracted, so this asserts the two stay
// byte-identical: if either drifts, this fails.
const SHELL_FRAGMENTS = [
  'class="!max-w-md !gap-0 overflow-visible !border-0 !bg-transparent !p-0 !shadow-none"',
  '[box-shadow:0_0_0_1px_hsl(var(--tac-amber)/0.3),0_0_40px_hsl(var(--tac-amber)/0.18)]',
  'absolute left-2 top-2 h-[14px] w-[14px] border-l-2 border-t-2 border-[hsl(var(--tac-amber))]',
  'absolute bottom-2 right-2 h-[14px] w-[14px] border-b-2 border-r-2 border-[hsl(var(--tac-amber))]',
  '[background-image:repeating-linear-gradient(180deg,transparent_0,transparent_3px,hsl(var(--tac-amber)/0.04)_3px,hsl(var(--tac-amber)/0.04)_4px)]',
  'absolute right-3 top-3 z-20 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground',
  'font-mono text-[0.72rem] font-bold uppercase tracking-[0.28em] text-[hsl(var(--tac-amber))]',
];

test("the attendance popup reuses the match popup's exact visual shell", () => {
  for (const fragment of SHELL_FRAGMENTS) {
    assert.ok(
      matchPopupSource.includes(fragment),
      `match popup should contain shell fragment: ${fragment.slice(0, 60)}`,
    );
    assert.ok(
      attendancePopupSource.includes(fragment),
      `attendance popup should contain shell fragment: ${fragment.slice(0, 60)}`,
    );
  }
  assert.match(attendancePopupSource, /AlertDialog, AlertDialogContent/);
});

test("attendance popup content follows the required structure", () => {
  // Heading in the match popup's status-label slot, tournament name where the
  // match popup shows the fixture, timer above the button.
  assert.match(
    attendancePopupSource,
    /tournament\.players\.check_in\.overlay_title/,
  );
  assert.match(attendancePopupSource, /current\.tournament\.name/);
  assert.match(
    attendancePopupSource,
    /minutesLeft \}\}:\{\{ String\(secondsRemainder\)/,
  );
  assert.match(
    attendancePopupSource,
    /tournament\.players\.check_in\.check_in_now/,
  );
  // The old long explanatory paragraph is no longer the middle content.
  assert.doesNotMatch(attendancePopupSource, /check_in\.overlay_description/);
});

test("the check-in button stays white, not amber or green", () => {
  const button = attendancePopupSource.slice(
    attendancePopupSource.indexOf('@click="checkIn"') - 900,
    attendancePopupSource.indexOf('@click="checkIn"') + 40,
  );
  assert.match(button, /bg-background/);
  assert.doesNotMatch(button, /tac-amber-cta/);
  assert.doesNotMatch(button, /bg-success|emerald/);
});

test("the attendance popup is dismissible without changing attendance state", () => {
  assert.match(attendancePopupSource, /function dismiss\(\)/);
  assert.match(attendancePopupSource, /@click="dismiss"/);
  assert.match(attendancePopupSource, /@escape-key-down="dismiss"/);

  const dismiss = attendancePopupSource.slice(
    attendancePopupSource.indexOf("function dismiss()"),
    attendancePopupSource.indexOf("const secondsLeft"),
  );
  // Dismiss only records the key. It must not check in or leave.
  assert.doesNotMatch(dismiss, /mutate|checkIntoTournament|delete_/);
  assert.match(dismiss, /dismissedKeys/);
});

test("the attendance popup has no disable-popup footer", () => {
  assert.doesNotMatch(attendancePopupSource, /disable_match_ready_modal/);
  assert.doesNotMatch(attendancePopupSource, /settings\/matchmaking/);
});

// --- 11. Match popup regression ----------------------------------------------

test("the match popup itself is untouched", () => {
  // Its CTA, footer, close button and shell all still present and unchanged.
  assert.match(matchPopupSource, /tac-amber-cta/);
  assert.match(matchPopupSource, /matchmaking\.go_to_match/);
  assert.match(matchPopupSource, /disable_match_ready_modal_hint/);
  assert.match(matchPopupSource, /disable_match_ready_modal_action/);
  assert.match(matchPopupSource, /\{\{ statusLabel \}\}/);
  assert.match(matchPopupSource, /\{\{ matchTitle \}\}/);
  assert.match(matchPopupSource, /@click="acknowledge"/);
  // It does not import anything from the attendance popup.
  assert.doesNotMatch(matchPopupSource, /TournamentCheckInOverlay/);
});

// --- writing style ------------------------------------------------------------

test("DEAFCS writing style: no em dashes in the new user-facing copy", () => {
  const copy = JSON.stringify([
    enLocale.tournament.attendance.not_selected,
    enLocale.tournament.page.not_selected_section,
    enLocale.tournament.join.individual.sheet_description,
  ]);
  assert.doesNotMatch(copy, /—/);
});
