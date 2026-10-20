import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  HS_MIN_KILLS,
  RATE_MIN_MATCHES,
  RATE_MIN_ROUNDS,
  RECORD_ORDER,
  SINGLE_MATCH_MIN_ROUNDS,
  weeklyRecords,
} from "../components/home/dashboard/weeklyRecords.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const homeIndex = await read("../pages/index.vue");
const dashboard = await read("../components/home/dashboard/HomeDashboard.vue");
const hero = await read("../components/home/dashboard/HomeDashboardHero.vue");
const streamers = await read("../components/home/dashboard/HomeLiveStreamers.vue");
const samples = await read("../components/home/dashboard/homePreviewSamples.ts");

// --- weekly records -------------------------------------------------------

function rows(steamId, matches, { rounds = 24, adr = 80, rating = 1, kills = 18, hs = 9, deaths = 15 } = {}) {
  const ratings = [];
  const stats = [];
  for (let i = 0; i < matches; i++) {
    const match_id = `${steamId}-m${i}`;
    ratings.push({ steam_id: steamId, match_id, adr, hltv_rating: rating, rounds_played: rounds });
    stats.push({ steam_id: steamId, match_id, kills, hs_kills: hs, deaths });
  }
  return { ratings, stats };
}

function merge(...parts) {
  return {
    ratings: parts.flatMap((p) => p.ratings),
    stats: parts.flatMap((p) => p.stats),
  };
}

const record = (records, key) => records.find((r) => r.key === key);

test("rate records ignore players below the match and round minimums", () => {
  const lucky = rows("1", RATE_MIN_MATCHES - 1, { adr: 200, rating: 2.5 });
  const regular = rows("2", RATE_MIN_MATCHES, { adr: 90, rating: 1.2 });
  const { ratings, stats } = merge(lucky, regular);
  const records = weeklyRecords(ratings, stats, {});

  assert.equal(record(records, "adr").entries[0].steamId, "2");
  assert.equal(record(records, "rating").entries[0].steamId, "2");
  assert.ok(!record(records, "adr").entries.some((e) => e.steamId === "1"));
  // Count records still include everyone.
  assert.ok(record(records, "kills").entries.some((e) => e.steamId === "1"));
});

test("rate records also need the minimum rounds", () => {
  const shortMatches = rows("1", RATE_MIN_MATCHES, { rounds: Math.floor((RATE_MIN_ROUNDS - 1) / RATE_MIN_MATCHES), adr: 150 });
  const records = weeklyRecords(shortMatches.ratings, shortMatches.stats, {});
  assert.equal(record(records, "adr"), undefined);
});

test("ADR and rating are averaged by rounds played, not by match", () => {
  const p = rows("1", 2, { rounds: 30, adr: 100, rating: 1.5 });
  const q = rows("1", 1, { rounds: 10, adr: 40, rating: 0.5 });
  q.ratings[0].match_id = q.stats[0].match_id = "1-extra";
  const { ratings, stats } = merge(p, q);
  const records = weeklyRecords(ratings, stats, {});
  // (100*60 + 40*10) / 70 = 91.4
  assert.equal(record(records, "adr").entries[0].display, "91.4");
  // (1.5*60 + 0.5*10) / 70 = 1.357
  assert.equal(record(records, "rating").entries[0].display, "1.36");
});

test("headshot % needs the kill minimum too", () => {
  const few = rows("1", RATE_MIN_MATCHES, { kills: Math.floor((HS_MIN_KILLS - 1) / RATE_MIN_MATCHES), hs: 9 });
  const enough = rows("2", RATE_MIN_MATCHES, { kills: 20, hs: 10 });
  const { ratings, stats } = merge(few, enough);
  const entries = record(weeklyRecords(ratings, stats, {}), "hs").entries;
  assert.deepEqual(entries.map((e) => e.steamId), ["2"]);
  assert.equal(entries[0].display, "50%");
});

test("most kills in one match skips overtime matches", () => {
  const overtime = rows("1", 1, { rounds: 30, kills: 40 });
  const regulation = rows("2", 1, { rounds: 24, kills: 30 });
  const { ratings, stats } = merge(overtime, regulation);
  const entries = record(weeklyRecords(ratings, stats, { "1-m0": 12, "2-m0": 12 }), "match_kills").entries;
  assert.equal(entries[0].steamId, "2");
  assert.equal(entries[0].matchId, "2-m0");
  assert.ok(!entries.some((e) => e.matchId === "1-m0"));
});

test("a short-handed player in an overtime match does not count as regulation", () => {
  // Player 2 joined late: 20 rounds, but the match itself went to 30.
  const full = rows("1", 1, { rounds: 30, kills: 20 });
  const late = { ratings: [{ ...full.ratings[0], steam_id: "2", rounds_played: 20 }], stats: [{ ...full.stats[0], steam_id: "2", kills: 25 }] };
  const { ratings, stats } = merge(full, late);
  const result = record(weeklyRecords(ratings, stats, { "1-m0": 12 }), "match_kills");
  assert.equal(result, undefined);
});

