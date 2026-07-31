export interface AwardHolderIdentity {
  steam_id?: string | null;
  id?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  short_name?: string | null;
}

export interface AwardDetailRecipient {
  id: string;
  player_steam_id?: string | null;
  team_id?: string | null;
  tournament_team_id?: string | null;
  revoked_at?: string | null;
  created_at?: string | null;
  player?: AwardHolderIdentity | null;
  team?: AwardHolderIdentity | null;
  tournament_team?: {
    id?: string | null;
    name?: string | null;
    team_id?: string | null;
    team?: AwardHolderIdentity | null;
  } | null;
  awarded_by?: AwardHolderIdentity | null;
}

export interface AwardDetailOccurrence {
  id: string;
  effective_at?: string | null;
  created_at?: string | null;
  placement?: number | null;
  source?: string | null;
  tournament_id?: string | null;
  event_id?: string | null;
  elo_season_id?: string | null;
  league_season_id?: string | null;
  tournament?: { id: string; name: string; start?: string | null } | null;
  event?: { id: string; name: string; start?: string | null } | null;
  elo_season?: { id: string; number: number } | null;
  league_season?: {
    id: string;
    name?: string | null;
    season_number?: number | null;
  } | null;
  recipients?: AwardDetailRecipient[] | null;
}

export interface AwardDetail {
  id: string;
  name: string;
  description?: string | null;
  tier: string;
  silhouette?: number | null;
  image_url?: string | null;
  system_key?: string | null;
  tournament_id?: string | null;
  event_id?: string | null;
  elo_season_id?: string | null;
  league_season_id?: string | null;
  tournament?: { id: string; name: string } | null;
  event?: { id: string; name: string } | null;
  elo_season?: { id: string; number: number } | null;
  league_season?: {
    id: string;
    name?: string | null;
    season_number?: number | null;
  } | null;
  occurrences?: AwardDetailOccurrence[] | null;
}

export interface ActiveAwardHolder {
  recipient: AwardDetailRecipient;
  occurrence: AwardDetailOccurrence;
  chronologyAt: string;
  identityKey: string;
  kind: "player" | "team";
}

export function occurrenceChronology(
  occurrence: AwardDetailOccurrence,
): string {
  return occurrence.effective_at || occurrence.created_at || "";
}

export function holderIdentity(
  recipient: AwardDetailRecipient,
): { key: string; kind: "player" | "team" } | null {
  const playerId = recipient.player_steam_id || recipient.player?.steam_id;
  if (playerId) return { key: `player:${playerId}`, kind: "player" };

  const teamId =
    recipient.team_id ||
    recipient.team?.id ||
    recipient.tournament_team?.team_id ||
    recipient.tournament_team?.team?.id ||
    recipient.tournament_team_id;
  if (teamId) return { key: `team:${teamId}`, kind: "team" };
  return null;
}

export function activeAwardHolders(award: AwardDetail): ActiveAwardHolder[] {
  const holders: ActiveAwardHolder[] = [];
  for (const occurrence of award.occurrences || []) {
    for (const recipient of occurrence.recipients || []) {
      if (recipient.revoked_at) continue;
      const identity = holderIdentity(recipient);
      if (!identity) continue;
      holders.push({
        recipient,
        occurrence,
        chronologyAt: occurrenceChronology(occurrence),
        identityKey: identity.key,
        kind: identity.kind,
      });
    }
  }
  return holders.sort((a, b) => {
    const dateDifference =
      Date.parse(b.chronologyAt || "1970-01-01") -
      Date.parse(a.chronologyAt || "1970-01-01");
    return dateDifference || b.recipient.id.localeCompare(a.recipient.id);
  });
}

export function awardDetailStats(award: AwardDetail) {
  const holders = activeAwardHolders(award);
  const dates = holders
    .map(({ chronologyAt }) => chronologyAt)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    totalActiveGrants: holders.length,
    uniqueActiveHolders: new Set(holders.map(({ identityKey }) => identityKey))
      .size,
    firstGrantAt: dates.at(0) || null,
    latestGrantAt: dates.at(-1) || null,
  };
}

export function occurrenceContext(occurrence: AwardDetailOccurrence): {
  label: string;
  to: string | null;
} {
  if (occurrence.tournament_id) {
    return {
      label: occurrence.tournament?.name || "Tournament",
      to: `/tournaments/${occurrence.tournament_id}`,
    };
  }
  if (occurrence.event_id) {
    return {
      label: occurrence.event?.name || "Event",
      to: `/events/${occurrence.event_id}`,
    };
  }
  if (occurrence.elo_season_id) {
    return {
      label:
        occurrence.elo_season?.number == null
          ? "ELO season"
          : `ELO Season ${occurrence.elo_season.number}`,
      to: "/seasons",
    };
  }
  if (occurrence.league_season_id) {
    return {
      label:
        occurrence.league_season?.name ||
        (occurrence.league_season?.season_number == null
          ? "League season"
          : `League Season ${occurrence.league_season.season_number}`),
      to: `/league/seasons/${occurrence.league_season_id}`,
    };
  }
  return { label: "Global", to: null };
}

export function awardDefinitionScope(award: AwardDetail): string {
  if (award.tournament_id) return award.tournament?.name || "Tournament";
  if (award.event_id) return award.event?.name || "Event";
  if (award.elo_season_id) {
    return award.elo_season?.number == null
      ? "ELO season"
      : `ELO Season ${award.elo_season.number}`;
  }
  if (award.league_season_id) {
    return (
      award.league_season?.name ||
      (award.league_season?.season_number == null
        ? "League season"
        : `League Season ${award.league_season.season_number}`)
    );
  }
  return "Global";
}
