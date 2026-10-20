<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, Medal } from "lucide-vue-next";
import gql from "graphql-tag";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { eloTierColor } from "~/utils/eloTier";
import { matchTypeRgb } from "~/utilities/matchTypeColors";
import { tacticalCardHeadingClasses } from "~/utilities/tacticalClasses";

type LeaderboardMode = "Competitive" | "Wingman" | "Duel";

interface LeaderboardPlayer {
  player_steam_id: string;
  player_name: string;
  player_avatar_url: string | null;
  player_custom_avatar_url: string | null;
  player_country: string | null;
  value: number;
  rank: number;
}

interface Season {
  id: string;
  starts_at: string;
  ends_at: string | null;
}

interface ModeState {
  players: LeaderboardPlayer[];
  loading: boolean;
  requestError: boolean;
}

const props = withDefaults(
  defineProps<{
    // glass: the signed-in dashboard's three columns (same data and rules),
    // each with the viewer's own rank under the top 5.
    variant?: "tabs" | "all" | "glass";
    viewerSteamId?: string | null;
  }>(),
  {
    variant: "tabs",
  },
);

const modes: Array<{
  value: LeaderboardMode;
  alias: "competitive" | "wingman" | "duel";
  color: string;
}> = [
  { value: "Competitive", alias: "competitive", color: `rgb(${matchTypeRgb("Competitive")})` },
  { value: "Wingman", alias: "wingman", color: `rgb(${matchTypeRgb("Wingman")})` },
  { value: "Duel", alias: "duel", color: `rgb(${matchTypeRgb("Duel")})` },
];

const TOP_PLAYERS_QUERY = gql`
  query HomeModeTopPlayers(
    $category: String!
    $window_days: Int!
    $exclude_tournaments: Boolean!
    $role: String
    $season_id: uuid
    $elo_view: String!
    $limit: Int
    $offset: Int
    $order_by: [leaderboard_entries_order_by!]
  ) {
    competitive: get_leaderboard(
      args: {
        _category: $category
        _window_days: $window_days
        _match_type: "Competitive"
        _exclude_tournaments: $exclude_tournaments
        _role: $role
        _season_id: $season_id
        _elo_view: $elo_view
      }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
      player_custom_avatar_url
      player_country
      value
    }
    wingman: get_leaderboard(
      args: {
        _category: $category
        _window_days: $window_days
        _match_type: "Wingman"
        _exclude_tournaments: $exclude_tournaments
        _role: $role
        _season_id: $season_id
        _elo_view: $elo_view
      }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
      player_custom_avatar_url
      player_country
      value
    }
    duel: get_leaderboard(
      args: {
        _category: $category
        _window_days: $window_days
        _match_type: "Duel"
        _exclude_tournaments: $exclude_tournaments
        _role: $role
        _season_id: $season_id
        _elo_view: $elo_view
      }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
      player_custom_avatar_url
      player_country
      value
    }
  }
`;

const selectedMode = ref<LeaderboardMode>("Competitive");
const modeStates = ref<Record<LeaderboardMode, ModeState>>({
  Competitive: { players: [], loading: true, requestError: false },
  Wingman: { players: [], loading: true, requestError: false },
  Duel: { players: [], loading: true, requestError: false },
});
let fetchGeneration = 0;

const activeState = computed(() => modeStates.value[selectedMode.value]);
const leaderboardLink = computed(() => ({
  path: "/leaderboard",
  query: { tab: "elo", period: "0", type: selectedMode.value },
}));

function leaderboardLinkFor(mode: LeaderboardMode) {
  return {
    path: "/leaderboard",
    query: { tab: "elo", period: "0", type: mode },
  };
}

function formatElo(value: number): string {
  return Math.round(value).toLocaleString();
}

function normalizeRows(rows: any[] | undefined): LeaderboardPlayer[] {
  return (rows ?? []).slice(0, 5).map((row, index) => ({
    player_steam_id: String(row.player_steam_id),
    player_name: String(row.player_name ?? ""),
    player_avatar_url: row.player_avatar_url ?? null,
    player_custom_avatar_url: row.player_custom_avatar_url ?? null,
    player_country: row.player_country ?? null,
    value: Number(row.value),
    rank: index + 1,
  }));
}

