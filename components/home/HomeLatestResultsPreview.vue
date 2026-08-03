<script setup lang="ts">
import { ref } from "vue";
import {
  ArrowRight,
  CalendarDays,
  Film,
  ListChecks,
} from "lucide-vue-next";
import { e_match_status_enum, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import TimeAgo from "~/components/TimeAgo.vue";
import MatchTypeBadge from "~/components/MatchTypeBadge.vue";
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
const loading = ref(true);
const requestError = ref(false);
let fetchGeneration = 0;

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

function mapContextFor(match: MatchResult): string {
  const maps = match.match_maps
    .map((matchMap) =>
      cleanMapName(matchMap.map?.label || matchMap.map?.name || ""),
    )
    .filter(Boolean);

  return maps.join(" · ");
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
            limit: 2,
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
      2,
    );
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("[home-latest-results] failed to load results", error);
    matches.value = [];
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
        v-else-if="matches.length === 0"
        class="flex min-h-32 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
      >
        <p class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
          No completed matches yet
        </p>
      </div>

      <div v-else class="space-y-3">
        <NuxtLink
          v-for="match in matches"
          :key="match.id"
          :to="{ name: 'matches-id', params: { id: match.id } }"
          class="group/result block min-w-0 rounded-md border border-border/60 bg-background/25 p-3 outline-none transition-colors hover:border-[hsl(var(--tac-amber)/0.4)] hover:bg-background/40 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          :aria-label="`View ${match.lineup_1.name} versus ${match.lineup_2.name}`"
        >
          <div class="flex min-w-0 items-center justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="inline-flex min-w-0 items-center rounded-md border border-border/70 bg-muted/35 px-2.5 py-1 font-mono text-[0.62rem] font-bold uppercase leading-none tracking-[0.14em] text-foreground"
              >
                BO{{ match.options?.best_of ?? 1 }}
              </span>
              <span
                v-if="clipCountFor(match) > 0"
                class="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/70 bg-muted/35 px-2 py-1 font-mono text-[0.6rem] font-bold uppercase leading-none tracking-[0.14em] text-foreground/80"
                :aria-label="`${clipCountFor(match)} public highlights`"
              >
                <Film class="h-3 w-3 shrink-0" aria-hidden="true" />
                <span class="tabular-nums">
                  {{ clipCountFor(match) }}
                </span>
              </span>
            </div>
            <TimeAgo
              :date="
                match.effective_at ||
                match.ended_at ||
                match.created_at
              "
              class="shrink-0 text-xs text-muted-foreground"
            />
          </div>

          <div
            v-if="match.options?.type || mapContextFor(match)"
            class="mt-3 flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground"
            :title="mapContextFor(match)"
          >
            <ListChecks class="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            <MatchTypeBadge
              v-if="match.options?.type"
              :type="match.options.type"
              size="compact"
            />
            <span
              v-if="match.options?.type && mapContextFor(match)"
              aria-hidden="true"
              class="text-muted-foreground/60"
            >
              ·
            </span>
            <span
              v-if="mapContextFor(match)"
              class="min-w-0 flex-1 break-words leading-relaxed"
            >
              {{ mapContextFor(match) }}
            </span>
          </div>

          <div class="mt-3 space-y-2">
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">
                {{ match.lineup_1.name }}
              </span>
              <span
                class="shrink-0 text-xl font-bold tabular-nums"
                :class="scoreColorFor(match, 'lineup1')"
              >
                {{ scoreFor(match)?.lineup1 ?? "—" }}
              </span>
            </div>
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">
                {{ match.lineup_2.name }}
              </span>
              <span
                class="shrink-0 text-xl font-bold tabular-nums"
                :class="scoreColorFor(match, 'lineup2')"
              >
                {{ scoreFor(match)?.lineup2 ?? "—" }}
              </span>
            </div>
          </div>
        </NuxtLink>

      </div>

      <NuxtLink
        v-if="!loading"
        to="/matches"
        class="mt-3 inline-flex min-h-10 items-center gap-1 self-start rounded-md font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
      >
        View all results
        <ArrowRight class="h-3 w-3" aria-hidden="true" />
      </NuxtLink>
    </div>
  </Card>
</template>
