import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../pages/leaderboard.vue", import.meta.url),
  "utf8",
);
const component = await readFile(
  new URL(
    "../components/leaderboard/ExternalRankLeaderboard.vue",
    import.meta.url,
  ),
  "utf8",
);
const locale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

test("FACEIT / PREMIER is the tab immediately after ELO", () => {
  assert.match(
    page,
    /const categories = \[\s*\{ value: "elo" \},\s*\{ value: EXTERNAL_RANK_CATEGORY \}/,
  );
  assert.equal(
    locale.pages.leaderboard.categories.external_ranks,
    "FACEIT / PREMIER",
  );
  assert.match(page, /<ExternalRankLeaderboard v-else \/>/);
});

test("the dedicated component keeps both external ratings visible", () => {
  assert.match(component, /pages\.leaderboard\.col\.faceit_elo/);
  assert.match(component, /pages\.leaderboard\.col\.premier_rating/);
  assert.match(component, /<PlayerFaceitRank/);
  assert.match(component, /<PlayerPremierRank/);
  assert.match(component, /<PlayerDisplay/);
  assert.match(component, /<Pagination/);
  assert.match(component, /class="min-w-\[640px\]"/);
});

test("FACEIT is the default sort and both header actions request descending global order", () => {
  assert.match(component, /const sortBy = ref<SortColumn>\("faceit"\)/);
  assert.match(
    component,
    /\{ faceit_elo: "desc_nulls_last" \},\s*\{ premier_rank: "desc_nulls_last" \},\s*\{ player_steam_id: "asc" \}/,
  );
  assert.match(
    component,
    /\{ premier_rank: "desc_nulls_last" \},\s*\{ faceit_elo: "desc_nulls_last" \},\s*\{ player_steam_id: "asc" \}/,
  );
  assert.match(
    component,
    /external_rank_leaderboard\([\s\S]*limit: \$limit[\s\S]*offset: \$offset[\s\S]*order_by: \$order_by/,
  );
  assert.match(component, /@click="selectSort\('faceit'\)"/);
  assert.match(component, /@click="selectSort\('premier'\)"/);
});

test("rank numbers follow the globally sorted page and missing data renders as hyphens", () => {
  assert.match(component, /\{\{ offset \+ index \+ 1 \}\}/);
  assert.match(component, /if \(!value\) return "-"/);
  assert.equal(
    (component.match(/font-mono font-semibold">-</g) || []).length,
    2,
  );
});

test("match dates come only from dedicated last-match fields, never sync timestamps", () => {
  assert.match(component, /formatDate\(entry\.faceit_last_match_at\)/);
  assert.match(component, /formatDate\(entry\.premier_last_match_at\)/);
  assert.doesNotMatch(component, /faceit_updated_at|premier_rank_updated_at/);
  assert.doesNotMatch(component, /fetch\(/);
});

test("the existing DEAFCS leaderboard query and category implementation remain in place", () => {
  assert.match(page, /query GetLeaderboard/);
  assert.match(page, /get_leaderboard\(/);
  assert.match(page, /get_leaderboard_aggregate\(/);
  assert.match(page, /function toggleSort\(field: SortField\)/);
});
