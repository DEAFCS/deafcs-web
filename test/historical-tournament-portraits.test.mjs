import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const utility = await read("utilities/teamRosterOverride.ts");

test("locked tournament resolution excludes both current roster tiers", () => {
  const start = utility.indexOf("export function resolveTournamentPlayerAvatarUrl");
  const locked = utility.slice(
    utility.indexOf("if (isTournamentRosterLocked", start),
    utility.indexOf("const teamRosterEntry", start),
  );
  assert.match(locked, /roster_image_url_snapshot/);
  assert.match(locked, /custom_avatar_url/);
  assert.match(locked, /avatar_url/);
  assert.doesNotMatch(locked, /teamRosterEntry|player\?\.roster_image_url/);
});

test("match queries preserve snapshots through shell, all-map, map, and compact flows", async () => {
  for (const path of [
    "graphql/matchLineupsGraphql.ts",
    "graphql/matchAllMapsStatsGraphql.ts",
    "graphql/matchMapStatsGraphql.ts",
    "graphql/simpleMatchFields.ts",
    "graphql/matchLineupStats.ts",
  ]) {
    const source = await read(path);
    assert.match(
      source,
      /rosterImageSnapshotField/,
      `${path} must select the persisted lineup snapshot`,
    );
  }

  const matchPage = await read("pages/matches/[id]/index.vue");
  const simpleMatch = await read("graphql/simpleMatchFields.ts");
  assert.match(
    matchPage,
    /tournament_brackets:[\s\S]*?tournament:[\s\S]*?status: true/,
  );
  assert.match(
    simpleMatch,
    /tournament_brackets:[\s\S]*?tournament:[\s\S]*?status: true/,
  );
});

test("every match portrait surface uses the historical-aware shared flow", async () => {
  const sharedOverride = [
    "components/match/PlayerStatusDisplay.vue",
    "components/match/HeadToHeadMatrix.vue",
    "components/match/LineupRadarComparison.vue",
    "components/match/MatchRoles.vue",
    "components/match/LineupOpeningDuelRow.vue",
    "components/match/MatchOverviewDrawer.vue",
    "components/MatchTableRow.vue",
  ];
  for (const path of sharedOverride) {
    const source = await read(path);
    assert.match(source, /buildMatchLineupAvatarOverride/);
    assert.match(source, /matchAllowsRosterImage/);
  }

  for (const path of [
    "components/match/HeadToHeadMatrix.vue",
    "components/match/ClutchTeamPanel.vue",
    "components/match/LineupOverviewRow.vue",
  ]) {
    assert.match(await read(path), /resolveMatchPlayerAvatarUrl/);
  }
});

test("locked tournament coach uses identity fallback and has no coach snapshot field", async () => {
  const matchInfo = await read("components/match/MatchInfo.vue");
  assert.match(
    matchInfo,
    /buildMatchLineupAvatarOverride\(match, lineup\)/,
  );
  assert.match(matchInfo, /:allow-roster-image="allowRosterImage"/);
  assert.doesNotMatch(matchInfo, /coach[^\n]*roster_image_url_snapshot/);
});

test("standings, podium, MVP, and locked roster rows use tournament snapshots", async () => {
  for (const path of [
    "components/tournament/StageStandings.vue",
    "components/tournament/TournamentResults.vue",
    "components/tournament/TournamentTeamMemberRow.vue",
  ]) {
    const source = await read(path);
    assert.match(source, /resolveTournamentPlayerAvatarUrl/);
    assert.match(source, /tournamentAllowsCurrentRosterImage/);
    assert.match(source, /:allow-roster-image="allowRosterImage"/);
  }

  assert.match(await read("graphql/tournamentTeamFields.ts"), /rosterImageSnapshotField/);
  assert.match(await read("components/tournament/TournamentDetail.vue"), /rosterImageSnapshotField/);
  assert.match(await read("components/tournament/TournamentResults.vue"), /rosterImageSnapshotField/);
});

test("generic PlayerDisplay override and unrelated identity consumers stay unchanged", async () => {
  const display = await read("components/PlayerDisplay.vue");
  const body = display.match(/playerAvatarSrc\(\)\s*\{([\s\S]*?)\n {4}\},/)[1];
  assert.ok(body.indexOf("this.avatarOverride") < body.indexOf("this.allowRosterImage"));
  assert.match(await read("components/chat/ChatMessage.vue"), /:avatar-override="liveAvatarUrl"/);
  assert.match(await read("components/tournament/TournamentOrganizerRow.vue"), /PlayerDisplay/);
});

console.log("historical tournament portrait wiring checks passed");
