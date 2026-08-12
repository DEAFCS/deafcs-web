export type MatchMapScopeCandidate = {
  status?: string | null;
  winning_lineup_id?: string | null;
  lineup_1_score?: number | null;
  lineup_2_score?: number | null;
  rounds?: Array<{ round?: number | string | null }> | null;
};

const PLAYED_OR_IN_PROGRESS_STATUSES = new Set([
  "Live",
  "Overtime",
  "Paused",
  "WaitingForTV",
  "UploadingDemo",
  "Finished",
  "Surrendered",
]);

const AUTHORITATIVE_PRE_PLAY_STATUSES = new Set([
  "Scheduled",
  "Warmup",
  "Knife",
]);

export function hasMatchMapPlayEvidence(
  matchMap: MatchMapScopeCandidate | null | undefined,
): boolean {
  if (!matchMap) return false;

  if (matchMap.winning_lineup_id) return true;
  if (Number(matchMap.lineup_1_score ?? 0) > 0) return true;
  if (Number(matchMap.lineup_2_score ?? 0) > 0) return true;

  return (matchMap.rounds ?? []).some((round) => {
    const roundNumber = Number(round?.round);
    return Number.isFinite(roundNumber) && roundNumber > 0;
  });
}

export function isStatsEligibleMatchMap(
  matchMap: MatchMapScopeCandidate | null | undefined,
): boolean {
  if (!matchMap) return false;

  if (PLAYED_OR_IN_PROGRESS_STATUSES.has(matchMap.status ?? "")) {
    return true;
  }

  if (AUTHORITATIVE_PRE_PLAY_STATUSES.has(matchMap.status ?? "")) {
    return false;
  }

  // Unknown/null legacy statuses, plus canceled historical maps, may have
  // incomplete status metadata. Only concrete recorded play revives them.
  return hasMatchMapPlayEvidence(matchMap);
}

export function statsEligibleMatchMaps<T extends MatchMapScopeCandidate>(
  matchMaps: readonly T[] | null | undefined,
): T[] {
  return (matchMaps ?? []).filter(isStatsEligibleMatchMap);
}

export function nextSelectedStatsMapId(
  selectedStatsMapId: string | null,
  clickedMapId: string,
): string | null {
  return selectedStatsMapId === clickedMapId ? null : clickedMapId;
}

export function validSelectedStatsMapId(
  selectedStatsMapId: string | null,
  eligibleMapIds: readonly string[],
): string | null {
  if (!selectedStatsMapId) return null;
  return eligibleMapIds.includes(selectedStatsMapId)
    ? selectedStatsMapId
    : null;
}
