import { resolveAvatarUrl } from "./avatarUrl";

interface RosterEntry {
  player_steam_id: string | number;
  roster_image_url?: string | null;
}

interface LineupLike {
  team_id?: string | null;
  team?: {
    roster?: RosterEntry[] | null;
  } | null;
}

export type AvatarOverrideLookup = (
  steamId: string | number | null | undefined,
) => string | null;

const NOOP: AvatarOverrideLookup = () => null;

export function buildLineupAvatarOverride(
  lineup: LineupLike | null | undefined,
): AvatarOverrideLookup {
  if (!lineup || !lineup.team_id) return NOOP;
  const entries = lineup.team?.roster ?? [];
  if (entries.length === 0) return NOOP;
  const map = new Map<string, string>();
  for (const e of entries) {
    if (e.roster_image_url) {
      map.set(String(e.player_steam_id), e.roster_image_url);
    }
  }
  if (map.size === 0) return NOOP;
  return (steamId) => {
    if (steamId == null) return null;
    return map.get(String(steamId)) ?? null;
  };
}

interface MatchLike {
  is_tournament_match?: boolean | null;
  tournament_brackets?: unknown[] | null;
}

// Matchmaking and Draft matches must never show a roster image (general or
// team-specific) - only real team/tournament-assigned matches may. Both a
// real persistent team and a temporary tournament-only team link to the
// match via tournament_brackets, so is_tournament_match (or its raw
// tournament_brackets fallback, for callers that select the relation
// directly instead of the computed field) is sufficient to distinguish
// "real tournament context" from MM/Draft in a single place.
export function matchAllowsRosterImage(
  match: MatchLike | null | undefined,
): boolean {
  return !!(match?.is_tournament_match || match?.tournament_brackets?.length);
}

export function buildMatchLineupAvatarOverride(
  match: MatchLike | null | undefined,
  lineup: LineupLike | null | undefined,
): AvatarOverrideLookup {
  if (!matchAllowsRosterImage(match)) return NOOP;
  return buildLineupAvatarOverride(lineup);
}

interface MatchPlayerLike {
  steam_id?: string | number | null;
  roster_image_url?: string | null;
  custom_avatar_url?: string | null;
  avatar_url?: string | null;
}

// Direct match-stat image renderers do not go through PlayerDisplay, so they
// must apply the same match-aware portrait policy themselves. Draft/MM stays
// avatar-only even if its lineup unexpectedly carries real team data.
export function resolveMatchPlayerAvatarUrl(
  match: MatchLike | null | undefined,
  lineup: LineupLike | null | undefined,
  player: MatchPlayerLike | null | undefined,
  steamId: string | number | null | undefined,
  apiDomain: string | null | undefined,
): string | null {
  const allowRosterImage = matchAllowsRosterImage(match);
  const teamRosterImage = allowRosterImage
    ? buildLineupAvatarOverride(lineup)(steamId ?? player?.steam_id)
    : null;
  const path =
    teamRosterImage ||
    (allowRosterImage ? player?.roster_image_url : null) ||
    player?.custom_avatar_url ||
    player?.avatar_url;
  return resolveAvatarUrl(path, apiDomain);
}
