<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { RotateCcw } from "lucide-vue-next";
import { useMediaQuery } from "@vueuse/core";
import { $, e_match_status_enum, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { simpleMatchFields } from "~/graphql/simpleMatchFields";
import { eloFields } from "~/graphql/eloFields";
import { playerMatchSummaryQuery } from "~/graphql/playerMatchAggStatsGraphql";
import PlayerMatchRow from "~/components/player/PlayerMatchRow.vue";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

const props = defineProps<{
  player: {
    steam_id: string;
    name?: string | null;
  } | null;
}>();

const ACTIVE_STATUSES = [
  e_match_status_enum.Veto,
  e_match_status_enum.WaitingForCheckIn,
  e_match_status_enum.WaitingForServer,
  e_match_status_enum.Live,
] as const;

const activeStatusSet = new Set<string>(ACTIVE_STATUSES);
const steamId = computed(() => String(props.player?.steam_id ?? ""));
const useCompactRow = useMediaQuery("(max-width: 1279px)");

const playerLineupFilter = {
  _or: [
    {
      lineup_1: {
        lineup_players: {
          steam_id: { _eq: $("playerId", "bigint!") },
        },
      },
    },
    {
      lineup_2: {
        lineup_players: {
          steam_id: { _eq: $("playerId", "bigint!") },
        },
      },
    },
  ],
};

const matchFields = {
  ...simpleMatchFields,
  elo_changes: [
    {
      where: {
        player_steam_id: { _eq: $("playerId", "bigint!") },
      },
    },
    eloFields,
  ],
};

const MY_MATCH_QUERY = generateQuery({
  __alias: {
    activeMatches: {
      matches: [
        {
          where: {
            _and: [
              playerLineupFilter,
              { status: { _in: [...ACTIVE_STATUSES] } },
            ],
          },
          order_by: [
            { effective_at: order_by.desc_nulls_last },
            { created_at: order_by.desc },
          ],
          limit: 1,
        },
        matchFields,
      ],
    },
    finishedMatches: {
      matches: [
        {
          where: {
            _and: [
              playerLineupFilter,
              { status: { _eq: e_match_status_enum.Finished } },
            ],
          },
          order_by: [
            { effective_at: order_by.desc_nulls_last },
            { created_at: order_by.desc },
          ],
          limit: 1,
        },
        matchFields,
      ],
    },
  },
} as any);

const selectedMatch = ref<any | null>(null);
const loading = ref(true);
const requestError = ref(false);
const summaryStats = ref<any | null>(null);
const canonicalRating = ref<number | null>(null);
let requestGeneration = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const isActive = computed(() =>
  activeStatusSet.has(String(selectedMatch.value?.status ?? "")),
);

function clearPoll() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function syncPoll() {
  clearPoll();
  if (!isActive.value) return;
  pollTimer = setInterval(() => {
    void fetchMyMatch();
  }, 15_000);
}

async function loadSummary(matchId: string) {
  try {
    const { data } = await getGraphqlClient().query({
      query: playerMatchSummaryQuery,
      variables: { steamId: steamId.value, matchIds: [matchId] },
      fetchPolicy: "network-only",
    });
    if (selectedMatch.value?.id !== matchId) return;

    summaryStats.value = (data as any)?.player_match_stats_v?.[0] ?? null;
    const rating = (data as any)?.v_player_match_rating?.[0]?.hltv_rating;
    canonicalRating.value =
      rating == null || !Number.isFinite(Number(rating))
        ? null
        : Number(rating);
  } catch {
    if (selectedMatch.value?.id !== matchId) return;
    summaryStats.value = null;
    canonicalRating.value = null;
  }
}

async function fetchMyMatch() {
  clearPoll();
  const generation = ++requestGeneration;
  if (!selectedMatch.value) loading.value = true;
  requestError.value = false;

  try {
    const { data } = await getGraphqlClient().query({
      query: MY_MATCH_QUERY,
      variables: { playerId: steamId.value },
      fetchPolicy: "network-only",
    });
    if (generation !== requestGeneration) return;

    const active = (data as any)?.activeMatches?.[0] ?? null;
    const finished = (data as any)?.finishedMatches?.[0] ?? null;
    const next = active ?? finished;
    const previousKey = selectedMatch.value
      ? `${selectedMatch.value.id}:${selectedMatch.value.status}`
      : "";
    const nextKey = next ? `${next.id}:${next.status}` : "";
    selectedMatch.value = next;

    if (previousKey !== nextKey) {
      summaryStats.value = null;
      canonicalRating.value = null;
      if (next) await loadSummary(next.id);
    }
  } catch (error) {
    if (generation !== requestGeneration) return;
    console.error("[home-my-match] failed to load match", error);
    requestError.value = true;
  } finally {
    if (generation === requestGeneration) {
      loading.value = false;
      syncPoll();
    }
  }
}

watch(
  steamId,
  (id) => {
    requestGeneration++;
    clearPoll();
    selectedMatch.value = null;
    summaryStats.value = null;
    canonicalRating.value = null;
    if (id) void fetchMyMatch();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  requestGeneration++;
  clearPoll();
});
</script>

<template>
  <Card
    v-if="loading"
    class="min-w-0 border-border/80 bg-card/45 p-4 shadow-none"
  >
    <div class="grid grid-cols-[2.5rem_5rem_1fr] items-center gap-3">
      <Skeleton class="size-9" />
      <Skeleton class="h-8 w-full" />
      <Skeleton class="h-8 w-full" />
    </div>
  </Card>

  <Card
    v-else-if="requestError && !selectedMatch"
    class="flex min-h-20 items-center justify-between gap-4 border-border/80 bg-card/45 px-4 py-3 shadow-none"
    role="alert"
  >
    <span class="text-sm text-muted-foreground">Unable to load your match</span>
    <button
      type="button"
      class="inline-flex min-h-9 items-center gap-1.5 rounded px-2 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
      @click="fetchMyMatch"
    >
      <RotateCcw class="size-3" aria-hidden="true" />
      Retry
    </button>
  </Card>

  <Card
    v-else-if="!selectedMatch"
    class="flex min-h-20 items-center border-border/80 bg-card/45 px-4 py-3 text-sm text-muted-foreground shadow-none"
  >
    No matches yet
  </Card>

  <PlayerMatchRow
    v-else
    :key="`${selectedMatch.id}:${selectedMatch.status}`"
    :match="selectedMatch"
    :player="player"
    :canonical-rating="canonicalRating"
    :collapsed-agg="summaryStats"
    :compact="useCompactRow"
    :allow-overview-drawer="false"
    class="animate-in fade-in slide-in-from-bottom-2"
  />
</template>
