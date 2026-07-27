<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Film,
  ListChecks,
} from "lucide-vue-next";
import { e_match_status_enum, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import TimeAgo from "~/components/TimeAgo.vue";
import cleanMapName from "~/utilities/cleanMapName";

interface ResultMap {
  id: string;
  lineup_1_score: number | null;
  lineup_2_score: number | null;
  winning_lineup_id: string | null;
  public_clips_count: number | null;
  map: {
    name: string;
    label: string | null;
  };
}

interface MatchResult {
  id: string;
  status: e_match_status_enum;
  effective_at: string | null;
  ended_at: string | null;
  created_at: string;
  options: {
    type: string;
    best_of: number | null;
  };
  lineup_1: {
    id: string;
    name: string;
  };
  lineup_2: {
    id: string;
    name: string;
  };
  match_maps: ResultMap[];
}

const matches = ref<MatchResult[]>([]);
const currentIndex = ref(0);
const loading = ref(true);
const requestError = ref(false);
let fetchGeneration = 0;

const currentMatch = computed(() => matches.value[currentIndex.value] ?? null);
const hasMultipleResults = computed(() => matches.value.length > 1);
const canGoPrevious = computed(() => currentIndex.value > 0);
const canGoNext = computed(
  () => currentIndex.value < matches.value.length - 1,
);

function scoreFor(match: MatchResult): { lineup1: number; lineup2: number } | null {
  if (match.match_maps.length === 0) return null;

  if (match.match_maps.length === 1) {
    const map = match.match_maps[0];
    return {
      lineup1: Number(map.lineup_1_score ?? 0),
      lineup2: Number(map.lineup_2_score ?? 0),
    };
  }

  return match.match_maps.reduce(
    (score, map) => {
      if (map.winning_lineup_id === match.lineup_1.id) score.lineup1++;
      if (map.winning_lineup_id === match.lineup_2.id) score.lineup2++;
      return score;
    },
    { lineup1: 0, lineup2: 0 },
  );
}

function clipCountFor(match: MatchResult): number {
  return match.match_maps.reduce(
    (total, map) => total + Number(map.public_clips_count ?? 0),
    0,
  );
}

function matchContextFor(match: MatchResult): string {
  const maps = match.match_maps
    .map((matchMap) =>
      cleanMapName(matchMap.map?.label || matchMap.map?.name || ""),
    )
    .filter(Boolean);

  return [match.options?.type, ...maps].filter(Boolean).join(" · ");
}

function scoreColorFor(
  match: MatchResult,
  lineup: "lineup1" | "lineup2",
): string {
  const score = scoreFor(match);
  if (!score || score.lineup1 === score.lineup2) {
    return "text-muted-foreground";
  }

  const won =
    lineup === "lineup1"
      ? score.lineup1 > score.lineup2
      : score.lineup2 > score.lineup1;
  return won ? "text-green-500" : "text-red-500";
}

function goPrevious() {
  if (canGoPrevious.value) currentIndex.value--;
}

function goNext() {
  if (canGoNext.value) currentIndex.value++;
}

async function fetchLatestResults() {
  const generation = ++fetchGeneration;
  loading.value = true;
  requestError.value = false;

  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        matches: [
          {
            where: {
              status: { _eq: e_match_status_enum.Finished },
              source: { _eq: "5stack" },
            },
            order_by: [
              { effective_at: order_by.desc_nulls_last },
              { created_at: order_by.desc },
            ],
            limit: 3,
          },
          {
            id: true,
            status: true,
            effective_at: true,
            ended_at: true,
            created_at: true,
            options: {
              type: true,
              best_of: true,
            },
            lineup_1: {
              id: true,
              name: true,
            },
            lineup_2: {
              id: true,
              name: true,
            },
            match_maps: [
              { order_by: [{ order: order_by.asc }] },
              {
                id: true,
                lineup_1_score: true,
                lineup_2_score: true,
                winning_lineup_id: true,
                public_clips_count: true,
                map: {
                  name: true,
                  label: true,
                },
              },
            ],
          },
        ],
      }),
      fetchPolicy: "network-only",
    });

    if (generation !== fetchGeneration) return;
    matches.value = ((data as { matches: MatchResult[] }).matches ?? []).slice(
      0,
      3,
    );
    currentIndex.value = 0;
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("[home-latest-results] failed to load results", error);
    matches.value = [];
    currentIndex.value = 0;
    requestError.value = true;
  } finally {
    if (generation === fetchGeneration) {
      loading.value = false;
    }
  }
}

void fetchLatestResults();
</script>

