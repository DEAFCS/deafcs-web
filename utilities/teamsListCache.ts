// Adapted from 5Stack WEB bd6c8150; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
// What the Teams page last showed, kept for the session. Coming back to the
// page renders it at once while fresh data loads, instead of empty sections
// filling in and shoving the page around. Module state, so it outlives the
// components that read it.

// The viewer's own teams, by steam id.
export const lastYourTeams = new Map<string, any[]>();

// Directory results, by the query that produced them.
export const lastDirectoryResults = new Map<
  string,
  { teams: any[]; total: number }
>();

// Rows on the last directory page shown, to size its loading skeleton.
export const lastDirectoryRowCount = { value: 0 };

// A team was deleted: evict it from Apollo's cache and forget every cached list
// that could still show it, so the Teams page refetches instead of seeding
// itself with a stale row (and Back onto it can't resurrect the card).
export function forgetDeletedTeam(
  teamId: string,
  apolloCache?: {
    identify: (obj: Record<string, unknown>) => string | undefined;
    evict: (options: { id?: string }) => boolean;
    gc: () => unknown;
  } | null,
) {
  lastDirectoryResults.clear();
  lastYourTeams.clear();
  lastDirectoryRowCount.value = 0;
  if (!apolloCache) return;
  const id = apolloCache.identify({ __typename: "teams", id: teamId });
  if (id) apolloCache.evict({ id });
  apolloCache.gc();
}
