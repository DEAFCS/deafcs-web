// Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
type EloLadder = "Competitive" | "Wingman" | "Duel";

type TournamentLike =
  | {
      min_players_per_lineup?: number | string | null;
      max_players_per_lineup?: number | string | null;
      options?: { type?: string | null } | null;
    }
  | null
  | undefined;

type PlayerLike =
  | { elo?: Record<string, number | null> | null }
  | null
  | undefined;

/**
 * Mirrors get_tournament_player_elo: a 2-per-lineup format is rated on the
 * Wingman ladder, 1-per-lineup on Duel and everything else on Competitive. The
 * entry gate, the draft and the free agent pool all have to read the same
 * ladder the server does.
 */
export function tournamentEloLadder(tournament: TournamentLike): EloLadder {
  const mode = tournament?.options?.type;
  if (mode === "Competitive" || mode === "Wingman" || mode === "Duel") return mode;
  const size =
    Number(tournament?.min_players_per_lineup) ||
    Number(tournament?.max_players_per_lineup) ||
    0;
  if (size === 2) {
    return "Wingman";
  }
  if (size === 1) {
    return "Duel";
  }
  return "Competitive";
}

/**
 * `players.elo` is a per-ladder map, never a single number — rendering or
 * comparing the column itself yields raw JSON and NaN.
 */
export function tournamentPlayerElo(
  tournament: TournamentLike,
  player: PlayerLike,
): number | null {
  const value = Number(
    player?.elo?.[tournamentEloLadder(tournament).toLowerCase()] ?? 5000,
  );
  return Number.isFinite(value) ? value : null;
}
