import { playerFields } from "~/graphql/playerFields";

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
    // to resolve the team-specific tier of the roster-image priority for
    // each tournament roster row via resolveRosterImageUrl().
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
      role: true,
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
