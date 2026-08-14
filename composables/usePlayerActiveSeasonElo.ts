import { reactive, ref, computed } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { gql } from "@apollo/client/core";
import {
  ACTIVE_SEASON_ELO_FALLBACK,
  type PlayerModeElo,
} from "~/utilities/playerModeElo";

export type { PlayerModeElo } from "~/utilities/playerModeElo";

// Shared season-aware ELO resolver for the player-display hover/badge
// (PlayerElo, mounted via PlayerDisplay.vue and LineupOverviewRow.vue's
// mobile row). players.elo's season branch (get_player_elo.sql's
// get_player_season_elo_by_type) falls back to the player's lifetime-latest
// player_elo row when they have no row for the active season -- this
// mirrors pages/players/[id].vue's profile-summary fix (season row wins,
// else the season starting ELO of 5000, never the stale lifetime value) so
// both surfaces agree, without duplicating a second implementation.
//
// Unlike the profile page (one player), PlayerDisplay is mounted by the
// dozens on list-heavy pages (team rosters, chat, lobbies). A naive
// per-mount query would be a query-per-badge storm, so results are cached
// module-wide by steamId+seasonId (see CACHE_TTL_MS below for how long),
// and requests arriving in the same tick are coalesced into a single
// batched query.

const SEASON_ELO_DISPLAY_DEFAULT = ACTIVE_SEASON_ELO_FALLBACK;

// ---- active season (fetched once, shared by every consumer) --------------
const SEASONS_QUERY = gql`
  query PlayerActiveSeasonEloSeasons {
    seasons(order_by: { starts_at: desc }) {
      id
      starts_at
      ends_at
    }
  }
`;

type SeasonRow = { id: string; starts_at: string; ends_at: string | null };

const seasons = ref<SeasonRow[]>([]);
let seasonsLoaded = false;
let seasonsLoading: Promise<void> | null = null;

// Mirrors pages/players/[id].vue's activeSeason computed: the season
// containing "now", falling back to the latest when off-season.
const activeSeasonId = computed<string | null>(() => {
  const now = Date.now();
  const current = seasons.value.find(
    (s) =>
      new Date(s.starts_at).getTime() <= now &&
      (!s.ends_at || new Date(s.ends_at).getTime() > now),
  );
  return current?.id ?? seasons.value[0]?.id ?? null;
});

function loadSeasons(
  apolloClient: ReturnType<typeof useApolloClient>["client"],
) {
  if (seasonsLoaded || seasonsLoading) return;
  seasonsLoading = apolloClient
    .query({ query: SEASONS_QUERY, fetchPolicy: "network-only" })
    .then(({ data }) => {
      seasons.value = ((data as any)?.seasons ?? []) as SeasonRow[];
      seasonsLoaded = true;
    })
    .catch(() => {
      seasons.value = [];
    })
    .finally(() => {
      seasonsLoading = null;
    });
}

// ---- per-player season ELO: batched + cached across every mount ----------
const SEASON_ELO_QUERY = gql`
  query PlayersActiveSeasonElo($where: v_player_elo_bool_exp!) {
    v_player_elo(
      where: $where
      distinct_on: [player_steam_id, type]
      order_by: [
        { player_steam_id: asc }
        { type: asc }
        { match_created_at: desc }
      ]
    ) {
      player_steam_id
      type
      updated_elo
    }
  }
`;

type SeasonEloByType = { Competitive?: number; Wingman?: number; Duel?: number };
type CacheEntry = { data: SeasonEloByType; fetchedAt: number };

// A player's real season ELO can change at any time during the browser
// session (they finish a match). Caching a fulfilled value forever would
// mean a hover that resolved 5000 (or a stale 5131) before their next match
// could never show the real post-match value without a full page reload.
// Instead of polling (nothing here runs on a timer) or refetching on every
// render, entries expire after this TTL: reads within the window are
// served from cache for free, a read past the window triggers exactly one
// background refetch (deduped via `inFlight`) while still rendering the
// last known value -- no flicker back to "loading"/lifetime elo, and no
// permanent staleness.
const CACHE_TTL_MS = 30_000;

