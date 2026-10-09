import { teamSizeForMatchType } from "~/utilities/streamerSpecSlots";

/**
 * Registration fill. Teams-only tournaments count teams. Free Agent and mixed
 * tournaments count players, and a team contributes only its ACTIVE seats (the
 * match size: 5, 2 or 1), never its whole roster, so substitutes cannot push the
 * number past the capacity (max teams x the same match size). The count is
 * capped at that capacity: a waitlisted Free Agent is over it by definition.
 */
export function tournamentRegistrationCount(tournament: any) {
  const teamSize = teamSizeForMatchType(tournament?.options?.type);
  const maxTeams = Number(tournament?.stages?.[0]?.max_teams ?? 0);
  const teams = Number(tournament?.teams_aggregate?.aggregate?.count ?? 0);
  const unifiedPool = tournament?.registration_version === 2 && tournament?.registration_type !== "teams";
  const legacySolo = tournament?.registration_version !== 2 && tournament?.options?.individual_registration_enabled;
  if (unifiedPool || legacySolo) {
    const agents = Number((unifiedPool ? tournament?.free_agents_aggregate : tournament?.individual_signups_aggregate)?.aggregate?.count ?? 0);
    const capacity = maxTeams * teamSize;
    const filled = agents + teams * teamSize;
    return { count: capacity > 0 ? Math.min(filled, capacity) : filled, capacity, unit: "players" as const };
  }
  return { count: teams, capacity: maxTeams, unit: "teams" as const };
}
