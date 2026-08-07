import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../pages/leaderboard.vue", import.meta.url),
  "utf8",
);
const enLocale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

const getPath = (object, path) =>
  path.split(".").reduce((value, key) => value?.[key], object);

test("the hardcoded 'Current' option is removed for ELO, All Time (non-ELO) is untouched", () => {
  assert.doesNotMatch(source, /time_periods\.current/);
  // scope="0" is hidden entirely for ELO — it's no longer a valid ELO view.
  assert.match(
    source,
    /<SelectItem v-if="category !== 'elo'" value="0">\{\{\s*\$t\("pages\.leaderboard\.time_periods\.all_time"\)\s*\}\}<\/SelectItem>/,
  );
  const zeroScopeItems = [
    ...source.matchAll(/<SelectItem v-if="category !== 'elo'" value="0">/g),
  ];
  assert.equal(
    zeroScopeItems.length,
    2,
    "expected desktop + mobile scope=0 items, both hidden for elo",
  );
});

test("Peak is renamed to All Time for ELO, without changing its query/behavior", () => {
  assert.doesNotMatch(source, /time_periods\.peak/);
  const peakItems = [
    ...source.matchAll(
      /<SelectItem v-if="category === 'elo'" value="peak">\s*\{\{\s*\$t\("pages\.leaderboard\.time_periods\.all_time"\)\s*\}\}\s*<\/SelectItem>/g,
    ),
  ];
  assert.equal(peakItems.length, 2, "expected desktop + mobile peak items");
  // The underlying eloView/isPeakElo wiring (query behavior) is untouched.
  assert.match(
    source,
    /const eloView = computed<"current" \| "peak">\(\(\) =>\s*category\.value === "elo" && scope\.value === "peak" \? "peak" : "current",\s*\);/,
  );
  assert.match(
    source,
    /const isPeakElo = computed\(\s*\(\) => category\.value === "elo" && eloView\.value === "peak",\s*\);/,
  );
});

test("'All Time' is available as a translation and reused for both scope=0 (non-ELO) and scope=peak (ELO)", () => {
  assert.ok(getPath(enLocale, "pages.leaderboard.time_periods.all_time"));
  assert.equal(
    (source.match(/pages\.leaderboard\.time_periods\.all_time/g) || [])
      .length,
    // scopeLabel: unresolved-season fallback, "0" entry, "peak" entry,
    // final ?? fallback; desktop scope=0 item, desktop peak item; mobile
    // scope=0 item, mobile peak item.
    8,
  );
});

test("the active season is auto-selected by default, for every category including ELO, falling back to All Time (peak for ELO)", () => {
  assert.doesNotMatch(
    source,
    /category\.value !== "elo" && seasonsEnabled\.value && activeSeason\.value/,
  );
  assert.match(
    source,
    /const defaultScope = computed\(\(\) => \{\s*if \(seasonsEnabled\.value && activeSeason\.value\) \{\s*return `season:\$\{activeSeason\.value\.id\}`;\s*\}\s*return category\.value === "elo" \? "peak" : "0";\s*\}\);/,
  );
});

test("legacy/URL requests for the removed ELO 'Current' scope (period=0) redirect to All Time instead of being honored", () => {
  // Initial ref computation.
  assert.match(
    source,
    /category\.value === "elo" && requestedScope === "0"\s*\?\s*""/,
  );
  // Switching onto the ELO tab while scope is still "0".
  assert.match(
    source,
    /if \(category\.value === "elo" && scope\.value === "0"\) \{\s*scope\.value = "peak";\s*return;\s*\}/,
  );
  // Browser back/forward or a hand-typed ?period=0 while on ELO.
  assert.match(
    source,
    /category\.value === "elo" && routePeriod === "0" \? "peak" : routePeriod/,
  );
});

test("a deliberate user/URL scope selection is not overwritten on mount", () => {
  assert.match(
    source,
    /if \(scope\.value\) \{\s*\/\/ Scope came from the URL[\s\S]*?fetchLeaderboard\(\);\s*\} else \{\s*\/\/[\s\S]*?scope\.value = defaultScope\.value;\s*\}/,
  );
});

