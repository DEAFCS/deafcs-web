<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useSubscription } from "@vue/apollo-composable";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, order_by } from "~/generated/zeus";
import { simpleMatchFields } from "~/graphql/simpleMatchFields";
import MatchesTable from "~/components/MatchesTable.vue";
import Pagination from "~/components/Pagination.vue";
import { Skeleton } from "~/components/ui/skeleton";
import {
  TOURNAMENT_MATCH_FILTERS,
  filterTournamentMatches,
  sortTournamentMatches,
  tournamentMatchCounts,
  type TournamentMatchFilter,
} from "~/utilities/tournamentMatches";

// Every match of the tournament as full DEAFCS match rows (mode badge, map
// background, score), live. Adapted from 5Stack's tournament Matches tab
// (MIT), using the DEAFCS MatchesTable instead of 5Stack's player table.
const props = defineProps<{ tournamentId: string }>();

const PER_PAGE = 20;

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
watch(filter, () => (page.value = 1));
const pageMatches = computed(() =>
  filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE),
);
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
      <MatchesTable :matches="pageMatches" />
      <Pagination
        v-if="filtered.length > PER_PAGE"
        :page="page"
        :per-page="PER_PAGE"
        :total="filtered.length"
        @page="(p: number) => (page = p)"
      />
    </template>
  </div>
</template>
