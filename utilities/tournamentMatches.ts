// Grouping for the tournament Matches tab (the tab itself is adapted from
// 5Stack's 2026-10-04 tournament page, MIT). Same buckets as /watch:
// Live (anything in progress, check-in to playing), Upcoming (scheduled),
// Results (decided). Canceled matches only appear under All.

export type TournamentMatchFilter = "all" | "live" | "upcoming" | "results";

export const TOURNAMENT_MATCH_FILTERS: TournamentMatchFilter[] = [
  "all",
  "live",
  "upcoming",
  "results",
];

const LIVE = ["Live", "Veto", "WaitingForCheckIn", "PickingPlayers", "WaitingForServer"];
const UPCOMING = ["Scheduled"];
const RESULTS = ["Finished", "Forfeit", "Surrendered", "Tie"];

export function tournamentMatchBucket(
  status: string | null | undefined,
): Exclude<TournamentMatchFilter, "all"> | null {
  if (!status) return null;
  if (LIVE.includes(status)) return "live";
  if (UPCOMING.includes(status)) return "upcoming";
  if (RESULTS.includes(status)) return "results";
  return null;
}

const BUCKET_ORDER: Record<string, number> = { live: 0, upcoming: 1, results: 2 };

const time = (value: unknown) => {
  const t = value ? new Date(value as string).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

// Live first, then upcoming soonest first, then results newest first.
export function sortTournamentMatches<T extends Record<string, any>>(matches: T[]): T[] {
  return [...matches].sort((a, b) => {
    const ba = BUCKET_ORDER[tournamentMatchBucket(a.status) ?? ""] ?? 3;
    const bb = BUCKET_ORDER[tournamentMatchBucket(b.status) ?? ""] ?? 3;
    if (ba !== bb) return ba - bb;
    if (ba === 1) {
      return (time(a.scheduled_at) ?? Infinity) - (time(b.scheduled_at) ?? Infinity);
    }
    const ta = time(a.ended_at) ?? time(a.started_at) ?? time(a.created_at) ?? 0;
    const tb = time(b.ended_at) ?? time(b.started_at) ?? time(b.created_at) ?? 0;
    return tb - ta;
  });
}

export function filterTournamentMatches<T extends Record<string, any>>(
  matches: T[],
  filter: TournamentMatchFilter,
): T[] {
  if (filter === "all") return matches;
  return matches.filter((match) => tournamentMatchBucket(match.status) === filter);
}

export function tournamentMatchCounts(
  matches: Array<Record<string, any>>,
): Record<TournamentMatchFilter, number> {
  const counts = { all: matches.length, live: 0, upcoming: 0, results: 0 };
  for (const match of matches) {
    const bucket = tournamentMatchBucket(match.status);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}
