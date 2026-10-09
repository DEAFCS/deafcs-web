<script setup lang="ts">
import { computed } from "vue";
import MatchOptionsDisplay from "~/components/match/MatchOptionsDisplay.vue";

// Overview "Match Setup": the map pool, plus Show Advanced Settings and
// Tournament Rules side by side. Mode, format, best of, map veto and
// substitutes are no longer repeated here; they are in the advanced settings
// (MatchOptionsDisplay). Concept adapted from 5Stack's tournament detail (MIT).
const props = defineProps<{
  tournament: any;
  format?: string | null;
}>();

const options = computed(() => props.tournament?.options ?? null);
const isDuel = computed(() => options.value?.type === "Duel");

// The effective allowance, from the same capacity the API enforces
// (tournament_max/min_players_per_lineup), never a separate tournament count.
const effectiveSubstitutes = computed(() => {
  const max = props.tournament?.max_players_per_lineup;
  const min = props.tournament?.min_players_per_lineup;
  if (typeof max !== "number" || typeof min !== "number") return null;
  return Math.max(0, max - min);
});
</script>

<template>
  <div v-if="options" data-testid="tournament-match-setup">
    <MatchOptionsDisplay
      :show-details-by-default="false"
      :options="options"
      :min-role="tournament.min_role"
      :substitutes="isDuel ? 0 : effectiveSubstitutes"
    >
      <template #actions>
        <NuxtLink
          to="/tournament-rules"
          class="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="tournament-overview-rules"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-[hsl(var(--tac-amber))]"></span>
          {{ $t("tournament.page.tournament_rules_action") }}
        </NuxtLink>
      </template>
    </MatchOptionsDisplay>
  </div>
</template>
