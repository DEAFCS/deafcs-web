import { order_by, Selector } from "~/generated/zeus";

// Adapted from 5Stack web graphql/watchTickerFields.ts (MIT, Copyright (c)
// 2025 5Stack.gg). DEAFCS: no events; map name/label/poster/patch for the
// map backgrounds; source for the results filter.

const watchLineupFields = Selector("match_lineups")({
  id: true,
  name: true,
  team: {
    name: true,
    short_name: true,
    avatar_url: true,
  },
  lineup_players: [{}, { checked_in: true, captain: true }],
});

// What a /watch rail card shows. Kept slim (not simpleMatchFields): the live
// list is a subscription and results page in as the row scrolls.
export const watchTickerMatchFields = Selector("matches")({
  id: true,
  status: true,
  source: true,
  scheduled_at: true,
  started_at: true,
  ended_at: true,
  is_in_lineup: true,
  is_coach: true,
  // Gameplay is live (server up): only then do automatic POVs count.
  server_id: true,
  is_server_online: true,
  winning_lineup_id: true,
  lineup_1_id: true,
  lineup_2_id: true,
  min_players_per_lineup: true,
  options: {
    best_of: true,
    mr: true,
    type: true,
    check_in_setting: true,
  },
  lineup_1: watchLineupFields,
  lineup_2: watchLineupFields,
  match_maps: [
    { order_by: [{ order: order_by.asc }] },
    {
      id: true,
      order: true,
      status: true,
      is_current_map: true,
      lineup_1_score: true,
      lineup_2_score: true,
      winning_lineup_id: true,
      map: { id: true, name: true, label: true, poster: true, patch: true },
    },
  ],
  tournament_brackets: [
    { limit: 1 },
    { stage: { tournament: { id: true, name: true } } },
  ],
  streams: [
    { order_by: [{ priority: order_by.asc }] },
    {
      id: true,
      link: true,
      title: true,
      priority: true,
      is_game_streamer: true,
      is_live: true,
    },
  ],
});
