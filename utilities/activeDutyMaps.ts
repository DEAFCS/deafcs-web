import { normalizeMapName } from "~/utilities/mapAssets";

/**
 * Valve's Active Duty maps first (DEAFCS).
 *
 * Which maps are Active Duty is not hard-coded: it is the `active_pool` flag
 * admins already keep on `maps`, the same flag the map pool settings use. A map
 * is Active Duty when any of its rows (Competitive, Wingman, Duel) carries it.
 * Nothing is hidden for good: the other maps stay one choice away, and their
 * lineups, callouts and history are untouched.
 */
export type MapPoolRow = {
  name: string;
  active_pool?: boolean | null;
};

export function activeDutyNames(rows: ReadonlyArray<MapPoolRow>): Set<string> {
  const names = new Set<string>();

  for (const row of rows) {
    if (row.active_pool === true) {
      names.add(normalizeMapName(row.name));
    }
  }

  return names;
}

/** Active Duty first, each group keeping the order it came in. */
export function orderActiveDutyFirst<T extends { name: string }>(
  items: ReadonlyArray<T>,
  active: ReadonlySet<string>,
): T[] {
  const { active: first, other } = splitActiveDuty(items, active);

  return [...first, ...other];
}

export function splitActiveDuty<T extends { name: string }>(
  items: ReadonlyArray<T>,
  active: ReadonlySet<string>,
): { active: T[]; other: T[] } {
  const first: T[] = [];
  const other: T[] = [];

  for (const item of items) {
    (active.has(normalizeMapName(item.name)) ? first : other).push(item);
  }

  return { active: first, other };
}
