import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Frontend half of the team-leave permission fix: once registration closes,
// the bracket exists and a normal participant/captain can no longer
// unilaterally pull their team -- matches the narrowed tournament_teams
// delete_permissions (Setup/RegistrationOpen only for a non-organizer).
// Organizers keep today's wider RegistrationClosed/Live/Paused removal
// window via canRemoveTeam, which this fix does not touch.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const teamSource = await read("../components/tournament/TournamentTeam.vue");

function computed(name) {
  const start = teamSource.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name}() not found`);
  // Grab up to the next top-level computed method (2-space-indented "name() {")
  // by finding the next occurrence of that same indentation pattern after this one.
  const rest = teamSource.slice(start + name.length + 4);
  const nextMatch = rest.match(/\n {4}\w+\([^)]*\) \{/);
  return rest.slice(0, nextMatch ? nextMatch.index : rest.length);
}

test("canLeaveTournament narrows the non-organizer window to Setup/RegistrationOpen", () => {
  const block = computed("canLeaveTournament");
  assert.match(block, /if \(!this\.tournament\.is_organizer\)/);
  assert.match(
    block,
    /restrictedStatuses\.push\(\s*e_tournament_status_enum\.RegistrationClosed,\s*e_tournament_status_enum\.Live,\s*e_tournament_status_enum\.Paused,?\s*\);/,
  );
});

test("canLeaveTeam narrows the same non-organizer window", () => {
  const block = computed("canLeaveTeam");
  assert.match(block, /if \(!this\.tournament\.is_organizer\)/);
  assert.match(
    block,
    /restrictedStatuses\.push\(\s*e_tournament_status_enum\.RegistrationClosed,\s*e_tournament_status_enum\.Live,\s*e_tournament_status_enum\.Paused,?\s*\);/,
  );
});

test("both leave computeds still block the three terminal statuses unconditionally", () => {
  for (const name of ["canLeaveTournament", "canLeaveTeam"]) {
    const block = computed(name);
    const restrictedInit = block.slice(
      block.indexOf("restrictedStatuses = ["),
      block.indexOf("];") + 2,
    );
    assert.match(restrictedInit, /e_tournament_status_enum\.Cancelled/);
    assert.match(restrictedInit, /e_tournament_status_enum\.CancelledMinTeams/);
    assert.match(restrictedInit, /e_tournament_status_enum\.Finished/);
  }
});

test("canLeaveTeam's roster-minimum and membership checks are unchanged", () => {
  const block = computed("canLeaveTeam");
  assert.match(block, /const isMember =/);
  assert.match(block, /if \(!isMember\) return false;/);
  assert.match(block, /if \(this\.rosterLockedAtMin\) return false;/);
});

test("canLeaveTournament's can_manage gate is unchanged", () => {
  const block = computed("canLeaveTournament");
  assert.match(block, /if \(!this\.team\.can_manage\) return false;/);
});

test("canRemoveTeam (organizer's own removal control) is untouched by this fix", () => {
  const block = computed("canRemoveTeam");
  assert.match(block, /if \(!this\.tournament\.is_organizer\) return false;/);
  assert.doesNotMatch(block, /RegistrationClosed/);
  assert.doesNotMatch(block, /Live/);
  assert.doesNotMatch(block, /Paused/);
  // Still only the three terminal statuses.
  assert.match(block, /e_tournament_status_enum\.Cancelled/);
  assert.match(block, /e_tournament_status_enum\.CancelledMinTeams/);
  assert.match(block, /e_tournament_status_enum\.Finished/);
});

test("button/template wiring is unchanged: organizer sees Remove Team, others see Leave Tournament", () => {
  assert.match(
    teamSource,
    /v-if="!tournament\.is_organizer && canLeaveTournament"/,
  );
  assert.match(teamSource, /v-if="tournament\.is_organizer && canRemoveTeam"/);
  assert.match(teamSource, /:can-leave="canLeaveTeam"/);
  assert.match(teamSource, /:roster-locked-at-min="rosterLockedAtMin"/);
});

test("rosterLocked (roster-minimum lock window) is unchanged by this fix", () => {
  const start = teamSource.indexOf("rosterLocked() {");
  const end = teamSource.indexOf("rosterLockedAtMin() {");
  const block = teamSource.slice(start, end);
  assert.match(block, /e_tournament_status_enum\.RegistrationClosed/);
  assert.match(block, /e_tournament_status_enum\.Live/);
  assert.match(block, /e_tournament_status_enum\.Paused/);
});

test("Solo Random's individual-leave rule is untouched and stays a separate surface", async () => {
  const attendanceUtilSource = await read("../utilities/tournamentAttendance.ts");
  assert.match(
    attendanceUtilSource,
    /export function canLeaveIndividualTournament\(/,
  );
  const block = attendanceUtilSource.slice(
    attendanceUtilSource.indexOf("export function canLeaveIndividualTournament"),
  );
  // Still RegistrationOpen-only, and still has nothing to do with
  // tournament_teams -- the team-leave fix in TournamentTeam.vue is
  // deliberately not shared with this helper.
  assert.match(block, /tournament\.status !== "RegistrationOpen"/);
  assert.doesNotMatch(block, /tournament_teams/);
});
