<script setup lang="ts">
// The /watch match rail: All / Live / Upcoming / Results filters over one
// horizontally scrolling row of match cards, results grouped by day.
//
// Adapted from 5Stack web (https://github.com/5stackgg/web,
// components/watch/WatchTicker.vue), MIT License, Copyright (c) 2025
// 5Stack.gg -- see LICENSE. DEAFCS changes: no stream stage (/watch only
// announces streams; they play on the match page), DEAFCS match cards
// (WatchMatchCard), and live cards count automatic player POV streams too.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { useI18n } from "vue-i18n";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-vue-next";
import { $, order_by } from "~/generated/zeus";
import { generateQuery, generateSubscription } from "~/graphql/graphqlGen";
import { watchTickerMatchFields } from "~/graphql/watchTickerFields";
import HorizontalScrollRow from "~/components/common/HorizontalScrollRow.vue";
import WatchMatchCard from "~/components/watch/WatchMatchCard.vue";
import WatchSegmented from "~/components/watch/WatchSegmented.vue";
import { Skeleton } from "~/components/ui/skeleton";
import FadeSwap from "~/components/ui/transitions/FadeSwap.vue";
import { seededSubscribe } from "~/utilities/seededSubscribe";
import { fetchMatchAutoStreams, type MatchAutoStream } from "~/composables/useTwitchApi";
import { autoPovEligible, mergeMatchStreams } from "~/utilities/matchStreams";
import {
  TICKER_LIVE_STATUSES,
  TICKER_RESULTS_PAGE,
  TICKER_UPCOMING_LIMIT,
  formatStartTime,
  resultDayLabel,
  sortLiveMatches,
  streamIndicator,
  tickerCell,
  tickerFilterTabs,
  type TickerCellModel,
  type TickerFilter,
} from "~/components/watch/watchTicker";

const props = defineProps<{ ghost?: boolean }>();

const { t, locale } = useI18n();
const { client } = useApolloClient();

const live = ref<any[]>([]);
const upcoming = ref<any[]>([]);
const results = ref<any[]>([]);
const liveLoaded = ref(false);
const upcomingLoaded = ref(false);
const resultsLoaded = ref(false);
const resultsDone = ref(false);
const resultsLoading = ref(false);
const filter = ref<TickerFilter>("all");
const scrollRow = ref<InstanceType<typeof HorizontalScrollRow> | null>(null);

let liveSub: { unsubscribe: () => void } | undefined;
let upcomingSub: { unsubscribe: () => void } | undefined;
// Bumped on every results reset so a page that lands after the reset is
// dropped instead of appended to the fresh list.
let resultsGeneration = 0;
let resultsRetries = 0;

const liveQuery = generateSubscription({
  matches: [
    {
      where: { status: { _in: $("statuses", "[e_match_status_enum!]") } },
      order_by: [{ started_at: order_by.desc_nulls_last }],
      limit: 20,
    },
    watchTickerMatchFields,
  ],
} as any);

const upcomingQuery = generateSubscription({
  matches: [
    {
      where: { status: { _eq: $("status", "e_match_status_enum!") } },
      order_by: [{ scheduled_at: order_by.asc_nulls_last }],
      limit: TICKER_UPCOMING_LIMIT,
    },
    watchTickerMatchFields,
  ],
} as any);

// Imported/third-party matches stay out, same as the old recent list.
const resultsQuery = generateQuery({
  matches: [
    {
      where: {
        status: { _eq: $("status", "e_match_status_enum!") },
        source: { _eq: "5stack" },
      },
      order_by: [{ ended_at: order_by.desc_nulls_last }],
      limit: $("limit", "Int!"),
      offset: $("offset", "Int!"),
    },
    watchTickerMatchFields,
  ],
} as any);

