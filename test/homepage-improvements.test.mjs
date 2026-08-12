import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getMatchSource, matchSourceIcon } from "../utilities/matchSource.ts";

const topPlayers = await readFile(
  new URL("../components/home/HomeTopPlayersPreview.vue", import.meta.url),
  "utf8",
);
const liveMatches = await readFile(
  new URL("../components/home/HomeLiveMatchesPreview.vue", import.meta.url),
  "utf8",
);
const latestResults = await readFile(
  new URL("../components/home/HomeLatestResultsPreview.vue", import.meta.url),
  "utf8",
);
const latestNews = await readFile(
  new URL("../components/home/HomeLatestNewsPreview.vue", import.meta.url),
  "utf8",
);
const playerOverview = await readFile(
  new URL("../components/home/HomePlayerOverview.vue", import.meta.url),
  "utf8",
);
const tacticalClasses = await readFile(
  new URL("../utilities/tacticalClasses.ts", import.meta.url),
  "utf8",
);
const homeIndex = await readFile(
  new URL("../pages/index.vue", import.meta.url),
  "utf8",
);
const mapDisplay = await readFile(
  new URL("../components/MapDisplay.vue", import.meta.url),
  "utf8",
);
// Read as source rather than imported directly: matchMapNames.ts uses the
// repo's normal extensionless relative import for cleanMapName, which plain
// `node --test` (no bundler) can't resolve on its own -- source inspection
// avoids requiring production code to add a .ts extension just for tests.
const matchMapNames = await readFile(
  new URL("../utilities/matchMapNames.ts", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// utilities/matchSource.ts -- the single shared Tournament/League/
// Matchmaking/Draft classifier both homepage cards use, so there is only one
// place this logic can drift.
// ---------------------------------------------------------------------------

test("getMatchSource classifies via existing relations only, no name/id guessing", () => {
  assert.equal(getMatchSource(null), "matchmaking");
  assert.equal(getMatchSource({}), "matchmaking");

  assert.equal(
    getMatchSource({ is_tournament_match: true, tournament_brackets: [] }),
    "tournament",
  );
  assert.equal(
    getMatchSource({
      tournament_brackets: [{ stage: { tournament: { league_season_division: null } } }],
    }),
    "tournament",
  );
  assert.equal(
    getMatchSource({
      is_tournament_match: true,
      tournament_brackets: [
        { stage: { tournament: { league_season_division: { id: "abc" } } } },
      ],
    }),
    "league",
  );
  assert.equal(
    getMatchSource({ draft_games: [{ id: "d1" }] }),
    "draft",
  );
  // Bracket-linked always wins over draft_games -- a match cannot be both.
  assert.equal(
    getMatchSource({
      is_tournament_match: true,
      tournament_brackets: [{ stage: { tournament: { league_season_division: null } } }],
      draft_games: [{ id: "d1" }],
    }),
    "tournament",
  );
});

test("matchSourceIcon returns an icon for tournament/league only -- no fake fallback glyph for matchmaking/draft", () => {
  assert.ok(matchSourceIcon("tournament"));
  assert.ok(matchSourceIcon("league"));
  assert.equal(matchSourceIcon("matchmaking"), null);
  assert.equal(matchSourceIcon("draft"), null);
  // Tournament and League must not resolve to the same icon component.
  assert.notEqual(matchSourceIcon("tournament"), matchSourceIcon("league"));
});

// ---------------------------------------------------------------------------
// Homepage Top-5 leaderboards -- active season + canonical avatar
// ---------------------------------------------------------------------------

test("HomeTopPlayersPreview resolves the active season the same way pages/leaderboard.vue does, instead of a hardcoded season_id: null", () => {
  assert.doesNotMatch(topPlayers, /season_id:\s*null,/);
  assert.match(topPlayers, /function resolveActiveSeasonId/);
  assert.match(
    topPlayers,
    /new Date\(s\.starts_at\)\.getTime\(\) <= now &&\s*\n\s*\(!s\.ends_at \|\| new Date\(s\.ends_at\)\.getTime\(\) > now\)/,
  );
  assert.match(topPlayers, /useApplicationSettingsStore\(\)\.seasonsEnabled/);
  assert.match(topPlayers, /season_id:\s*seasonId,/);
});

test("HomeTopPlayersPreview queries and forwards player_custom_avatar_url, matching PlayerDisplay's custom-avatar-first resolution", () => {
  // Query selects the field on all three mode aliases (competitive/wingman/duel).
  assert.equal(
    (topPlayers.match(/player_custom_avatar_url/g) || []).length >= 5,
    true,
    "expected player_custom_avatar_url in all 3 query blocks + interface + template binding",
  );
  assert.match(topPlayers, /player_custom_avatar_url:\s*string \| null;/);
  assert.match(
    topPlayers,
    /custom_avatar_url:\s*player\.player_custom_avatar_url,/,
  );
  // No second avatar resolver invented -- PlayerDisplay stays the only place
  // that decides custom-vs-Steam avatar precedence.
  assert.doesNotMatch(topPlayers, /custom_avatar_url \|\| .*avatar_url/);
});

test("Top-5 does not add a Source filter -- ELO's value column ignores Source in the backend, so exposing one would be a no-op control", () => {
  assert.doesNotMatch(topPlayers, /\$source/);
  assert.doesNotMatch(topPlayers, /_source:\s*\$source/);
});

test("both Top-5 variants describe the active leaderboard as Current Season without hardcoding a season number", () => {
  assert.match(topPlayers, /\{\{ selectedMode \}\} · Current Season/);
  assert.match(topPlayers, /Top 5 · Current Season/);
  assert.doesNotMatch(topPlayers, /· Current\s*\n/);
  assert.doesNotMatch(topPlayers, /Season 1/);
});

test("Top-5 mode card titles (Competitive/Wingman/Duel) and the logged-out 'Top Players' title use the shared muted heading class, not text-foreground; the mode-colored Medal icon is untouched", () => {
  assert.match(
    topPlayers,
    /import \{ tacticalCardHeadingClasses \} from "~\/utilities\/tacticalClasses";/,
  );
  // Both the tabs-variant "Top Players" title and the all-variant per-mode
  // ({{ mode.value }}) title use the shared class.
  assert.equal(
    (topPlayers.match(/<h3 :class="tacticalCardHeadingClasses">/g) || [])
      .length,
    2,
  );
  assert.doesNotMatch(
    topPlayers,
    /font-mono text-xs font-bold uppercase tracking-\[0\.16em\] text-foreground/,
  );
  // The Medal icon still carries the per-mode color in the all-variant, and
  // stays plain amber in the tabs-variant header -- neither was touched.
  assert.match(topPlayers, /<Medal\s*\n\s*class="h-4 w-4 shrink-0"\s*\n\s*:style="\{ color: mode\.color \}"/);
  assert.match(topPlayers, /<Medal\s*\n\s*class="h-4 w-4 shrink-0 text-\[hsl\(var\(--tac-amber\)\)\]"/);
});

// ---------------------------------------------------------------------------
// Homepage Live Matches -- Watch/Play match-card pattern, not a bespoke one
// ---------------------------------------------------------------------------

test("HomeLiveMatchesPreview uses the shared MatchTypeBadge and the same BO pill markup as MatchTableRow/HomeLatestResultsPreview, not plain text", () => {
  assert.match(liveMatches, /import MatchTypeBadge from "~\/components\/MatchTypeBadge\.vue";/);
  assert.match(liveMatches, /<MatchTypeBadge[\s\S]*:type="match\.options\.type"[\s\S]*size="default"/);
  assert.match(liveMatches, /BO\{\{ match\.options\.best_of \}\}/);
  assert.match(
    liveMatches,
    /border border-border\/70 bg-muted\/35 px-2\.5 py-1 font-mono text-\[0\.62rem\] font-bold uppercase leading-none tracking-\[0\.14em\] text-foreground/,
    "BO pill classes should match MatchTableRow's matchTypePillClasses exactly",
  );
  // LIVE badge comes before the mode badge, mode badge before BO, all in one row.
  const live = liveMatches.indexOf("text-red-400");
  const modeBadge = liveMatches.indexOf("<MatchTypeBadge");
  const boBadge = liveMatches.indexOf(':class="boBadgeClasses"');
  assert.ok(live > -1 && modeBadge > live && boBadge > modeBadge);
});

test("HomeLiveMatchesPreview's match card uses the same border/radius/hover treatment as HomeLatestResultsPreview.vue, not a flat/transparent panel", () => {
  // bg-muted/30 is now just the pre-image-load base color (the map/overlay
  // layer fully covers it once loaded) -- hover:bg-muted/20 was dropped from
  // both cards since it would be invisible under the opaque overlay.
  assert.match(
    liveMatches,
    /relative block min-w-0 overflow-hidden rounded-lg border border-border bg-muted\/30 outline-none transition-colors hover:border-primary\/30 hover:shadow-lg hover:shadow-primary\/10/,
  );
  assert.match(
    latestResults,
    /relative block min-w-0 overflow-hidden rounded-lg border border-border bg-muted\/30 outline-none transition-colors hover:border-primary\/30 hover:shadow-lg hover:shadow-primary\/10/,
  );
  assert.doesNotMatch(liveMatches, /bg-background\/25/);
  assert.doesNotMatch(liveMatches, /rounded-md border border-border\/60/);
});

// ---------------------------------------------------------------------------
// Map-image backgrounds -- reusing MapDisplay.vue + maps.poster, mirroring
// SimpleMatchDisplay.vue's side-by-side concept, without touching
// MapDisplay.vue or copying its hover-reveal behavior.
// ---------------------------------------------------------------------------

test("MapDisplay.vue's core rendering is unchanged by this or the prior homepage pass -- only a later, separate task adds an opt-in loading prop (see test/watch-map-background.test.mjs)", () => {
  // These are the exact markers from the pre-existing component; if any of
  // these stop matching, MapDisplay.vue's core behavior was edited.
  assert.match(mapDisplay, /:src="map\.poster"/);
  assert.match(mapDisplay, /bg-black bg-opacity-45/);
  assert.match(mapDisplay, /min-w-\[150px\]/);
  assert.match(
    mapDisplay,
    /props: \{\s*\n\s*map: \{\s*\n\s*type: Object,\s*\n\s*required: true,\s*\n\s*\},\s*\n\s*darken: \{\s*\n\s*type: Boolean,\s*\n\s*default: false,\s*\n\s*\},\s*\n\s*patch: \{\s*\n\s*type: Boolean,\s*\n\s*default: true,\s*\n\s*\},/,
  );
});

test("both cards query maps.poster (and not patch, which is unused since :patch=\"false\")", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(source, /map: \{\s*\n\s*name: true,\s*\n\s*label: true,\s*\n\s*poster: true,\s*\n\s*\},/);
    assert.match(source, /poster: string \| null;/);
    assert.doesNotMatch(source, /patch: true/);
  }
});

test("both cards render MapDisplay side by side for known maps, sized locally (flex-1 min-w-0) rather than editing MapDisplay.vue's own min-w-[150px]", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(
      source,
      /import MapDisplay from "~\/components\/MapDisplay\.vue";/,
    );
    assert.match(
      source,
      /<MapDisplay\s*\n\s*v-for="matchMap in match\.match_maps"\s*\n\s*:key="matchMap\.id"\s*\n\s*:map="matchMap\.map"\s*\n\s*:patch="false"\s*\n\s*class="min-w-0 flex-1 rounded-none"/,
    );
  }
});