// Keyed by `${steamId}:${seasonId}`. Absence means "never fetched yet".
const resultCache = reactive(new Map<string, CacheEntry>());
const inFlight = new Set<string>();
let pendingIds: Set<string> = new Set();
let pendingSeasonId: string | null = null;
let flushScheduled = false;

function cacheKey(steamId: string, seasonId: string): string {
  return `${steamId}:${seasonId}`;
}

function isFresh(entry: CacheEntry | undefined): boolean {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

async function flush(
  apolloClient: ReturnType<typeof useApolloClient>["client"],
) {
  const ids = Array.from(pendingIds);
  const seasonId = pendingSeasonId;
  pendingIds = new Set();
  pendingSeasonId = null;
  flushScheduled = false;
  if (!ids.length || !seasonId) return;

  try {
    const { data } = await apolloClient.query({
      query: SEASON_ELO_QUERY,
      variables: {
        where: {
          player_steam_id: { _in: ids },
          season_id: { _eq: seasonId },
        },
      },
      fetchPolicy: "network-only",
    });
    const rows = ((data as any)?.v_player_elo ?? []) as Array<{
      player_steam_id: string | number;
      type: string;
      updated_elo: number;
    }>;
    const byPlayer = new Map<string, SeasonEloByType>();
    for (const row of rows) {
      const sid = String(row.player_steam_id);
      const entry: SeasonEloByType = byPlayer.get(sid) ?? {};
      if (
        (row.type === "Competitive" ||
          row.type === "Wingman" ||
          row.type === "Duel") &&
        typeof row.updated_elo === "number"
      ) {
        entry[row.type] = row.updated_elo;
      }
      byPlayer.set(sid, entry);
    }
    const fetchedAt = Date.now();
    for (const id of ids) {
      resultCache.set(cacheKey(id, seasonId), {
        data: byPlayer.get(id) ?? {},
        fetchedAt,
      });
    }
  } catch {
    const fetchedAt = Date.now();
    for (const id of ids) {
      resultCache.set(cacheKey(id, seasonId), { data: {}, fetchedAt });
    }
  } finally {
    for (const id of ids) {
      inFlight.delete(cacheKey(id, seasonId));
    }
  }
}

function requestSeasonElo(
  apolloClient: ReturnType<typeof useApolloClient>["client"],
  steamId: string,
  seasonId: string,
) {
  const key = cacheKey(steamId, seasonId);
  if (inFlight.has(key)) return;
  inFlight.add(key);
  pendingSeasonId = seasonId;
  pendingIds.add(steamId);
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => flush(apolloClient));
  }
}

export function usePlayerActiveSeasonElo() {
  const { client: apolloClient } = useApolloClient();
  const appSettings = useApplicationSettingsStore();

  function eloForPlayer(
    player:
      | { steam_id?: string | number | null; elo?: PlayerModeElo | null }
      | null
      | undefined,
  ): PlayerModeElo | null | undefined {
    if (!appSettings.seasonsEnabled) {
      return player?.elo;
    }

    loadSeasons(apolloClient);
    const seasonId = activeSeasonId.value;
    if (!seasonId || !player?.steam_id) {
      return player?.elo;
    }

    const steamId = String(player.steam_id);
    const key = cacheKey(steamId, seasonId);
    const entry = resultCache.get(key);
    if (!isFresh(entry)) {
      // Expired (or never fetched) -- (re)request in the background. If we
      // already have a prior value, keep showing it below instead of
      // flickering back to the optimistic player.elo while this resolves.
      requestSeasonElo(apolloClient, steamId, seasonId);
    }
    if (!entry) {
      return player?.elo; // nothing resolved yet at all
    }

    return {
      competitive:
        typeof entry.data.Competitive === "number"
          ? entry.data.Competitive
          : SEASON_ELO_DISPLAY_DEFAULT,
      wingman:
        typeof entry.data.Wingman === "number"
          ? entry.data.Wingman
          : SEASON_ELO_DISPLAY_DEFAULT,
      duel:
        typeof entry.data.Duel === "number"
          ? entry.data.Duel
          : SEASON_ELO_DISPLAY_DEFAULT,
    };
  }

  return { eloForPlayer };
}
