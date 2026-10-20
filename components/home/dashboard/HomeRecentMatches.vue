<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { $, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { watchTickerMatchFields } from "~/graphql/watchTickerFields";
import WatchMatchCard from "~/components/watch/WatchMatchCard.vue";
import { tickerCell } from "~/components/watch/watchTicker";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import {
  homeEmptyClasses,
  homePanelClasses,
  homePanelPaddingClasses,
  lineupHasPlayer,
  whenNearViewport,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

// "Your Recent Matches": this player's own finished DEAFCS matches, as the
// /watch result cards (WatchMatchCard = 5Stack WatchTickerCell with the DEAFCS
// map backgrounds; same tickerCell model and watchTickerMatchFields).
const props = defineProps<{ viewer: HomeViewer }>();

const LIMIT = 6;
const { t, locale } = useI18n();
const root = ref<HTMLElement | null>(null);
const matches = ref<any[]>([]);
const state = ref<"idle" | "ready" | "error">("idle");

const query = generateQuery({
  matches: [
    {
      where: {
        status: { _eq: "Finished" },
        source: { _eq: "5stack" },
        ...lineupHasPlayer($("steam_id", "bigint!")),
      },
      order_by: [{ ended_at: order_by.desc_nulls_last }],
      limit: LIMIT,
    },
    {
      ...watchTickerMatchFields,
      // + steam_id, to tell the viewer's side for the W/L marker.
      lineup_1: { ...(watchTickerMatchFields as any).lineup_1, lineup_players: [{}, { steam_id: true }] },
      lineup_2: { ...(watchTickerMatchFields as any).lineup_2, lineup_players: [{}, { steam_id: true }] },
    },
  ],
} as any);

async function load() {
  try {
    const { data } = await getGraphqlClient().query({
      query,
      variables: { steam_id: props.viewer.steamId },
      fetchPolicy: "network-only",
    });
    matches.value = (data as any)?.matches ?? [];
    state.value = "ready";
  } catch (error) {
    console.error("[home] recent matches:", error);
    state.value = "error";
  }
}

let stopObserving = () => {};
onMounted(() => {
  stopObserving = whenNearViewport(root.value, () => void load());
});
onBeforeUnmount(() => stopObserving());

const cells = computed(() => {
  const ctx = { t, locale: locale.value, now: new Date() };
  return matches.value.map((match) => tickerCell(match, ctx));
});

// Win or loss from the viewer's side, shown as a thin strip under each card.
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
const outcomes = computed(() => new Map(matches.value.map((m) => [m.id, outcome(m)])));
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
    />

    <div v-if="state === 'idle'" class="flex flex-wrap gap-3">
      <div v-for="i in 3" :key="i" class="h-[6.875rem] w-56 animate-pulse rounded-lg bg-muted/30"></div>
    </div>
    <p v-else-if="state === 'error'" :class="homeEmptyClasses">Could not load your recent matches.</p>
    <p v-else-if="!cells.length" :class="homeEmptyClasses">
      Your finished matches will show up here.
      <NuxtLink to="/play" class="font-semibold text-[hsl(var(--tac-amber))] hover:underline">Find a match</NuxtLink>
    </p>
    <!-- Phones: one swipeable row like the /watch rail; a grid from sm up. -->
    <ul v-else class="home-recent-grid -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0">
      <li v-for="cell in cells" :key="cell.id" class="relative w-56 min-w-0 shrink-0 snap-start sm:w-auto">
        <WatchMatchCard :model="cell" :stream-label="null" class="!w-full" />
        <span
          v-if="outcomes.get(cell.id)"
          class="pointer-events-none absolute bottom-2.5 right-3 z-10 rounded px-1.5 font-mono text-[0.6rem] font-bold uppercase leading-4"
          :aria-label="outcomes.get(cell.id) === 'win' ? 'Win' : 'Loss'"
          :class="
            outcomes.get(cell.id) === 'win'
              ? 'bg-emerald-500/90 text-black'
              : 'bg-destructive/90 text-white'
          "
        >{{ outcomes.get(cell.id) === "win" ? "W" : "L" }}</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
@media (min-width: 640px) {
  .home-recent-grid {
    grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  }
}
</style>
