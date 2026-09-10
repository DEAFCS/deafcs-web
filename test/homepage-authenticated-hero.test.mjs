import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const playerOverview = await readFile(
  new URL("../components/home/HomePlayerOverview.vue", import.meta.url),
  "utf8",
);
const homeIndex = await readFile(
  new URL("../pages/index.vue", import.meta.url),
  "utf8",
);
const matchmakingStore = await readFile(
  new URL("../stores/MatchmakingStore.ts", import.meta.url),
  "utf8",
);
const socket = await readFile(
  new URL("../web-sockets/Socket.ts", import.meta.url),
  "utf8",
);

test("authenticated homepage hero uses the real player nickname and bundled banner", async () => {
  assert.match(playerOverview, /Welcome back, \{\{ playerName \}\}/);
  assert.match(playerOverview, /props\.previewPlayer \?\? authStore\.me/);
  assert.doesNotMatch(playerOverview, /TricoN/);
  assert.match(playerOverview, /src="\/img\/home\/deafcs-banner\.png"/);

  await access(
    new URL("../public/img/home/deafcs-banner.png", import.meta.url),
  );
});

test("total players comes from a Hasura aggregate count without downloading player rows", () => {
  assert.match(
    playerOverview,
    /players_aggregate:\s*\[[\s\S]*last_sign_in_at:\s*\{ _is_null: false \}[\s\S]*aggregate:\s*\{ count: true \}/,
  );
  assert.match(playerOverview, /fetchPolicy: "network-only"/);
  assert.doesNotMatch(playerOverview, /data\?\.players\?\.length/);
});

test("online now reuses the established websocket presence snapshot", () => {
  assert.match(
    playerOverview,
    /matchmakingStore\.onlinePlayerSteamIds\.length/,
  );
  assert.match(matchmakingStore, /const hasOnlinePlayerSnapshot = ref\(false\)/);
  assert.match(socket, /socket\.listen\("players-online"/);
  assert.match(socket, /matchmakingStore\.hasOnlinePlayerSnapshot = true/);
});

test("stats have no fake values and the logged-out homepage remains on its existing branch", () => {
  assert.doesNotMatch(playerOverview, /\b2[,.]?458\b|\b27\b/);
  assert.match(homeIndex, /<HomePlayerOverview[\s\S]*v-else-if="showLoggedInHome"/);
  assert.match(
    homeIndex,
    /v-if="!authStore\.hasCheckedSession && !previewHomeState"/,
  );
  assert.match(homeIndex, /<main v-else/);
  assert.match(homeIndex, /Welcome to DEAFCS/);
  assert.match(homeIndex, /Sign in with Steam/);
});
