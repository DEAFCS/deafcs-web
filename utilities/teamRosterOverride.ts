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
  lineup_players?: LineupPlayerLike[] | null;
}

interface LineupPlayerLike {
  steam_id?: string | number | null;
  roster_image_url_snapshot?: string | null;
  player?: MatchPlayerLike | null;
}

export type AvatarOverrideLookup = (
  steamId: string | number | null | undefined,
) => string | null;

const NOOP: AvatarOverrideLookup = () => null;

function normalizeSteamId(
  steamId: string | number | null | undefined,
): string | null {
  return steamId == null ? null : String(steamId);
}

export function buildLineupAvatarOverride(
  lineup: LineupLike | null | undefined,
): AvatarOverrideLookup {
  if (!lineup || !lineup.team_id) return NOOP;
  const entries = lineup.team?.roster ?? [];
  if (entries.length === 0) return NOOP;
  const map = new Map<string, string>();
  for (const e of entries) {
    const steamId = normalizeSteamId(e.player_steam_id);
    if (steamId && e.roster_image_url) {
      map.set(steamId, e.roster_image_url);
    }
  }
  if (map.size === 0) return NOOP;
  return (steamId) => {
    if (steamId == null) return null;
    return map.get(normalizeSteamId(steamId) ?? "") ?? null;
  };
}

interface MatchLike {
  is_tournament_match?: boolean | null;
  tournament_brackets?: Array<{
    stage?: {
      tournament?: {
        status?: string | null;
      } | null;
    } | null;
  }> | null;
}

const UNLOCKED_TOURNAMENT_STATUSES = new Set(["Setup", "RegistrationOpen"]);

export function isTournamentRosterLocked(
  status: string | null | undefined,
): boolean {
  return !UNLOCKED_TOURNAMENT_STATUSES.has(status ?? "");
}

export function tournamentStatusForMatch(
  match: MatchLike | null | undefined,
): string | null {
  return match?.tournament_brackets?.[0]?.stage?.tournament?.status ?? null;
}

export function matchUsesHistoricalRosterSnapshot(
  match: MatchLike | null | undefined,
): boolean {
  return (
    !!(match?.is_tournament_match || match?.tournament_brackets?.length) &&
    isTournamentRosterLocked(tournamentStatusForMatch(match))
  );
}

// Only an unlocked tournament may let PlayerDisplay inspect current roster
// fields. Locked tournaments receive their persisted snapshot as an explicit
// override; keeping this false prevents a NULL legacy snapshot from falling
// through to today's general roster image.
export function matchAllowsRosterImage(
  match: MatchLike | null | undefined,
): boolean {
  const isTournamentMatch = !!(
    match?.is_tournament_match || match?.tournament_brackets?.length
  );
  return isTournamentMatch && !matchUsesHistoricalRosterSnapshot(match);
}

function buildLineupSnapshotAvatarOverride(
  lineup: LineupLike | null | undefined,
): AvatarOverrideLookup {
  const members = lineup?.lineup_players ?? [];
  if (members.length === 0) return NOOP;
  const map = new Map<string, string>();
  for (const member of members) {
    const steamId = normalizeSteamId(member.steam_id);
    if (steamId && member.roster_image_url_snapshot) {
      map.set(steamId, member.roster_image_url_snapshot);
    }
  }
  if (map.size === 0) return NOOP;
  return (steamId) => {
    if (steamId == null) return null;
    return map.get(normalizeSteamId(steamId) ?? "") ?? null;
  };
}

export function buildMatchLineupAvatarOverride(
  match: MatchLike | null | undefined,
  lineup: LineupLike | null | undefined,
): AvatarOverrideLookup {
  if (matchUsesHistoricalRosterSnapshot(match)) {
    return buildLineupSnapshotAvatarOverride(lineup);
  }
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
  const historicalSnapshot = matchUsesHistoricalRosterSnapshot(match)
    ? buildLineupSnapshotAvatarOverride(lineup)(
        steamId ?? player?.steam_id,
      )
    : null;
  const allowRosterImage = matchAllowsRosterImage(match);
  const teamRosterImage = allowRosterImage
    ? buildLineupAvatarOverride(lineup)(steamId ?? player?.steam_id)
    : null;
  const path =
    historicalSnapshot ||
    teamRosterImage ||
    (allowRosterImage ? player?.roster_image_url : null) ||
    player?.custom_avatar_url ||
    player?.avatar_url;
  return resolveAvatarUrl(path, apiDomain);
}

interface TournamentLike {
  status?: string | null;
}

interface TournamentTeamLike {
  team?: {
    roster?: RosterEntry[] | null;
  } | null;
  roster?: Array<{
    player_steam_id?: string | number | null;
    roster_image_url_snapshot?: string | null;
    player?: MatchPlayerLike | null;
  }> | null;
}

export function tournamentAllowsCurrentRosterImage(
  tournament: TournamentLike | null | undefined,
): boolean {
  return !isTournamentRosterLocked(tournament?.status);
}

export function resolveTournamentPlayerAvatarUrl(
  tournament: TournamentLike | null | undefined,
  tournamentTeam: TournamentTeamLike | null | undefined,
  player: MatchPlayerLike | null | undefined,
  apiDomain: string | null | undefined,
  rosterMember?: {
    player_steam_id?: string | number | null;
    roster_image_url_snapshot?: string | null;
  } | null,
): string | null {
  const steamId = player?.steam_id;
  const normalizedSteamId = normalizeSteamId(steamId);
  const member =
    (normalizedSteamId &&
    rosterMember &&
    normalizeSteamId(rosterMember.player_steam_id) === normalizedSteamId
      ? rosterMember
      : tournamentTeam?.roster?.find(
          (entry) =>
            normalizedSteamId != null &&
            normalizeSteamId(entry.player_steam_id) === normalizedSteamId,
        )) ?? null;

  if (isTournamentRosterLocked(tournament?.status)) {
    return resolveAvatarUrl(
      member?.roster_image_url_snapshot ||
        player?.custom_avatar_url ||
        player?.avatar_url,
      apiDomain,
    );
  }

  const teamRosterEntry = tournamentTeam?.team?.roster?.find(
    (entry) =>
      normalizedSteamId != null &&
      normalizeSteamId(entry.player_steam_id) === normalizedSteamId,
  );
  return resolveAvatarUrl(
    teamRosterEntry?.roster_image_url ||
      player?.roster_image_url ||
      player?.custom_avatar_url ||
      player?.avatar_url,
    apiDomain,
  );
}
