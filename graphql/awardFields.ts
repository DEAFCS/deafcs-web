import { order_by, Selector } from "~/generated/zeus";

export const awardFields = Selector("award_recipients")({
  id: true,
  team_id: true,
  player_steam_id: true,
  tournament_team_id: true,
  occurrence: {
    id: true,
    tournament_id: true,
    placement: true,
    award: {
      image_url: true,
    },
    tournament: {
      name: true,
      start: true,
      stages: [
        {
          order_by: [
            {
              order: order_by.desc,
            },
          ],
          limit: 1,
        },
        {
          type: true,
        },
      ],
    },
  },
  tournament_team: {
    name: true,
    team_id: true,
    team: {
      id: true,
      name: true,
      short_name: true,
    },
  },
  team: {
    id: true,
    name: true,
    short_name: true,
  },
});
