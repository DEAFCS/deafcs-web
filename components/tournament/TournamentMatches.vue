<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSubscription } from "@vue/apollo-composable";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, order_by } from "~/generated/zeus";
import { simpleMatchFields } from "~/graphql/simpleMatchFields";
import PlayerMatchesTable from "~/components/player/PlayerMatchesTable.vue";
import Pagination from "~/components/Pagination.vue";
import { Skeleton } from "~/components/ui/skeleton";
import { usePerPage } from "~/composables/usePerPage";
import { useMatchRowStats } from "~/composables/useMatchRowStats";
import {
  TOURNAMENT_MATCH_FILTERS,
  filterTournamentMatches,
  sortTournamentMatches,
  tournamentMatchCounts,
  type TournamentMatchFilter,
} from "~/utilities/tournamentMatches";

// Current 5Stack tournament architecture: the shared responsive match-row
// table, paginated locally, with MVP/stats enrichment limited to this page.
// DEAFCS keeps its live/result filter chips and server subscription.
const props = defineProps<{ tournamentId: string }>();

const { result, loading } = useSubscription(
  typedGql("subscription")({
    matches: [
      {
        where: {
          tournament_brackets: {
            stage: { tournament_id: { _eq: $("tournamentId", "uuid!") } },
          },
        },
        order_by: [{ created_at: order_by.desc }],
      },
      simpleMatchFields,
    ],
  } as any),
  () => ({ tournamentId: props.tournamentId }),
);

const matches = computed<any[]>(() =>
  sortTournamentMatches((result.value as any)?.matches ?? []),
);
const counts = computed(() => tournamentMatchCounts(matches.value));

const filter = ref<TournamentMatchFilter>("all");
const filtered = computed(() => filterTournamentMatches(matches.value, filter.value));

const page = ref(1);
const perPage = usePerPage("tournament-matches");
watch([filter, perPage], () => (page.value = 1));
const setPerPage = (value: number) => {
  perPage.value = value;
};
const pageMatches = computed(() =>
  filtered.value.slice(
    (page.value - 1) * perPage.value,
    page.value * perPage.value,
  ),
);
const { topPlayerByMatch, statsByMatch, ratingByMatch } =
  useMatchRowStats(pageMatches);
</script>

<template>
  <div class="grid gap-3" data-testid="tournament-matches">
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="option in TOURNAMENT_MATCH_FILTERS"
        :key="option"
        type="button"
        :disabled="option !== 'all' && !counts[option]"
        :data-testid="`tournament-matches-filter-${option}`"
        class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.14em] transition-colors disabled:opacity-30"
        :class="
          filter === option
            ? 'border-[hsl(var(--tac-amber))] bg-[hsl(var(--tac-amber)/0.16)] text-[hsl(var(--tac-amber))]'
            : 'border-border/60 bg-card/40 text-muted-foreground hover:text-foreground'
        "
        @click="filter = option"
      >
        {{ $t(`tournament.page.matches.filter.${option}`) }}
        <span class="font-bold tabular-nums">{{ counts[option] }}</span>
      </button>
    </div>

    <div v-if="loading && !matches.length" class="space-y-1.5" aria-busy="true">
      <Skeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
    </div>

    <p
      v-else-if="!filtered.length"
      class="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground"
      data-testid="tournament-matches-empty"
    >
      {{ $t("tournament.page.matches.empty") }}
    </p>

    <template v-else>
      <PlayerMatchesTable
        :matches="pageMatches"
        neutral
        tournament-times
        :top-player-by-match="topPlayerByMatch"
        :stats-by-match="statsByMatch"
        :rating-by-match="ratingByMatch"
      />
      <Pagination
        :page="page"
        :per-page="perPage"
        :total="filtered.length"
        show-per-page-selector
        @page="(p: number) => (page = p)"
        @update:per-page="setPerPage"
      />
    </template>
  </div>
</template>
