import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canSelfCheckInIndividually } from "../utilities/tournamentAttendance.ts";

// Solo Random waitlist check-in. During the automatic attendance window
// (tournament still RegistrationOpen) Waitlisted players must check in too:
// team generation now selects only checked-in Registered/Waitlisted signups
// against the CURRENT capacity. The older manual RegistrationClosed window
// keeps asking Registered players only. The API (checkIntoTournament) is
// authoritative; these surfaces mirror it so nobody is offered a button the
// server would reject, or left unprompted when they need to act.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const openWindow = () => new Date(Date.now() + 10 * 60_000).toISOString();
const closedWindow = () => new Date(Date.now() - 60_000).toISOString();
const tournament = (status, endsAt = openWindow()) => ({
  status,
  individual_check_in_ends_at: endsAt,
});
const signup = (status, overrides = {}) => ({
  status,
  checked_in_at: null,
  tournament_team_id: null,
  ...overrides,
});

// --- the shared rule -------------------------------------------------------

test("automatic window: unchecked Registered may check in", () => {
  assert.equal(
    canSelfCheckInIndividually(signup("Registered"), tournament("RegistrationOpen")),
    true,
  );
});

test("automatic window: unchecked Waitlisted may check in", () => {
  assert.equal(
    canSelfCheckInIndividually(signup("Waitlisted"), tournament("RegistrationOpen")),
    true,
  );
});

test("manual window: Registered may check in, Waitlisted may not (unchanged)", () => {
  assert.equal(
    canSelfCheckInIndividually(signup("Registered"), tournament("RegistrationClosed")),
    true,
  );
  assert.equal(
    canSelfCheckInIndividually(signup("Waitlisted"), tournament("RegistrationClosed")),
    false,
  );
});

test("never once checked in, assigned, removed, or outside the window", () => {
  const t = tournament("RegistrationOpen");
  assert.equal(
    canSelfCheckInIndividually(
      signup("Waitlisted", { checked_in_at: "2026-09-28T17:00:00Z" }),
      t,
    ),
    false,
  );
  assert.equal(
    canSelfCheckInIndividually(signup("Assigned", { tournament_team_id: "x" }), t),
    false,
  );
  assert.equal(canSelfCheckInIndividually(signup("Removed"), t), false);
  assert.equal(
    canSelfCheckInIndividually(
      signup("Waitlisted"),
      tournament("RegistrationOpen", closedWindow()),
    ),
    false,
  );
  assert.equal(
    canSelfCheckInIndividually(signup("Registered"), tournament("RegistrationOpen", null)),
    false,
  );
  assert.equal(canSelfCheckInIndividually(null, t), false);
});

// --- surfaces use the rule ---------------------------------------------------

test("Join form and Players page both delegate self check-in to the shared rule", async () => {
  const joinForm = await read("components/tournament/TournamentJoinForm.vue");
  const players = await read("components/tournament/TournamentIndividualPlayers.vue");
  assert.match(joinForm, /canSelfCheckInIndividually\(/);
  assert.match(players, /canSelfCheckInIndividually\(signup, this\.tournament as any\)/);
});

test("an unchecked Waitlisted player in the automatic window is told to check in, without a promise", async () => {
  const joinForm = await read("components/tournament/TournamentJoinForm.vue");
  const en = JSON.parse(await read("i18n/locales/en.json"));
  assert.match(joinForm, /tournament\.attendance\.waitlisted_check_in_by/);
  const copy = en.tournament.attendance.waitlisted_check_in_by;
  assert.match(copy, /waitlist/i);
  assert.match(copy, /\{time\}/);
  assert.doesNotMatch(copy, /confirmed|guaranteed|you're in/i);
  assert.doesNotMatch(copy, /—/);
});

// --- global overlay ---------------------------------------------------------

test("overlay subscription prompts unchecked Registered, and unchecked Waitlisted only in the automatic window", async () => {
  const overlay = await read("components/tournament/TournamentCheckInOverlay.vue");
  const query = overlay.slice(
    overlay.indexOf("subscription MyPendingTournamentCheckIns"),
    overlay.indexOf("`;", overlay.indexOf("subscription MyPendingTournamentCheckIns")),
  );
  assert.match(query, /checked_in_at: \{ _is_null: true \}/);
  assert.match(query, /\{ status: \{ _eq: Registered \} \}/);
  assert.match(
    query,
    /status: \{ _eq: Waitlisted \}\s*tournament: \{ status: \{ _eq: RegistrationOpen \} \}/,
  );
  // No blanket status filter left that would hide Waitlisted rows.
  assert.doesNotMatch(query, /^\s*status: \{ _eq: Registered \}\s*$/m);
  // Client-side, rows go through the same shared rule.
  assert.match(overlay, /canSelfCheckInIndividually\(row, row\.tournament\)/);
});

test("overlay tells a waitlisted player a spot is not guaranteed", async () => {
  const overlay = await read("components/tournament/TournamentCheckInOverlay.vue");
  const en = JSON.parse(await read("i18n/locales/en.json"));
  assert.match(overlay, /v-if="currentIsWaitlisted"/);
  assert.match(overlay, /tournament\.players\.check_in\.overlay_waitlisted/);
  const copy = en.tournament.players.check_in.overlay_waitlisted;
  assert.match(copy, /not guaranteed/i);
  assert.doesNotMatch(copy, /spot confirmed|you're in/i);
  assert.doesNotMatch(copy, /—/);
  // The shared title stays neutral for both.
  assert.doesNotMatch(
    en.tournament.players.check_in.overlay_title,
    /confirmed|spot/i,
  );
});

test("overlay still checks in through the player's own action", async () => {
  const overlay = await read("components/tournament/TournamentCheckInOverlay.vue");
  assert.match(overlay, /checkIntoTournament: \[/);
  assert.doesNotMatch(overlay, /checkInTournamentIndividualPlayer/);
});
