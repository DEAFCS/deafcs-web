<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, ref, watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import AwardArtwork from "~/components/award/AwardArtwork.vue";
import {
  TOURNAMENT_AWARD_PLACEMENTS,
  effectiveTournamentAwardSelection,
  tournamentMvpEnabled,
  type TournamentAwardDefinition,
  type TournamentAwardSlotRow,
} from "~/utilities/tournamentAwardPicker";

// Public, read-only counterpart to TournamentAwardPicker.vue: shows the same
// effective award selection (explicit tournament_award_slots override, else
// the built-in default per placement) an organizer already sees while
// configuring it. Renders nothing while awards are disabled -- the tournament
// still exposes AWARDS = NO via MatchOptionsDisplay's Team Settings row.
const AWARD_DEFINITIONS_QUERY = gql`
  query TournamentAwardShowcaseDefinitions {
    awards(
      where: { archived_at: { _is_null: true } }
      order_by: [{ system_key: asc_nulls_last }, { name: asc }]
    ) {
      id
      name
      description
      tier
      silhouette
      image_url
      system_key
      archived_at
      tournament_id
      event_id
      elo_season_id
      league_season_id
    }
  }
`;

const TOURNAMENT_AWARD_SLOTS_QUERY = gql`
  query TournamentAwardShowcaseSlots($tournamentId: uuid!) {
    tournament_award_slots(
      where: { tournament_id: { _eq: $tournamentId } }
      order_by: { slot: asc }
    ) {
      id
      tournament_id
      slot
      award_id
    }
  }
`;

const props = withDefaults(
  defineProps<{
    tournamentId?: string | null;
    enabled?: boolean;
    matchType?: string | null;
    minPlayersPerLineup?: number | null;
  }>(),
  {
    tournamentId: null,
    enabled: false,
    matchType: null,
    minPlayersPerLineup: null,
  },
);

const { client } = useApolloClient();
const definitions = ref<TournamentAwardDefinition[]>([]);
const slots = ref<TournamentAwardSlotRow[]>([]);
const loading = ref(false);
const loadError = ref("");

const mvpEnabled = computed(() =>
  tournamentMvpEnabled(props.matchType, props.minPlayersPerLineup),
);
const relevantPlacements = computed(() =>
  TOURNAMENT_AWARD_PLACEMENTS.filter(
    (config) => config.placement !== 0 || mvpEnabled.value,
  ),
);
const selection = computed(() =>
  effectiveTournamentAwardSelection(definitions.value, slots.value),
);

function awardForId(awardId?: string | null) {
  if (!awardId) return null;
  return definitions.value.find((award) => award.id === awardId) ?? null;
}

const entries = computed(() =>
  relevantPlacements.value
    .map((config) => ({
      config,
      award: awardForId(selection.value[config.placement]),
    }))
    .filter(
      (entry): entry is { config: (typeof relevantPlacements.value)[number]; award: TournamentAwardDefinition } =>
        !!entry.award,
    ),
);

async function load() {
  if (!props.tournamentId || !props.enabled) return;
  loading.value = true;
  loadError.value = "";
  try {
    const [definitionsResult, slotsResult] = await Promise.all([
      client.query<{ awards: TournamentAwardDefinition[] }>({
        query: AWARD_DEFINITIONS_QUERY,
        fetchPolicy: "cache-first",
      }),
      client.query<{ tournament_award_slots: TournamentAwardSlotRow[] }>({
        query: TOURNAMENT_AWARD_SLOTS_QUERY,
        variables: { tournamentId: props.tournamentId },
        fetchPolicy: "cache-first",
      }),
    ]);
    definitions.value = definitionsResult.data.awards ?? [];
    slots.value = slotsResult.data.tournament_award_slots ?? [];
  } catch (error) {
    loadError.value =
      error instanceof Error ? error.message : "Awards could not be loaded.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => [props.tournamentId, props.enabled], load);
</script>

<template>
  <section
    v-if="enabled && (loading || loadError || entries.length > 0)"
    class="mt-4 rounded-sm border border-border/70 bg-background/35 p-4 sm:p-5"
    aria-labelledby="tournament-award-showcase-title"
  >
    <div
      id="tournament-award-showcase-title"
      class="font-mono text-xs font-semibold uppercase tracking-[0.2em]"
    >
      {{ $t("tournament.page.awards_showcase.title") }}
    </div>

    <div v-if="loadError" class="mt-3 text-sm text-muted-foreground">
      {{ loadError }}
    </div>

    <div v-else class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div
        v-for="entry in entries"
        :key="entry.config.slot"
        class="flex flex-col items-center gap-2 rounded-sm border border-border/60 bg-background/45 p-4 text-center"
      >
        <AwardArtwork :award="entry.award" size="md" decorative />
        <div
          class="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ entry.config.shortLabel }} ·
          {{
            entry.config.placement === 0
              ? $t("tournament.page.awards_showcase.player")
              : $t("tournament.page.awards_showcase.team")
          }}
        </div>
        <div class="text-sm font-semibold">{{ entry.award.name }}</div>
      </div>
    </div>
  </section>
</template>
