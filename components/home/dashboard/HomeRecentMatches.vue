<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { $, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { watchTickerMatchFields } from "~/graphql/watchTickerFields";
import HorizontalScrollRow from "~/components/common/HorizontalScrollRow.vue";
import WatchMatchCard from "~/components/watch/WatchMatchCard.vue";
import { resultDayLabel, tickerCell, type TickerCellModel } from "~/components/watch/watchTicker";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import {
  homeEmptyClasses,
  homePanelClasses,
  homePanelPaddingClasses,
  lineupHasPlayer,
  whenNearViewport,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

// "Your Recent Matches": this player's own finished DEAFCS matches as the
// /watch match rail shows its results (WatchMatchRail): one horizontal row of
// WatchMatchCard (5Stack WatchTickerCell with the DEAFCS map backgrounds),
// day dividers, arrows, and older matches paging in as the row scrolls.
// Results only, so no live block.
const props = defineProps<{ viewer: HomeViewer }>();

const PAGE = 12;
const { t, locale } = useI18n();
const root = ref<HTMLElement | null>(null);
const scrollRow = ref<InstanceType<typeof HorizontalScrollRow> | null>(null);
const matches = ref<any[]>([]);
const state = ref<"idle" | "ready" | "error">("idle");
const loadingMore = ref(false);
const done = ref(false);

const query = generateQuery({
  matches: [
    {
      where: {
        status: { _eq: "Finished" },
        source: { _eq: "5stack" },
        ...lineupHasPlayer($("steam_id", "bigint!")),
      },
      order_by: [{ ended_at: order_by.desc_nulls_last }],
      limit: $("limit", "Int!"),
      offset: $("offset", "Int!"),
    },
    {
      ...watchTickerMatchFields,
      // + steam_id, to tell the viewer's side for the W/L marker.
      lineup_1: { ...(watchTickerMatchFields as any).lineup_1, lineup_players: [{}, { steam_id: true }] },
      lineup_2: { ...(watchTickerMatchFields as any).lineup_2, lineup_players: [{}, { steam_id: true }] },
    },
  ],
} as any);

async function load(more = false) {
  if (more && (loadingMore.value || done.value)) return;
  loadingMore.value = more;
  try {
    const { data } = await getGraphqlClient().query({
      query,
      variables: { steam_id: props.viewer.steamId, limit: PAGE, offset: more ? matches.value.length : 0 },
      fetchPolicy: "network-only",
    });
    const page: any[] = (data as any)?.matches ?? [];
    const known = new Set(matches.value.map((m) => m.id));
    matches.value = more ? [...matches.value, ...page.filter((m) => !known.has(m.id))] : page;
    done.value = page.length < PAGE;
    state.value = "ready";
  } catch (error) {
    console.error("[home] recent matches:", error);
    if (!more) state.value = "error";
  } finally {
    loadingMore.value = false;
  }
}

let stopObserving = () => {};
onMounted(() => {
  stopObserving = whenNearViewport(root.value, () => void load());
});
onBeforeUnmount(() => stopObserving());

// Win or loss from the viewer's side, shown on each card.
function outcome(match: any): "win" | "loss" | null {
  if (!match?.winning_lineup_id) return null;
  const steamId = String(props.viewer.steamId);
  const inLineup = (lineup: any) =>
    (lineup?.lineup_players ?? []).some((p: any) => String(p.steam_id) === steamId);
  const mine = inLineup(match.lineup_1)
    ? match.lineup_1_id
    : inLineup(match.lineup_2)
      ? match.lineup_2_id
      : null;
  if (!mine) return null;
  return match.winning_lineup_id === mine ? "win" : "loss";
}

type Item =
  | { type: "cell"; key: string; model: TickerCellModel; outcome: "win" | "loss" | null }
  | { type: "divider"; key: string; label: string };

// Same day dividers as the /watch results ("Today", "Yesterday", dates).
const items = computed<Item[]>(() => {
  const now = new Date();
  const ctx = { t, locale: locale.value, now };
  const list: Item[] = [];
  let lastDay: string | null = null;
  for (const match of matches.value) {
    const day = resultDayLabel(match.ended_at, now, t, locale.value);
    if (day && day !== lastDay) {
      list.push({ type: "divider", key: `day-${day}`, label: day });
      lastDay = day;
    }
    list.push({ type: "cell", key: match.id, model: tickerCell(match, ctx), outcome: outcome(match) });
  }
  return list;
});

function scrollRight() {
  scrollRow.value?.scrollByDirection("right");
  if (!scrollRow.value?.state.canScrollRight) void load(true);
}

const arrowClasses =
  "inline-flex size-8 items-center justify-center rounded-md border border-border bg-muted/30 text-foreground/80 transition-colors duration-150 hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] disabled:cursor-default disabled:opacity-35 disabled:hover:bg-muted/30";
</script>

<template>
  <section
    ref="root"
    aria-labelledby="home-recent-title"
    :class="[homePanelClasses, homePanelPaddingClasses]"
    data-testid="home-recent-matches"
  >
    <HomeSectionHeader
      id="home-recent-title"
      title="Your Recent Matches"
      :to="`/players/${viewer.steamId}`"
      link-label="Match history"
      link-beside-title
    >
      <template #actions>
        <div v-if="items.length" class="flex gap-1.5 max-sm:hidden">
          <button
            type="button"
            :class="arrowClasses"
            :aria-label="$t('ui.scroll.left')"
            :disabled="!scrollRow?.state.canScrollLeft"
            @click="scrollRow?.scrollByDirection('left')"
          >
            <ChevronLeft class="size-4" />
          </button>
          <button
            type="button"
            :class="arrowClasses"
            :aria-label="$t('ui.scroll.right')"
            :disabled="!scrollRow?.state.canScrollRight && done"
            @click="scrollRight"
          >
            <ChevronRight class="size-4" />
          </button>
        </div>
      </template>
    </HomeSectionHeader>

    <div v-if="state === 'idle'" class="flex gap-3 overflow-hidden">
      <div v-for="i in 5" :key="i" class="h-[6.875rem] w-56 shrink-0 animate-pulse rounded-lg bg-muted/30"></div>
    </div>
    <p v-else-if="state === 'error'" :class="homeEmptyClasses">Could not load your recent matches.</p>
    <p v-else-if="!items.length" :class="homeEmptyClasses">
      Your finished matches will show up here.
      <NuxtLink to="/play" class="font-semibold text-[hsl(var(--tac-amber))] hover:underline">Find a match</NuxtLink>
    </p>
    <HorizontalScrollRow v-else ref="scrollRow" @approaching-end="load(true)">
      <div
        v-for="item in items"
        :key="item.key"
        class="relative flex shrink-0 snap-start"
        data-testid="home-recent-item"
      >
        <template v-if="item.type === 'cell'">
          <WatchMatchCard :model="item.model" :stream-label="null" />
          <span
            v-if="item.outcome"
            class="pointer-events-none absolute bottom-2.5 right-3 z-10 rounded px-1.5 font-mono text-[0.6rem] font-bold uppercase leading-4"
            :aria-label="item.outcome === 'win' ? 'Win' : 'Loss'"
            :class="item.outcome === 'win' ? 'bg-emerald-500/90 text-black' : 'bg-destructive/90 text-white'"
          >{{ item.outcome === "win" ? "W" : "L" }}</span>
        </template>
        <div
          v-else
          class="ml-1.5 flex h-[6.875rem] min-w-[4.75rem] flex-col justify-center border-l border-border/70 pl-3 pr-2"
        >
          <span class="whitespace-nowrap text-[13px] font-bold">{{ item.label }}</span>
        </div>
      </div>
      <div v-if="loadingMore" class="h-[6.875rem] w-56 shrink-0 animate-pulse rounded-lg bg-muted/30"></div>
    </HorizontalScrollRow>
  </section>
</template>