// Mirrors pages/leaderboard.vue's own active-season resolution exactly: the
// season whose date range currently contains "now". Falls back to All Time
// (season_id = null, same as today's behavior) when seasons are disabled or
// none is currently active -- never a hard error.
const SEASONS_QUERY = gql`
  query HomeTopPlayersSeasons {
    seasons(order_by: { starts_at: desc }) {
      id
      starts_at
      ends_at
    }
  }
`;

function resolveActiveSeasonId(seasons: Season[]): string | null {
  const now = Date.now();
  const active = seasons.find(
    (s) =>
      new Date(s.starts_at).getTime() <= now &&
      (!s.ends_at || new Date(s.ends_at).getTime() > now),
  );
  return active?.id ?? null;
}

async function fetchActiveSeasonId(): Promise<string | null> {
  if (!useApplicationSettingsStore().seasonsEnabled) return null;
  try {
    const { data } = await getGraphqlClient().query({
      query: SEASONS_QUERY,
      fetchPolicy: "cache-first",
    });
    return resolveActiveSeasonId((data as any)?.seasons ?? []);
  } catch {
    return null;
  }
}

function selectAdjacentMode(direction: -1 | 1) {
  const current = modes.findIndex((mode) => mode.value === selectedMode.value);
  const next = Math.min(Math.max(current + direction, 0), modes.length - 1);
  selectedMode.value = modes[next].value;
}

async function fetchTopPlayers() {
  const generation = ++fetchGeneration;
  for (const mode of modes) {
    modeStates.value[mode.value].loading = true;
    modeStates.value[mode.value].requestError = false;
  }

  try {
    const seasonId = await fetchActiveSeasonId();
    if (generation !== fetchGeneration) return;

    if (props.variant === "glass") void fetchOwnRanks(seasonId, generation);

    const response = await getGraphqlClient().query({
      query: TOP_PLAYERS_QUERY,
      variables: {
        category: "elo",
        window_days: 0,
        exclude_tournaments: false,
        role: null,
        season_id: seasonId,
        elo_view: "current",
        limit: 5,
        offset: 0,
        order_by: [{ value: "desc" }],
      },
      fetchPolicy: "network-only",
      errorPolicy: "all",
    });

    if (generation !== fetchGeneration) return;

    const data = (response.data ?? {}) as Record<string, any[] | undefined>;
    const errors = ((response as any).errors ?? []) as Array<{
      path?: Array<string | number>;
    }>;

    for (const mode of modes) {
      const aliasFailed = errors.some(
        (error) => error.path?.[0] === mode.alias,
      );
      const rows = data[mode.alias];
      modeStates.value[mode.value] = {
        players: aliasFailed ? [] : normalizeRows(rows),
        loading: false,
        requestError: aliasFailed || !Array.isArray(rows),
      };
    }
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("[home-top-players] failed to load leaderboards", error);
    for (const mode of modes) {
      modeStates.value[mode.value] = {
        players: [],
        loading: false,
        requestError: true,
      };
    }
  }
}

// --- glass variant: the viewer's own rank per mode -------------------------
// Same get_player_leaderboard_rank call (and season) as PlayerLeaderboardRank
// and the leaderboard page. It ranks with SQL RANK(), so tied players share a
// place; the top 5 use the same competition ranking below.
type OwnRank = { rank: number; total: number; value: number };

const OWN_RANK_QUERY = gql`
  query HomeOwnLeaderboardRanks($season_id: uuid, $steam_id: String!, $steam_id_pk: bigint!) {
    competitive: get_player_leaderboard_rank(
      args: { _category: "elo", _window_days: 0, _match_type: "Competitive", _exclude_tournaments: false, _elo_view: "current", _season_id: $season_id, _player_steam_id: $steam_id }
    ) { rank total value }
    wingman: get_player_leaderboard_rank(
      args: { _category: "elo", _window_days: 0, _match_type: "Wingman", _exclude_tournaments: false, _elo_view: "current", _season_id: $season_id, _player_steam_id: $steam_id }
    ) { rank total value }
    duel: get_player_leaderboard_rank(
      args: { _category: "elo", _window_days: 0, _match_type: "Duel", _exclude_tournaments: false, _elo_view: "current", _season_id: $season_id, _player_steam_id: $steam_id }
    ) { rank total value }
    players_by_pk(steam_id: $steam_id_pk) { steam_id name avatar_url custom_avatar_url country }
  }
`;

