// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
import { e_match_types_enum, e_tournament_status_enum } from "~/generated/zeus";
import { EXPECTED_PLAYERS } from "~/utilities/matchmakingPartySize";

// "5v5" / "2v2" / "1v1" -- demo-only types (Premier, Faceit) are 5v5.
export function matchTypeLabel(type?: string | null) {
  const players = EXPECTED_PLAYERS[type as e_match_types_enum] ?? 10;
  const side = players / 2;
  return `${side}v${side}`;
}

export type TournamentRowState = "live" | "finished" | "upcoming";

export function tournamentRowState(status?: string | null): TournamentRowState {
  if (
    status === e_tournament_status_enum.Live ||
    status === e_tournament_status_enum.Paused
  ) {
    return "live";
  }
  if (
    status === e_tournament_status_enum.Finished ||
    status === e_tournament_status_enum.Cancelled ||
    status === e_tournament_status_enum.CancelledMinTeams
  ) {
    return "finished";
  }
  return "upcoming";
}

function teamName(entry: any): string | null {
  return entry?.team?.name || entry?.team?.short_name || entry?.name || null;
}

// The awarded winner first, then the final stage's standings when awards
// were never issued (same order as TournamentCompactCard's podium).
export function tournamentChampion(tournament: any): string | null {
  const finalStage = [...(tournament?.stages || [])].sort(
    (a: any, b: any) => (Number(b.order) || 0) - (Number(a.order) || 0),
  )[0];
  const winner = (finalStage?.results || []).find(
    (row: any) => Number(row.rank) === 1,
  );
  return winner ? teamName(winner.team) : null;
}
