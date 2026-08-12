import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const matchTableRow = await readFile(
  new URL("../components/MatchTableRow.vue", import.meta.url),
  "utf8",
);
const otherMatches = await readFile(
  new URL("../components/match/OtherMatches.vue", import.meta.url),
  "utf8",
);
const matchesTable = await readFile(
  new URL("../components/MatchesTable.vue", import.meta.url),
  "utf8",
);
const mapDisplay = await readFile(
  new URL("../components/MapDisplay.vue", import.meta.url),
  "utf8",
);
const simpleMatchFields = await readFile(
  new URL("../graphql/simpleMatchFields.ts", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// No new GraphQL/backend work -- /watch's existing simpleMatchFields already
// selects the full mapFields object (poster/patch included).
// ---------------------------------------------------------------------------

test("simpleMatchFields.ts is unchanged -- map.poster was already selected via mapFields before this task", () => {
  assert.match(simpleMatchFields, /map: mapFields,/);
});

// ---------------------------------------------------------------------------
// MatchTableRow.vue -- opt-in mapBackground prop, so /matches (which never
// passes it) renders exactly as before.
// ---------------------------------------------------------------------------

test("MatchTableRow.vue gains an opt-in mapBackground prop, defaulting false", () => {
  assert.match(
    matchTableRow,
    /mapBackground:\s*\{\s*\n\s*type:\s*Boolean,\s*\n\s*default:\s*false,\s*\n\s*\},/,
  );
});

test("the map background is only rendered when mapBackground is true, absolutely positioned, full-bleed, and decorative", () => {
  assert.match(matchTableRow, /<div\s*\n\s*v-if="mapBackground"\s*\n\s*class="absolute inset-0 flex"\s*\n\s*aria-hidden="true"/);
});

test("the root card is position:relative and the foreground content is explicitly stacked above the background (relative z-10)", () => {
  assert.match(
    matchTableRow,
    /'relative transition-all duration-300 cursor-pointer group overflow-hidden flex flex-col h-full',/,
  );
  assert.match(
    matchTableRow,
    /'relative z-10 flex flex-col gap-3 flex-1',/,
  );
  // The (rarely-hit outside /watch) player-analysis block also stays above
  // the background layer if a caller ever combines player-focus mode with
  // mapBackground.
  assert.match(
    matchTableRow,
    /class="relative z-10 border-t border-border bg-card\/40 px-2 py-2\.5 space-y-2\.5"/,
  );
});

test("known maps render as equal-width MapDisplay tiles (min-w-0 flex-1), sized from the consumer side rather than editing MapDisplay.vue's own min-w-[150px]", () => {
  assert.match(
    matchTableRow,
    /<MapDisplay\s*\n\s*v-for="matchMap in match\.match_maps"\s*\n\s*:key="matchMap\.id"\s*\n\s*:map="matchMap\.map"\s*\n\s*:patch="false"\s*\n\s*loading="lazy"\s*\n\s*class="min-w-0 flex-1 rounded-none \[&>div\]:hidden"/,
  );
});

test("zero known maps falls back to the existing default.webp screenshot, marked alt=\"\" as decorative", () => {
  assert.match(
    matchTableRow,
    /<NuxtImg\s*\n\s*v-else\s*\n\s*src="\/img\/maps\/screenshots\/default\.webp"/,
  );
  assert.match(matchTableRow, /alt=""/);
});

test("the map tiles' individual veils are suppressed in favor of one smooth overlay that darkens toward the actions", () => {
  assert.match(matchTableRow, /\[&>div\]:hidden/);
  assert.match(
    matchTableRow,
    /class="absolute inset-0 bg-gradient-to-b from-black\/60 via-black\/75 to-black\/90"/,
  );
  assert.doesNotMatch(matchTableRow, /hover:bg-opacity/);
  assert.doesNotMatch(matchTableRow, /bg-opacity-10/);
  assert.doesNotMatch(matchTableRow, /hover:opacity/);
});

test("map-background cards avoid the shared hover glow/background-opacity shift while ordinary cards keep it", () => {
  assert.match(
    matchTableRow,
    /mapBackground\s*\n\s*\? 'bg-black border border-border rounded-lg hover:border-primary\/30'/,
  );
  assert.match(
    matchTableRow,
    /'bg-muted\/30 border border-border rounded-lg hover:shadow-lg hover:shadow-primary\/10 hover:bg-muted\/20 hover:border-primary\/30'/,
  );
});

test("map background images use loading=\"lazy\" -- /watch can render many cards across 3 sections (up to 12+10+10)", () => {
  assert.match(matchTableRow, /loading="lazy"/);
  // Both the MapDisplay tiles and the default.webp fallback are lazy.
  const lazyCount = (matchTableRow.match(/loading="lazy"/g) || []).length;
  assert.equal(lazyCount, 2);
});

test("existing badges/buttons this task must preserve are all still present and untouched: MatchTypeBadge, BO pill, Quick Overview, Open Match", () => {
  assert.equal((matchTableRow.match(/<MatchTypeBadge/g) || []).length, 2);
  assert.equal((matchTableRow.match(/size="default"/g) || []).length, 2);
  assert.match(matchTableRow, /\$t\("ui_extras\.quick_overview"\)/);
  assert.match(matchTableRow, /\$t\("match\.open_match"\)/);
  // The existing full map-list line (Trophy/ListChecks + cleanMapName join)
  // on /watch is untouched -- this task did not touch that block at all.
  assert.match(matchTableRow, /cleanMapName\(mm\.map\?\.label \|\| mm\.map\?\.name \|\| ""\)/);
});

// ---------------------------------------------------------------------------
// Scoped to /watch only -- OtherMatches.vue is /watch-exclusive, and only
// its compact (horizontal-scroll) branch opts in. /matches (MatchesTable.vue
// directly, and pages/matches/index.vue) is untouched.
// ---------------------------------------------------------------------------

test("OtherMatches.vue's compact branch (the only branch /watch actually uses) opts into map-background", () => {
  assert.match(
    otherMatches,
    /<MatchTableRow\s*\n\s*:match="match"\s*\n\s*compact\s*\n\s*always-show\s*\n\s*map-background\s*\n/,
  );
});

test("MatchesTable.vue (used directly by /matches) is not modified -- no map-background prop added there", () => {
  assert.doesNotMatch(matchesTable, /map-background/);
  assert.doesNotMatch(matchesTable, /mapBackground/);
});

// ---------------------------------------------------------------------------
// MapDisplay.vue -- minimal, backward-compatible loading prop only.
// ---------------------------------------------------------------------------

test("MapDisplay.vue gained only an optional loading prop (default undefined) -- every other existing consumer is unaffected", () => {
  assert.match(mapDisplay, /:src="map\.poster"/);
  assert.match(mapDisplay, /:loading="loading"/);
  assert.match(
    mapDisplay,
    /loading:\s*\{\s*\n\s*type:\s*String as PropType<"lazy" \| "eager" \| undefined>,\s*\n\s*default:\s*undefined,\s*\n\s*\},/,
  );
  // Original markers untouched.
  assert.match(mapDisplay, /bg-black bg-opacity-45/);
  assert.match(mapDisplay, /min-w-\[150px\]/);
});