test("records keep the top five and drop empty records", () => {
  const players = ["1", "2", "3", "4", "5", "6"].map((id, i) => rows(id, 1, { kills: 10 + i }));
  const { ratings, stats } = merge(...players);
  const records = weeklyRecords(ratings, stats, {});
  assert.deepEqual(record(records, "kills").entries.map((e) => e.steamId), ["6", "5", "4", "3", "2"]);
  assert.deepEqual(record(records, "kills").entries.map((e) => e.place), [1, 2, 3, 4, 5]);
  assert.equal(record(records, "kills").entries[0].detail, "1 match");
  const many = rows("9", 5);
  const manyRecords = weeklyRecords(many.ratings, many.stats, {});
  assert.equal(record(manyRecords, "kills").entries[0].detail, "5 matches");
  assert.equal(record(manyRecords, "matches").entries[0].detail, "120 rounds");
  assert.equal(weeklyRecords([], [], {}).length, 0);
});

test("tied values share a place (competition ranking), order stays deterministic", () => {
  const players = ["3", "1", "2", "4"].map((id) => rows(id, 1, { kills: id === "4" ? 5 : 20 }));
  const { ratings, stats } = merge(...players);
  const entries = record(weeklyRecords(ratings, stats, {}), "kills").entries;
  assert.deepEqual(entries.map((e) => [e.steamId, e.place]), [["1", 1], ["2", 1], ["3", 1], ["4", 4]]);
});

test("lowest DPR is total deaths / total rounds, with the rate minimums", () => {
  // 15 deaths in 24 rounds (0.625/round), then 0 deaths in 10 rounds: the
  // true weekly DPR is 30/58 = 0.52, not the average of match DPRs.
  const a = rows("1", 2, { rounds: 24, deaths: 15 });
  const b = rows("1", 1, { rounds: 10, deaths: 0 });
  b.ratings[0].match_id = b.stats[0].match_id = "1-extra";
  const worse = rows("2", 3, { rounds: 24, deaths: 20 });
  const short = rows("3", RATE_MIN_MATCHES - 1, { deaths: 1 });
  const { ratings, stats } = merge(a, b, worse, short);
  const entries = record(weeklyRecords(ratings, stats, {}), "dpr").entries;
  assert.deepEqual(entries.map((e) => e.steamId), ["1", "2"]);
  assert.equal(entries[0].display, "0.52");
});

test("single-match records need the minimum rounds and link the match", () => {
  const short = rows("1", 1, { rounds: SINGLE_MATCH_MIN_ROUNDS - 1, rating: 3, adr: 200, kills: 15 });
  const full = rows("2", 1, { rounds: 20, rating: 1.4, adr: 95, kills: 22 });
  const { ratings, stats } = merge(short, full);
  const records = weeklyRecords(ratings, stats, {});
  for (const key of ["match_rating", "match_adr", "match_kills"]) {
    const entries = record(records, key).entries;
    assert.deepEqual(entries.map((e) => e.steamId), ["2"], key);
    assert.equal(entries[0].matchId, "2-m0", key);
  }
  assert.equal(record(records, "match_rating").entries[0].display, "1.40");
  assert.equal(record(records, "match_adr").entries[0].display, "95.0");
});

test("clutches and opening kills only appear when their data loaded", () => {
  const p = merge(rows("1", 2), rows("2", 2));
  const without = weeklyRecords(p.ratings, p.stats, {});
  assert.equal(record(without, "clutches"), undefined);
  assert.equal(record(without, "opening_kills"), undefined);

  const withEvents = weeklyRecords(p.ratings, p.stats, {}, {
    clutches: [
      { match_id: "1-m0", clutcher_steam_id: "1" },
      { match_id: "1-m1", clutcher_steam_id: "1" },
      { match_id: "2-m0", clutcher_steam_id: "2" },
    ],
    openings: [
      { match_id: "1-m0", steam_id: "2", wins: 4 },
      { match_id: "1-m0", steam_id: "2", wins: 3 },
      { match_id: "1-m0", steam_id: "1", wins: 5 },
    ],
  });
  assert.deepEqual(record(withEvents, "clutches").entries.map((e) => [e.steamId, e.value]), [["1", 2], ["2", 1]]);
  assert.deepEqual(record(withEvents, "opening_kills").entries.map((e) => [e.steamId, e.value]), [["2", 7], ["1", 5]]);
  // Categories come in the agreed order.
  assert.deepEqual(withEvents.map((r) => r.key), RECORD_ORDER.filter((k) => withEvents.some((r) => r.key === k)));
});

test("every record has a footer line, so the card height never changes", () => {
  const p = merge(rows("1", 3), rows("2", 3));
  const records = weeklyRecords(p.ratings, p.stats, {}, {
    clutches: [{ match_id: "1-m0", clutcher_steam_id: "1" }],
    openings: [{ match_id: "1-m0", steam_id: "1", wins: 2 }],
  });
  assert.equal(records.length, RECORD_ORDER.length);
  for (const r of records) assert.ok(typeof r.rule === "string" && r.rule.length > 0, r.key);
});

