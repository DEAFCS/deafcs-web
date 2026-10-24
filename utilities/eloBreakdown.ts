// The four ELO fields of the ELO Change Details popup, from a stored
// v_player_elo row. Every value is read from what the API stored for that
// match (its own formula version, scale, expected score, PERF and series),
// never recomputed with today's formula, so old matches show their original
// numbers.
//
// Version 2 (DEAFCS ELO v2, rated 5v5): IMPACT is the HLTV-style match rating
// (NULL when the match had no rating, shown as "-"). Version 1 (Duel, Wingman
// and every match before v2): IMPACT is the original Impact multiplier
// (0.80 - 1.20) with its percentage.

export type EloRow = {
  elo_change?: number | string | null;
  expected_score?: number | string | null;
  actual_score?: number | string | null;
  k_factor?: number | string | null;
  impact?: number | string | null;
  performance_multiplier?: number | string | null;
  series_multiplier?: number | string | null;
  elo_version?: number | string | null;
  scale_factor?: number | string | null;
};

export type EloBreakdown = {
  version: number;
  scale: number;
  expected: number;
  actual: number;
  expectedPercent: number;
  delta: number;
  baseElo: number;
  impact: number | null;
  impactIsHltv: boolean;
  impactPercent: number | null;
  perf: number;
  perfPercent: number;
  kFactor: number;
  series: number;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function eloBreakdown(row: EloRow): EloBreakdown {
  const version = num(row.elo_version) ?? 1;
  const expected = num(row.expected_score) ?? 0;
  const actual = num(row.actual_score) ?? 0;
  const kFactor = num(row.k_factor) ?? 500;
  const series = num(row.series_multiplier) || 1;
  const perf = num(row.performance_multiplier) ?? 1;
  const delta = actual - expected;
  const impactIsHltv = version >= 2;
  const rawImpact = num(row.impact);
  // Version 1 rows always carry an Impact; v2 keeps "no rating" as NULL.
  const impact = impactIsHltv ? rawImpact : (rawImpact ?? perf);

  return {
    version,
    scale: num(row.scale_factor) ?? 4000,
    expected,
    actual,
    expectedPercent: Math.round(expected * 100),
    delta,
    baseElo: Math.round(kFactor * delta * series),
    impact,
    impactIsHltv,
    impactPercent:
      impactIsHltv || impact === null ? null : Math.round((impact - 1) * 100),
    perf,
    perfPercent: Math.round((perf - 1) * 1000) / 10,
    kFactor,
    series,
  };
}

// "1.25", "0.875", "1.00": two decimals, three only when the third matters.
export function formatMultiplier(value: number): string {
  const three = value.toFixed(3);
  return three.endsWith("0") ? value.toFixed(2) : three;
}

export function formatSigned(value: number, digits = 0): string {
  const text = digits > 0 ? Math.abs(value).toFixed(digits) : Math.abs(Math.round(value)).toLocaleString();
  if (value > 0) return `+${text}`;
  if (value < 0) return `−${text}`;
  return digits > 0 ? (0).toFixed(digits) : "0";
}

// "+25%", "−12.5%", "0%".
export function formatPercent(value: number): string {
  const text = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1);
  if (value > 0) return `+${text}%`;
  if (value < 0) return `−${text}%`;
  return "0%";
}