function start() {
  if (liveSub || typeof window === "undefined") return;
  liveSub = seededSubscribe(
    client,
    { query: liveQuery, variables: { statuses: [...TICKER_LIVE_STATUSES] } },
    {
      next: ({ data }: any) => {
        const next: any[] = data?.matches ?? [];
        // A match that drops out of the live list has usually just
        // finished, so the results need to pick it up.
        const nextIds = new Set(next.map((m) => m.id));
        const ended = live.value.some((m) => !nextIds.has(m.id));
        live.value = next;
        liveLoaded.value = true;
        if (ended) void refreshNewestResults();
      },
      error: (err: any) => {
        console.error("[watch-rail] live subscription error", err);
        liveLoaded.value = true;
      },
    },
  );
  upcomingSub = seededSubscribe(
    client,
    { query: upcomingQuery, variables: { status: "Scheduled" } },
    {
      next: ({ data }: any) => {
        upcoming.value = data?.matches ?? [];
        upcomingLoaded.value = true;
      },
      error: (err: any) => {
        console.error("[watch-rail] upcoming subscription error", err);
        upcomingLoaded.value = true;
      },
    },
  );
  void loadResults(true);
}

function stop() {
  liveSub?.unsubscribe();
  upcomingSub?.unsubscribe();
  liveSub = undefined;
  upcomingSub = undefined;
}

async function loadResults(reset = false) {
  if (reset) {
    resultsGeneration++;
    resultsDone.value = false;
  } else if (resultsLoading.value || resultsDone.value) {
    return;
  }
  const generation = resultsGeneration;
  resultsLoading.value = true;
  try {
    const { data } = await client.query({
      query: resultsQuery,
      variables: {
        status: "Finished",
        limit: TICKER_RESULTS_PAGE,
        offset: reset ? 0 : results.value.length,
      },
      fetchPolicy: "network-only",
    });
    if (generation !== resultsGeneration) return;
    const page: any[] = (data as any)?.matches ?? [];
    resultsRetries = 0;
    results.value = reset ? page : [...results.value, ...page];
    resultsDone.value = page.length < TICKER_RESULTS_PAGE;
  } catch (err) {
    console.error("[watch-rail] results query error", err);
    if (generation === resultsGeneration && resultsRetries < 3) {
      resultsRetries++;
      setTimeout(() => {
        if (generation === resultsGeneration) {
          void loadResults(results.value.length === 0);
        }
      }, 5000);
    }
  } finally {
    if (generation === resultsGeneration) {
      resultsLoading.value = false;
      resultsLoaded.value = true;
    }
  }
}

// Prepends results that finished since the first page loaded, without
// resetting a row the viewer may have scrolled deep into.
async function refreshNewestResults() {
  try {
    const { data } = await client.query({
      query: resultsQuery,
      variables: { status: "Finished", limit: TICKER_RESULTS_PAGE, offset: 0 },
      fetchPolicy: "network-only",
    });
    const known = new Set(results.value.map((m) => m.id));
    const fresh = ((data as any)?.matches ?? []).filter((m: any) => !known.has(m.id));
    if (fresh.length) results.value = [...fresh, ...results.value];
  } catch (err) {
    console.error("[watch-rail] results refresh error", err);
  }
}

watch(
  () => props.ghost,
  (ghost) => {
    if (ghost) stop();
    else start();
  },
  { immediate: true },
);
onBeforeUnmount(stop);

const now = ref(new Date());
const clock =
  typeof window !== "undefined" ? setInterval(() => (now.value = new Date()), 60_000) : null;
onBeforeUnmount(() => clock && clearInterval(clock));

// --- Automatic player POV streams for the live cards' stream count ---
// One batched API call for every match in actual gameplay (Live, server up)
// the viewer may watch (never their own: the API also returns nothing for
// those), every 60 seconds. Pre-match cards count manual streams only.
const autoStreams = ref<Record<string, MatchAutoStream[]>>({});
const watchableLiveIds = computed(() =>
  live.value
    .filter((m) => autoPovEligible(m))
    .map((m) => m.id)
    .sort(),
);
let autoStreamsTimer: ReturnType<typeof setInterval> | null = null;
async function loadAutoStreams() {
  const ids = watchableLiveIds.value;
  autoStreams.value = ids.length ? await fetchMatchAutoStreams(ids) : {};
}
watch(
  () => watchableLiveIds.value.join(","),
  () => {
    if (typeof window === "undefined") return;
    void loadAutoStreams();
    if (!autoStreamsTimer) autoStreamsTimer = setInterval(loadAutoStreams, 60_000);
  },
  { immediate: true },
);
onBeforeUnmount(() => autoStreamsTimer && clearInterval(autoStreamsTimer));

function streamLabel(model: TickerCellModel): string | null {
  const count = mergeMatchStreams(
    model.streams as any,
    model.autoPov ? autoStreams.value[model.id] : [],
  ).length;
  return streamIndicator(model, count, t);
}

