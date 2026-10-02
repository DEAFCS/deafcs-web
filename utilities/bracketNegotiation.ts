// Negotiated scheduling for a normal (non-league) tournament bracket, on the
// same league_scheduling_proposals rows and rules the league schedule uses.
// Postgres (tbi/tbu/tau_league_scheduling_proposals) is the authority; these
// helpers only decide what the page offers, mirroring those triggers:
// - a manager of either team (owner, captain or roster Admin) or an
//   administrator may propose; the opposing side accepts;
// - only while there is no match yet, or it is still Scheduled /
//   WaitingForCheckIn;
// - inside the stage's window for that round, else within two weeks.
// Accepting the first proposal is what creates the match (as Scheduled).

export type NegotiationProposal = {
  id: string;
  proposed_time: string;
  status: string;
  message?: string | null;
  proposed_by_steam_id: string;
  proposed_by?: { steam_id: string; name: string } | null;
};

type NegotiationBracket = {
  bye?: boolean | null;
  finished?: boolean | null;
  round?: number | null;
  scheduled_at?: string | null;
  team_1?: { id?: string | null; team_id?: string | null } | null;
  team_2?: { id?: string | null; team_id?: string | null } | null;
  match?: { status?: string | null } | null;
  scheduling_proposals?: NegotiationProposal[] | null;
};

type NegotiationTournament = {
  scheduling_mode?: string | null;
  // League tournaments negotiate on the league schedule (match weeks).
  league_season_division?: { id?: string | null } | null;
};

const RESCHEDULABLE = new Set(["Scheduled", "WaitingForCheckIn"]);
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

/** The bracket can be negotiated here (and is not a league fixture). */
export function negotiableBracket(
  tournament: NegotiationTournament | null | undefined,
  bracket: NegotiationBracket,
): boolean {
  if (tournament?.scheduling_mode !== "negotiated") return false;
  if (tournament.league_season_division) return false;
  if (bracket.bye || bracket.finished) return false;
  if (!bracket.team_1?.id || !bracket.team_2?.id) return false;
  return !bracket.match || RESCHEDULABLE.has(bracket.match.status ?? "");
}

export function pendingBracketProposals(bracket: NegotiationBracket): NegotiationProposal[] {
  return (bracket.scheduling_proposals ?? []).filter((p) => p.status === "Pending");
}

export function pastBracketProposals(bracket: NegotiationBracket): NegotiationProposal[] {
  return (bracket.scheduling_proposals ?? []).filter((p) => p.status !== "Pending");
}

/** The viewer manages one of the bracket's two teams. */
export function managesBracket(bracket: NegotiationBracket, managedTeamIds: string[]): boolean {
  return [bracket.team_1?.team_id, bracket.team_2?.team_id].some(
    (teamId) => !!teamId && managedTeamIds.includes(teamId),
  );
}

/**
 * Where a proposal may fall: the stage's window for this round when one is
 * configured, otherwise from now until two weeks ahead (the trigger's rule
 * for windowless negotiated stages).
 */
export function proposalWindow(
  stage: { windows?: Array<{ round: number; opens_at?: string | null; closes_at?: string | null }> | null } | null | undefined,
  bracket: NegotiationBracket,
  now: number,
): { opensAt: string; closesAt: string } {
  const window = (stage?.windows ?? []).find((w) => w.round === bracket.round);
  if (window) {
    return {
      opensAt: window.opens_at ?? new Date(now).toISOString(),
      closesAt: window.closes_at ?? new Date(now + TWO_WEEKS_MS).toISOString(),
    };
  }
  return {
    opensAt: new Date(now).toISOString(),
    closesAt: new Date(now + TWO_WEEKS_MS).toISOString(),
  };
}
