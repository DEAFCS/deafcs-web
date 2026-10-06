<script setup lang="ts">
// Local-only preview of the /watch match cards (?watchcards): the real
// tickerCell model and WatchMatchCard, fed with data shaped like production
// rows (official maps have no label; a workshop map keeps its configured
// label). No backend.
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import WatchMatchCard from "../../../components/watch/WatchMatchCard.vue";
import HorizontalScrollRow from "../../../components/common/HorizontalScrollRow.vue";
import ScrollArrows from "../../../components/common/ScrollArrows.vue";
import { tickerCell, streamIndicator } from "../../../components/watch/watchTicker";
import { TooltipProvider } from "../../../components/ui/tooltip";

const { t, locale } = useI18n();
const now = new Date();
const shot = (map: string) => `/public/img/maps/screenshots/${map}.webp`;
let seq = 0;
function map(name: string, label: string | null, l1: number, l2: number, extra: Record<string, any> = {}) {
  seq++;
  return {
    id: `mm${seq}`, order: seq, status: "Finished", is_current_map: false,
    lineup_1_score: l1, lineup_2_score: l2, winning_lineup_id: l1 > l2 ? "l1" : "l2",
    map: { id: `map${seq}`, name, label, poster: label === "Mini Dust 2" ? shot("de_dust2") : shot(name), patch: null },
    ...extra,
  };
}
function match(over: Record<string, any>) {
  seq++;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    status: "Finished", source: "5stack",
    started_at: new Date(now.getTime() - 3600000).toISOString(),
    ended_at: new Date(now.getTime() - 1800000).toISOString(),
    scheduled_at: null, is_in_lineup: false, is_coach: false,
    server_id: "srv", is_server_online: true,
    winning_lineup_id: "l1", lineup_1_id: "l1", lineup_2_id: "l2",
    min_players_per_lineup: 5,
    options: { best_of: 1, mr: 12, type: "Competitive", check_in_setting: "Players" },
    lineup_1: { id: "l1", name: "Team 6", team: null, lineup_players: [] },
    lineup_2: { id: "l2", name: "Team 2", team: null, lineup_players: [] },
    match_maps: [],
    tournament_brackets: [],
    streams: [],
    ...over,
  };
}

const matches = [
  { m: match({ status: "Live", winning_lineup_id: null, ended_at: null, options: { best_of: 3, mr: 12, type: "Competitive" },
      lineup_1: { id: "l1", name: "Northern Stars", team: null, lineup_players: [] }, lineup_2: { id: "l2", name: "Quiet Force", team: null, lineup_players: [] },
      match_maps: [map("de_mirage", null, 13, 9), map("de_ancient", null, 7, 5, { status: "Live", is_current_map: true, winning_lineup_id: null }), map("de_nuke", null, 0, 0, { status: "Scheduled", winning_lineup_id: null })] }), streams: 2 },
  { m: match({ status: "Veto", winning_lineup_id: null, ended_at: null, lineup_1: { id: "l1", name: "Orange Squad", team: null, lineup_players: [] }, lineup_2: { id: "l2", name: "Hands Up", team: null, lineup_players: [] } }), streams: 1 },
  { m: match({ tournament_brackets: [{ stage: { tournament: { id: "t", name: "5v5 Random (Beta #2)" } } }], match_maps: [map("de_dust2", null, 16, 14)] }), streams: 0 },
  { m: match({ lineup_1: { id: "l1", name: "Alpha", team: null, lineup_players: [] }, lineup_2: { id: "l2", name: "Bravo", team: null, lineup_players: [] }, match_maps: [map("de_dust2", null, 13, 8)] }), streams: 0 },
  { m: match({ options: { best_of: 1, mr: 12, type: "Wingman" }, lineup_1: { id: "l1", name: "Duo One", team: null, lineup_players: [] }, lineup_2: { id: "l2", name: "Duo Two", team: null, lineup_players: [] }, match_maps: [map("de_inferno", null, 9, 6)] }), streams: 0 },
  { m: match({ options: { best_of: 1, mr: 12, type: "Duel" }, lineup_1: { id: "l1", name: "Solo A", team: null, lineup_players: [] }, lineup_2: { id: "l2", name: "Solo B", team: null, lineup_players: [] }, match_maps: [map("3584384994", "Mini Dust 2", 9, 7)] }), streams: 0 },
  { m: match({ options: { best_of: 1, mr: 12, type: "Premier" }, match_maps: [map("de_mirage", null, 13, 11)] }), streams: 0 },
  { m: match({ status: "Scheduled", winning_lineup_id: null, ended_at: null, scheduled_at: new Date(now.getTime() + 7200000).toISOString(), match_maps: [] }), streams: 0 },
];
const cells = matches.map(({ m, streams }) => {
  const model = tickerCell(m, { t, locale: locale.value, now });
  return { model, streamLabel: streamIndicator(model, streams, t) };
});
const rowRef = ref<any>(null);
</script>

<template>
  <TooltipProvider>
    <main class="mx-auto grid w-full min-w-0 max-w-[1400px] gap-6 p-4 sm:p-6">
      <section class="min-w-0" data-preview="watch-rail">
        <div class="mb-2 flex items-center justify-between">
          <span class="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Matches</span>
          <ScrollArrows
            :can-left="rowRef?.state?.canScrollLeft"
            :can-right="rowRef?.state?.canScrollRight"
            @scroll="(d: any) => rowRef?.scrollByDirection(d)"
          />
        </div>
        <HorizontalScrollRow ref="rowRef">
          <WatchMatchCard v-for="c in cells" :key="c.model.id" :model="c.model" :stream-label="c.streamLabel" />
        </HorizontalScrollRow>
      </section>
    </main>
  </TooltipProvider>
</template>
