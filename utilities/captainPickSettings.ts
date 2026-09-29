// Mirrors api-deafcs src/matchmaking/captain-pick/captain-pick-settings.ts so
// the admin form validates exactly what the API will accept.

export const CAPTAIN_PICK_ENABLED_SETTING =
  "public.matchmaking_competitive_captain_pick";
export const CAPTAIN_PICK_SECONDS_SETTING =
  "public.matchmaking_captain_pick_seconds";

export const DEFAULT_CAPTAIN_PICK_SECONDS = 30;
export const MIN_CAPTAIN_PICK_SECONDS = 10;
export const MAX_CAPTAIN_PICK_SECONDS = 120;

// Off unless an administrator explicitly turned it on (unlike the
// public.matchmaking_{type} toggles, which count as on when absent).
export function parseCaptainPickEnabled(
  value: string | null | undefined,
): boolean {
  return value === "true";
}

export function parseCaptainPickSeconds(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) {
    return DEFAULT_CAPTAIN_PICK_SECONDS;
  }

  const trimmed = typeof value === "string" ? value.trim() : value;
  if (trimmed === "") {
    return DEFAULT_CAPTAIN_PICK_SECONDS;
  }

  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds)) {
    return DEFAULT_CAPTAIN_PICK_SECONDS;
  }

  return Math.min(
    MAX_CAPTAIN_PICK_SECONDS,
    Math.max(MIN_CAPTAIN_PICK_SECONDS, Math.floor(seconds)),
  );
}
