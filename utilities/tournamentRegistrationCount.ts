/** Registration capacity uses players for solo/mixed pools and teams otherwise. */
export function tournamentRegistrationCount(tournament: any) {
  const teamSize = tournament?.options?.type === "Duel" ? 1 : tournament?.options?.type === "Wingman" ? 2 : 5;
  const maxTeams = Number(tournament?.stages?.[0]?.max_teams ?? 0);
  const teams = Number(tournament?.teams_aggregate?.aggregate?.count ?? 0);
  const unifiedPool = tournament?.registration_version === 2 && tournament?.registration_type !== "teams";
  const legacySolo = tournament?.registration_version !== 2 && tournament?.options?.individual_registration_enabled;
  if (unifiedPool || legacySolo) {
    const agents = Number((unifiedPool ? tournament?.free_agents_aggregate : tournament?.individual_signups_aggregate)?.aggregate?.count ?? 0);
    return { count: agents + teams * teamSize, capacity: maxTeams * teamSize, unit: "players" as const };
  }
  return { count: teams, capacity: maxTeams, unit: "teams" as const };
}