test("the active named season queries its real season UUID, never season_id = null", () => {
  // No hack that overrides the season id sent to the backend when the
  // active season is selected — derivedSeasonId (the real UUID) is used
  // directly and unconditionally.
  assert.doesNotMatch(source, /queriedSeasonId/);
  assert.equal(
    (source.match(/season_id: derivedSeasonId\.value,/g) || []).length,
    2,
    "queryVariables + alignPageToHighlightedPlayer both send the real season id",
  );
  assert.match(source, /const isActiveSeasonSelected = computed\(/);
  assert.match(source, /const isCompletedSeasonSelected = computed\(/);
});

test("All Time (peak) and an active named season can never collapse onto the same dataset", () => {
  // All Time only ever sends season_id via derivedSeasonId, which is null
  // for scope "peak" (it doesn't start with "season:"), while any selected
  // season — active or completed — always sends its own real, distinct
  // UUID. There is no code path that forces an active season's query back
  // to null.
  assert.doesNotMatch(source, /isActiveSeasonSelected\.value \? null/);
});

test("completed seasons show a Final ELO value column; active seasons keep the plain ELO label", () => {
  assert.match(
    source,
    /category\.value === "elo" && isCompletedSeasonSelected\.value\s*\?\s*t\("pages\.leaderboard\.col\.final_elo"\)/,
  );
  assert.equal(
    getPath(enLocale, "pages.leaderboard.col.final_elo"),
    "Final ELO",
  );
  assert.equal(
    getPath(enLocale, "pages.leaderboard.col.elo_change"),
    "ELO Change",
  );
});

test("an active named season shows the secondary column labeled 'Last Match', backed by the real backend field", () => {
  assert.match(
    source,
    /secondary_value:\s*category\.value === "elo" && isPeakElo\.value\s*\?\s*t\("pages\.leaderboard\.col\.current_elo"\)\s*:\s*category\.value === "elo" && isActiveSeasonSelected\.value\s*\?\s*t\("pages\.leaderboard\.col\.last_match"\)\s*:\s*cols\.secondary_value\s*\?\s*t\(cols\.secondary_value\)\s*:\s*null,/,
  );
  assert.equal(getPath(enLocale, "pages.leaderboard.col.last_match"), "Last Match");
  // No second/new query is introduced to fetch it — it rides the existing
  // secondary_value field already returned by the current leaderboard query.
  assert.equal(
    (source.match(/query GetLeaderboard/g) || []).length,
    1,
    "only one leaderboard query definition exists",
  );
});

test("the Last Match header/tooltip uses a dedicated glossary entry, distinct from the generic ELO Change tooltip", () => {
  assert.match(
    source,
    /const columnGlossary = computed<Partial<Record<SortField, string>>>\(\(\) => \{\s*const base = config\.value\.glossary \?\? \{\};\s*if \(category\.value === "elo" && isActiveSeasonSelected\.value\) \{\s*return \{ \.\.\.base, secondary_value: "last_match" \};\s*\}/,
  );
  assert.equal(
    getPath(enLocale, "stat_glossary.last_match.description"),
    "ELO gained or lost in the player's latest eligible match within this season.",
  );
});

test("All Time (Peak) shows Current ELO and Record Win Streak, backed by the real backend fields, instead of hiding the columns", () => {
  assert.match(
    source,
    /secondary_value:\s*category\.value === "elo" && isPeakElo\.value\s*\?\s*t\("pages\.leaderboard\.col\.current_elo"\)/,
  );
  assert.match(
    source,
    /tertiary_value:\s*category\.value === "elo" && isPeakElo\.value\s*\?\s*t\("pages\.leaderboard\.col\.record_win_streak"\)\s*:\s*cols\.tertiary_value\s*\?\s*t\(cols\.tertiary_value\)\s*:\s*null,/,
  );
  assert.equal(
    getPath(enLocale, "pages.leaderboard.col.current_elo"),
    "Current ELO",
  );
  assert.equal(
    getPath(enLocale, "pages.leaderboard.col.record_win_streak"),
    "Record Win Streak",
  );
  // No second/new query is introduced to fetch either -- both ride the
  // existing secondary_value/tertiary_value fields already returned by the
  // current leaderboard query.
  assert.equal(
    (source.match(/query GetLeaderboard/g) || []).length,
    1,
    "only one leaderboard query definition exists",
  );
});

test("All Time's Current ELO and Record Win Streak use dedicated glossary tooltips, distinct from the generic ELO Change/Win Streak ones", () => {
  assert.match(
    source,
    /if \(category\.value === "elo" && isPeakElo\.value\) \{\s*return \{\s*\.\.\.base,\s*secondary_value: "current_elo",\s*tertiary_value: "record_win_streak",\s*\};\s*\}/,
  );
  assert.equal(
    getPath(enLocale, "stat_glossary.current_elo.description"),
    "The player's rating in whichever named season is active right now.",
  );
  assert.equal(
    getPath(enLocale, "stat_glossary.record_win_streak.description"),
    "The longest run of consecutive match wins in the player's history for this mode.",
  );
  // The tertiary header didn't previously render a StatLabel/tooltip at
  // all -- it now does, wired the same way as the value/secondary headers.
  assert.match(
    source,
    /<StatLabel\s*\n\s*v-if="columnGlossary\.tertiary_value"\s*\n\s*:stat="columnGlossary\.tertiary_value"\s*\n\s*:label="columnLabels\.tertiary_value \?\? ''"\s*\n\s*header\s*\n\s*\/>/,
  );
});

test("Current ELO uses plain unsigned ELO formatting (not a +/- delta) and stays uncolored, unlike ELO Change/Last Match", () => {
  assert.match(
    source,
    /if \(category\.value === "elo" && isPeakElo\.value\) \{\s*return Math\.round\(value\)\.toLocaleString\(\);\s*\}/,
  );
  // secondaryValueClass's green/red/neutral coloring only ever checks
  // scope "7"/"30" and isActiveSeasonSelected -- isPeakElo is deliberately
  // absent, so Current ELO always falls through to the neutral class.
  assert.doesNotMatch(
    source,
    /usesEloChangeColor[\s\S]{0,200}isPeakElo/,
  );
});

test("Record Win Streak renders as a plain neutral integer via the existing generic tertiary formatter", () => {
  assert.match(
    source,
    /function formatTertiary\(value: number \| null\): string \{\s*if \(value == null\) return "—";\s*return Math\.round\(value\)\.toLocaleString\(\);\s*\}/,
  );
});

test("All Time still sends elo_view = peak through the unchanged query variables", () => {
  assert.equal(
    (source.match(/elo_view: eloView\.value,/g) || []).length,
    2,
    "queryVariables + alignPageToHighlightedPlayer both send eloView",
  );
});

test("ELO Change/Last Match coloring covers the rolling 7/30-day windows and the active season alike, unchanged for everything else", () => {
  assert.match(
    source,
    /const usesEloChangeColor =\s*category\.value === "elo" &&\s*\(scope\.value === "7" \|\|\s*scope\.value === "30" \|\|\s*isActiveSeasonSelected\.value\);/,
  );
  assert.match(source, /if \(rounded > 0\) return "text-success";/);
  assert.match(source, /if \(rounded < 0\) return "text-destructive";/);
  assert.match(source, /return "text-muted-foreground";/);
});

test("Competitive / Wingman / Duel mode selector is untouched", () => {
  assert.match(
    source,
    /const MATCH_TYPE_OPTIONS = \["all", "Competitive", "Wingman", "Duel"\] as const;/,
  );
  assert.equal((source.match(/match_types\.competitive/g) || []).length, 2);
  assert.equal((source.match(/match_types\.wingman/g) || []).length, 2);
  assert.equal((source.match(/match_types\.duel/g) || []).length, 2);
});

test("the old Exclude Tournaments toggle has been fully removed from the web leaderboard UI", () => {
  assert.doesNotMatch(source, /function toggleExcludeTournaments\(/);
  assert.doesNotMatch(source, /excludeTournaments/);
  assert.doesNotMatch(source, /pages\.leaderboard\.exclude_tournaments/);
  assert.doesNotMatch(source, /v-model="excludeTournaments"/);
  assert.doesNotMatch(source, /<Trophy\b/);
  assert.doesNotMatch(source, /from "~\/components\/ui\/switch"/);
  // exclude_tournaments is still sent to the backend (compatibility with
  // the existing, still-accepted parameter) but always as the neutral
  // default, never as a user-controlled value.
  assert.equal(
    (source.match(/exclude_tournaments: false,/g) || []).length,
    2,
    "queryVariables + alignPageToHighlightedPlayer both send the neutral default",
  );
});

test("Source (Overall/Matchmaking/Tournament/League) replaces Exclude Tournaments, defaults to Overall, and appears after Mode on desktop and mobile", () => {
  assert.match(
    source,
    /const SOURCE_OPTIONS = \[\s*"overall",\s*"matchmaking",\s*"tournament",\s*"league",\s*\] as const;/,
  );
  assert.match(
    source,
    /const source = ref<string>\(\s*readQueryParam\("source", SOURCE_OPTIONS, "overall"\),\s*\);/,
  );
  // Desktop: the Source Select sits between the Mode Select and the
  // (optional) Role Select in source order.
  const modeIdx = source.indexOf('<Select v-model="matchType">');
  const sourceIdxDesktop = source.indexOf('<Select v-model="source">');
  const roleIdx = source.indexOf('<Select v-if="supportsRole" v-model="roleFilter">');
  assert.ok(modeIdx > -1 && sourceIdxDesktop > -1 && roleIdx > -1);
  assert.ok(modeIdx < sourceIdxDesktop && sourceIdxDesktop < roleIdx);
  // Both desktop and mobile Source selects render all four options.
  assert.equal(
    (source.match(/pages\.leaderboard\.sources\.\$\{opt\}/g) || []).length,
    2,
  );
  assert.equal(
    (source.match(/v-for="opt of SOURCE_OPTIONS"/g) || []).length,
    2,
  );
  // Mobile filter badge/chip use Source instead of Exclude Tournaments.
  assert.match(source, /if \(source\.value !== "overall"\) n\+\+;/);
  assert.match(source, /v-if="source !== 'overall'"/);
  // source is threaded through both places that talk to the backend, plus
  // the URL query-sync watcher (mirroring how matchType does it).
  assert.equal((source.match(/source: source\.value,/g) || []).length, 3);
});

test("Source translations exist for all four options, following the match_types convention", () => {
  assert.equal(getPath(enLocale, "pages.leaderboard.sources.overall"), "Overall");
  assert.equal(
    getPath(enLocale, "pages.leaderboard.sources.matchmaking"),
    "Matchmaking",
  );
  assert.equal(
    getPath(enLocale, "pages.leaderboard.sources.tournament"),
    "Tournament",
  );
  assert.equal(getPath(enLocale, "pages.leaderboard.sources.league"), "League");
});

test("Source selection never changes how the ELO value column is computed/labeled -- the canonical rating stays the single source of truth on the web side too", () => {
  // formatValue/eloValueColor/columnLabels.value only ever branch on
  // category/isPeakElo/isCompletedSeasonSelected -- never on source.value.
  assert.doesNotMatch(source, /formatValue[\s\S]{0,400}source\.value/);
  assert.doesNotMatch(
    source,
    /value:\s*isPeakElo\.value[\s\S]{0,200}source\.value/,
  );
});

test("category tabs, sorting, highlighting, and PageTransition wiring are untouched", () => {
  assert.match(source, /<PageTransition>/);
  assert.match(source, /function toggleSort\(field: SortField\)/);
  assert.match(source, /leaderboard-row--highlight/);
  assert.match(source, /leaderboard-row--me/);
});
