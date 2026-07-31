import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manageUrl = new URL(
  "../components/tournament/TournamentAwardsManage.vue",
  import.meta.url,
);
const catalogUrl = new URL("../pages/awards/index.vue", import.meta.url);

test("manual award removal uses revokeAward instead of the legacy delete mutation", async () => {
  const component = await readFile(manageUrl, "utf8");
  assert.doesNotMatch(component, /delete_tournament_trophies_by_pk/);
  assert.match(component, /revokeAward\s*\(\s*id:\s*\$id,\s*reason:\s*\$reason/);
  assert.match(component, /variables:\s*\{\s*id:\s*target\.id,\s*reason\s*\}/);
});

test("manual revocation requires a non-empty reason", async () => {
  const component = await readFile(manageUrl, "utf8");
  assert.match(component, /const reason = this\.revokeReason\.trim\(\)/);
  assert.match(component, /if \(!target\?\.manual \|\| !target\.id \|\| !reason\) return/);
  assert.match(component, /:disabled="revoking \|\| !revokeReason\.trim\(\)"/);
});

test("calculated awards do not expose manual revoke controls", async () => {
  const component = await readFile(manageUrl, "utf8");
  assert.match(component, /\.filter\(\(t\) => t\.manual/);
  assert.match(component, /v-if="trophy\.manual"[\s\S]*?@click="requestRevoke\(trophy\)"/);
  assert.match(component, /if \(!trophy\?\.manual\) return/);
});

test("catalog cards do not navigate to the unimplemented detail route", async () => {
  const page = await readFile(catalogUrl, "utf8");
  assert.doesNotMatch(page, /:to="`\/awards\/\$\{award\.id\}`"/);
  assert.match(page, /<article[\s\S]*?v-for="award in group\.awards"/);
});
