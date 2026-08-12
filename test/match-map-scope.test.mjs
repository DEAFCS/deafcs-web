import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import cleanMapName from "../utilities/cleanMapName.ts";
import {
  formatClutchRoundLabel,
  isStatsEligibleMatchMap,
  nextSelectedStatsMapId,
  statsEligibleMatchMaps,
  validSelectedStatsMapId,
} from "../utilities/matchMapScope.ts";

const map = (id, status, extra = {}) => ({ id, status, ...extra });

test("BO1 has one eligible map, so the selector remains hidden", () => {
  const eligible = statsEligibleMatchMaps([map("m1", "Finished")]);
  assert.deepEqual(eligible.map((m) => m.id), ["m1"]);
  assert.equal(eligible.length > 1, false);
});

test("finished BO3 2-0 preserves order and excludes its scheduled third map", () => {
  const eligible = statsEligibleMatchMaps([
    map("inferno", "Finished"),
    map("mini-dust-2", "Finished"),
    map("unused", "Scheduled"),
  ]);
  assert.deepEqual(eligible.map((m) => m.id), ["inferno", "mini-dust-2"]);
});

test("finished BO3 2-1 includes all three played maps", () => {
  const eligible = statsEligibleMatchMaps([
    map("m1", "Finished"),
    map("m2", "Finished"),
    map("m3", "Surrendered"),
  ]);
  assert.deepEqual(eligible.map((m) => m.id), ["m1", "m2", "m3"]);
});

test("BO5 scopes preserve partial and full played-map order", () => {
  const maps = [
    map("m1", "Finished"),
    map("m2", "Finished"),
    map("m3", "Live"),
    map("m4", "Scheduled"),
    map("m5", null),
  ];
  assert.deepEqual(
    statsEligibleMatchMaps(maps).map((matchMap) => matchMap.id),
    ["m1", "m2", "m3"],
  );

  maps[2].status = "Finished";
  maps[3].status = "Finished";
  maps[4].status = "Surrendered";
  assert.deepEqual(
    statsEligibleMatchMaps(maps).map((matchMap) => matchMap.id),
    ["m1", "m2", "m3", "m4", "m5"],
  );
});

test("played/in-progress statuses are eligible while pre-play statuses are not", () => {
  for (const status of [
    "Live",
    "Overtime",
    "Paused",
    "WaitingForTV",
    "UploadingDemo",
    "Finished",
    "Surrendered",
  ]) {
    assert.equal(isStatsEligibleMatchMap(map(status, status)), true, status);
  }
  for (const status of ["Warmup", "Knife", "Scheduled"]) {
    assert.equal(isStatsEligibleMatchMap(map(status, status)), false, status);
  }
});

test("authoritative pre-play statuses reject misleading historical evidence", () => {
  const misleadingEvidence = [
    { lineup_1_score: 4 },
    { winning_lineup_id: "lineup-1" },
    { rounds: [{ round: 1 }] },
    {
      lineup_2_score: 3,
      winning_lineup_id: "lineup-2",
      rounds: [{ round: 1 }],
    },
  ];

  for (const status of ["Scheduled", "Warmup", "Knife"]) {
    for (const evidence of misleadingEvidence) {
      assert.equal(
        isStatsEligibleMatchMap(map(`${status}-placeholder`, status, evidence)),
        false,
        `${status} must override ${JSON.stringify(evidence)}`,
      );
    }
  }
});

test("historical play evidence recovers incomplete and canceled map rows", () => {
  assert.equal(
    isStatsEligibleMatchMap(map("winner", null, { winning_lineup_id: "l1" })),
    true,
  );
  assert.equal(
    isStatsEligibleMatchMap(map("score", "Canceled", { lineup_2_score: 8 })),
    true,
  );
  assert.equal(
    isStatsEligibleMatchMap(map("rounds", null, { rounds: [{ round: 1 }] })),
    true,
  );
  assert.equal(isStatsEligibleMatchMap(map("canceled", "Canceled")), false);
});

test("historical round evidence requires a finite positive round number", () => {
  assert.equal(
    isStatsEligibleMatchMap(map("null-zero", null, { rounds: [{ round: 0 }] })),
    false,
  );
  assert.equal(
    isStatsEligibleMatchMap(
      map("canceled-zero", "Canceled", { rounds: [{ round: 0 }] }),
    ),
    false,
  );
  assert.equal(
    isStatsEligibleMatchMap(map("null-one", null, { rounds: [{ round: 1 }] })),
    true,
  );
  assert.equal(
    isStatsEligibleMatchMap(
      map("canceled-one", "Canceled", { rounds: [{ round: "1" }] }),
    ),
    true,
  );
  assert.equal(
    isStatsEligibleMatchMap(
      map("mixed", null, { rounds: [{ round: 0 }, { round: "2" }] }),
    ),
    true,
  );

  for (const round of [null, undefined, "", "not-a-round", NaN, Infinity, -1]) {
    assert.equal(
      isStatsEligibleMatchMap(
        map(`invalid-${String(round)}`, null, { rounds: [{ round }] }),
      ),
      false,
      `${String(round)} must not count as round evidence`,
    );
  }
});