test("both cards fall back to the existing default.webp screenshot when zero maps are known, with alt=\"\" since it's decorative", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(
      source,
      /<NuxtImg\s*\n\s*v-else\s*\n\s*src="\/img\/maps\/screenshots\/default\.webp"/,
    );
    assert.match(source, /alt=""/);
  }
});

test("the map background is full-bleed, decorative (aria-hidden), and behind the foreground content (absolute vs. relative z-10)", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(source, /<div class="absolute inset-0 flex" aria-hidden="true">/);
    assert.match(source, /<div class="relative z-10 p-3">/);
  }
});

test("the overlay is permanently dark -- no Play-card hover-reveal (hover:bg-opacity, opacity fade, or bg-opacity-10) anywhere in either homepage card", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(source, /<div class="absolute inset-0 bg-black\/60"><\/div>/);
    assert.doesNotMatch(source, /hover:bg-opacity/);
    assert.doesNotMatch(source, /bg-opacity-10/);
    assert.doesNotMatch(source, /hover:opacity/);
  }
});

test("live match backgrounds render whichever maps are currently known (no invented placeholders) -- driven directly by match.match_maps, same array the foreground already uses", () => {
  // The background v-for iterates match.match_maps as-is; there is no
  // padding/filling logic to reach a fixed BO count.
  assert.doesNotMatch(liveMatches, /Array\.from\(\{\s*length:/);
  assert.doesNotMatch(liveMatches, /\.fill\(/);
});

test("HomeLiveMatchesPreview no longer combines mode+map as plain text", () => {
  assert.doesNotMatch(liveMatches, /function matchContext\(/);
  assert.doesNotMatch(liveMatches, /\[match\.options\?\.type, mapName\]\.filter\(Boolean\)\.join/);
});

// ---------------------------------------------------------------------------
// Map-text fix -- Live Matches must show ALL known maps (not just the
// current one), joined the same way as /watch's MatchTableRow.vue and
// HomeLatestResultsPreview.vue, via one shared helper.
// ---------------------------------------------------------------------------

test("utilities/matchMapNames.ts: joinedMapNames maps every known map through cleanMapName, joins with ' · ', and invents nothing for unknown maps", () => {
  // cleanMapName is reused unchanged (not reimplemented) -- same helper
  // MatchTableRow.vue uses on /watch.
  assert.match(matchMapNames, /import cleanMapName from "\.\/cleanMapName";/);
  assert.match(
    matchMapNames,
    /cleanMapName\(matchMap\.map\?\.label \|\| matchMap\.map\?\.name \|\| ""\)/,
  );
  // Every entry is mapped (not just the first/current one) -- guards against
  // reverting to the single-current-map bug this helper was created to fix.
  assert.match(matchMapNames, /\.map\(\(matchMap\) =>/);
  assert.doesNotMatch(matchMapNames, /\.find\(/);
  // " · " separator, matching /watch exactly.
  assert.match(matchMapNames, /\.join\(" · "\)/);
  // Falsy/empty names are dropped, not rendered as blank placeholders.
  assert.match(matchMapNames, /\.filter\(Boolean\)/);
  // null/undefined input degrades to an empty list rather than throwing or
  // inventing placeholder maps.
  assert.match(matchMapNames, /\(matchMaps \?\? \[\]\)/);
  assert.doesNotMatch(matchMapNames, /Array\.from\(\{\s*length:/);
  assert.doesNotMatch(matchMapNames, /\.fill\(/);
});

test("HomeLiveMatchesPreview and HomeLatestResultsPreview both show ALL known maps (not just the current/first one), via the same shared joinedMapNames helper", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(
      source,
      /import \{ joinedMapNames \} from "~\/utilities\/matchMapNames";/,
    );
    assert.match(source, /return joinedMapNames\(match\.match_maps\);/);
  }
  // The old single-current-map bug: mapLabelFor()/displayedMap() driving the
  // text line is gone from Live -- displayedMap still exists (it still
  // drives the live score), but no longer feeds the map-text line.
  assert.doesNotMatch(liveMatches, /function mapLabelFor/);
  assert.doesNotMatch(liveMatches, /mapLabelFor\(match\)/);
  assert.match(liveMatches, /function displayedMap\(/);
  assert.match(liveMatches, /displayedMap\(match\)\?\.lineup_1_score/);
});

test("the map-text line's source icon still comes before the map names in both cards' markup order", () => {
  for (const source of [liveMatches, latestResults]) {
    const sourceIconIdx = source.indexOf("sourceIconFor(match)");
    const mapContextIdx = source.lastIndexOf("mapContextFor(match)");
    assert.ok(sourceIconIdx > -1 && mapContextIdx > sourceIconIdx);
  }
});

test("HomeLiveMatchesPreview queries the same source relations as HomeLatestResultsPreview and renders the shared source icon (no ListChecks fallback)", () => {
  for (const source of [liveMatches, latestResults]) {
    assert.match(source, /is_tournament_match: true,/);
    assert.match(source, /tournament_brackets: \[/);
    assert.match(source, /league_season_division: \{ id: true \},/);
    assert.match(source, /draft_games: \[\{ limit: 1 \}, \{ id: true \}\],/);
    assert.match(
      source,
      /import \{ getMatchSource, matchSourceIcon \} from "~\/utilities\/matchSource";/,
    );
    assert.match(source, /matchSourceIcon\(getMatchSource\(match\)\)/);
  }
  assert.doesNotMatch(liveMatches, /ListChecks/);
  assert.doesNotMatch(latestResults, /ListChecks/);
});

// ---------------------------------------------------------------------------
// Homepage headings -- grey/muted, matching the Play/Tournaments/League
// feature card title treatment exactly (not orange).
// ---------------------------------------------------------------------------

test("tacticalCardHeadingClasses matches the feature card title treatment exactly: font-mono, 0.72rem, bold, uppercase, 0.2em tracking, muted-foreground (not amber)", () => {
  assert.match(
    tacticalClasses,
    /export const tacticalCardHeadingClasses =\s*\n\s*"font-mono text-\[0\.72rem\] font-bold uppercase tracking-\[0\.2em\] text-muted-foreground"/,
  );
  assert.doesNotMatch(tacticalClasses, /tacticalCardHeadingClasses[\s\S]{0,120}--tac-amber/);
});

test("Latest News / Live Matches / Latest Results headings reuse tacticalCardHeadingClasses instead of duplicated strings", () => {
  for (const source of [latestNews, liveMatches, latestResults]) {
    assert.match(
      source,
      /import \{ tacticalCardHeadingClasses \} from "~\/utilities\/tacticalClasses";/,
    );
    assert.match(source, /:class="tacticalCardHeadingClasses"/);
    assert.doesNotMatch(
      source,
      /font-mono text-xs font-bold uppercase tracking-\[0\.16em\] text-foreground/,
    );
  }
});

test("Top 5 Leaderboards main section header uses the shared tactical section label and amber tick instead of a Medal", () => {
  assert.match(playerOverview, /tacticalSectionLabelClasses,/);
  assert.match(playerOverview, /tacticalSectionTickClasses,/);
  const section = playerOverview.slice(
    playerOverview.indexOf('<section aria-labelledby="top-leaderboards-title">'),
    playerOverview.indexOf('<HomeTopPlayersPreview variant="all" />'),
  );
  assert.match(section, /:class="tacticalSectionLabelClasses"/);
  assert.match(section, /:class="tacticalSectionTickClasses"/);
  assert.match(section, /Top 5 Leaderboards/);
  assert.doesNotMatch(section, /<Medal/);
});

test("the feature card title itself (Play/Tournaments/League) also uses the shared tacticalCardHeadingClasses, so the two can't drift apart again", () => {
  const featureCards = playerOverview.slice(
    playerOverview.indexOf('aria-label="Main platform destinations"'),
    playerOverview.indexOf(
      "</nav>",
      playerOverview.indexOf('aria-label="Main platform destinations"'),
    ),
  );
  assert.equal(
    (featureCards.match(/tacticalCardHeadingClasses/g) || []).length,
    2,
    "expected both explicit card branches to share the heading classes",
  );
});

// ---------------------------------------------------------------------------
// Feature cards -- Play, Tournaments, League order + copy + League non-click
// ---------------------------------------------------------------------------

test("feature card order is Play, Tournaments, League", () => {
  const play = playerOverview.indexOf('label: "PLAY"');
  const tournaments = playerOverview.indexOf('label: "TOURNAMENTS"');
  const league = playerOverview.indexOf('label: "LEAGUE"');
  assert.ok(play > -1 && tournaments > play && league > tournaments);
  assert.doesNotMatch(playerOverview, /label:\s*"MATCHMAKING"/);
});

test("Play renders through the enabled NuxtLink branch, retains /play, and mentions matchmaking, rankings, draft, and schedule", () => {
  const description = playerOverview.match(
    /label: "PLAY"[\s\S]*?description:\s*\n\s*"([^"]+)"/,
  )?.[1];
  assert.ok(description, "expected to find the PLAY card's description string");
  for (const word of ["matchmaking", "rankings", "draft", "schedule"]) {
    assert.ok(
      description.toLowerCase().includes(word),
      `expected Play description to mention "${word}", got: ${description}`,
    );
  }
  assert.match(
    playerOverview,
    /label: "PLAY",\s*\n\s*to: "\/play",[\s\S]*?comingSoon: false,/,
  );
  assert.match(
    playerOverview,
    /<NuxtLink\s*\n\s*v-if="!destination\.comingSoon"\s*\n\s*:to="destination\.to"/,
  );
});

test("Tournaments renders through the enabled NuxtLink branch and retains its existing /tournaments route", () => {
  assert.match(
    playerOverview,
    /label: "TOURNAMENTS",\s*\n\s*to: "\/tournaments",[\s\S]*?comingSoon: false,/,
  );
  assert.match(
    playerOverview,
    /<NuxtLink\s*\n\s*v-if="!destination\.comingSoon"\s*\n\s*:to="destination\.to"/,
  );
});

test("League card shows Coming Q1-Q2 2027 and keeps /league as data without making it a link", () => {
  assert.match(playerOverview, /comingSoonLabel:\s*"Coming Q1–Q2 2027"/);
  assert.match(
    playerOverview,
    /label: "LEAGUE",\s*\n\s*to: "\/league",[\s\S]*?comingSoon: true,/,
  );
  assert.match(
    playerOverview,
    /<div\s*\n\s*v-else\s*\n\s*aria-disabled="true"/,
  );
});

test("League renders as the non-clickable div branch while interactive hover/focus/cursor classes stay on NuxtLink only", () => {
  const featureCards = playerOverview.slice(
    playerOverview.indexOf('aria-label="Main platform destinations"'),
    playerOverview.indexOf(
      "</nav>",
      playerOverview.indexOf('aria-label="Main platform destinations"'),
    ),
  );
  const linkOpeningTag = featureCards.match(/<NuxtLink\s+[\s\S]*?>/)?.[0];
  const leagueOpeningTag = featureCards.match(
    /<div\s*\n\s*v-else\s*\n\s*aria-disabled="true"[\s\S]*?>/,
  )?.[0];

  assert.ok(linkOpeningTag, "expected an explicit NuxtLink card branch");
  assert.ok(leagueOpeningTag, "expected an explicit disabled div card branch");
  assert.match(linkOpeningTag, /featureCardInteractiveClasses/);
  assert.doesNotMatch(leagueOpeningTag, /featureCardInteractiveClasses/);
  assert.doesNotMatch(
    leagueOpeningTag,
    /:to=|active-class|cursor-pointer|hover:|focus-visible:/,
  );
  assert.match(playerOverview, /const featureCardInteractiveClasses =\s*\n\s*"group\/feature cursor-pointer/);
});

test("comingSoon state disables only League and cannot accidentally disable Play or Tournaments", () => {
  const destinationsBlock = playerOverview.match(
    /const destinations = \[([\s\S]*?)\n\] as const;/,
  )?.[1];
  assert.ok(destinationsBlock, "expected to find the feature destinations array");
  assert.equal((destinationsBlock.match(/comingSoon: false/g) || []).length, 2);
  assert.equal((destinationsBlock.match(/comingSoon: true/g) || []).length, 1);
  assert.match(
    destinationsBlock,
    /label: "PLAY"[\s\S]*?comingSoon: false,[\s\S]*?label: "TOURNAMENTS"[\s\S]*?comingSoon: false,[\s\S]*?label: "LEAGUE"[\s\S]*?comingSoon: true,/,
  );
  assert.doesNotMatch(
    playerOverview,
    /<component\s+[\s\S]*?:is="destination\.comingSoon \? 'div' : 'NuxtLink'"/,
  );
});

test('the profile header button reads "MY STATS", not "VIEW MY PROFILE", and its destination is unchanged', () => {
  assert.doesNotMatch(playerOverview, /VIEW MY PROFILE/);
  assert.match(playerOverview, />MY STATS<\/span>/);
  assert.match(playerOverview, /:to="profilePath"/);
});

// ---------------------------------------------------------------------------
// Logged-out homepage (pages/index.vue) -- Why DEAFCS / How It Works layout
// ---------------------------------------------------------------------------

test("Why DEAFCS has 6 cards, and every card puts its icon and title on the same row (icon+title row, description underneath)", () => {
  const featuresBlock = homeIndex.match(
    /const whyDeafcsFeatures = \[([\s\S]*?)\n\];/,
  )?.[1];
  assert.ok(featuresBlock, "expected to find whyDeafcsFeatures array");
  assert.equal((featuresBlock.match(/title:/g) || []).length, 6);
  assert.match(homeIndex, /title: "Earn awards",/);
  assert.match(homeIndex, /icon: Award,/);
  assert.match(homeIndex, /^import \{\s*\n\s*Award,/m);

  // The icon+title wrapper row exists ahead of the Why DEAFCS card's <h3>,
  // and the old "icon above title" spacing (mt-4 on the title) is gone.
  const whyDeafcsSection = homeIndex.match(
    /why-deafcs-title[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(whyDeafcsSection);
  assert.match(whyDeafcsSection, /<div class="flex items-center gap-3">/);
  assert.doesNotMatch(
    whyDeafcsSection,
    /<h3 class="mt-4 font-semibold text-foreground">/,
  );
  // The 5-item centering hack (lg:col-start-2/4) is gone now that 6 items
  // divide evenly into the lg:grid-cols-6 / lg:col-span-2 grid.
  assert.doesNotMatch(whyDeafcsSection, /lg:col-start-2/);
  assert.doesNotMatch(whyDeafcsSection, /lg:col-start-4/);
});

test("How It Works keeps its 5 steps, the step-number badge position, and the odd-count centering hack, while also moving icon+title onto the same row", () => {
  const stepsBlock = homeIndex.match(
    /const howItWorksSteps = \[([\s\S]*?)\n\];/,
  )?.[1];
  assert.ok(stepsBlock);
  assert.equal((stepsBlock.match(/title:/g) || []).length, 5);

  const howItWorksSection = homeIndex.match(
    /how-it-works-title[\s\S]*?<\/section>/,
  )?.[0];
  assert.ok(howItWorksSection);
  assert.match(
    howItWorksSection,
    /String\(index \+ 1\)\.padStart\(2, "0"\)/,
    "step number progression must remain",
  );
  assert.match(howItWorksSection, /'lg:col-start-2': index === 3,/);
  assert.match(howItWorksSection, /'lg:col-start-4': index === 4,/);
  assert.match(howItWorksSection, /<div class="flex items-center gap-3">/);
  assert.doesNotMatch(
    howItWorksSection,
    /<h3 class="mt-5 font-semibold text-foreground">/,
  );
});

test("the final 'Play and climb' step mentions playing matches, climbing the leaderboard, and tournaments/leagues", () => {
  const description = homeIndex.match(
    /title: "Play and climb",\s*\n\s*description:\s*\n?\s*"([^"]+)"/,
  )?.[1];
  assert.ok(description, "expected to find the 'Play and climb' description");
  for (const phrase of ["play", "climb", "tournament", "league"]) {
    assert.ok(
      description.toLowerCase().includes(phrase),
      `expected 'Play and climb' description to mention "${phrase}", got: ${description}`,
    );
  }
});
