import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tournament Stats tab (V1) + Standings Prize column. Source-inspection
// style, matching this repo's existing convention for Vue SFCs that aren't
// otherwise unit-testable (see tournament-schedule-lock.test.mjs,
// tournament-rules-page.test.mjs) -- there is no @vue/test-utils mounting
// harness in this project, so these assertions pin the actual template/script
// text rather than mounted DOM output.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const statsSource = await read("../components/tournament/TournamentStats.vue");
const standingsSource = await read("../components/tournament/StageStandings.vue");
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const resultsSource = await read("../components/tournament/TournamentResults.vue");
const stageSource = await read("../components/tournament/TournamentStage.vue");
const rewardsSource = await read("../components/tournament/TournamentRewards.vue");
const prizesUtilSource = await read("../utilities/prizes.ts");
const prizesManageSource = await read("../components/tournament/TournamentPrizesManage.vue");
const createWizardSource = await read("../components/tournament/TournamentCreateWizard.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

// --- Prize mapping contract: array position, not the `place` label --------
//
// Traced before writing prizeForPlacement(): tournament_prizes has both a
// free-text `place` column and an integer `order` column. `place` is
// explicitly documented (utilities/prizes.ts) as a cosmetic, organizer-
// editable label auto-derived from list position ("#1", "#2", ...) that can
// be overridden to anything ("Top 8", "Champion") -- it is never parsed
// anywhere to mean "the Nth finishing position." `order` is a plain sort
// index that both prize-editing surfaces (the create wizard and the manage
// screen) rewrite to the current array index on every insert/reorder/remove,
// so after `ORDER BY order ASC`, array position IS finishing position by
// construction -- the same contract TournamentRewards.vue's
// `podium = prizes.slice(0, 3)` already depends on. Conclusion: array-index
// lookup is the correct, intentional, pre-existing contract; no code change
// was needed in prizeForPlacement().

test("`place` is documented as a cosmetic label, not a parseable finishing position", () => {
  assert.match(
    prizesUtilSource,
    /Prize places are auto-numbered from list position/,
  );
  assert.match(
    prizesUtilSource,
    /Organizers can still type a custom label/,
  );
  // autoPlace derives the label FROM the index, confirming index is upstream
  // of place, never the reverse.
  assert.match(prizesUtilSource, /export function autoPlace\(index: number\): string \{\s*return `#\$\{index \+ 1\}`;/);
});

test("`order` is rewritten to the current array index on every mutation, in both prize-editing surfaces", () => {
  // Manage screen: reorder/add/remove all call persistOrder(), which sets
  // order: index for every row -- gapless and 0-based by construction.
  assert.match(
    prizesManageSource,
    /_set: \{ order: index, place: effectivePlace\(row\.place, index\) \}/,
  );
  assert.match(prizesManageSource, /order: index,/);
  // Create wizard: same convention at initial creation.
  assert.match(createWizardSource, /order: index,/);
  assert.match(createWizardSource, /place: effectivePlace\(prize\.place, index\)/);
});

test("TournamentRewards' existing podium/extras split already depends on array position, not `place`", () => {
  assert.match(rewardsSource, /const podium = computed\(\(\) => props\.prizes\.slice\(0, 3\)\);/);
  assert.match(rewardsSource, /const extras = computed\(\(\) => props\.prizes\.slice\(3\)\);/);
  // `place` IS rendered (as a display label alongside the amount/rank), but
  // only ever read off the row already selected by position -- never used
  // to decide WHICH row is 1st/2nd/3rd. `podium.value[index]`/`.slice()` are
  // the only things that determine placement membership here.
  assert.match(rewardsSource, /entry\.prize\?\.place \|\| `#\$\{entry\.index \+ 1\}`/);
});

test("prizeForPlacement follows the same position-based contract, unchanged from the original implementation", () => {
  assert.match(standingsSource, /const index = Number\(placement\) - 1;/);
  assert.match(standingsSource, /const row = \(this\.prizes as any\[\]\)\[index\];/);
});

// --- Stats tab visibility --------------------------------------------------

test("statsTabVisible reuses the exact same gate as Standings (Live | Paused | Finished)", () => {
  assert.match(
    detailSource,
    /statsTabVisible\(\)\s*\{\s*return this\.standingsTabVisible;\s*\}/,
  );
  // Pin the shared gate itself so a change to Standings' definition is
  // guaranteed to also move Stats, rather than each drifting independently.
  const block = detailSource.slice(
    detailSource.indexOf("standingsTabVisible() {"),
    detailSource.indexOf("standingsTabVisible() {") + 260,
  );
  assert.match(block, /e_tournament_status_enum\.Live/);
  assert.match(block, /e_tournament_status_enum\.Paused/);
  assert.match(block, /e_tournament_status_enum\.Finished/);
});

test("the Stats tab trigger and content are both gated on statsTabVisible", () => {
  assert.match(detailSource, /v-if="statsTabVisible"\s*\n\s*value="stats"/);
  assert.match(
    detailSource,
    /<TabsContent v-if="statsTabVisible" value="stats">/,
  );
});

test("pre-Live statuses (Setup/RegistrationOpen/RegistrationClosed) are excluded, same as Standings", () => {
  // standingsTabVisible (and therefore statsTabVisible) only lists three
  // statuses; anything else -- Setup, RegistrationOpen, RegistrationClosed --
  // is excluded by omission from that whitelist.
  const block = detailSource.slice(
    detailSource.indexOf("standingsTabVisible() {"),
    detailSource.indexOf("standingsTabVisible() {") + 260,
  );
  assert.doesNotMatch(block, /RegistrationOpen|RegistrationClosed|Setup/);
});

test("TournamentStats is wired into the tab list and content area", () => {
  assert.match(statsSource, /^/); // sanity: file loaded
  assert.match(
    detailSource,
    /import TournamentStats from "~\/components\/tournament\/TournamentStats\.vue"/,
  );
  assert.match(
    detailSource,
    /<TournamentStats\s+:tournament="tournament"\s+:active="activeTab === 'stats'"\s*\/>/,
  );
  assert.match(detailSource, /tabs\.push\("stats"\)/);
});

// --- Empty state -------------------------------------------------------

test("zero rows renders the clean 'No stats yet' empty state, not an empty table", () => {
  assert.match(statsSource, /v-if="!loading && rows\.length === 0"/);
  assert.match(statsSource, /tournament\.stats_section\.no_data/);
  assert.equal(enLocale.tournament.stats_section.no_data, "No stats yet");
});

// --- Default ranking / columns ----------------------------------------

test("default sort is Rating, descending", () => {
  assert.match(statsSource, /sortKey: "rating" as SortKey/);
  assert.match(statsSource, /sortDesc: true/);
});

test("main table renders exactly the V1 column set: #, Player, Team, Rating, K-D, K/D, ADR, HS%, Matches", () => {
  const headerBlock = statsSource.slice(
    statsSource.indexOf("<TableHeader>"),
    statsSource.indexOf("</TableHeader>"),
  );
  assert.match(headerBlock, />#<\/TableHead>/);
  assert.match(headerBlock, /\$t\("common\.player"\)/);
  assert.match(headerBlock, /\$t\("team\.table\.team"\)/);
  assert.match(headerBlock, /stat="rating" label="Rating"/);
  assert.match(headerBlock, />K-D<\/TableHead>/);
  assert.match(headerBlock, /stat="kd" label="K\/D"/);
  assert.match(headerBlock, /stat="adr" label="ADR"/);
  assert.match(headerBlock, /stat="hs" label="HS%"/);
  assert.match(headerBlock, /tournament\.results_table\.matches/);
  // Raw Kills/Deaths/Assists are deliberately NOT separate main columns.
  assert.doesNotMatch(headerBlock, />K<\/TableHead>/);
  assert.doesNotMatch(headerBlock, />A<\/TableHead>/);
});

test("expanded row exposes raw K/D/A", () => {
  const expandBlock = statsSource.slice(
    statsSource.indexOf("isExpanded(row.player_steam_id)\" class=\"hover:bg-transparent\">"),
  );
  assert.match(expandBlock, /StatLabel stat="k" label="K" \/>: \{\{ row\.kills \}\}/);
  assert.match(expandBlock, /StatLabel stat="d" label="D" \/>: \{\{ row\.deaths \}\}/);
  assert.match(expandBlock, /StatLabel stat="a" label="A" \/>: \{\{ row\.assists \}\}/);
});

// --- Team linking --------------------------------------------------------

test("a row without a real team_id (Solo Random / ad-hoc team) never renders a /teams link", () => {
  const cellBlock = statsSource.slice(
    statsSource.indexOf("<TableCell>\n                  <NuxtLink"),
    statsSource.indexOf("<TableCell>\n                  <NuxtLink") + 500,
  );
  assert.match(cellBlock, /v-if="row\.team_id"/);
  assert.match(cellBlock, /:to="`\/teams\/\$\{row\.team_id\}`"/);
  // The non-linked fallback branch renders plain text, never a NuxtLink.
  assert.match(cellBlock, /<span v-else class="font-medium">\{\{ row\.team_name \|\| "—" \}\}<\/span>/);
});

// --- Polling / "live" behavior --------------------------------------------

test("V1 live behavior is a simple ~20s poll, not a subscription or a bespoke real-time system", () => {
  assert.match(statsSource, /const POLL_INTERVAL_MS = 20000;/);
  assert.match(statsSource, /pollInterval: POLL_INTERVAL_MS/);
  assert.doesNotMatch(statsSource, /\$subscribe/);
  assert.doesNotMatch(statsSource, /WebSocket|EventSource/);
});

test("the query is scoped by tournament id and skipped when inactive/absent", () => {
  assert.match(statsSource, /get_tournament_leaderboard\(args: \{ _tournament_id: \$tournamentId \}\)/);
  assert.match(statsSource, /return !self\.active \|\| !self\.tournament\?\.id;/);
});

// --- Standings Prize column ------------------------------------------------

test("Prize column exists on StageStandings, gated by an explicit opt-in prop", () => {
  assert.match(standingsSource, /showPrizeColumn:\s*\{\s*type: Boolean,\s*default: false,\s*\}/);
  assert.match(standingsSource, /v-if="showPrizeColumn" class="text-center">\s*\{\{ \$t\("tournament\.results_table\.prize"\) \}\}/);
});

test("only the top-level Standings tab (TournamentResults) turns the Prize column on", () => {
  assert.match(
    resultsSource,
    /:prizes="tournament\.prizes \|\| \[\]"\s*\n\s*:show-prize-column="true"/,
  );
});

test("the Overview-embedded group standings (TournamentStage.vue) does not pass prize props", () => {
  const callSite = stageSource.slice(
    stageSource.indexOf("<StageStandings"),
    stageSource.indexOf("/>", stageSource.indexOf("<StageStandings")) + 2,
  );
  assert.doesNotMatch(callSite, /prizes=/);
  assert.doesNotMatch(callSite, /show-prize-column/);
});

test("Live and Paused never resolve a prize -- isFinished is checked before any placement math", () => {
  const method = standingsSource.slice(
    standingsSource.indexOf("prizeForPlacement(placement: number): string | null {"),
  );
  const body = method.slice(0, method.indexOf("},"));
  const firstStatement = body
    .split("{")[1]
    .split(";")[0]
    .trim();
  assert.match(firstStatement, /if \(!this\.isFinished\) return null/);
  assert.match(
    standingsSource,
    /isFinished\(\): boolean \{\s*return \(\s*\(this\.tournament as any\)\?\.status ===\s*e_tournament_status_enum\.Finished\s*\);\s*\}/,
  );
});

test("missing/out-of-range prize falls back to the neutral dash, never blank or an error", () => {
  assert.match(
    standingsSource,
    /\{\{ prizeForPlacement\(entry\.placement\) \|\| "—" \}\}/,
  );
  // The method itself also degrades to null (not throwing) for an
  // out-of-range or non-finite placement.
  const method = standingsSource.slice(
    standingsSource.indexOf("prizeForPlacement(placement: number): string | null {"),
    standingsSource.indexOf("prizeForPlacement(placement: number): string | null {") + 400,
  );
  assert.match(method, /if \(!Number\.isFinite\(index\) \|\| index < 0\) return null;/);
  assert.match(method, /return row\?\.prize \?\? null;/);
});

test("tied teams share `placement` (not the unique `rank`), so they resolve the same prize", () => {
  assert.match(
    standingsSource,
    /prizeForPlacement\(entry\.placement\)/,
  );
  assert.doesNotMatch(
    standingsSource,
    /prizeForPlacement\(entry\.rank\)/,
  );
  // placement is populated on every entry alongside rank (both derived from
  // the same row), which is what lets two tied entries carry an identical
  // placement value into prizeForPlacement.
  assert.match(standingsSource, /rank: Number\(row\.rank\) \|\| 0,\s*\n\s*placement: Number\(row\.placement\) \|\| 0,/);
});

test("prize lookup is position-based (prizes[placement-1]), not a parse of the free-text `place` label", () => {
  const method = standingsSource.slice(
    standingsSource.indexOf("prizeForPlacement(placement: number): string | null {"),
    standingsSource.indexOf("prizeForPlacement(placement: number): string | null {") + 400,
  );
  assert.match(method, /const index = Number\(placement\) - 1;/);
  assert.match(method, /const row = \(this\.prizes as any\[\]\)\[index\];/);
  assert.doesNotMatch(method, /\.place\b/);
});

test("existing expandable roster/player stats markup is unchanged", () => {
  assert.match(standingsSource, /StatLabel stat="k" label="K"/);
  assert.match(standingsSource, /StatLabel stat="d" label="D"/);
  assert.match(standingsSource, /StatLabel stat="a" label="A"/);
  assert.match(standingsSource, /StatLabel stat="kd" label="K\/D"/);
  assert.match(standingsSource, /StatLabel stat="hs" label="HS%"/);
  assert.match(standingsSource, /StatLabel stat="mp" label="MP"/);
  assert.match(standingsSource, /tournament\.standings_section\.no_roster/);
});

// --- Regression: Overview bracket / TournamentRewards untouched -----------

test("TournamentStage.vue's bracket rendering is untouched by this feature", () => {
  // BracketPair (the actual Overview bracket) still renders unconditionally
  // in the single-division branch, with no new props/conditions layered on.
  assert.match(stageSource, /<BracketPair/);
  assert.doesNotMatch(stageSource, /prizeForPlacement|showPrizeColumn|TournamentStats/);
});

test("TournamentRewards.vue was not touched by this feature", () => {
  assert.doesNotMatch(rewardsSource, /prizeForPlacement|showPrizeColumn|get_tournament_leaderboard|TournamentStats/);
});

test("no live-placement/ranking logic was added anywhere in this feature's files", () => {
  for (const [name, source] of [
    ["TournamentStats.vue", statsSource],
    ["StageStandings.vue", standingsSource],
  ]) {
    assert.doesNotMatch(
      source,
      /ORDER BY|RANK\(\)|ROW_NUMBER\(\)/,
      `${name} should not contain SQL/ranking logic`,
    );
  }
});

test("no em dashes in newly added user-facing copy", () => {
  assert.doesNotMatch(JSON.stringify(enLocale.tournament.stats_tab), /—/);
  assert.doesNotMatch(JSON.stringify(enLocale.tournament.stats_section), /—/);
  assert.doesNotMatch(JSON.stringify(enLocale.tournament.results_table), /—/);
});
