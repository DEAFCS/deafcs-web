// Adapted from 5Stack WEB bd6c8150; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { order_by } from "~/generated/zeus";
import { generateSubscription } from "~/graphql/graphqlGen";
import {
  mapAwardRecipientToTrophy,
  type AwardRecipientRow,
  type TournamentAwardSlotLookupRow,
} from "~/utilities/awardOccurrenceResolution";

// A team's award grant as the teams list shows it.
export type TeamAwardEntry = {
  id: string;
  placement?: number | null;
  source?: string | null;
  tournament_id?: string | null;
  created_at?: string | null;
  award?: {
    id: string;
    name?: string | null;
    tier?: string | null;
    silhouette?: number | null;
    image_url?: string | null;
  } | null;
  tournament?: {
    id?: string;
    name?: string | null;
    start?: string | null;
    stages?: Array<{ type?: string | null }> | null;
  } | null;
  tournament_award?: {
    custom_name?: string | null;
    silhouette?: number | null;
    image_url?: string | null;
  } | null;
};

// What a team's award grant needs from a live DEAFCS award_recipients row
// (award_recipients -> award_occurrences -> awards). 5Stack's current API reads
// placement/source straight off the recipient; DEAFCS keeps them on the
// occurrence, so recipientToGrant() flattens one into the other.
export const teamAwardRecipientFields = {
  id: true,
  team_id: true,
  player_steam_id: true,
  tournament_team_id: true,
  created_at: true,
  occurrence: {
    id: true,
    tournament_id: true,
    placement: true,
    source: true,
    award: {
      id: true,
      name: true,
      tier: true,
      silhouette: true,
      image_url: true,
      system_key: true,
    },
    tournament: {
      id: true,
      name: true,
      start: true,
      stages: [
        { order_by: [{ order: order_by.desc }], limit: 1 },
        { type: true },
      ],
    },
  },
  tournament_team: {
    name: true,
    team_id: true,
    team: { id: true, name: true, short_name: true },
  },
  team: { id: true, name: true, short_name: true },
};

// Every team award (player awards excluded): the list rows show them and
// "Tournament winners" filters on them.
export const teamAwardsSubscription = generateSubscription({
  award_recipients: [
    { where: { player_steam_id: { _is_null: true } } },
    teamAwardRecipientFields,
  ],
} as any);

// A live recipient row as the grant the team components read. `trophy` is the
// same award in the shape AwardCase/AwardModal take; `slots` are the
// per-tournament artwork overrides (custom name, silhouette, image).
export function recipientToGrant(
  recipient: AwardRecipientRow,
  slots?: TournamentAwardSlotLookupRow[] | null,
) {
  const trophy = mapAwardRecipientToTrophy(recipient, slots ?? null);
  const occurrence = recipient.occurrence;
  return {
    id: recipient.id,
    team_id: recipient.team_id ?? null,
    source: (occurrence as any)?.source ?? null,
    placement: occurrence?.placement ?? null,
    tournament_id: occurrence?.tournament_id ?? null,
    created_at: (recipient as any).created_at ?? null,
    award: trophy.award,
    tournament: occurrence?.tournament ?? null,
    tournament_award: trophy.trophy_config,
    trophy,
  };
}

export function groupAwardsByTeam<T extends { team_id?: string | null }>(
  grants: T[],
): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const grant of grants) {
    if (grant.team_id) (map[grant.team_id] ??= []).push(grant);
  }
  return map;
}

// Only placements won in a tournament count: a hand-granted award doesn't
// make a team a tournament winner.
export function tournamentWinnerTeamIds(
  grants: Array<{ team_id?: string | null; source?: string | null }>,
): string[] {
  return [
    ...new Set(
      grants
        .filter((grant) => grant.team_id && grant.source === "tournament")
        .map((grant) => grant.team_id as string),
    ),
  ];
}
