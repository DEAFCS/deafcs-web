import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// /teams follows current 5Stack's directory (TeamsDirectory + rows). The
// original intent of this file still holds: the AVG ELO shown for a team comes
// from the API's teams.ranks.avg_elo (v_team_ranks), never recomputed from the
// raw roster[].player.elo values, which can fall back to a lifetime ELO outside
// the active season.

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const pageSource = await read("pages/teams/index.vue");
const directory = await read("components/teams/TeamsDirectory.vue");
const row = await read("components/teams/TeamsDirectoryRow.vue");

test("the /teams page composes the current 5Stack sections", () => {
  for (const component of [
    "TeamsYourTeams",
    "TeamsPlayingNow",
    "TeamsLookingForScrims",
    "TeamsDirectory",
  ]) {
    assert.match(pageSource, new RegExp(`<${component}\\b`));
  }
  // The old table page is gone, and so is its TacticalPageHeader banner.
  assert.doesNotMatch(pageSource, /TeamsTable|TacticalPageHeader/);
  assert.match(pageSource, /<h1 class="sr-only">\{\{ \$t\("pages\.teams\.title"\) \}\}<\/h1>/);
});

test("the directory query requests ranks.avg_elo and sorts by it", () => {
  assert.match(directory, /ranks:\s*\{\s*avg_elo:\s*true\s*\}/);
  assert.match(directory, /rating:\s*\[\{\s*ranks:\s*\{\s*avg_elo:\s*"desc_nulls_last"/);
});

test("the row reads team.ranks.avg_elo directly, never the raw roster ELO", () => {
  assert.match(row, /props\.team\.ranks\?\.avg_elo/);
  assert.doesNotMatch(row, /player\?\.elo\?\.competitive/);
  assert.doesNotMatch(row, /values\.reduce\(/);
});

test("search, My Teams, tournament winners, scrims and pagination are wired", () => {
  assert.match(directory, /const search = ref\(""\)/);
  assert.match(directory, /const mine = ref\(false\)/);
  assert.match(directory, /const winnersOnly = ref\(false\)/);
  assert.match(directory, /const scrimsOnly = ref\(false\)/);
  assert.match(directory, /teams_aggregate/);
  assert.match(directory, /<Pagination/);
});

test("DEAFCS drops what its API does not serve yet", async () => {
  // Guarded by an introspection check (the sort falls back to rating).
  assert.match(directory, /schemaHasField\(client, "teams", "last_match_at"\)/);
  // Neither exists in the DEAFCS schema (checked against the live API).
  for (const file of [
    "components/teams/TeamsLookingForScrims.vue",
    "components/teams/TeamsDirectory.vue",
    "composables/useLiveTeamMatches.ts",
    "pages/teams/[id].vue",
  ]) {
    const source = await read(file);
    assert.doesNotMatch(source, /avg_rush_elo/, `${file} must not select avg_rush_elo`);
    assert.doesNotMatch(source, /is_league: true/, `${file} must not select tournaments.is_league`);
  }
});

test("team rows navigate client-side to the team page route", () => {
  assert.match(row, /<NuxtLink\s+:to="\{ name: 'teams-id', params: \{ id: team\.id \} \}"/);
  for (const source of [pageSource, directory, row]) {
    assert.doesNotMatch(source, /window\.location|location\.href/);
  }
});
