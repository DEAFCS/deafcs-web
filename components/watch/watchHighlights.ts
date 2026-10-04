export type HighlightKind = "all" | "ace" | "4k";
export type HighlightRange = "today" | "week" | "all";

export function highlightsRangeStart(value: HighlightRange, now = new Date()): string | null {
  if (value === "all") return null;
  const start = new Date(now);
  if (value === "today") start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - 7);
  return start.toISOString();
}

// Public clips only. kills_count is the clip's total, so Aces/4Ks only mean
// something on a single-round clip (round set); nothing else is inferred.
export function highlightsWhere(kind: HighlightKind, range: HighlightRange, now = new Date()) {
  const where: Record<string, any> = { visibility: { _eq: "public" } };
  const since = highlightsRangeStart(range, now);
  if (since) where.created_at = { _gte: since };
  if (kind === "ace") {
    where.kills_count = { _eq: 5 };
    where.round = { _is_null: false };
  } else if (kind === "4k") {
    where.kills_count = { _eq: 4 };
    where.round = { _is_null: false };
  }
  return where;
}
