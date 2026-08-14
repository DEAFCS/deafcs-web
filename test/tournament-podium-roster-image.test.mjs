import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../components/tournament/TournamentResults.vue", import.meta.url),
  "utf8",
);

test("podium, hover rows, and MVP share the historical tournament resolver", () => {
  assert.match(source, /resolveTournamentPlayerAvatarUrl/);
  assert.match(source, /tournamentAllowsCurrentRosterImage/);
  assert.match(
    source,
    /tournamentPortraitFor\(p, entry\.tournamentTeam\)/,
  );
  assert.match(
    source,
    /tournamentPortraitFor\(mvp\.player, mvp\.tournament_team\)/,
  );
});

test("visible podium avatars carry tournament-team identity, not only a label", () => {
  assert.match(
    source,
    /tournamentTeam: primary\?\.tournament_team \?\? null/,
  );
  assert.match(
    source,
    /v-if="tournamentPortraitFor\(p, entry\.tournamentTeam\)"/,
  );
  assert.match(
    source,
    /:src="tournamentPortraitFor\(p, entry\.tournamentTeam\)"/,
  );
});

test("locked results disable PlayerDisplay current-roster fallback", () => {
  assert.match(source, /:allow-roster-image="allowRosterImage"/);
  assert.doesNotMatch(source, /:allow-roster-image="true"/);
  assert.match(
    source,
    /allowRosterImage\(\): boolean \{\s*return tournamentAllowsCurrentRosterImage/,
  );
});

test("award recipient tournament rosters select the persisted snapshot", () => {
  assert.match(source, /\.\.\.rosterImageSnapshotField/);
  const subscriptionStart = source.indexOf("awardOccurrences: {");
  const awardBlock = source.slice(
    subscriptionStart,
    source.indexOf("variables: function", subscriptionStart),
  );
  assert.match(awardBlock, /tournament_team:[\s\S]*?roster:[\s\S]*?rosterImageSnapshotField/);
});

console.log("historical tournament podium portrait checks passed");
