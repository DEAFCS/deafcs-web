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
    // The whole award definition, not just its image: every consumer renders
    // it through AwardArtwork, which needs tier/silhouette/system_key to pick
    // between uploaded artwork, a procedural silhouette and the tier icon.
    award: {
      id: true,
      name: true,
      tier: true,
      silhouette: true,
      image_url: true,
      system_key: true,
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
