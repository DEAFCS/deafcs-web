import { order_by } from "~/generated/zeus";

// Current 5Stack top-play ranking: shorter clips break kill-count ties.
// MIT License, Copyright (c) 2025 5Stack.gg — see LICENSE.
export const topPlayOrderBy = [
  { kills_count: order_by.desc_nulls_last },
  { duration_ms: order_by.asc_nulls_last },
  { views_count: order_by.desc_nulls_last },
  { created_at: order_by.desc },
];

const clipLineupWithPlayersFields = {
  id: true,
  name: true,
  team_id: true,
  team: {
    name: true,
    avatar_url: true,
  },
  lineup_players: [
    {},
    {
      captain: true,
      steam_id: true,
      placeholder_name: true,
      player: {
        steam_id: true,
        name: true,
        avatar_url: true,
      },
    },
  ],
} as const;

// download_url is a Hasura computed field returning a CF worker URL.
export const matchClipFields = {
  id: true,
  user_steam_id: true,
  target_steam_id: true,
  match_map_id: true,
  title: true,
  duration_ms: true,
  download_url: true,
  thumbnail_url: true,
  thumbnail_download_url: true,
  kills_count: true,
  round: true,
  views_count: true,
  visibility: true,
  created_at: true,
  user: {
    steam_id: true,
    name: true,
    avatar_url: true,
  },
  target: {
    steam_id: true,
    name: true,
    avatar_url: true,
  },
  match_map: {
    id: true,
    lineup_1_score: true,
    lineup_2_score: true,
    winning_lineup_id: true,
    map: { name: true, poster: true, label: true },
    match: {
      id: true,
      status: true,
      started_at: true,
      ended_at: true,
      winning_lineup_id: true,
      is_tournament_match: true,
      lineup_1_id: true,
      lineup_2_id: true,
      lineup_1: { id: true, name: true, team_id: true },
      lineup_2: { id: true, name: true, team_id: true },
      options: {
        best_of: true,
        mr: true,
        type: true,
      },
      tournament_brackets: [
        { limit: 1 },
        {
          stage: {
            e_tournament_stage_type: { description: true },
            tournament: { id: true, name: true },
          },
        },
      ],
      match_maps: [
        {},
        {
          id: true,
          order: true,
          lineup_1_score: true,
          lineup_2_score: true,
          winning_lineup_id: true,
          map: { name: true, label: true },
        },
      ],
    },
  },
} as const;

export const matchClipFieldsWithLineups = {
  ...matchClipFields,
  match_map: {
    ...matchClipFields.match_map,
    match: {
      ...matchClipFields.match_map.match,
      lineup_1: clipLineupWithPlayersFields,
      lineup_2: clipLineupWithPlayersFields,
    },
  },
} as const;

// Discovery tiles need metadata and thumbnails, never video URLs or full
// match/lineup detail. Playback resolves those only for the active/next clip.
export const clipTileFields = {
  id: true, user_steam_id: true, target_steam_id: true, match_map_id: true,
  title: true, duration_ms: true, thumbnail_download_url: true,
  kills_count: true, round: true, views_count: true, visibility: true, created_at: true,
  user: matchClipFields.user, target: matchClipFields.target,
  match_map: {
    id: true,
    lineup_1_score: true, lineup_2_score: true, winning_lineup_id: true,
    map: matchClipFields.match_map.map,
    match: {
      id: true, is_tournament_match: true, winning_lineup_id: true,
      lineup_1_id: true, lineup_2_id: true,
      lineup_1: matchClipFields.match_map.match.lineup_1,
      lineup_2: matchClipFields.match_map.match.lineup_2,
      options: { best_of: true },
      match_maps: matchClipFields.match_map.match.match_maps,
    },
  },
} as const;
