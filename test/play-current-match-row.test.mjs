import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// /play's current match (issue #52), now the match panel of the 5Stack hero
// (PlayMatchmaking). DEAFCS keeps its decisions there: the dynamic
// MatchStatus badge instead of a raw status string, the existing connect
// controls, and the orange Go to Match CTA on the same route.

const hero = await readFile(
  new URL("../components/play/PlayMatchmaking.vue", import.meta.url),
  "utf8",
);
const quickConnect = await readFile(
  new URL("../components/match/QuickMatchConnect.vue", import.meta.url),
  "utf8",
);

test("the match panel reuses MatchStatus for dynamic status, not a raw status string", () => {
  assert.match(
    hero,
    /import MatchStatus from "~\/components\/match\/MatchStatus\.vue";/,
  );
  assert.match(hero, /<MatchStatus v-if="match" :match="match" \/>/);
  assert.doesNotMatch(hero, /\{\{\s*match\??\.status\s*\}\}/);
  assert.doesNotMatch(hero, /e_match_status\?\.description \?\? match\?\.status/);
});

test("Copy/Join Server are still the existing QuickMatchConnect component", () => {
  assert.match(hero, /<QuickMatchConnect :match="match" \/>/);
});

test("Join Server visibility rules (live + connected + online) are untouched", () => {
  assert.match(quickConnect, /showConnectPanel\(\)\s*\{\s*\n\s*return !!this\.me && this\.isLive;/);
  assert.match(quickConnect, /isLive\(\)\s*\{\s*\n\s*return this\.match\.status === e_match_status_enum\.Live;/);
  assert.match(quickConnect, /v-if="match\.connection_link"/);
});

test("Go to Match keeps the DEAFCS orange CTA and its route", () => {
  assert.match(hero, /tacticalCtaButtonClasses,/);
  assert.match(
    hero,
    /<NuxtLink\s+v-if="match"\s+:to="\{ name: 'matches-id', params: \{ id: match\.id \} \}"\s+:class="\[tacticalCtaButtonClasses, 'shrink-0 max-sm:w-full'\]"\s*>\s*\{\{ \$t\("matchmaking\.go_to_match"\) \}\}\s*<\/NuxtLink>/,
  );
});

test("the match subscription selects the fields MatchStatus needs", () => {
  const start = hero.indexOf("matches_by_pk: [");
  const block = hero.slice(start, start + 1400);
  assert.match(block, /e_match_status: \{ description: true \}/);
  assert.match(block, /winning_lineup_id: true/);
  assert.match(block, /status: true/);
});

console.log("play current-match row checks passed");
