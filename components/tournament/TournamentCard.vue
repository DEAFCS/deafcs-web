<script setup lang="ts">
// Adapted from 5Stack WEB b4b83f23 (components/tournament/TournamentCard.vue);
// MIT Copyright (c) 2025 5Stack.gg. DEAFCS passes its Awards-system podium
// data (award_occurrences + tournament_award_slots) through to the compact
// card, which renders the real award artwork.
import TournamentFeatureCard from "~/components/tournament/TournamentFeatureCard.vue";
import TournamentCompactCard from "~/components/tournament/TournamentCompactCard.vue";
import SimpleTournamentDisplay from "~/components/tournament/SimpleTournamentDisplay.vue";
import type {
  TournamentCardVariant,
  TournamentStatusVariant,
} from "~/components/tournament/tournamentCard";

withDefaults(
  defineProps<{
    tournament: any;
    variant?: TournamentCardVariant;
    statusVariant?: TournamentStatusVariant;
    statusLabel?: string;
    awardOccurrences?: any[];
    awardSlots?: any[];
  }>(),
  {
    variant: "feature",
    statusVariant: "default",
    statusLabel: undefined,
    awardOccurrences: () => [],
    awardSlots: () => [],
  },
);
</script>

<template>
  <TournamentCompactCard
    v-if="variant === 'compact'"
    :tournament="tournament"
    :status-variant="statusVariant"
    :status-label="statusLabel"
    :award-occurrences="awardOccurrences"
    :award-slots="awardSlots"
  />
  <!-- The simple card renders status straight off the tournament, so it takes
       no variant/label overrides. -->
  <SimpleTournamentDisplay
    v-else-if="variant === 'simple'"
    :tournament="tournament"
  />
  <TournamentFeatureCard
    v-else
    :tournament="tournament"
    :status-variant="statusVariant"
    :status-label="statusLabel"
  />
</template>
