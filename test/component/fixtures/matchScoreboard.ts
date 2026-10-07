export function scoreboardFixture(stats = true, bestOf = 1) {
  const stat = (kills: number) => ({
    kills, deaths: 10, assists: 3, rounds_played: 20, damage: 1800,
    hs_kills: 6, two_kill_rounds: 2, flashes_thrown: 12, flash_assists: 2,
    enemies_flashed: 8, he_throws: 4, he_damage: 180, he_team_damage: 0,
    molotov_throws: 3, molotov_damage: 90, shots: 240, hits: 70,
    trade_kills: 3, traded_deaths: 2, rounds_t: 10, rounds_ct: 10,
    kills_t: 12, kills_ct: kills - 12, deaths_t: 5, deaths_ct: 5,
  });
  const member = (id: string, kills: number) => ({
    steam_id: id,
    player: {
      steam_id: id, name: `Player ${id}`,
      match_stats: stats ? [stat(kills)] : [],
      match_map_stats: stats ? [{ ...stat(kills + 1), match_map_id: "ancient", deaths: 5 }] : [],
      match_map_hltv: stats ? [{ match_map_id: "ancient", kast_pct: 75, rounds_played: 20 }] : [],
    },
  });
  return {
    id: "fixture-match", status: "Finished", created_at: "2026-09-26T17:20:00Z", lineup_1_id: "alpha", lineup_2_id: "beta",
    options: { best_of: bestOf, type: "Competitive" },
    lineup_1: { id: "alpha", name: "Alpha", lineup_players: [member("11", 30), member("12", 20)] },
    lineup_2: { id: "beta", name: "Beta", lineup_players: [member("21", 25), member("22", 10)] },
    match_maps: [{ id: "ancient", map: { name: "de_ancient" }, lineup_1_score: stats ? 13 : 0, lineup_2_score: stats ? 7 : 0, winning_lineup_id: stats ? "alpha" : null },
      ...(bestOf > 1 ? [{ id: "custom", map: { name: "workshop_raw", label: "Mini Dust2" }, lineup_1_score: 0, lineup_2_score: 0, winning_lineup_id: null }] : [])],
  };
}
