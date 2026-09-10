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
const playersSearchApi = await readFile(
  new URL("../server/api/players-search.post.ts", import.meta.url),
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

test("total players uses the supported registered-player count without returning player rows", () => {
  assert.match(
    playerOverview,
    /\$fetch<\{ found\?: number \}>\("\/api\/players-search",\s*\{[\s\S]*method: "POST"[\s\S]*registeredOnly: true[\s\S]*per_page: 0/,
  );
  assert.match(playerOverview, /const count = response\?\.found/);
  assert.doesNotMatch(playerOverview, /players_aggregate|getGraphqlClient|generateQuery/);
  assert.match(
    playersSearchApi,
    /body\.registeredOnly[\s\S]*filterBy\.push\(`is_registered:=true`\)/,
  );
  assert.match(
    playersSearchApi,
    /body\.per_page !== undefined && body\.per_page !== null[\s\S]*\? \{ per_page: body\.per_page \}/,
  );
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
