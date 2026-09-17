import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const matchmakingStore = readFileSync("stores/MatchmakingStore.ts", "utf8");
const leftNav = readFileSync("layouts/components/LeftNav.vue", "utf8");
const topNav = readFileSync("layouts/components/TopNav.vue", "utf8");

for (const mode of ["Competitive", "Wingman", "Duel"]) {
  assert.match(
    matchmakingStore,
    new RegExp(`e_match_types_enum\\.${mode}`),
    `queue total must include ${mode}`,
  );
}

assert.match(matchmakingStore, /const totalQueuedPlayers = computed\(\(\) =>/);
assert.match(matchmakingStore, /lobbySizes\.set\(`\$\{type\}:\$\{entry\.index\}`/);
assert.match(matchmakingStore, /total \+= size/);

for (const [name, source] of [
  ["left navigation", leftNav],
  ["top navigation", topNav],
]) {
  assert.match(
    source,
    /playTotalCount\(\)\s*{\s*return useMatchmakingStore\(\)\.totalQueuedPlayers;\s*}/,
    `${name} Play badge must use the shared queue-player total`,
  );
  assert.match(
    source,
    /v-if="playTotalCount > 0"/,
    `${name} Play badge must stay hidden at zero`,
  );
  assert.match(
    source,
    /store\.liveTournamentsCount \+ store\.openRegistrationTournamentsCount/,
    `${name} Tournaments badge must keep its tournament-only count`,
  );
  assert.match(
    source,
    /return useMatchLobbyStore\(\)\.liveMatchesCount;/,
    `${name} Watch badge must keep its live-match count`,
  );
}

console.log("Play queue badge regression checks passed");
