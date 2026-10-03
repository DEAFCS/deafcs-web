// Largest count a notification badge shows exactly; anything above reads
// "99+" so the circle stays small.
export const MAX_BADGE_COUNT = 99;

export function formatBadgeCount(count: number): string {
  return count > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(count);
}
