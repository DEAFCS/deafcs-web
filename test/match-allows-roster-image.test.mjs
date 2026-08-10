import assert from "node:assert/strict";
import { register } from "node:module";

register("./resolve-aliases-loader.mjs", import.meta.url);

const { matchAllowsRosterImage, buildLineupAvatarOverride } = await import(
  "~/utilities/teamRosterOverride"
);

// Real tournament match (is_tournament_match computed field present and true)
assert.equal(matchAllowsRosterImage({ is_tournament_match: true }), true);

// Matchmaking / Draft match - is_tournament_match is false
assert.equal(matchAllowsRosterImage({ is_tournament_match: false }), false);

// No match context at all (e.g. no match prop passed)
assert.equal(matchAllowsRosterImage(null), false);
assert.equal(matchAllowsRosterImage(undefined), false);

// Fallback path for callers that select tournament_brackets directly instead
// of the is_tournament_match computed field.
assert.equal(
  matchAllowsRosterImage({ tournament_brackets: [{ id: "b1" }] }),
  true,
);
assert.equal(matchAllowsRosterImage({ tournament_brackets: [] }), false);
assert.equal(
  matchAllowsRosterImage({ is_tournament_match: false, tournament_brackets: [] }),
  false,
);

// Sanity: buildLineupAvatarOverride is unaffected by this change (still
// correctly no-ops for a lineup with no team_id, e.g. an MM/Draft lineup).
assert.equal(buildLineupAvatarOverride(null)("76561190000000001"), null);
assert.equal(
  buildLineupAvatarOverride({ team_id: null })("76561190000000001"),
  null,
);
assert.equal(
  buildLineupAvatarOverride({
    team_id: "team-1",
    team: { roster: [{ player_steam_id: "76561190000000001", roster_image_url: "x.png" }] },
  })("76561190000000001"),
  "x.png",
);

console.log("matchAllowsRosterImage checks passed");
