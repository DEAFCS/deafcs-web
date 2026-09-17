import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const teamMembers = await read("components/teams/TeamMembers.vue");
const teamMember = await read("components/teams/TeamMember.vue");
const teamPage = await read("pages/teams/[id].vue");
const english = JSON.parse(await read("i18n/locales/en.json"));

const warning =
  "You are the last team Admin. Assign another Admin before changing your role or leaving the team.";

test("Admin is assignable and every roster section marks the final Admin", () => {
  assert.doesNotMatch(teamMembers, /_neq:\s*e_team_roles_enum\.Admin/);
  assert.match(teamMembers, /adminCount\(\): number/);
  assert.equal(
    teamMembers.match(
      /:is-last-admin="member\.role === 'Admin' && adminCount === 1"/g,
    )?.length,
    4,
  );
});

test("final-Admin demotion and removal are prevented before mutation", () => {
  assert.match(teamMember, /isLastAdmin:\s*\{/);
  assert.match(
    teamMember,
    /:disabled="isLastAdmin && role\.value !== 'Admin'"/,
  );
  assert.match(
    teamMember,
    /this\.team\.can_remove && !this\.isSelf && !this\.isLastAdmin/,
  );
  assert.match(teamMember, /this\.showLastAdminError\(\)/);
});

test("self-demotion requires confirmation and mutation failures are sanitized", () => {
  assert.match(teamMember, /team\.admin\.demote_confirmation/);
  assert.match(teamMember, /roleChangeDialog = true/);
  assert.match(teamMember, /team\.admin\.operation_failed/);
  assert.doesNotMatch(teamMember, /description:\s*message\s*[,}]/);
});

test("the final Admin cannot leave and concurrent backend rejections stay readable", () => {
  assert.match(teamPage, /requestLeaveTeam/);
  assert.match(teamPage, /this\.isLastAdmin/);
  assert.match(teamPage, /team\.admin\.last_admin/);
  assert.match(teamPage, /team\.admin\.operation_failed/);
  assert.match(teamPage, /role:\s*true/);
});

test("the required final-Admin copy is exact", () => {
  assert.equal(english.team.admin.last_admin, warning);
});
