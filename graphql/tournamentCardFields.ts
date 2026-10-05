// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { order_by } from "~/generated/zeus";

const count = [{}, { aggregate: { count: true } }] as const;

// Everything WatchTournamentCard reads, shared by /watch and /play.
export const tournamentCardFields = {
  id: true,
  name: true,
  status: true,
  start: true,
  registration_version: true,
  registration_type: true,
  individual_signups_aggregate: [{ where: { status: { _in: ["Registered", "Waitlisted"] } } }, { aggregate: { count: true } }],
  free_agents_aggregate: [{ where: { status: { _in: ["registered", "waitlisted"] } } }, { aggregate: { count: true } }],
  location: true,
  banner: true,
  e_tournament_status: { description: true },
  categories: [
    {},
    { category: true, e_tournament_category: { description: true } },
  ],
  options: {
    type: true,
    best_of: true,
    individual_registration_enabled: true,
    map_pool: { maps: [{}, { poster: true }] },
  },
  organizer_teams: [{}, { team: { name: true } }],
  admin: { name: true },
  prizes: [{}, { prize: true }],
  teams_aggregate: count,
  stages: [
    { order_by: [{ order: order_by.asc }] },
    {
      order: true,
      max_teams: true,
      max_rounds: true,
      type: true,
      e_tournament_stage_type: { description: true },
      brackets: [{}, { round: true, bye: true, finished: true, scheduled_at: true, match: { status: true, winning_lineup_id: true } }],
      results: [
        {},
        {
          rank: true,
          team: { name: true, team: { name: true, short_name: true } },
        },
      ],
    },
  ],
};