test("map labels prefer readable labels, including Workshop maps, then clean internal names", () => {
  const workshopMap = {
    label: "Mini Dust2",
    name: "workshop/3070923343",
  };
  assert.equal(
    workshopMap.label || cleanMapName(workshopMap.name),
    "Mini Dust2",
  );
  assert.equal(cleanMapName("de_ancient"), "Ancient");
  assert.equal("" || cleanMapName("de_nuke"), "Nuke");
});

test(
  "Overall clutch labels distinguish duplicate rounds with readable map names",
  () => {
    const inferno = formatClutchRoundLabel(2, "Inferno", null);
    const miniDust2 = formatClutchRoundLabel(2, "Mini Dust2", null);

    assert.equal(inferno, "R2 · Inferno");
    assert.equal(miniDust2, "R2 · Mini Dust2");
    assert.notEqual(inferno, miniDust2);
  },
);

test(
  "map-scoped clutch labels stay compact and missing metadata falls back to the round",
  () => {
    assert.equal(formatClutchRoundLabel(7, "Inferno", "inferno"), "R7");
    assert.equal(formatClutchRoundLabel(7, "", null), "R7");
  },
);

test("selection starts Overall, toggles the active map, and switches directly", () => {
  let selected = null;
  selected = nextSelectedStatsMapId(selected, "inferno");
  assert.equal(selected, "inferno");
  selected = nextSelectedStatsMapId(selected, "mini-dust-2");
  assert.equal(selected, "mini-dust-2");
  selected = nextSelectedStatsMapId(selected, "mini-dust-2");
  assert.equal(selected, null);
});

test("an invalid selected map resets safely to Overall", () => {
  assert.equal(validSelectedStatsMapId("inferno", ["inferno", "nuke"]), "inferno");
  assert.equal(validSelectedStatsMapId("unused", ["inferno", "nuke"]), null);
  assert.equal(validSelectedStatsMapId(null, ["inferno"]), null);
});

const matchDetail = await readFile(
  new URL("../pages/matches/[id]/index.vue", import.meta.url),
  "utf8",
);
const matchTabs = await readFile(
  new URL("../components/match/MatchTabs.vue", import.meta.url),
  "utf8",
);
const economy = await readFile(
  new URL("../components/match/MatchEconomyTimeline.vue", import.meta.url),
  "utf8",
);
const mapAnalysis = await readFile(
  new URL("../components/match/MatchMapAnalysis.vue", import.meta.url),
  "utf8",
);
const mapLabelSource = await readFile(
  new URL("../utilities/mapLabel.ts", import.meta.url),
  "utf8",
);
const headToHead = await readFile(
  new URL("../components/match/HeadToHead.vue", import.meta.url),
  "utf8",
);
const lineupClutches = await readFile(
  new URL("../components/match/LineupClutches.vue", import.meta.url),
  "utf8",
);
const clutchTeamPanel = await readFile(
  new URL("../components/match/ClutchTeamPanel.vue", import.meta.url),
  "utf8",
);

test("the shared mapLabel helper is label-first before clean-name fallback", () => {
  assert.match(mapLabelSource, /return map\?\.label \|\| cleanMapName\(map\?\.name \?\? ""\)/);
});

