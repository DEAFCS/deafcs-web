// ELO rank tiers — shared so the leaderboard, PlayerElo card, and anywhere
// else that shows an ELO value tint it with the same tier color.

export interface RankTier {
  threshold: number;
  label: string;
  rgb: string;
}

// Below this, a rating is still shown as the flat "Grey"/Provisional color
// rather than a tier color. Distinct from a player's actual starting ELO
// (5000, set server-side in get_player_elo_by_type) -- that's an unrelated
// backend fact this display constant no longer mirrors now that 5000 sits
// inside the Medium Blue tier below.
export const ELO_BASELINE = 2500;

export const RANK_TIERS: RankTier[] = [
  { threshold: 20000, label: "Gold", rgb: "254 215 0" },
  { threshold: 15000, label: "Red", rgb: "235 75 75" },
  { threshold: 12500, label: "Magenta", rgb: "210 44 230" },
  { threshold: 10000, label: "Purple", rgb: "136 70 255" },
  { threshold: 7500, label: "Strong Blue", rgb: "75 105 255" },
  { threshold: 5000, label: "Medium Blue", rgb: "94 152 215" },
  { threshold: ELO_BASELINE, label: "Light Steel", rgb: "177 195 217" },
];

export const PROVISIONAL_TIER: RankTier = {
  threshold: 0,
  label: "Grey",
  rgb: "120 130 140",
};

export function tierFor(elo: number): RankTier {
  if (elo < ELO_BASELINE) return PROVISIONAL_TIER;
  for (const t of RANK_TIERS) {
    if (elo >= t.threshold) return t;
  }
  return RANK_TIERS[RANK_TIERS.length - 1];
}

// CSS color string for an ELO value's tier, or undefined when the value
// isn't a usable number (so callers can spread into :style safely).
export function eloTierColor(
  elo: number | null | undefined,
): string | undefined {
  if (elo === null || elo === undefined || !Number.isFinite(elo)) {
    return undefined;
  }
  return `rgb(${tierFor(elo).rgb})`;
}
