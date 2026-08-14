import { playerFields } from "~/graphql/playerFields";
import { rosterImageSnapshotField } from "~/graphql/rosterImageSnapshotField";

export default {
  id: true,
  name: true,
  short_name: true,
  team_id: true,
  seed: true,
  eligible_at: true,
  can_manage: true,
  captain_steam_id: true,
  owner_steam_id: true,
  captain: playerFields,
  team: {
    id: true,
    name: true,
    short_name: true,
    avatar_url: true,
    // The real team's roster -- the only place a team-specific roster image
    // lives (tournament_team_roster has no roster_image_url column). Used
    // to resolve the team-specific tier of the pre-lock portrait priority;
    // locked tournaments use the persisted tournament-roster snapshot.
    roster: [
      {},
      {
        player_steam_id: true,
        roster_image_url: true,
      },
    ],
  },
  roster: [
    {},
    {
      player_steam_id: true,
      role: true,
      ...rosterImageSnapshotField,
      player: playerFields,
    },
  ],
  roster_aggregate: [
    {},
    {
      aggregate: {
        count: true,
      },
    },
  ],
};
