// "Last 7 days" community records for the signed-in homepage. Pure, so the
// rules are unit-tested (test/components/weeklyRecords.test.ts).
//
// Inputs are per player per match rows for finished DEAFCS Competitive
// matches of the last 7 days: v_player_match_rating (rounds, ADR, rating)
// and player_match_stats_v (kills, headshot kills). Records are shown for
// fun only; nothing here is awarded.

// Rate-based records (rating, ADR, headshot %) only count players with
// enough play behind the number, so one lucky short match cannot top them.
export const RATE_MIN_MATCHES = 3;
export const RATE_MIN_ROUNDS = 50;
// Headshot % also needs a fair number of kills.
export const HS_MIN_KILLS = 30;
export const RECORD_PLACES = 3;

export type RatingRow = {
  steam_id: string;
  match_id: string;
  adr: number | string | null;
  hltv_rating: number | string | null;
  rounds_played: number | null;
};

export type StatsRow = {
  steam_id: string;
  match_id: string;
  kills: number | null;
  hs_kills: number | null;
};

export type RecordKey = "rating" | "adr" | "kills" | "hs" | "matches" | "match_kills";

export type RecordEntry = {
  steamId: string;
  value: number;
  display: string;
  detail: string;
  matchId?: string;
};

export type WeeklyRecord = {
  key: RecordKey;
  title: string;
  unit: string;
  rule: string | null;
  entries: RecordEntry[];
};

type PlayerTotals = {
  steamId: string;
  matches: Set<string>;
  rounds: number;
  ratingRounds: number;
  adrRounds: number;
  kills: number;
  hsKills: number;
};

const num = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const plural = (count: number, word: "match" | "round") =>
  `${count} ${count === 1 ? word : word === "match" ? "matches" : "rounds"}`;

function rank(
  players: PlayerTotals[],
  value: (p: PlayerTotals) => number,
  display: (v: number) => string,
  detail: (p: PlayerTotals) => string,
): RecordEntry[] {
  return players
    .map((p) => ({ p, v: value(p) }))
    .filter(({ v }) => Number.isFinite(v) && v > 0)
    .sort(
      (a, b) =>
        b.v - a.v ||
        b.p.matches.size - a.p.matches.size ||
        a.p.steamId.localeCompare(b.p.steamId),
    )
    .slice(0, RECORD_PLACES)
    .map(({ p, v }) => ({ steamId: p.steamId, value: v, display: display(v), detail: detail(p) }));
}

export function weeklyRecords(
  ratings: RatingRow[],
  stats: StatsRow[],
  matchMr: Record<string, number | null | undefined>,
): WeeklyRecord[] {
  const players = new Map<string, PlayerTotals>();
  const player = (steamId: string) => {
    let p = players.get(steamId);
    if (!p) {
      p = { steamId, matches: new Set(), rounds: 0, ratingRounds: 0, adrRounds: 0, kills: 0, hsKills: 0 };
      players.set(steamId, p);
    }
    return p;
  };

  // Rounds of each match (its longest-playing player), to tell regulation
  // from overtime for the single-match kills record.
  const matchRounds = new Map<string, number>();
  for (const row of ratings) {
    const steamId = String(row.steam_id);
    const rounds = num(row.rounds_played);
    if (!rounds) continue;
    const p = player(steamId);
    p.matches.add(row.match_id);
    p.rounds += rounds;
    p.ratingRounds += num(row.hltv_rating) * rounds;
    p.adrRounds += num(row.adr) * rounds;
    matchRounds.set(row.match_id, Math.max(matchRounds.get(row.match_id) ?? 0, rounds));
  }

  let bestMatches: Array<RecordEntry> = [];
  for (const row of stats) {
    const steamId = String(row.steam_id);
    const kills = num(row.kills);
    const p = player(steamId);
    p.matches.add(row.match_id);
    p.kills += kills;
    p.hsKills += num(row.hs_kills);

    const mr = num(matchMr[row.match_id]) || 12;
    const rounds = matchRounds.get(row.match_id) ?? 0;
    if (kills > 0 && rounds > 0 && rounds <= mr * 2) {
      bestMatches.push({
        steamId,
        value: kills,
        display: String(kills),
        detail: `in ${plural(rounds, "round")}`,
        matchId: row.match_id,
      });
    }
  }
  bestMatches = bestMatches
    .sort((a, b) => b.value - a.value || a.steamId.localeCompare(b.steamId))
    .slice(0, RECORD_PLACES);

  const all = [...players.values()];
  const rated = all.filter((p) => p.matches.size >= RATE_MIN_MATCHES && p.rounds >= RATE_MIN_ROUNDS);
  const matchesDetail = (p: PlayerTotals) => plural(p.matches.size, "match");
  const rateRule = `Min. ${RATE_MIN_MATCHES} matches and ${RATE_MIN_ROUNDS} rounds`;

  return [
    {
      key: "rating",
      title: "Top rating",
      unit: "Rating",
      rule: rateRule,
      entries: rank(rated, (p) => p.ratingRounds / p.rounds, (v) => v.toFixed(2), matchesDetail),
    },
    {
      key: "adr",
      title: "Highest ADR",
      unit: "ADR",
      rule: rateRule,
      entries: rank(rated, (p) => p.adrRounds / p.rounds, (v) => v.toFixed(1), matchesDetail),
    },
    {
      key: "kills",
      title: "Most kills",
      unit: "Kills",
      rule: null,
      entries: rank(all, (p) => p.kills, (v) => String(v), matchesDetail),
    },
    {
      key: "hs",
      title: "Best headshot %",
      unit: "HS%",
      rule: `${rateRule}, ${HS_MIN_KILLS} kills`,
      entries: rank(
        rated.filter((p) => p.kills >= HS_MIN_KILLS),
        (p) => (p.hsKills / p.kills) * 100,
        (v) => `${Math.round(v)}%`,
        (p) => `${p.kills} kills`,
      ),
    },
    {
      key: "matches",
      title: "Most matches",
      unit: "Matches",
      rule: null,
      entries: rank(all, (p) => p.matches.size, (v) => String(v), (p) => plural(p.rounds, "round")),
    },
    {
      key: "match_kills",
      title: "Most kills in one match",
      unit: "Kills",
      rule: "Regulation time only, no overtime",
      entries: bestMatches,
    },
  ].filter((record) => record.entries.length > 0) as WeeklyRecord[];
}
