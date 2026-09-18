import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const teamMember = await read("components/teams/TeamMember.vue");
const teamMembers = await read("components/teams/TeamMembers.vue");
const english = JSON.parse(await read("i18n/locales/en.json"));

test("choosing Starter/Substitute/Benched atomically clears coach in the same mutation", () => {
  const updateMemberStatus = teamMember.match(
    /async updateMemberStatus\(value: e_team_roster_statuses_enum\) \{[\s\S]*?\n {4}\},/,
  )?.[0];
  assert.ok(updateMemberStatus, "updateMemberStatus method not found");
  assert.match(updateMemberStatus, /status:\s*value,/);
  assert.match(updateMemberStatus, /coach:\s*false,/);
  // Both fields must be set in the same _set object (one atomic UPDATE), not
  // two separate mutations.
  const setBlock = updateMemberStatus.match(/_set:\s*\{([\s\S]*?)\}\s*as any/)?.[1];
  assert.ok(setBlock, "_set block not found");
  assert.match(setBlock, /status:\s*value,/);
  assert.match(setBlock, /coach:\s*false,/);
});

test("updateMemberStatus has a reentrancy guard and reports errors instead of failing silently", () => {
  assert.match(teamMember, /updatingStatus:\s*false,/);
  assert.match(
    teamMember,
    /async updateMemberStatus\([\s\S]{0,80}\{\s*\n\s*if \(this\.updatingStatus\) \{\s*\n\s*return;/,
  );
  assert.match(teamMember, /this\.showStatusChangeError\(error\)/);
});

test("the 5-starter and substitute cap errors are sanitized to translated copy, never the raw DB message", () => {
  assert.match(teamMember, /showStatusChangeError\(error: unknown\)/);
  assert.match(teamMember, /Only \(\\d\+\) starters are allowed/);
  assert.match(teamMember, /Only \(\\d\+\) substitutes are allowed/);
  assert.match(teamMember, /team\.admin\.starter_cap_reached/);
  assert.match(teamMember, /team\.admin\.substitute_cap_reached/);
  assert.equal(
    english.team.admin.starter_cap_reached,
    "Only {max} starters are allowed; bench a starter first.",
  );
  assert.equal(
    english.team.admin.substitute_cap_reached,
    "Only {max} substitutes are allowed; bench a substitute first.",
  );
});

test("normal player to Coach (toggleCoach) is untouched -- it only ever sets coach, never status", () => {
  const toggleCoach = teamMember.match(
    /async toggleCoach\(\) \{[\s\S]*?\n {4}\},/,
  )?.[0];
  assert.ok(toggleCoach, "toggleCoach method not found");
  assert.match(toggleCoach, /coach:\s*!this\.member\.coach,/);
  assert.doesNotMatch(toggleCoach, /status:/);
});

test("Coaches section still filters on coach, Starters/Substitutes/Bench still exclude coaches", () => {
  assert.match(teamMembers, /coaches\(\): any\[\] \{\s*\n\s*return this\.sortedRoster\.filter\(\(m: any\) => m\.coach\);/);
  assert.match(teamMembers, /starters\(\): any\[\] \{\s*\n\s*return this\.sortedRoster\.filter\(\s*\n?\s*\(m: any\) => !m\.coach && m\.status === "Starter",?\s*\n?\s*\);/);
});
