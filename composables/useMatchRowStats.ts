import { ref, watch, type Ref } from "vue";
import gql from "graphql-tag";
import { useApolloClient } from "@vue/apollo-composable";

const tournamentMatchRowStatsQuery = gql`
  query TournamentMatchRowStats($matchIds: [uuid!]!) {
    player_match_stats_v(where: { match_id: { _in: $matchIds } }) {
      match_id
      steam_id
      kills
      deaths
      assists
      damage
      rounds_played
    }
    v_player_match_rating(where: { match_id: { _in: $matchIds } }) {
      match_id
      steam_id
      hltv_rating
    }
  }
`;

function playerForSteamId(match: any, steamId: string) {
  for (const lineup of [match?.lineup_1, match?.lineup_2]) {
    const row = (lineup?.lineup_players ?? []).find(
      (entry: any) =>
        String(entry?.player?.steam_id ?? entry?.steam_id ?? "") === steamId,
    );
    if (row) return row.player ?? row;
  }
  return null;
}

// Current 5Stack tournament rows choose one MVP candidate per visible match,
// ranking canonical HLTV rating first and kills second. Keeping the query
// scoped to the current page avoids loading every tournament player's stats.
export function useMatchRowStats(matches: Ref<any[]>) {
  const { client } = useApolloClient();
  const topPlayerByMatch = ref<Map<string, any>>(new Map());
  const statsByMatch = ref<Map<string, any>>(new Map());
  const ratingByMatch = ref<Map<string, number>>(new Map());
  let request = 0;

  watch(
    matches,
    async (pageMatches) => {
      const currentRequest = ++request;
      const ids = pageMatches.map((match) => String(match?.id ?? "")).filter(Boolean);
      if (!ids.length) {
        topPlayerByMatch.value = new Map();
        statsByMatch.value = new Map();
        ratingByMatch.value = new Map();
        return;
      }

      try {
        const { data } = await client.query({
          query: tournamentMatchRowStatsQuery,
          variables: { matchIds: ids },
          fetchPolicy: "network-only",
        });
        if (currentRequest !== request) return;

        const ratings = new Map<string, number>();
        for (const row of (data as any)?.v_player_match_rating ?? []) {
          if (row.match_id == null || row.steam_id == null || row.hltv_rating == null) continue;
          ratings.set(`${row.match_id}:${row.steam_id}`, Number(row.hltv_rating));
        }

        const candidates = new Map<string, any[]>();
        for (const row of (data as any)?.player_match_stats_v ?? []) {
          if (row.match_id == null || row.steam_id == null) continue;
          const matchId = String(row.match_id);
          const steamId = String(row.steam_id);
          const list = candidates.get(matchId) ?? [];
          list.push({
            ...row,
            rating: ratings.get(`${matchId}:${steamId}`) ?? null,
          });
          candidates.set(matchId, list);
        }

        const players = new Map<string, any>();
        const stats = new Map<string, any>();
        const matchRatings = new Map<string, number>();
        for (const match of pageMatches) {
          const matchId = String(match.id);
          const top = [...(candidates.get(matchId) ?? [])].sort((a, b) => {
            const ratingDiff = Number(b.rating ?? -1) - Number(a.rating ?? -1);
            return ratingDiff || Number(b.kills ?? 0) - Number(a.kills ?? 0);
          })[0];
          if (!top) continue;
          const player = playerForSteamId(match, String(top.steam_id));
          players.set(matchId, {
            steam_id: String(top.steam_id),
            name: player?.name ?? String(top.steam_id),
            avatar_url: player?.avatar_url ?? null,
          });
          stats.set(matchId, top);
          if (top.rating != null) matchRatings.set(matchId, Number(top.rating));
        }

        topPlayerByMatch.value = players;
        statsByMatch.value = stats;
        ratingByMatch.value = matchRatings;
      } catch {
        if (currentRequest !== request) return;
        topPlayerByMatch.value = new Map();
        statsByMatch.value = new Map();
        ratingByMatch.value = new Map();
      }
    },
    { immediate: true },
  );

  return { topPlayerByMatch, statsByMatch, ratingByMatch };
}