const ctx = computed(() => ({ t, locale: locale.value, now: now.value }));
const liveCells = computed(() =>
  sortLiveMatches(live.value).map((m) => tickerCell(m, ctx.value)),
);
// A match that just went live can still sit in the upcoming list for a
// beat; the live subscription wins.
const upcomingCells = computed(() => {
  const liveIds = new Set(live.value.map((m) => m.id));
  return upcoming.value
    .filter((m) => !liveIds.has(m.id))
    .map((m) => tickerCell(m, ctx.value));
});

const tabs = computed(() =>
  tickerFilterTabs({ live: liveCells.value.length, upcoming: upcomingCells.value.length }, t),
);

type Item =
  | { type: "cell"; key: string; model: TickerCellModel }
  | { type: "divider"; key: string; label: string; sub?: string }
  | { type: "note"; key: string; text: string }
  | { type: "end"; key: string }
  | { type: "skeleton"; key: string };

const loading = computed(() => !liveLoaded.value || !upcomingLoaded.value || !resultsLoaded.value);

const nothingLive = computed(() => {
  const next = upcoming.value.find((m) => m.scheduled_at);
  return next
    ? t("pages.watch.ticker.nothing_live_next", {
        time: formatStartTime(next.scheduled_at, now.value, locale.value),
      })
    : t("pages.watch.ticker.nothing_live");
});

const items = computed<Item[]>(() => {
  const list: Item[] = [];
  const f = filter.value;
  const cell = (model: TickerCellModel): Item => ({ type: "cell", key: model.id, model });

  if (f === "all" || f === "live") {
    if (liveCells.value.length) list.push(...liveCells.value.map(cell));
    else if (liveLoaded.value) list.push({ type: "note", key: "nothing-live", text: nothingLive.value });
  }

  if (f === "all" || f === "upcoming") {
    if (upcomingCells.value.length) {
      if (f === "all") {
        list.push({
          type: "divider",
          key: "up-next",
          label: t("pages.watch.ticker.up_next"),
          sub: t("pages.watch.ticker.match_count", upcomingCells.value.length),
        });
      }
      list.push(...upcomingCells.value.map(cell));
    } else if (f === "upcoming") {
      list.push({ type: "note", key: "nothing-upcoming", text: t("pages.watch.ticker.nothing_upcoming") });
    }
  }

  if (f === "all" || f === "results") {
    let lastDay: string | null = null;
    for (const match of results.value) {
      const day = resultDayLabel(match.ended_at, now.value, t, locale.value);
      if (day !== lastDay) {
        list.push({
          type: "divider",
          key: `day-${day}`,
          label: day,
          sub: lastDay === null ? t("pages.watch.ticker.results") : undefined,
        });
        lastDay = day;
      }
      list.push(cell(tickerCell(match, ctx.value)));
    }
    if (resultsLoading.value) {
      for (let i = 0; i < 3; i++) list.push({ type: "skeleton", key: `sk-${i}` });
    } else if (resultsLoaded.value && !results.value.length && f === "results") {
      list.push({ type: "note", key: "no-results", text: t("pages.watch.ticker.no_results") });
    } else if (resultsDone.value && results.value.length) {
      list.push({ type: "end", key: "end" });
    }
  }

  return list;
});

const showsResults = computed(() => filter.value === "all" || filter.value === "results");

function loadMore() {
  if (showsResults.value) void loadResults();
}

function scrollRight() {
  scrollRow.value?.scrollByDirection("right");
  if (!scrollRow.value?.state.canScrollRight) loadMore();
}

defineExpose({ filter, items, tabs, autoStreams });
</script>

