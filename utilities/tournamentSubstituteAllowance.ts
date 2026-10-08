// The substitute allowance a NEW tournament is created with.
//
// Random (individual registration) and Free Agent tournaments generate their
// own fixed-size teams, so they get no substitute slots: the global
// team_max_subs must not quietly turn them into 5+2. Every other tournament,
// including "both" (premade teams can carry substitutes), takes the global
// default. Editing an existing tournament never goes through this: it keeps
// the allowance the tournament already has.
export function newTournamentSubstituteAllowance(
  values: {
    individual_registration_enabled?: boolean | null;
    registration_type?: string | null;
  },
  globalAllowance: number,
): number {
  if (
    values.individual_registration_enabled ||
    values.registration_type === "free_agents"
  ) {
    return 0;
  }
  return globalAllowance;
}
