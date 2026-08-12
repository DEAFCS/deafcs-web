import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playersList = await readFile(
  new URL("../components/matchmaking-lobby/PlayersList.vue", import.meta.url),
  "utf8",
);
const english = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

test("Steam Sync button is the tooltip trigger without a separate info control", () => {
  assert.match(
    playersList,
    /import \{[\s\S]*Tooltip,[\s\S]*TooltipContent,[\s\S]*TooltipTrigger,[\s\S]*\} from "~\/components\/ui\/tooltip"/,
  );
  assert.match(
    playersList,
    /<Tooltip v-if="friendsOnly">\s*<TooltipTrigger as-child>\s*<Button[\s\S]*?<\/Button>\s*<\/TooltipTrigger>\s*<TooltipContent side="bottom">\s*\{\{ \$t\("matchmaking\.friends\.sync_info"\) \}\}/,
  );
  assert.doesNotMatch(playersList, /FiveStackToolTip|<Info\b/);
});

test("Steam Sync button preserves its action and syncing presentation", () => {
  assert.match(playersList, /:disabled="syncing"/);
  assert.match(playersList, /syncSteamFriends\(\);/);
  assert.match(playersList, /<Spinner v-if="syncing"/);
  assert.match(playersList, /<SteamIcon v-else/);
  assert.match(playersList, /\$t\("matchmaking\.friends\.syncing"\)/);
  assert.match(playersList, /\$t\("matchmaking\.friends\.sync"\)/);
});

test("Steam Sync keeps the approved explanation text", () => {
  assert.equal(
    english.matchmaking.friends.sync_info,
    "Sync checks your Steam friends list and adds friends who are also registered on DEAFCS. Your Steam friends list must be set to Public for sync to work. Friends who have not signed in to DEAFCS yet will not appear.",
  );
});
