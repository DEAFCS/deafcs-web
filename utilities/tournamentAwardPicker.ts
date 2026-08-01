export type TournamentAwardPlacement = 0 | 1 | 2 | 3;

export type TournamentAwardTier = "mvp" | "gold" | "silver" | "bronze";

export interface TournamentAwardDefinition {
  id: string;
  name: string;
  description?: string | null;
  tier: string;
  silhouette?: number | null;
  image_url?: string | null;
  system_key?: string | null;
  archived_at?: string | null;
  tournament_id?: string | null;
  event_id?: string | null;
  elo_season_id?: string | null;
  league_season_id?: string | null;
}

export interface TournamentAwardSlotRow {
  id?: string;
  tournament_id?: string;
  slot: string;
  award_id: string;
  custom_name?: string | null;
  silhouette_override?: number | null;
  image_override?: string | null;
  award?: TournamentAwardDefinition | null;
}

export type TournamentAwardSelection = Partial<
  Record<TournamentAwardPlacement, string>
>;

export const TOURNAMENT_AWARD_PLACEMENTS = [
  {
    placement: 1,
    slot: "champion",
    label: "Champion award",
    shortLabel: "Champion",
    tier: "gold",
    systemKey: "tournament_gold",
  },
  {
    placement: 2,
    slot: "runner_up",
    label: "Runner-up award",
    shortLabel: "Runner-up",
    tier: "silver",
    systemKey: "tournament_silver",
  },
  {
    placement: 3,
    slot: "third_place",
    label: "Third-place award",
    shortLabel: "Third Place",
    tier: "bronze",
    systemKey: "tournament_bronze",
  },
  {
    placement: 0,
    slot: "mvp",
    label: "MVP award",
    shortLabel: "MVP",
    tier: "mvp",
    systemKey: "tournament_mvp",
  },
] as const satisfies ReadonlyArray<{
  placement: TournamentAwardPlacement;
  slot: string;
  label: string;
  shortLabel: string;
  tier: TournamentAwardTier;
  systemKey: string;
}>;

export function tournamentMvpEnabled(
  matchType?: string | null,
  minPlayersPerLineup?: number | null,
): boolean {
  if (typeof minPlayersPerLineup === "number") {
    return minPlayersPerLineup === 5;
  }
  return matchType === "Competitive";
}

export function eligibleTournamentAward(
  award: TournamentAwardDefinition,
  tournamentId?: string | null,
): boolean {
  if (
    award.archived_at ||
    award.event_id ||
    award.elo_season_id ||
    award.league_season_id
  ) {
    return false;
  }

  return !award.tournament_id || award.tournament_id === tournamentId;
}

export function awardsForTournamentPlacement(
  awards: TournamentAwardDefinition[],
  placement: TournamentAwardPlacement,
  tournamentId?: string | null,
): TournamentAwardDefinition[] {
  const config = TOURNAMENT_AWARD_PLACEMENTS.find(
    (candidate) => candidate.placement === placement,
  );
  if (!config) return [];

  return awards
    .filter(
      (award) =>
        award.tier === config.tier &&
        eligibleTournamentAward(award, tournamentId),
    )
    .sort((left, right) => {
      const leftBuiltIn = left.system_key ? 0 : 1;
      const rightBuiltIn = right.system_key ? 0 : 1;
      return (
        leftBuiltIn - rightBuiltIn || left.name.localeCompare(right.name)
      );
    });
}

export function builtInAwardForPlacement(
  awards: TournamentAwardDefinition[],
  placement: TournamentAwardPlacement,
): TournamentAwardDefinition | null {
  const config = TOURNAMENT_AWARD_PLACEMENTS.find(
    (candidate) => candidate.placement === placement,
  );
  if (!config) return null;
  return awards.find((award) => award.system_key === config.systemKey) ?? null;
}

export function placementForTournamentAwardSlot(
  slot: string,
): TournamentAwardPlacement | null {
  return (
    TOURNAMENT_AWARD_PLACEMENTS.find((candidate) => candidate.slot === slot)
      ?.placement ?? null
  );
}

export function effectiveTournamentAwardSelection(
  awards: TournamentAwardDefinition[],
  slots: TournamentAwardSlotRow[] = [],
): TournamentAwardSelection {
  const selection: TournamentAwardSelection = {};

  for (const config of TOURNAMENT_AWARD_PLACEMENTS) {
    const slot = slots.find((candidate) => candidate.slot === config.slot);
    const fallback = builtInAwardForPlacement(awards, config.placement);
    const awardId = slot?.award_id || fallback?.id;
    if (awardId) selection[config.placement] = awardId;
  }

  return selection;
}

export function tournamentAwardSelectionOverrides(
  selection: TournamentAwardSelection,
  awards: TournamentAwardDefinition[],
  mvpEnabled: boolean,
): Array<{ placement: TournamentAwardPlacement; awardId: string }> {
  return TOURNAMENT_AWARD_PLACEMENTS.flatMap((config) => {
    if (config.placement === 0 && !mvpEnabled) return [];
    const awardId = selection[config.placement];
    const fallback = builtInAwardForPlacement(awards, config.placement);
    if (!awardId || awardId === fallback?.id) return [];
    return [{ placement: config.placement, awardId }];
  });
}

export function sameTournamentAwardSelection(
  left: TournamentAwardSelection,
  right: TournamentAwardSelection,
  mvpEnabled: boolean,
): boolean {
  return TOURNAMENT_AWARD_PLACEMENTS.every(
    (config) =>
      (config.placement === 0 && !mvpEnabled) ||
      left[config.placement] === right[config.placement],
  );
}
