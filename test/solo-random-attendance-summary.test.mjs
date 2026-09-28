import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { individualAttendanceSummary } from "../utilities/tournamentAttendance.ts";

// Covers the "44 signed up · 40 checked in" attendance summary on the Solo
// Random Players page: the shared counting helper, where it is rendered, and
// that normal team tournaments never see it.

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const signup = (status, checkedIn = false, teamId = null) => ({
  status,
  checked_in_at: checkedIn ? "2026-09-28T18:00:00Z" : null,
  tournament_team_id: teamId,
});
const many = (n, status, checkedIn) =>
  Array.from({ length: n }, () => signup(status, checkedIn));

test("signed up counts every existing signup row", () => {
  const rows = [
    ...many(3, "Registered", false),
    ...many(2, "Waitlisted", false),
  ];
  assert.equal(individualAttendanceSummary(rows).signedUp, 5);
});

test("checked in counts rows with checked_in_at set", () => {
  const rows = [...many(4, "Registered", true), ...many(2, "Registered", false)];
  assert.deepEqual(individualAttendanceSummary(rows), {
    signedUp: 6,
    checkedIn: 4,
  });
});

test("checked-in Registered players are included", () => {
  assert.equal(
    individualAttendanceSummary([signup("Registered", true)]).checkedIn,
    1,
  );
});

test("checked-in Waitlisted players are included", () => {
  const rows = [signup("Registered", true), signup("Waitlisted", true)];
  assert.equal(individualAttendanceSummary(rows).checkedIn, 2);
});

test("unchecked players are excluded from checked in", () => {
  const rows = [
    signup("Registered", false),
    signup("Waitlisted", false),
    signup("Registered", true),
  ];
  assert.deepEqual(individualAttendanceSummary(rows), {
    signedUp: 3,
    checkedIn: 1,
  });
});

test("counts stay correct after Assigned/Removed statuses", () => {
  // 44 signed up, 40 checked in, 7 x 5v5 teams: 35 Assigned, 5 checked-in
  // players left Waitlisted (sitting out), 4 Removed for not checking in.
  const rows = [
    ...Array.from({ length: 35 }, () => signup("Assigned", true, "team-1")),
    ...many(5, "Waitlisted", true),
    ...many(4, "Removed", false),
  ];
  assert.deepEqual(individualAttendanceSummary(rows), {
    signedUp: 44,
    checkedIn: 40,
  });
});

test("missing data degrades to zero", () => {
  assert.deepEqual(individualAttendanceSummary(undefined), {
    signedUp: 0,
    checkedIn: 0,
  });
  assert.deepEqual(individualAttendanceSummary([]), {
    signedUp: 0,
    checkedIn: 0,
  });
});

test("singular/plural labels", async () => {
  const en = JSON.parse(await read("i18n/locales/en.json"));
  assert.equal(
    en.tournament.players.summary_signed_up,
    "{count} signed up | {count} signed up",
  );
  assert.equal(
    en.tournament.players.summary_checked_in,
    "{count} checked in | {count} checked in",
  );
  // No em dashes in user-facing copy.
  assert.doesNotMatch(en.tournament.players.summary_signed_up, /—/);
  assert.doesNotMatch(en.tournament.players.summary_checked_in, /—/);
});

test("the Players page renders the summary from the subscribed signups", async () => {
  const src = await read("components/tournament/TournamentIndividualPlayers.vue");
  assert.match(src, /individualAttendanceSummary\(this\.signups\)/);
  assert.match(src, /data-testid="individual-attendance-summary"/);
  assert.match(
    src,
    /\$t\(\s*"tournament\.players\.summary_signed_up",\s*attendanceSummary\.signedUp,\s*\)/,
  );
  assert.match(
    src,
    /\$t\(\s*"tournament\.players\.summary_checked_in",\s*attendanceSummary\.checkedIn,\s*\)/,
  );
  // Reuses the page's own tournament data: no second query or polling loop.
  assert.doesNotMatch(src, /setInterval|pollInterval|\$subscribe/);
});

test("the detail page subscription carries checked_in_at for every signup", async () => {
  const detail = await read("components/tournament/TournamentDetail.vue");
  const block = detail.slice(detail.indexOf("individual_signups: ["));
  assert.match(block.slice(0, 400), /\{\},\s*\{[\s\S]*checked_in_at: true/);
});

test("normal team tournaments do not show the summary", async () => {
  const detail = await read("components/tournament/TournamentDetail.vue");
  // The Players component (and so the summary) only mounts for individual
  // registration; team tournaments take the v-else roster branch.
  assert.match(
    detail,
    /<TournamentIndividualPlayers\s+v-if="isIndividualRegistration"/,
  );
  assert.equal(
    (detail.match(/<TournamentIndividualPlayers\b/g) ?? []).length,
    1,
  );
  assert.doesNotMatch(detail, /individual-attendance-summary|summary_signed_up/);
});