<template>
  <Card
    class="flex min-w-0 flex-col overflow-hidden border-border/70 bg-card/40 p-5 shadow-none"
  >
    <div class="flex items-center gap-3">
      <CalendarDays
        class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
        aria-hidden="true"
      />
      <h3
        class="font-mono text-xs font-bold uppercase tracking-[0.16em] text-foreground"
      >
        Latest Results
      </h3>
    </div>

    <div class="mt-4 flex flex-1 flex-col" aria-live="polite">
      <div v-if="loading" aria-label="Loading latest results">
        <Skeleton class="h-3 w-24" />
        <div class="mt-4 space-y-3">
          <div class="flex items-center justify-between gap-4">
            <Skeleton class="h-4 w-2/3" />
            <Skeleton class="h-7 w-8" />
          </div>
          <div class="flex items-center justify-between gap-4">
            <Skeleton class="h-4 w-1/2" />
            <Skeleton class="h-7 w-8" />
          </div>
        </div>
        <Skeleton class="mt-4 h-3 w-28" />
      </div>

      <div
        v-else-if="requestError"
        class="flex min-h-32 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
        role="alert"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
          Unable to load this section
        </p>
        <button
          type="button"
          class="mt-3 min-h-10 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          @click="fetchLatestResults"
        >
          Try again
        </button>
      </div>

      <div
        v-else-if="!currentMatch"
        class="flex min-h-32 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
          No completed matches yet
        </p>
      </div>

      <template v-else>
        <NuxtLink
          :to="{ name: 'matches-id', params: { id: currentMatch.id } }"
          class="group/result min-w-0 rounded-md border border-border/60 bg-background/25 p-3 outline-none transition-colors hover:border-[hsl(var(--tac-amber)/0.4)] hover:bg-background/40 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          :aria-label="`View ${currentMatch.lineup_1.name} versus ${currentMatch.lineup_2.name}`"
        >
          <div class="flex min-w-0 items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="inline-flex min-w-0 items-center rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 font-mono text-[0.62rem] font-bold uppercase leading-none tracking-[0.14em] text-foreground"
              >
                BO{{ currentMatch.options?.best_of ?? 1 }}
              </span>
              <span
                v-if="clipCountFor(currentMatch) > 0"
                class="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 py-1 font-mono text-[0.6rem] font-bold uppercase leading-none tracking-[0.14em] text-foreground/80"
                :aria-label="`${clipCountFor(currentMatch)} public highlights`"
              >
                <Film class="h-3 w-3 shrink-0" aria-hidden="true" />
                <span class="tabular-nums">
                  {{ clipCountFor(currentMatch) }}
                </span>
              </span>
            </div>
            <TimeAgo
              :date="
                currentMatch.effective_at ||
                currentMatch.ended_at ||
                currentMatch.created_at
              "
              class="shrink-0 text-xs text-muted-foreground"
            />
          </div>

          <div
            v-if="matchContextFor(currentMatch)"
            class="mt-3 flex min-w-0 items-center gap-1.5 font-mono text-[0.6rem] uppercase leading-none tracking-[0.14em] text-muted-foreground"
            :title="matchContextFor(currentMatch)"
          >
            <ListChecks class="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            <span class="truncate">{{ matchContextFor(currentMatch) }}</span>
          </div>

          <div class="mt-3 space-y-2">
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">
                {{ currentMatch.lineup_1.name }}
              </span>
              <span
                class="shrink-0 text-xl font-bold tabular-nums"
                :class="scoreColorFor(currentMatch, 'lineup1')"
              >
                {{ scoreFor(currentMatch)?.lineup1 ?? "—" }}
              </span>
            </div>
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">
                {{ currentMatch.lineup_2.name }}
              </span>
              <span
                class="shrink-0 text-xl font-bold tabular-nums"
                :class="scoreColorFor(currentMatch, 'lineup2')"
              >
                {{ scoreFor(currentMatch)?.lineup2 ?? "—" }}
              </span>
            </div>
          </div>
        </NuxtLink>

        <div
          v-if="hasMultipleResults"
          class="mt-3 flex items-center justify-center gap-3"
          aria-label="Result navigation"
        >
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background/30 text-muted-foreground outline-none transition-colors hover:border-[hsl(var(--tac-amber)/0.45)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted-foreground"
            :disabled="!canGoPrevious"
            aria-label="Show previous result"
            @click="goPrevious"
          >
            <ChevronLeft class="h-4 w-4" aria-hidden="true" />
          </button>
          <span
            class="min-w-12 text-center font-mono text-[0.65rem] font-semibold tabular-nums tracking-[0.12em] text-muted-foreground"
          >
            {{ currentIndex + 1 }} / {{ matches.length }}
          </span>
          <button
            type="button"
            class="inline-flex size-10 items-center justify-center rounded-md border border-border bg-background/30 text-muted-foreground outline-none transition-colors hover:border-[hsl(var(--tac-amber)/0.45)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-border disabled:hover:text-muted-foreground"
            :disabled="!canGoNext"
            aria-label="Show next result"
            @click="goNext"
          >
            <ChevronRight class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </template>

      <NuxtLink
        v-if="!loading"
        to="/matches"
        class="mt-auto inline-flex min-h-10 items-center gap-1 self-start rounded-md pt-3 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
      >
        View all results
        <ArrowRight class="h-3 w-3" aria-hidden="true" />
      </NuxtLink>
    </div>
  </Card>
</template>
