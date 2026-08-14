import assert from "node:assert/strict";
import { register } from "node:module";

register("./resolve-aliases-loader.mjs", import.meta.url);

const {
  matchAllowsRosterImage,
  buildLineupAvatarOverride,
  buildMatchLineupAvatarOverride,
  isTournamentRosterLocked,
  matchUsesHistoricalRosterSnapshot,
  resolveMatchPlayerAvatarUrl,
  resolveTournamentPlayerAvatarUrl,
  tournamentAllowsCurrentRosterImage,
} = await import("~/utilities/teamRosterOverride");

const tournamentMatch = (status) => ({
  is_tournament_match: true,
  tournament_brackets: [{ stage: { tournament: { status } } }],
});

assert.equal(isTournamentRosterLocked("Setup"), false);
assert.equal(isTournamentRosterLocked("RegistrationOpen"), false);
assert.equal(isTournamentRosterLocked("RegistrationClosed"), true);
assert.equal(isTournamentRosterLocked("Live"), true);
assert.equal(isTournamentRosterLocked("Finished"), true);
assert.equal(isTournamentRosterLocked(undefined), true);

// Only pre-lock tournaments may let PlayerDisplay inspect current roster data.
assert.equal(matchAllowsRosterImage(tournamentMatch("Setup")), true);
assert.equal(matchAllowsRosterImage(tournamentMatch("RegistrationOpen")), true);
assert.equal(matchAllowsRosterImage(tournamentMatch("Live")), false);
assert.equal(matchUsesHistoricalRosterSnapshot(tournamentMatch("Live")), true);
assert.equal(
  matchUsesHistoricalRosterSnapshot(tournamentMatch("RegistrationOpen")),
  false,
);

// Matchmaking / Draft match - is_tournament_match is false
assert.equal(matchAllowsRosterImage({ is_tournament_match: false }), false);

// No match context at all (e.g. no match prop passed)
assert.equal(matchAllowsRosterImage(null), false);
assert.equal(matchAllowsRosterImage(undefined), false);

// Fallback path for callers that select tournament_brackets directly instead
// of the is_tournament_match computed field.
assert.equal(
  matchAllowsRosterImage({ tournament_brackets: [{ id: "b1" }] }),
  false,
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
  lineup_players: [
    {
      steam_id: steamId,
      roster_image_url_snapshot: "avatars/historical.webp",
    },
  ],
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

// A pre-lock tournament keeps the complete current portrait priority chain.
const preLockTournamentMatch = tournamentMatch("RegistrationOpen");
assert.equal(
  resolveMatchPlayerAvatarUrl(
    preLockTournamentMatch,
    lineupWithTeamRoster,
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/team-specific.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    preLockTournamentMatch,
    {
      ...lineupWithTeamRoster,
      team: { roster: [] },
      lineup_players: [],
    },
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/general-roster.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    preLockTournamentMatch,
    {
      ...lineupWithTeamRoster,
      team: { roster: [] },
      lineup_players: [],
    },
    { ...playerWithEveryImage, roster_image_url: null },
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/custom.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    preLockTournamentMatch,
    {
      ...lineupWithTeamRoster,
      team: { roster: [] },
      lineup_players: [],
    },
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

// A locked tournament uses only the persisted lineup snapshot, then identity
// avatars. Current team-specific and general roster images are never fallback.
const lockedTournamentMatch = tournamentMatch("Finished");
assert.equal(
  buildMatchLineupAvatarOverride(
    lockedTournamentMatch,
    lineupWithTeamRoster,
  )(steamId),
  "avatars/historical.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    lockedTournamentMatch,
    lineupWithTeamRoster,
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/historical.webp",
);
const lineupWithoutSnapshot = {
  ...lineupWithTeamRoster,
  lineup_players: [{ steam_id: steamId, roster_image_url_snapshot: null }],
};
assert.equal(
  resolveMatchPlayerAvatarUrl(
    lockedTournamentMatch,
    lineupWithoutSnapshot,
    playerWithEveryImage,
    steamId,
    "api.example",
  ),
  "https://api.example/avatars/custom.webp",
);
assert.equal(
  resolveMatchPlayerAvatarUrl(
    lockedTournamentMatch,
    lineupWithoutSnapshot,
    { ...playerWithEveryImage, custom_avatar_url: null },
    steamId,
    "api.example",
  ),
  "https://steam.example/avatar.jpg",
);

const tournamentTeam = {
  team: { roster: lineupWithTeamRoster.team.roster },
  roster: [
    {
      player_steam_id: steamId,
      roster_image_url_snapshot: "avatars/tournament-snapshot.webp",
      player: playerWithEveryImage,
    },
  ],
};
assert.equal(tournamentAllowsCurrentRosterImage({ status: "Finished" }), false);
assert.equal(
  tournamentAllowsCurrentRosterImage({ status: "RegistrationOpen" }),
  true,
);
assert.equal(
  resolveTournamentPlayerAvatarUrl(
    { status: "Finished" },
    tournamentTeam,
    playerWithEveryImage,
    "api.example",
  ),
  "https://api.example/avatars/tournament-snapshot.webp",
);
assert.equal(
  resolveTournamentPlayerAvatarUrl(
    { status: "Finished" },
    { ...tournamentTeam, roster: [{ ...tournamentTeam.roster[0], roster_image_url_snapshot: null }] },
    playerWithEveryImage,
    "api.example",
  ),
  "https://api.example/avatars/custom.webp",
);
assert.equal(
  resolveTournamentPlayerAvatarUrl(
    { status: "Finished" },
    { ...tournamentTeam, roster: [{ ...tournamentTeam.roster[0], roster_image_url_snapshot: null }] },
    { ...playerWithEveryImage, custom_avatar_url: null },
    "api.example",
  ),
  "https://steam.example/avatar.jpg",
);
assert.equal(
  resolveTournamentPlayerAvatarUrl(
    { status: "RegistrationOpen" },
    tournamentTeam,
    playerWithEveryImage,
    "api.example",
  ),
  "https://api.example/avatars/team-specific.webp",
);

console.log("matchAllowsRosterImage checks passed");