// undefined: still loading; null: unranked in that mode.
const ownRanks = ref<Record<LeaderboardMode, OwnRank | null | undefined>>({
  Competitive: undefined,
  Wingman: undefined,
  Duel: undefined,
});
const viewerPlayer = ref<Record<string, any> | null>(null);

async function fetchOwnRanks(seasonId: string | null, generation: number) {
  const steamId = props.viewerSteamId ? String(props.viewerSteamId) : "";
  if (!steamId) return;
  try {
    const { data } = await getGraphqlClient().query({
      query: OWN_RANK_QUERY,
      variables: { season_id: seasonId, steam_id: steamId, steam_id_pk: steamId },
      fetchPolicy: "network-only",
    });
    if (generation !== fetchGeneration) return;
    viewerPlayer.value = (data as any)?.players_by_pk ?? null;
    for (const mode of modes) {
      const row = (data as any)?.[mode.alias]?.[0];
      ownRanks.value[mode.value] = row
        ? { rank: Number(row.rank), total: Number(row.total), value: Number(row.value) }
        : null;
    }
  } catch (error) {
    console.error("[home-top-players] failed to load your ranks", error);
    for (const mode of modes) ownRanks.value[mode.value] = null;
  }
}

// Competition ranking within the top 5 (1, 1, 3), matching RANK().
function placeOf(players: LeaderboardPlayer[], player: LeaderboardPlayer) {
  return 1 + players.filter((other) => other.value > player.value).length;
}

const isViewer = (steamId: string) =>
  !!props.viewerSteamId && String(props.viewerSteamId) === steamId;

void fetchTopPlayers();
</script>

