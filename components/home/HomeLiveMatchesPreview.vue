<script setup lang="ts">
import { ref } from "vue";
import { Activity, ListChecks, RotateCcw } from "lucide-vue-next";
import { e_match_status_enum, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import cleanMapName from "~/utilities/cleanMapName";

interface LiveMatchMap {
  id: string;
  is_current_map: boolean | null;
  lineup_1_score: number | null;
  lineup_2_score: number | null;
  map: {
    name: string;
    label: string | null;
  };
}

interface LiveMatch {
  id: string;
  created_at: string;
  started_at: string | null;
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
  match_maps: LiveMatchMap[];
}

const matches = ref<LiveMatch[]>([]);
const loading = ref(true);
const requestError = ref(false);
let fetchGeneration = 0;

function displayedMap(match: LiveMatch): LiveMatchMap | null {
  return (
    match.match_maps.find((matchMap) => matchMap.is_current_map) ??
    match.match_maps[0] ??
    null
  );
}

function matchContext(match: LiveMatch): string {
  const matchMap = displayedMap(match);
  const mapName = cleanMapName(
    matchMap?.map?.label || matchMap?.map?.name || "",
  );
  return [match.options?.type, mapName].filter(Boolean).join(" · ");
}

async function fetchLiveMatches() {
  const generation = ++fetchGeneration;
  loading.value = true;
  requestError.value = false;

  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        matches: [
          {
            where: {
              status: { _eq: e_match_status_enum.Live },
            },
            order_by: [
              { started_at: order_by.desc_nulls_last },
              { created_at: order_by.desc },
            ],
            limit: 2,
          },
          {
            id: true,
            created_at: true,
            started_at: true,
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
                is_current_map: true,
                lineup_1_score: true,
                lineup_2_score: true,
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
    matches.value = ((data as { matches?: LiveMatch[] }).matches ?? []).slice(
      0,
      2,
    );
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("[home-live-matches] failed to load live matches", error);
    matches.value = [];
    requestError.value = true;
  } finally {
    if (generation === fetchGeneration) {
      loading.value = false;
    }
  }
}

void fetchLiveMatches();
</script>

<template>
  <Card
    class="flex min-w-0 flex-col overflow-hidden border-border/70 bg-card/40 p-5 shadow-none"
  >
    <div class="flex items-center gap-3">
      <Activity
        class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
        aria-hidden="true"
      />
      <h3
        class="font-mono text-xs font-bold uppercase tracking-[0.16em] text-foreground"
      >
        Live Matches
      </h3>
    </div>

    <div class="mt-4 flex flex-1 flex-col" aria-live="polite">
      <div v-if="loading" class="space-y-3" aria-label="Loading live matches">
        <div
          v-for="index in 2"
          :key="index"
          class="rounded-md border border-border/60 bg-background/25 p-3"
        >
          <Skeleton class="h-3 w-24" />
          <Skeleton class="mt-3 h-4 w-3/4" />
          <Skeleton class="mt-2 h-4 w-2/3" />
        </div>
      </div>

      <div
        v-else-if="requestError"
        class="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
        role="alert"
      >
        <p
          class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground"
        >
          Unable to load live matches
        </p>
        <button
          type="button"
          class="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          @click="fetchLiveMatches"
        >
          <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      </div>

      <div
        v-else-if="matches.length === 0"
        class="flex min-h-40 flex-1 items-center justify-center rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-5 text-center"
      >
        <p class="text-sm text-muted-foreground">
          No matches are live right now.
        </p>
      </div>

      <div v-else class="space-y-3">
        <NuxtLink
          v-for="match in matches"
          :key="match.id"
          :to="{ name: 'matches-id', params: { id: match.id } }"
          class="group/live block min-w-0 rounded-md border border-border/60 bg-background/25 p-3 outline-none transition-colors hover:border-[hsl(var(--tac-amber)/0.4)] hover:bg-background/40 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
          :aria-label="`View live match ${match.lineup_1.name} versus ${match.lineup_2.name}`"
        >
          <div class="flex min-w-0 items-center justify-between gap-3">
            <span
              class="inline-flex items-center gap-1.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-red-400"
            >
              <span
                class="size-1.5 rounded-full bg-red-500 shadow-[0_0_7px_rgb(239_68_68/0.7)]"
                aria-hidden="true"
              ></span>
              Live
            </span>
            <span
              v-if="match.options?.best_of"
              class="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              BO{{ match.options.best_of }}
            </span>
          </div>

          <div
            v-if="matchContext(match)"
            class="mt-3 flex min-w-0 items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground"
            :title="matchContext(match)"
          >
            <ListChecks class="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
            <span class="truncate">{{ matchContext(match) }}</span>
          </div>

          <div class="mt-3 space-y-2">
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">
                {{ match.lineup_1.name }}
              </span>
              <span class="shrink-0 text-xl font-bold tabular-nums">
                {{ displayedMap(match)?.lineup_1_score ?? "—" }}
              </span>
            </div>
            <div class="flex min-w-0 items-center justify-between gap-3">
              <span class="truncate text-sm font-semibold text-foreground">
                {{ match.lineup_2.name }}
              </span>
              <span class="shrink-0 text-xl font-bold tabular-nums">
                {{ displayedMap(match)?.lineup_2_score ?? "—" }}
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </Card>
</template>