test("clutch round labels derive readable map identity from each row in Overall", () => {
  assert.match(lineupClutches, /mapLabel\(matchMap\.map\)/);
  assert.match(lineupClutches, /map_label: readableMapLabel\(c\.match_map_id\)/);
  assert.match(lineupClutches, /!\/\^workshop\[\\\\\/\]\/i\.test\(label\)/);
  assert.match(lineupClutches, /:selected-map-id="selectedMapId"/);
  assert.match(
    clutchTeamPanel,
    /formatClutchRoundLabel\(\s*clutch\.round,\s*clutch\.map_label,\s*selectedMapId,/,
  );
});

test("the match page owns one ID-based scope and tabs do not reset it", () => {
  assert.match(matchDetail, /const selectedStatsMapId = ref<string \| null>\(null\)/);
  assert.doesNotMatch(matchDetail, /activeStatsMap/);
  assert.match(matchDetail, /v-model:selected-map-id="selectedStatsMapId"/);
  assert.doesNotMatch(matchTabs, /activeTab[\s\S]{0,120}selectedStatsMapId\s*=/);
});

test("the canonical selector is hidden for BO1 and drives map-aware tabs", () => {
  assert.match(matchTabs, /v-if="statsEligibleMaps\.length > 1"/);
  assert.match(matchTabs, /:selected-map-id="activeMap\?\.id"/);
  assert.match(matchTabs, /<lineup-clutches[\s\S]*?:selected-map-id="activeMap\?\.id"/);
  assert.match(matchTabs, /<MatchRoles[\s\S]*?:selected-map-id="activeMap\?\.id"/);
});

test("map-specific sidebar hides unused slots and veto while Overall restores the complete context", () => {
  assert.match(
    matchDetail,
    /selectedStatsMapId\s*\? statsEligibleMatchMaps\(match\.match_maps\)\s*:\s*mapSlots/,
  );
  assert.match(
    matchDetail,
    /v-show="\s*!selectedStatsMapId && showVetoPicks && vetoPickCount !== 0\s*"/,
  );
});

test("Economy and Map Analysis no longer own independent map selectors", () => {
  assert.doesNotMatch(economy, /localMapId/);
  assert.doesNotMatch(economy, /function onMapSelect/);
  assert.doesNotMatch(mapAnalysis, /const selectedMapId = ref/);
  assert.doesNotMatch(mapAnalysis, /showMapSelector/);
  assert.match(matchTabs, /v-for="matchMap in economyTimelineMaps"/);
  assert.match(matchTabs, /!selectedMapId && statsEligibleMaps\.length > 1/);
});

test("Head-to-Head remains entirely Overall-only without clearing the shared scope", () => {
  assert.match(headToHead, /v_player_match_head_to_head/);
  assert.doesNotMatch(headToHead, /selectedMapId|selected-map-id|match_map_id/);

  const h2hTab = matchTabs.slice(
    matchTabs.indexOf('<TabsContent value="head-to-head">'),
    matchTabs.indexOf('<TabsContent value="roles">'),
  );
  assert.match(h2hTab, /<HeadToHead\s+[\s\S]*?:match="match"/);
  assert.match(h2hTab, /<LineupRadarComparison[\s\S]*?:match="match"/);
  assert.match(h2hTab, /:lineup="overallLineup1"/);
  assert.match(h2hTab, /:combine-with="overallLineup2"/);
  assert.match(h2hTab, /:selected-map-id="null"/);
  assert.match(h2hTab, /match\.head_to_head_overall_only/);
  assert.doesNotMatch(h2hTab, /update:selectedMapId|activeMap\?\.id|mapScopedMatch/);

  const rolesTab = matchTabs.slice(
    matchTabs.indexOf('<TabsContent value="roles">'),
    matchTabs.indexOf('<TabsContent value="map-analysis">'),
  );
  assert.match(rolesTab, /:selected-map-id="activeMap\?\.id"/);
});

test("map-stat loading has one ID watcher and generation-guards stale responses", () => {
  assert.match(matchTabs, /activeMapId:\s*\{\s*immediate: true,/);
  assert.doesNotMatch(matchTabs, /"activeMap\.id"\(\)/);
  assert.doesNotMatch(matchTabs, /watch:\s*\{\s*activeMap:/);
  assert.match(
    matchTabs,
    /const requestGeneration = \+\+this\.mapStatsRequestGeneration;\s*this\.mapStats = null;/,
  );
  assert.match(
    matchTabs,
    /requestGeneration !== this\.mapStatsRequestGeneration \|\|\s*this\.activeMapId !== requestedMapId/,
  );
  assert.match(
    matchTabs,
    /if \(requestGeneration === this\.mapStatsRequestGeneration\) \{\s*this\.mapStatsLoading = false;/,
  );
});

test("Map Analysis invalidates old loads and resets map-specific state on scope changes", () => {
  assert.match(
    mapAnalysis,
    /\(\) => activeMatchMap\.value\?\.id \?\? null,[\s\S]*?loadGen \+= 1;[\s\S]*?selectedRound\.value = null;[\s\S]*?positions\.value = \[\];[\s\S]*?roundTicks\.value = \[\];[\s\S]*?grenades\.value = \[\];[\s\S]*?loadedDemoMapId\.value = null;/,
  );
  assert.match(mapAnalysis, /if \(gen !== loadGen\) \{\s*return;/);
  assert.match(mapAnalysis, /const seq: \(number \| null\)\[\] = \[null, \.\.\.rounds\]/);
  assert.doesNotMatch(
    mapAnalysis,
    /\[\(\) => activeMatchMap\.value\?\.id, mode, showTrajectories\]/,
  );
  assert.match(
    mapAnalysis,
    /onUnmounted\(\(\) => \{\s*loadGen \+= 1;\s*window\.removeEventListener\("keydown", onKeyDown\);\s*\}\);/,
  );
});
