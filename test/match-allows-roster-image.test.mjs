import assert from "node:assert/strict";
import { register } from "node:module";

register("./resolve-aliases-loader.mjs", import.meta.url);

const {
  matchAllowsRosterImage,
  buildLineupAvatarOverride,
  buildMatchLineupAvatarOverride,
  resolveMatchPlayerAvatarUrl,
} = await import("~/utilities/teamRosterOverride");

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

const steamId = "76561190000000001";
const lineupWithTeamRoster = {
  team_id: "team-1",
  team: {
    roster: [
      {
        player_steam_id: steamId,
        roster_image_url: "avatars/team-specific.webp",
      },
    ],
  },
};
const playerWithEveryImage = {
  steam_id: steamId,
  roster_image_url: "avatars/general-roster.webp",
  custom_avatar_url: "avatars/custom.webp",
  avatar_url: "https://steam.example/avatar.jpg",
};

// A Draft/MM match remains avatar-only even if its lineup unexpectedly has a
// real team_id and a matching team-roster portrait.
assert.equal(
  buildMatchLineupAvatarOverride(
    { is_tournament_match: false },
    lineupWithTeamRoster,
  )(steamId),
  null,
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    { is_tournament_match: false },
    lineupWithTeamRoster,
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/custom.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    { is_tournament_match: false },
    lineupWithTeamRoster,
    { ...playerWithEveryImage, custom_avatar_url: null },
    steamId,
    "api.example",
  ),
  "https://steam.example/avatar.jpg",
);

// A tournament-linked match keeps the complete portrait priority chain.
const tournamentMatch = { is_tournament_match: true };
assert.equal(
  resolveMatchPlayerAvatarUrl(
    tournamentMatch,
    lineupWithTeamRoster,
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/team-specific.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    tournamentMatch,
    { ...lineupWithTeamRoster, team: { roster: [] } },
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/general-roster.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    tournamentMatch,
    { ...lineupWithTeamRoster, team: { roster: [] } },
    { ...playerWithEveryImage, roster_image_url: null },
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/custom.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    tournamentMatch,
    { ...lineupWithTeamRoster, team: { roster: [] } },
    {
      ...playerWithEveryImage,
      roster_image_url: null,
      custom_avatar_url: null,
    },
    steamId,
    "api.example",
  ),
  "https://steam.example/avatar.jpg",
);

console.log("matchAllowsRosterImage checks passed");
