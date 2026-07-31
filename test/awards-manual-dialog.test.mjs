import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL(
  "../components/tournament/TournamentAwardsManage.vue",
  import.meta.url,
);

test("an organizer can open the manual award form before recipients load", async () => {
  const component = await readFile(componentUrl, "utf8");
  const action = component.match(
    /<template v-if="isOrganizer && !adding" #action>([\s\S]*?)<\/template>/,
  );

  assert.ok(action, "manual award organizer action is rendered");
  assert.match(action[1], /@click="startAdd"/);
  assert.doesNotMatch(action[1], /:disabled="!teams\.length"/);
  assert.match(component, /startAdd\(\)[\s\S]*?this\.adding = true;/);
});
