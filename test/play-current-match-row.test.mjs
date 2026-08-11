import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// /play's current-match section used to show a raw {{ match.status }}
// Badge (always the literal enum string, no VETO/LIVE/PAUSED-aware styling),
// a separately-boxed QuickMatchConnect, and a detached white "Go to Match"
// button. This groups all three into one compact bordered row, reusing the
// existing dynamic status component and connect controls rather than
// inventing new ones (issue #52).

const matchmaking = await readFile(
  new URL("../components/matchmaking/Matchmaking.vue", import.meta.url),
  "utf8",
);
const quickConnect = await readFile(
  new URL("../components/match/QuickMatchConnect.vue", import.meta.url),
  "utf8",
);

test("the current-match section reuses MatchStatus for dynamic status, not a raw status string", () => {
  assert.match(
    matchmaking,
    /import MatchStatus from "~\/components\/match\/MatchStatus\.vue";/,
  );
  assert.match(matchmaking, /<MatchStatus :match="match" \/>/);
  // The old unconditional {{ match.status }} Badge is gone -- MatchStatus
  // owns VETO/LIVE/PAUSED/etc. labeling and color now, not this component.
  assert.doesNotMatch(matchmaking, /\{\{\s*match\.status\s*\}\}/);
});

test("Copy/Join Server are still the existing QuickMatchConnect component, unmodified apart from placement", () => {
  assert.match(matchmaking, /<QuickMatchConnect :match="match" bare \/>/);
});

test("QuickMatchConnect's bare prop only suppresses the connected-row wrapper box, not the buttons/icons/logic inside it", () => {
  assert.match(quickConnect, /bare:\s*\{\s*\n\s*type:\s*Boolean,\s*\n\s*default:\s*false,/);
  assert.match(
    quickConnect,
    /:class="bare \? '' : 'p-4 rounded-lg border bg-foreground\/10'"/,
  );
  // Everything else that renders Copy/Join Server -- ClipBoard, the Join
  // Server button, its icon, and the connection_link gating -- is untouched.
  assert.match(quickConnect, /<ClipBoard\s/);
  assert.match(quickConnect, /\$t\("match\.server\.join_server"\)/);
  assert.match(quickConnect, /<ExternalLink class="w-4 h-4" \/>/);
  assert.match(quickConnect, /v-if="match\.connection_link"/);
});

test("Join Server visibility rules (live + connected + online) are untouched", () => {
  assert.match(quickConnect, /showConnectPanel\(\)\s*\{\s*\n\s*return !!this\.me && this\.isLive;/);
  assert.match(quickConnect, /isLive\(\)\s*\{\s*\n\s*return this\.match\.status === e_match_status_enum\.Live;/);
});

test("Go to Match uses the standard DEAFCS orange CTA styling instead of a bare white button", () => {
  assert.match(
    matchmaking,
    /import \{ tacticalCtaButtonClasses \} from "~\/utilities\/tacticalClasses";/,
  );
  const linkMatch = matchmaking.match(
    /<NuxtLink\s+:to="\{ name: 'matches-id', params: \{ id: match\.id \} \}"\s+:class="\[tacticalCtaButtonClasses, 'shrink-0'\]"\s*>\s*\{\{ \$t\("matchmaking\.go_to_match"\) \}\}\s*<\/NuxtLink>/,
  );
  assert.ok(linkMatch, "expected Go to Match to be a tacticalCtaButtonClasses NuxtLink");
  // No leftover white/foreground button styling for this control.
  assert.doesNotMatch(matchmaking, /bg-foreground">\s*\{\{ \$t\("matchmaking\.go_to_match"\) \}\}/);
});

test("Go to Match navigation target is unchanged (same route/params as before)", () => {
  assert.match(
    matchmaking,
    /:to="\{ name: 'matches-id', params: \{ id: match\.id \} \}"/,
  );
});

test("the row groups status/connect controls on the left and Go to Match on the right with flexible space between", () => {
  const rowMatch = matchmaking.match(
    /<template v-else-if="match">\s*<div\s+class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted\/30 px-4 py-3"\s*>\s*<div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">\s*<MatchStatus[\s\S]*?<QuickMatchConnect[\s\S]*?<\/div>\s*<NuxtLink/,
  );
  assert.ok(
    rowMatch,
    "expected one bordered row with a flex-1 left group (status + connect) and Go to Match after it",
  );
});

test("the match query now selects the fields MatchStatus needs to render VETO/PAUSED/etc., not just status", () => {
  const queryBlock = matchmaking.slice(
    matchmaking.indexOf("matches_by_pk: ["),
    matchmaking.indexOf("matches_by_pk: [") + 1100,
  );
  assert.match(queryBlock, /e_match_status:\s*\{\s*\n\s*description:\s*true,/);
  assert.match(queryBlock, /winning_lineup_id:\s*true/);
  assert.match(queryBlock, /match_maps:\s*\[\{\},\s*\{\s*status:\s*true\s*\}\]/);
});

console.log("play current-match row checks passed");
