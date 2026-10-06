<script setup lang="ts">
// Local-only preview: player profile Highlights and Tournaments rows and the
// /watch tournament cards, rendered with the real components and fixture
// data (no backend). ?profile in index.html.
import { ref } from "vue";
import { ArrowRight } from "lucide-vue-next";
import ClipTile from "../../../components/clips/ClipTile.vue";
import HorizontalScrollRow from "../../../components/common/HorizontalScrollRow.vue";
import ScrollArrows from "../../../components/common/ScrollArrows.vue";
import TournamentCard from "../../../components/tournament/TournamentCard.vue";
import WatchTournamentCard from "../../../components/watch/WatchTournamentCard.vue";
import { TooltipProvider } from "../../../components/ui/tooltip";
import {
  tacticalSectionDescriptionClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "../../../utilities/tacticalClasses";

const params = new URLSearchParams(location.search);
const noHighlights = params.has("nohighlights");
const shot = (map: string) => `/public/img/maps/screenshots/${map}.webp`;
const maps = ["de_mirage", "de_inferno", "de_nuke", "de_ancient", "de_anubis", "de_dust2"];

const clips = noHighlights
  ? []
  : maps.map((map, i) => ({
      id: `clip-${i}`,
      title: i % 2 ? "Best Round (3K)" : "Clutch (2K)",
      kills_count: [3, 2, 4, 5, 3, 2][i],
      round: 4 + i,
      duration_ms: [21000, 14000, 33000, 41000, 18000, 12000][i],
      thumbnail_download_url: shot(map),
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      views_count: 12 * (i + 1),
      visibility: "public",
      user_steam_id: "1",
      target: { steam_id: "1", name: "Local player" },
      match_map: { map: { name: map, label: map.replace("de_", ""), poster: shot(map) } },
    }));

const teams = (n: number) => ({ aggregate: { count: n } });
const stage = (rank: number | null) => ({
  id: "s1", order: 1, type: "DoubleElimination",
  e_tournament_stage_type: { description: "Double Elimination" },
  results: rank ? [{ tournament_team_id: "tt1", rank, placement: rank }] : [],
});
const base = (over: Record<string, any>) => ({
  id: Math.random().toString(36).slice(2),
  name: "5v5 Cup #1",
  start: new Date(Date.now() + 4 * 86400000).toISOString(),
  status: "RegistrationOpen",
  e_tournament_status: { description: "Registration Open" },
  options: { type: "Competitive", map_pool: { maps: [{ id: "m1", name: "de_mirage", poster: shot("de_mirage") }] } },
  teams_aggregate: teams(8),
  stages: [stage(null)],
  rosters: [{ tournament_team_id: "tt1" }],
  ...over,
});
const tournaments = [
  base({}),
  base({ name: "2v2 Cup (Beta #1)", status: "Finished", e_tournament_status: { description: "Finished" }, start: "2026-09-24T17:00:00Z", options: { type: "Wingman", map_pool: { maps: [{ id: "m2", name: "de_inferno", poster: shot("de_inferno") }] } }, teams_aggregate: teams(6), stages: [stage(1)] }),
  base({ name: "1v1 Cup (Beta #2)", status: "Finished", e_tournament_status: { description: "Finished" }, start: "2026-09-22T17:00:00Z", options: { type: "Duel", map_pool: { maps: [{ id: "m3", name: "de_nuke", poster: shot("de_nuke") }] } }, teams_aggregate: teams(18), stages: [stage(3)] }),
  base({ name: "5v5 Random (Beta #1)", status: "Finished", e_tournament_status: { description: "Finished" }, start: "2026-09-16T17:00:00Z", teams_aggregate: teams(4), stages: [stage(2)] }),
  base({ name: "Spring Major", status: "Live", e_tournament_status: { description: "Live" }, current_stage: 2, stages: [stage(null), { ...stage(null), id: "s2", order: 2 }] }),
];
const scrollRef = ref<any>(null);
const tourRef = ref<any>(null);

const watchCards = [
  { ...tournaments[0], id: "w-open", registration_version: 1, registration_type: "teams", can_join: true },
  { ...tournaments[1], id: "w-fin", stages: [{ order: 1, max_teams: 8, results: [
    { rank: 1, tournament_team_id: "a", team: { name: "Oltenia Vanguard" } },
    { rank: 2, tournament_team_id: "b", team: { name: "SUPERMAN & EMPEROR" } },
    { rank: 3, tournament_team_id: "c", team: { name: "Samurai" } },
  ] }] },
];
</script>

<template>
  <TooltipProvider>
    <main class="mx-auto grid w-full min-w-0 max-w-[1400px] gap-12 p-4 sm:p-6">
      <section data-preview="highlights" class="min-w-0">
        <div :class="[tacticalSectionLabelClasses, '!flex w-full items-center justify-between']">
          <span class="inline-flex items-center gap-2">
            <span :class="tacticalSectionTickClasses"></span>
            Highlights
          </span>
          <ScrollArrows
            :can-left="scrollRef?.state?.canScrollLeft"
            :can-right="scrollRef?.state?.canScrollRight"
            @scroll="(d: any) => scrollRef?.scrollByDirection(d)"
          />
        </div>
        <HorizontalScrollRow v-if="clips.length" ref="scrollRef">
          <div v-for="c in clips" :key="c.id" class="w-96 shrink-0 snap-start">
            <ClipTile :clip="c as any" :queue="clips as any" queue-scope="preview" hide-player />
          </div>
        </HorizontalScrollRow>
        <p v-else class="text-xs text-muted-foreground">(no highlights: the real section hides itself)</p>
      </section>

      <section data-preview="tournaments" class="min-w-0">
        <div :class="[tacticalSectionLabelClasses, '!flex w-full items-center justify-between']">
          <div class="inline-flex items-center gap-3">
            <span class="inline-flex items-center gap-2">
              <span :class="tacticalSectionTickClasses"></span>
              TOURNAMENTS
            </span>
            <button type="button" class="inline-flex items-center gap-1 font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground normal-case">
              See all <ArrowRight class="h-3 w-3" />
            </button>
          </div>
          <ScrollArrows
            :can-left="tourRef?.state?.canScrollLeft"
            :can-right="tourRef?.state?.canScrollRight"
            @scroll="(d: any) => tourRef?.scrollByDirection(d)"
          />
        </div>
        <div :class="tacticalSectionDescriptionClasses">Tournaments this player has competed in.</div>
        <HorizontalScrollRow ref="tourRef">
          <TournamentCard
            v-for="t in tournaments"
            :key="t.id"
            :tournament="t"
            variant="simple"
            status-variant="finished"
            class="shrink-0 snap-start"
          />
        </HorizontalScrollRow>
        <h3 class="mt-6 text-xs text-muted-foreground">See all dialog layout (flex-wrap)</h3>
        <div class="flex flex-wrap justify-center gap-3">
          <TournamentCard v-for="t in tournaments" :key="'all-' + t.id" :tournament="t" variant="simple" />
        </div>
      </section>

      <section data-preview="watch" class="grid min-w-0 gap-4 lg:grid-cols-2">
        <WatchTournamentCard v-for="t in watchCards" :key="t.id" :tournament="t" />
      </section>
    </main>
  </TooltipProvider>
</template>
