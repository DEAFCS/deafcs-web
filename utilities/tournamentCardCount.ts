// What a tournament card counts next to its people icon.
//
// Random / Solo Random tournaments (individual_registration_enabled) take
// individual player sign-ups while registration is open and only build
// teams afterwards, so "0 Teams" there is misleading. While the canonical
// status is RegistrationOpen they show registered players; once it moves on
// they show the real team count (which may still be 0 while team
// generation runs, never a made-up number). Every other tournament keeps
// counting teams.

type CardCountTournament = {
  status?: string | null;
  options?: { individual_registration_enabled?: boolean | null } | null;
  teams_aggregate?: { aggregate?: { count?: number | null } | null } | null;
  individual_signups?: Array<{ status?: string | null }> | null;
};

export type TournamentCardCount = {
  unit: "players" | "teams";
  count: number;
};

export function tournamentCardCount(
  tournament: CardCountTournament | null | undefined,
): TournamentCardCount {
  const individual = !!tournament?.options?.individual_registration_enabled;
  if (individual && tournament?.status === "RegistrationOpen") {
    // Same rule as the tournament page's Players tab: everyone signed up
    // except removed sign-ups (waitlisted players count).
    const count = (tournament.individual_signups ?? []).filter(
      (signup) => signup?.status !== "Removed",
    ).length;
    return { unit: "players", count };
  }
  return {
    unit: "teams",
    count: tournament?.teams_aggregate?.aggregate?.count || 0,
  };
}