<template>
  <section aria-labelledby="watch-rail-label" data-testid="watch-match-rail">
    <h2 id="watch-rail-label" class="sr-only">
      {{ $t("pages.watch.ticker.label") }}
    </h2>

    <template v-if="ghost">
      <div class="flex gap-3 overflow-hidden">
        <p
          class="flex h-[7.75rem] w-72 shrink-0 items-center rounded-lg border border-dashed border-border px-4 py-3 text-sm leading-snug text-foreground/70"
        >
          {{ $t("pages.watch.ticker.ghost_caption") }}
        </p>
        <div
          v-for="i in 5"
          :key="i"
          aria-hidden="true"
          class="flex h-[7.75rem] w-60 shrink-0 flex-col justify-center gap-2.5 rounded-lg border border-dashed border-border/70 px-3"
        >
          <span class="h-2 w-2/5 rounded-sm bg-muted/60"></span>
          <span class="h-2.5 w-3/4 rounded-sm bg-muted/60"></span>
          <span class="h-2.5 w-3/5 rounded-sm bg-muted/60"></span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="mb-2.5 flex items-center justify-between gap-3">
        <WatchSegmented v-model="filter" :options="tabs" :label="$t('pages.watch.ticker.filters_label')" />

        <div class="flex shrink-0 items-center gap-3">
          <!-- Same "See all →" as Highlights: the full Matches page. -->
          <NuxtLink
            to="/matches"
            data-testid="watch-matches-see-all"
            class="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ $t("common.see_all") }}
            <ArrowRight class="h-3 w-3" />
          </NuxtLink>
          <div class="flex gap-1.5 max-sm:hidden">
          <button
            type="button"
            :aria-label="$t('ui.scroll.left')"
            :disabled="!scrollRow?.state.canScrollLeft"
            class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-foreground/80 transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-muted/30"
            @click="scrollRow?.scrollByDirection('left')"
          >
            <ChevronLeft class="size-4" />
          </button>
          <button
            type="button"
            :aria-label="$t('ui.scroll.right')"
            :disabled="!scrollRow?.state.canScrollRight && (!showsResults || resultsDone)"
            class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-foreground/80 transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-muted/30"
            @click="scrollRight"
          >
            <ChevronRight class="size-4" />
          </button>
          </div>
        </div>
      </div>

      <!-- One height for every item, so an empty filter or a loading page
           never changes the row's height. -->
      <FadeSwap>
        <div
          v-if="loading"
          key="loading"
          class="flex gap-3 overflow-hidden px-px pb-2 pt-1"
          :aria-label="$t('pages.watch.ticker.loading_older')"
        >
          <Skeleton v-for="i in 6" :key="i" class="h-[7.75rem] w-60 shrink-0 rounded-lg" />
        </div>
        <div v-else :key="`row-${filter}`">
          <HorizontalScrollRow ref="scrollRow" @approaching-end="loadMore">
            <TransitionGroup
              enter-active-class="transition-[opacity,transform] [transition-delay:var(--enter-delay,0ms)] [transition-duration:240ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:![transition-duration:1ms] motion-reduce:![transition-delay:0ms]"
              enter-from-class="translate-x-2 opacity-0"
            >
              <div
                v-for="(item, index) in items"
                :key="item.key"
                class="flex shrink-0 snap-start"
                :style="{ '--enter-delay': `${Math.min(index % 12, 8) * 30}ms` }"
              >
                <WatchMatchCard v-if="item.type === 'cell'" :model="item.model" :stream-label="streamLabel(item.model)" />
                <div
                  v-else-if="item.type === 'divider'"
                  data-testid="watch-rail-divider"
                  class="ml-1.5 flex h-[7.75rem] min-w-[4.75rem] flex-col justify-center gap-0.5 border-l border-border/70 pl-3 pr-3.5"
                >
                  <span class="whitespace-nowrap text-[13px] font-bold">{{ item.label }}</span>
                  <span v-if="item.sub" class="whitespace-nowrap text-xs text-muted-foreground">{{ item.sub }}</span>
                </div>
                <div
                  v-else-if="item.type === 'note'"
                  data-testid="watch-rail-note"
                  class="flex h-[7.75rem] items-center gap-2.5 rounded-lg border border-dashed border-border px-4 text-[13px] text-muted-foreground"
                >
                  <span class="inline-flex size-2 shrink-0 rounded-full bg-muted-foreground/60"></span>
                  {{ item.text }}
                </div>
                <div
                  v-else-if="item.type === 'end'"
                  class="flex h-[7.75rem] items-center whitespace-nowrap pl-3 pr-5 text-xs text-muted-foreground"
                >
                  {{ $t("pages.watch.ticker.end") }}
                </div>
                <Skeleton v-else class="h-[7.75rem] w-60 rounded-lg" :aria-label="$t('pages.watch.ticker.loading_older')" />
              </div>
            </TransitionGroup>
          </HorizontalScrollRow>
        </div>
      </FadeSwap>
    </template>
  </section>
</template>