<template>
  <Card
    v-if="props.variant === 'tabs'"
    class="flex min-w-0 flex-col overflow-hidden border-border/70 bg-card/40 p-5 shadow-none"
  >
    <div class="flex items-center gap-3">
      <Medal
        class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
        aria-hidden="true"
      />
      <div class="min-w-0">
        <h3 :class="tacticalCardHeadingClasses">
          Top Players
        </h3>
        <p class="mt-0.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted-foreground">
          {{ selectedMode }} · Current Season
        </p>
      </div>
    </div>

    <div
      class="mt-4 grid min-w-0 grid-cols-3 rounded-md border border-border/70 bg-background/25 p-1"
      role="tablist"
      aria-label="Leaderboard mode"
    >
      <button
        v-for="mode in modes"
        :id="`top-players-tab-${mode.value.toLowerCase()}`"
        :key="mode.value"
        type="button"
        role="tab"
        class="relative min-h-10 min-w-0 rounded px-1.5 font-mono text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground outline-none transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:text-[0.62rem]"
        :class="
          selectedMode === mode.value ? 'bg-muted/35 text-foreground' : ''
        "
        :aria-selected="selectedMode === mode.value"
        :aria-controls="`top-players-panel-${mode.value.toLowerCase()}`"
        @click="selectedMode = mode.value"
        @keydown.left.prevent="selectAdjacentMode(-1)"
        @keydown.right.prevent="selectAdjacentMode(1)"
      >
        <span class="truncate">{{ mode.value }}</span>
        <span
          v-if="selectedMode === mode.value"
          class="absolute inset-x-2 bottom-0 h-0.5 rounded-full"
          :style="{ backgroundColor: mode.color }"
          aria-hidden="true"
        ></span>
      </button>
    </div>

    <div
      :id="`top-players-panel-${selectedMode.toLowerCase()}`"
      class="mt-3 flex flex-1 flex-col"
      role="tabpanel"
      :aria-labelledby="`top-players-tab-${selectedMode.toLowerCase()}`"
      aria-live="polite"
    >
      <div
        v-if="activeState.loading"
        class="space-y-1"
        :aria-label="`Loading ${selectedMode} top players`"
      >
        <div
          v-for="rank in 5"
          :key="rank"
          class="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_3.75rem] items-center gap-2 border-b border-border/40 py-1.5 last:border-0"
        >
          <Skeleton class="h-3 w-4" />
          <div class="flex min-w-0 items-center gap-2">
            <Skeleton class="size-8 shrink-0" />
            <Skeleton class="h-3 w-2/3" />
          </div>
          <Skeleton class="ml-auto h-3 w-12" />
        </div>
      </div>

      <div
        v-else-if="activeState.requestError"
        class="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
        role="alert"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
          Unable to load this section
        </p>
        <button
          type="button"
          class="mt-3 min-h-10 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          @click="fetchTopPlayers"
        >
          Try again
        </button>
      </div>

      <div
        v-else-if="activeState.players.length === 0"
        class="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
          No ranked players yet
        </p>
      </div>

      <ol v-else class="min-w-0">
        <li
          v-for="player in activeState.players"
          :key="player.player_steam_id"
          class="border-b border-border/40 last:border-0"
        >
          <NuxtLink
            :to="{
              name: 'players-id',
              params: { id: player.player_steam_id },
            }"
            class="grid min-h-11 min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-1 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
            :aria-label="`View rank ${player.rank}, ${player.player_name}, ${formatElo(player.value)} ELO`"
          >
            <span
              class="text-center font-mono text-[0.65rem] font-bold tabular-nums text-muted-foreground"
            >
              {{ player.rank }}
            </span>
            <PlayerDisplay
              :player="{
                steam_id: player.player_steam_id,
                name: player.player_name,
                avatar_url: player.player_avatar_url,
                custom_avatar_url: player.player_custom_avatar_url,
                country: player.player_country,
              }"
              :show-elo="false"
              :show-online="false"
              :show-role="false"
              :linkable="false"
              truncate-name
              compact
              size="xs"
              class="min-w-0"
            />
            <span
              class="shrink-0 text-right font-mono text-xs font-bold tabular-nums"
              :style="{ color: eloTierColor(player.value) }"
            >
              {{ formatElo(player.value) }}
            </span>
          </NuxtLink>
        </li>
      </ol>

      <NuxtLink
        v-if="!activeState.loading"
        :to="leaderboardLink"
        class="mt-auto inline-flex min-h-10 items-center gap-1 self-start rounded-md pt-3 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
      >
        View full leaderboard
        <ArrowRight class="h-3 w-3" aria-hidden="true" />
      </NuxtLink>
    </div>
  </Card>

  <!-- Three columns from lg up; one swipeable row of columns below that. -->
  <div
    v-else-if="props.variant === 'glass'"
    class="-mx-1 flex min-w-0 snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0"
    data-testid="home-elo-leaderboard"
  >
    <section
      v-for="mode in modes"
      :key="mode.value"
      :aria-labelledby="`elo-col-${mode.alias}`"
      class="flex w-[86%] min-w-0 shrink-0 snap-start flex-col rounded-lg border border-border/70 bg-background/35 p-3 sm:w-[60%] lg:w-auto"
      :data-testid="`home-elo-${mode.alias}`"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <h3 :id="`elo-col-${mode.alias}`" class="flex min-w-0 items-center gap-2 text-sm font-bold">
          <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: mode.color }" aria-hidden="true"></span>
          <span class="truncate">
            {{ mode.value === "Competitive" ? "5v5" : mode.value === "Wingman" ? "2v2" : "1v1" }}
            <span class="font-semibold text-muted-foreground">{{ mode.value }}</span>
          </span>
        </h3>
        <NuxtLink
          :to="leaderboardLinkFor(mode.value)"
          class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground hover:text-foreground"
          :aria-label="`Full ${mode.value} leaderboard`"
        >
          Full leaderboard
          <ArrowRight class="size-3" aria-hidden="true" />
        </NuxtLink>
      </div>

      <div v-if="modeStates[mode.value].loading" class="grid gap-1">
        <Skeleton v-for="rank in 6" :key="rank" class="h-10 w-full rounded-md" />
      </div>
      <div
        v-else-if="modeStates[mode.value].requestError"
        class="flex flex-1 items-center justify-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-6 text-xs text-muted-foreground"
        role="alert"
      >
        Unable to load.
        <button type="button" class="font-semibold text-[hsl(var(--tac-amber))] hover:underline" @click="fetchTopPlayers">
          Try again
        </button>
      </div>
      <p
        v-else-if="modeStates[mode.value].players.length === 0"
        class="flex flex-1 items-center justify-center rounded-md border border-dashed border-border/70 px-3 py-6 text-xs text-muted-foreground"
      >
        No ranked players yet.
      </p>
      <template v-else>
        <ol class="grid gap-1">
          <li v-for="player in modeStates[mode.value].players" :key="player.player_steam_id">
            <NuxtLink
              :to="{ name: 'players-id', params: { id: player.player_steam_id } }"
              class="grid min-h-10 min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-1 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
              :class="
                isViewer(player.player_steam_id)
                  ? 'border-[hsl(var(--tac-amber)/0.7)] bg-[hsl(var(--tac-amber)/0.14)]'
                  : placeOf(modeStates[mode.value].players, player) === 1
                    ? 'border-[hsl(var(--tac-amber)/0.4)] bg-[linear-gradient(90deg,hsl(var(--tac-amber)/0.12),transparent_70%)]'
                    : 'border-border/50 bg-muted/15'
              "
              :aria-label="`Rank ${placeOf(modeStates[mode.value].players, player)}, ${player.player_name}${isViewer(player.player_steam_id) ? ' (you)' : ''}, ${formatElo(player.value)} ELO`"
            >
              <span
                class="grid size-6 place-items-center rounded font-mono text-[0.68rem] font-black tabular-nums"
                :class="
                  placeOf(modeStates[mode.value].players, player) === 1
                    ? 'bg-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber-foreground))]'
                    : placeOf(modeStates[mode.value].players, player) <= 3
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground'
                "
              >{{ placeOf(modeStates[mode.value].players, player) }}</span>
              <span class="flex min-w-0 items-center gap-1.5">
                <PlayerDisplay
                  :player="{
                    steam_id: player.player_steam_id,
                    name: player.player_name,
                    avatar_url: player.player_avatar_url,
                    custom_avatar_url: player.player_custom_avatar_url,
                    country: player.player_country,
                  }"
                  :show-elo="false"
                  :show-online="false"
                  :show-role="false"
                  :linkable="false"
                  truncate-name
                  compact
                  size="xs"
                  class="min-w-0"
                />
                <span
                  v-if="isViewer(player.player_steam_id)"
                  class="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--tac-amber))]"
                >You</span>
              </span>
              <span class="text-right font-mono text-[13px] font-bold tabular-nums" :style="{ color: eloTierColor(player.value) }">
                {{ formatElo(player.value) }}
              </span>
            </NuxtLink>
          </li>
        </ol>

        <!-- The viewer's own rank, unless they are already in the top 5. -->
        <template
          v-if="
            viewerSteamId &&
            !modeStates[mode.value].players.some((p) => isViewer(p.player_steam_id))
          "
        >
          <div class="my-1 flex justify-center text-muted-foreground/50" aria-hidden="true">···</div>
          <Skeleton v-if="ownRanks[mode.value] === undefined" class="h-10 w-full rounded-md" />
          <NuxtLink
            v-else-if="ownRanks[mode.value]"
            :to="{ path: '/leaderboard', query: { tab: 'elo', period: '0', type: mode.value, player: viewerSteamId } }"
            class="grid min-h-10 min-w-0 grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-[hsl(var(--tac-amber)/0.7)] bg-[hsl(var(--tac-amber)/0.14)] px-2 py-1 outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.2)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
            :aria-label="`Your ${mode.value} rank: ${ownRanks[mode.value]!.rank} of ${ownRanks[mode.value]!.total}, ${formatElo(ownRanks[mode.value]!.value)} ELO`"
            :data-testid="`home-elo-you-${mode.alias}`"
          >
            <span class="font-mono text-[0.72rem] font-black tabular-nums text-[hsl(var(--tac-amber))]">#{{ ownRanks[mode.value]!.rank }}</span>
            <span class="flex min-w-0 items-center gap-1.5">
              <PlayerDisplay
                v-if="viewerPlayer"
                :player="viewerPlayer"
                :show-elo="false"
                :show-online="false"
                :show-role="false"
                :linkable="false"
                truncate-name
                compact
                size="xs"
                class="min-w-0"
              />
              <span class="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--tac-amber))]">You</span>
            </span>
            <span class="text-right font-mono text-[13px] font-bold tabular-nums" :style="{ color: eloTierColor(ownRanks[mode.value]!.value) }">
              {{ formatElo(ownRanks[mode.value]!.value) }}
            </span>
          </NuxtLink>
          <p
            v-else
            class="flex min-h-10 items-center justify-between gap-2 rounded-md border border-dashed border-border/70 px-2.5 text-xs text-muted-foreground"
            :data-testid="`home-elo-unranked-${mode.alias}`"
          >
            <span>You are unranked in {{ mode.value }}</span>
            <span class="font-mono font-bold">-</span>
          </p>
        </template>
      </template>
    </section>
  </div>

  <div
    v-else
    class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
  >
    <Card
      v-for="mode in modes"
      :key="mode.value"
      class="flex min-w-0 flex-col overflow-hidden border-border/70 bg-card/40 p-5 shadow-none md:last:col-span-2 lg:last:col-span-1"
    >
      <div class="flex items-center gap-3">
        <Medal
          class="h-4 w-4 shrink-0"
          :style="{ color: mode.color }"
          aria-hidden="true"
        />
        <div class="min-w-0">
          <h3 :class="tacticalCardHeadingClasses">
            {{ mode.value }}
          </h3>
          <p
            class="mt-0.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted-foreground"
          >
            Top 5 · Current Season
          </p>
        </div>
      </div>

      <div class="mt-4 flex flex-1 flex-col" aria-live="polite">
        <div
          v-if="modeStates[mode.value].loading"
          class="space-y-1"
          :aria-label="`Loading ${mode.value} top players`"
        >
          <div
            v-for="rank in 5"
            :key="rank"
            class="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_3.75rem] items-center gap-2 border-b border-border/40 py-1.5 last:border-0"
          >
            <Skeleton class="h-3 w-4" />
            <div class="flex min-w-0 items-center gap-2">
              <Skeleton class="size-8 shrink-0" />
              <Skeleton class="h-3 w-2/3" />
            </div>
            <Skeleton class="ml-auto h-3 w-12" />
          </div>
        </div>

        <div
          v-else-if="modeStates[mode.value].requestError"
          class="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
          role="alert"
        >
          <p
            class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground"
          >
            Unable to load this section
          </p>
          <button
            type="button"
            class="mt-3 min-h-10 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
            @click="fetchTopPlayers"
          >
            Try again
          </button>
        </div>

        <div
          v-else-if="modeStates[mode.value].players.length === 0"
          class="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
        >
          <p
            class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground"
          >
            No ranked players yet
          </p>
        </div>

        <ol v-else class="min-w-0">
          <li
            v-for="player in modeStates[mode.value].players"
            :key="player.player_steam_id"
            class="border-b border-border/40 last:border-0"
          >
            <NuxtLink
              :to="{
                name: 'players-id',
                params: { id: player.player_steam_id },
              }"
              class="grid min-h-11 min-w-0 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-1 outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
              :aria-label="`View rank ${player.rank}, ${player.player_name}, ${formatElo(player.value)} ELO`"
            >
              <span
                class="text-center font-mono text-[0.65rem] font-bold tabular-nums text-muted-foreground"
              >
                {{ player.rank }}
              </span>
              <PlayerDisplay
                :player="{
                  steam_id: player.player_steam_id,
                  name: player.player_name,
                  avatar_url: player.player_avatar_url,
                  custom_avatar_url: player.player_custom_avatar_url,
                  country: player.player_country,
                }"
                :show-elo="false"
                :show-online="false"
                :show-role="false"
                :linkable="false"
                truncate-name
                compact
                size="xs"
                class="min-w-0"
              />
              <span
                class="shrink-0 text-right font-mono text-xs font-bold tabular-nums"
                :style="{ color: eloTierColor(player.value) }"
              >
                {{ formatElo(player.value) }}
              </span>
            </NuxtLink>
          </li>
        </ol>

        <NuxtLink
          v-if="!modeStates[mode.value].loading"
          :to="leaderboardLinkFor(mode.value)"
          class="mt-auto inline-flex min-h-10 items-center gap-1 self-start rounded-md pt-3 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
        >
          View full leaderboard
          <ArrowRight class="h-3 w-3" aria-hidden="true" />
        </NuxtLink>
      </div>
    </Card>
  </div>
</template>
