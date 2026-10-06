export function tournamentMatchScores(
  match: any,
): [number | null, number | null] {
  const maps = match?.match_maps ?? [];
  const playedMaps = maps.filter(
    (map: any) =>
      map?.winning_lineup_id ||
      Number(map?.lineup_1_score ?? 0) + Number(map?.lineup_2_score ?? 0) > 0,
  );
  if (!playedMaps.length) return [null, null];

  if (Number(match?.options?.best_of ?? 1) === 1) {
    return [
      Number(playedMaps[0].lineup_1_score ?? 0),
      Number(playedMaps[0].lineup_2_score ?? 0),
    ];
  }

  return [
    playedMaps.filter(
      (map: any) => map.winning_lineup_id === match?.lineup_1_id,
    ).length,
    playedMaps.filter(
      (map: any) => map.winning_lineup_id === match?.lineup_2_id,
    ).length,
  ];
}

export function supportsTournamentMvp(match: any): boolean {
  return ["Competitive", "Premier"].includes(match?.options?.type ?? "");
}
