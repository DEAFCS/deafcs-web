<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, Medal } from "lucide-vue-next";
import gql from "graphql-tag";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { eloTierColor } from "~/utils/eloTier";

type LeaderboardMode = "Competitive" | "Wingman" | "Duel";

interface LeaderboardPlayer {
  player_steam_id: string;
  player_name: string;
  player_avatar_url: string | null;
  player_country: string | null;
  value: number;
  rank: number;
}

interface ModeState {
  players: LeaderboardPlayer[];
  loading: boolean;
  requestError: boolean;
}

const modes: Array<{
  value: LeaderboardMode;
  alias: "competitive" | "wingman" | "duel";
  color: string;
}> = [
  { value: "Competitive", alias: "competitive", color: "#F99E2F" },
  { value: "Wingman", alias: "wingman", color: "#D946EF" },
  { value: "Duel", alias: "duel", color: "#22D3EE" },
];

const TOP_PLAYERS_QUERY = gql`
  query HomeModeTopPlayers(
    $category: String!
    $window_days: Int!
    $exclude_tournaments: Boolean!
    $role: String
    $season_id: uuid
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
      }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
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
      }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
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
      }
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
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
  query: { type: selectedMode.value },
}));

function formatElo(value: number): string {
  return Math.round(value).toLocaleString();
}

function normalizeRows(rows: any[] | undefined): LeaderboardPlayer[] {
  return (rows ?? []).slice(0, 5).map((row, index) => ({
    player_steam_id: String(row.player_steam_id),
    player_name: String(row.player_name ?? ""),
    player_avatar_url: row.player_avatar_url ?? null,
    player_country: row.player_country ?? null,
    value: Number(row.value),
    rank: index + 1,
  }));
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
    const response = await getGraphqlClient().query({
      query: TOP_PLAYERS_QUERY,
      variables: {
        category: "elo",
        window_days: 0,
        exclude_tournaments: false,
        role: null,
        season_id: null,
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

void fetchTopPlayers();
</script>

<template>
  <Card
    class="flex min-w-0 flex-col overflow-hidden border-border/70 bg-card/40 p-5 shadow-none"
  >
    <div class="flex items-center gap-3">
      <Medal
        class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
        aria-hidden="true"
      />
      <div class="min-w-0">
        <h3
          class="font-mono text-xs font-bold uppercase tracking-[0.16em] text-foreground"
        >
          Top Players
        </h3>
        <p class="mt-0.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-muted-foreground">
          {{ selectedMode }} · All time
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
</template>
