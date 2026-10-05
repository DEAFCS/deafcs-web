export type HighlightKind = "all" | "ace" | "4k";
export type HighlightRange = "today" | "week" | "all";

export function highlightsRangeStart(value: HighlightRange, now = new Date()): string | null {
  if (value === "all") return null;
  const start = new Date(now);
  if (value === "today") start.setHours(0, 0, 0, 0);
  else start.setDate(start.getDate() - 7);
  return start.toISOString();
}

// Fetch public candidates; clipRoundKills validates their actual round kills.
// Legacy Best Round clips can include additional knife kills in their total.
export function highlightsWhere(kind: HighlightKind, range: HighlightRange, now = new Date()) {
  const where: Record<string, any> = { visibility: { _eq: "public" } };
  const since = highlightsRangeStart(range, now);
  if (since) where.created_at = { _gte: since };
  if (kind !== "all") {
    const kills = kind === "ace" ? 5 : 4;
    where.round = { _is_null: false };
    where._or = [
      { kills_count: { _eq: kills } },
      { kills_count: { _gte: kills }, title: { _iregex: `Best Round \\(${kills}K\\)` } },
    ];
  }
  return where;
}
