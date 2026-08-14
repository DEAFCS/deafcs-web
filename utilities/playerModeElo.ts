export type PlayerModeElo = {
  competitive?: number;
  wingman?: number;
  duel?: number;
};

export type ActiveSeasonEloMode = "Competitive" | "Wingman" | "Duel";
type PlayerModeEloKey = keyof PlayerModeElo;

export const ACTIVE_SEASON_ELO_FALLBACK = 5000;

/**
 * Select one ladder from an ELO object already resolved by
 * usePlayerActiveSeasonElo(). Unknown/non-DEAFCS match types intentionally
 * retain PlayerElo's established Competitive fallback.
 */
export function activeSeasonEloForMode(
  elo: PlayerModeElo | null | undefined,
  matchType: string | null | undefined,
): number {
  const normalized = String(matchType ?? "").toLowerCase();
  const key: PlayerModeEloKey =
    normalized === "wingman" || normalized === "duel"
      ? normalized
      : "competitive";
  const value = elo?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : ACTIVE_SEASON_ELO_FALLBACK;
}

/** Every supplied player contributes, using the same per-mode 5000 fallback. */
export function averageActiveSeasonEloForMode<T>(
  entries: T[],
  matchType: string | null | undefined,
  eloForEntry: (entry: T) => PlayerModeElo | null | undefined,
): number {
  if (entries.length === 0) return 0;
  const total = entries.reduce(
    (sum, entry) =>
      sum + activeSeasonEloForMode(eloForEntry(entry), matchType),
    0,
  );
  return Math.round(total / entries.length);
}
