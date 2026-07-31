export const AWARD_TIERS = ["mvp", "gold", "silver", "bronze", "special"] as const;

export type AwardTier = (typeof AWARD_TIERS)[number];
export type AwardScopeKind =
  | "global"
  | "tournament"
  | "event"
  | "elo_season"
  | "league_season";

export interface AwardCatalogAward {
  id: string;
  name: string;
  description?: string | null;
  tier: string;
  image_url?: string | null;
  archived_at?: string | null;
  tournament_id?: string | null;
  event_id?: string | null;
  elo_season_id?: string | null;
  league_season_id?: string | null;
  tournament?: { id: string; name: string } | null;
  event?: { id: string; name: string } | null;
  elo_season?: { id: string; number: number } | null;
  league_season?: { id: string; name?: string | null; season_number: number } | null;
  occurrences?: Array<{
    recipients_aggregate?: {
      aggregate?: { count?: number | null } | null;
    } | null;
  }> | null;
}

export interface AwardCatalogGroup {
  kind: AwardScopeKind;
  ownerKey: string;
  ownerName: string | null;
  awards: AwardCatalogAward[];
}

const SCOPE_ORDER: AwardScopeKind[] = [
  "global",
  "tournament",
  "event",
  "elo_season",
  "league_season",
];

export function activeGrantCount(award: AwardCatalogAward): number {
  return (award.occurrences || []).reduce(
    (total, occurrence) =>
      total + (occurrence.recipients_aggregate?.aggregate?.count || 0),
    0,
  );
}

export function awardScope(award: AwardCatalogAward): {
  kind: AwardScopeKind;
  ownerKey: string;
  ownerName: string | null;
} {
  if (award.tournament_id) {
    return {
      kind: "tournament",
      ownerKey: award.tournament_id,
      ownerName: award.tournament?.name || null,
    };
  }
  if (award.event_id) {
    return {
      kind: "event",
      ownerKey: award.event_id,
      ownerName: award.event?.name || null,
    };
  }
  if (award.elo_season_id) {
    return {
      kind: "elo_season",
      ownerKey: award.elo_season_id,
      ownerName:
        award.elo_season?.number == null
          ? null
          : `Season ${award.elo_season.number}`,
    };
  }
  if (award.league_season_id) {
    return {
      kind: "league_season",
      ownerKey: award.league_season_id,
      ownerName:
        award.league_season?.name ||
        (award.league_season?.season_number == null
          ? null
          : `Season ${award.league_season.season_number}`),
    };
  }
  return { kind: "global", ownerKey: "global", ownerName: null };
}

export function filterAwards(
  awards: AwardCatalogAward[],
  search: string,
  tier: string,
): AwardCatalogAward[] {
  const needle = search.trim().toLocaleLowerCase();
  return awards.filter((award) => {
    if (award.archived_at) return false;
    if (tier !== "all" && award.tier !== tier) return false;
    if (!needle) return true;
    return `${award.name} ${award.description || ""}`
      .toLocaleLowerCase()
      .includes(needle);
  });
}

export function groupAwards(awards: AwardCatalogAward[]): AwardCatalogGroup[] {
  const groups = new Map<string, AwardCatalogGroup>();
  for (const award of awards) {
    const scope = awardScope(award);
    const key = `${scope.kind}:${scope.ownerKey}`;
    const group = groups.get(key);
    if (group) group.awards.push(award);
    else groups.set(key, { ...scope, awards: [award] });
  }

  return [...groups.values()].sort((a, b) => {
    const scopeOrder = SCOPE_ORDER.indexOf(a.kind) - SCOPE_ORDER.indexOf(b.kind);
    if (scopeOrder) return scopeOrder;
    return (a.ownerName || "").localeCompare(b.ownerName || "");
  });
}