test("Last 7 Days keeps a fixed footer and four runner-up rows, without an out-in gap", async () => {
  const card = await read("../components/home/dashboard/HomeWeeklyRecords.vue");
  const template = card.slice(card.indexOf("<template>"));
  assert.doesNotMatch(template, /mode="out-in"/);
  assert.match(template, /leave-active-class="[^"]*absolute/);
  assert.match(template, /data-testid="home-week-rule"/);
  assert.doesNotMatch(template, /v-if="current\.rule"/);
  assert.match(template, /v-for="pad in Math\.max\(0, 4 - /);
});

test("Your Highlights filters on the featured player (target_steam_id), not match lineups", async () => {
  const highlights = await read("../components/watch/WatchHighlights.vue");
  assert.match(highlights, /target_steam_id: \{ _eq: String\(props\.steamId\) \}/);
  assert.doesNotMatch(highlights, /lineup_players/);
  assert.match(highlights, /path: "\/highlights", query/);
  assert.match(highlights, /player: String\(props\.steamId\)/);
});

test("no AWP or knife records", () => {
  assert.ok(!RECORD_ORDER.some((key) => /awp|knife/i.test(key)));
});

// --- page wiring ----------------------------------------------------------

test("the dashboard has a personal area, then the community area", () => {
  const template = dashboard.slice(dashboard.indexOf("<template>"));
  const personal = template.indexOf('data-testid="home-area-personal"');
  const divider = template.indexOf('data-testid="home-area-divider"');
  const community = template.indexOf('data-testid="home-area-community"');
  assert.ok(personal >= 0 && personal < divider && divider < community);
  assert.ok(template.indexOf("<HomeRecentMatches") < divider);
  assert.ok(template.indexOf("<HomeLiveStreamers") > community);
  assert.match(template, /<WatchHighlights[\s\S]*:steam-id="viewer\.steamId"/);
  assert.match(template, /<HomeTopPlayersPreview variant="glass" :viewer-steam-id="viewer\.steamId" \/>/);
});

test("the signed-in branch renders the dashboard; the logged-out page is untouched", () => {
  assert.match(homeIndex, /<HomeDashboard v-else-if="showLoggedInHome" :viewer="homeViewer" \/>/);
  assert.match(homeIndex, /<main v-else/);
  assert.match(homeIndex, /Welcome to DEAFCS/);
  assert.match(homeIndex, /Sign in with Steam/);
  assert.match(homeIndex, /samples: import\.meta\.dev && route\.query\.samples === "1"/);
});

test("dashboard sections appear in the agreed order", () => {
  const order = [
    // Your DEAFCS
    "HomeDashboardHero",
    "HomeScheduledMatches",
    "HomeYourTournament",
    "HomeRecentMatches",
    "WatchHighlights",
    // DEAFCS Community
    "HomeLiveStreamers",
    "HomePlayerOfMonth",
    "HomeWeeklyRecords",
    'HomeTopPlayersPreview variant="glass"',
    "HomeNewsFeed",
  ];
  const template = dashboard.slice(dashboard.indexOf("<template>"));
  const positions = order.map((name) => template.indexOf(`<${name}`));
  assert.ok(positions.every((p) => p >= 0), `missing: ${order.filter((_, i) => positions[i] < 0)}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("hero stats are real counts, and the hero art is a pre-sized WebP", () => {
  assert.match(hero, /"\/api\/players-search"/);
  assert.match(hero, /matches_aggregate/);
  assert.match(hero, /status: \{ _eq: "Finished" \}, source: \{ _eq: "5stack" \}/);
  assert.match(hero, /matchmakingStore\.onlinePlayerSteamIds\.length/);
  assert.match(hero, /deafcs-banner-1400\.webp 1400w/);
  assert.doesNotMatch(hero, /deafcs-banner\.png|NuxtImg/);
});

test("live streamers never embed or autoplay Twitch", () => {
  const template = streamers.slice(streamers.indexOf("<template>"));
  assert.doesNotMatch(template, /<iframe|<video|player\.twitch\.tv|autoplay|jtvnw/);
  assert.match(streamers, /fetchLiveStreamers/);
  assert.match(streamers, /v-if="streamers\.length"/);
});

test("preview samples are dev-only and always labelled", async () => {
  assert.match(samples, /LOCAL PREVIEW ONLY/);
  for (const file of [
    "HomeScheduledMatches.vue",
    "HomeYourTournament.vue",
    "HomeLiveStreamers.vue",
    "HomePlayerOfMonth.vue",
  ]) {
    const source = await read(`../components/home/dashboard/${file}`);
    assert.match(source, /import\.meta\.dev/, file);
    assert.match(source, /:sample="sample"/, file);
    assert.match(source, /await import\(\s*"~\/components\/home\/dashboard\/homePreviewSamples"/, file);
  }
});
