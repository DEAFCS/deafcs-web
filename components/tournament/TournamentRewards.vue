<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, ref, watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { Trophy } from "lucide-vue-next";
import { Card } from "~/components/ui/card";
import AwardArtwork from "~/components/award/AwardArtwork.vue";
import { formatPrizePool } from "~/utilities/prizePool";
import {
  TOURNAMENT_AWARD_PLACEMENTS,
  effectiveTournamentAwardSelection,
  tournamentMvpEnabled,
  type TournamentAwardDefinition,
  type TournamentAwardSlotRow,
} from "~/utilities/tournamentAwardPicker";

// The single public "what can I win" section for a tournament: prize money
// (podium cards, unchanged from the old standalone Prize Distribution
// section) plus the read-only award selection an organizer already
// configures in TournamentAwardPicker.vue (same effective-selection
// resolver, same two queries -- this replaces TournamentAwardShowcase.vue
// rather than running a second copy of its queries alongside it). MVP is
// pulled out of the award grid and rendered compactly in the header instead,
// next to the prize pool total.
const AWARD_DEFINITIONS_QUERY = gql`
  query TournamentRewardsAwardDefinitions {
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
  query TournamentRewardsAwardSlots($tournamentId: uuid!) {
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
    prizes?: Array<{
      id: string;
      place: string;
      prize: string;
      order?: number;
    }>;
    tournamentId?: string | null;
    awardsEnabled?: boolean;
    matchType?: string | null;
    minPlayersPerLineup?: number | null;
  }>(),
  {
    prizes: () => [],
    tournamentId: null,
    awardsEnabled: false,
    matchType: null,
    minPlayersPerLineup: null,
  },
);

// --- Prize money (unchanged behavior from the old TournamentPrizes.vue) ---

const podium = computed(() => props.prizes.slice(0, 3));
const extras = computed(() => props.prizes.slice(3));
const pool = computed(() => formatPrizePool(props.prizes));
const hasPrizes = computed(() => props.prizes.length > 0);

// Champion sits center, runner-up left, third right (desktop). Each rank drives
// its own accent, height and podium order.
const TIERS = [
  {
    label: "text-[hsl(var(--tac-amber))]",
    bar: "bg-[hsl(var(--tac-amber))]",
    amount: "text-[hsl(var(--tac-amber))] text-[1.7rem]",
    frame:
      "border-[hsl(var(--tac-amber)/0.4)] [background:linear-gradient(180deg,hsl(var(--tac-amber)/0.12),hsl(var(--card)/0.4))] sm:pt-7",
    order: "sm:order-2",
  },
  {
    label: "text-[hsl(220_9%_72%)]",
    bar: "bg-[hsl(220_9%_72%)]",
    amount: "",
    frame: "sm:pt-5",
    order: "sm:order-1",
  },
  {
    label: "text-[hsl(28_45%_52%)]",
    bar: "bg-[hsl(28_45%_52%)]",
    amount: "",
    frame: "",
    order: "sm:order-3",
  },
];

// --- Awards (moved from TournamentAwardShowcase.vue) ---

const { client } = useApolloClient();
const definitions = ref<TournamentAwardDefinition[]>([]);
const slots = ref<TournamentAwardSlotRow[]>([]);
const awardsLoading = ref(false);
const awardsLoadError = ref("");

const mvpEnabled = computed(() =>
  tournamentMvpEnabled(props.matchType, props.minPlayersPerLineup),
);
const selection = computed(() =>
  effectiveTournamentAwardSelection(definitions.value, slots.value),
);

function awardForId(awardId?: string | null) {
  if (!awardId) return null;
  return definitions.value.find((award) => award.id === awardId) ?? null;
}

// MVP renders only in the header, never inside a placement card.
const mvpAward = computed(() =>
  mvpEnabled.value ? awardForId(selection.value[0]) : null,
);

// Champion / Runner-up / Third Place -- in that order, matching podium
// index 0/1/2 -- for pairing with the same-rank prize card below.
const bodyPlacements = TOURNAMENT_AWARD_PLACEMENTS.filter(
  (config) => config.placement !== 0,
);

// One standing per podium position (0/1/2 = 1st/2nd/3rd), each carrying
// whatever exists for that rank: prize money, its configured award, both,
// or -- if neither exists -- omitted entirely rather than rendering an
// empty card. This is what lets the award artwork ride inside the existing
// money card instead of a separate row underneath: index (not array
// position) is preserved so TIERS[entry.index] still resolves correctly
// even when a middle rank is skipped.
const standingEntries = computed(() => {
  const entries: Array<{
    index: number;
    prize: { id: string; place: string; prize: string } | null;
    award: TournamentAwardDefinition | null;
  }> = [];
  for (let index = 0; index < 3; index++) {
    const prize = podium.value[index] ?? null;
    const placementConfig = bodyPlacements[index];
    const award =
      props.awardsEnabled && placementConfig
        ? awardForId(selection.value[placementConfig.placement])
        : null;
    if (!prize && !award) continue;
    entries.push({ index, prize, award });
  }
  return entries;
});
const hasStandings = computed(() => standingEntries.value.length > 0);

const hasAwardsContent = computed(
  () =>
    props.awardsEnabled &&
    (awardsLoading.value ||
      !!awardsLoadError.value ||
      standingEntries.value.some((entry) => !!entry.award) ||
      !!mvpAward.value),
);

const showSection = computed(() => hasPrizes.value || hasAwardsContent.value);

async function loadAwards() {
  if (!props.tournamentId || !props.awardsEnabled) return;
  awardsLoading.value = true;
  awardsLoadError.value = "";
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
    awardsLoadError.value =
      error instanceof Error ? error.message : "Awards could not be loaded.";
  } finally {
    awardsLoading.value = false;
  }
}

onMounted(loadAwards);
watch(() => [props.tournamentId, props.awardsEnabled], loadAwards);
</script>

<template>
  <Card v-if="showSection" class="overflow-hidden">
    <div class="flex flex-col gap-5 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <Trophy class="h-3.5 w-3.5 text-[hsl(var(--tac-amber))]" />
        <span
          class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
        >
          {{ $t("tournament.rewards.title") }}
        </span>
        <div class="ml-auto flex items-center gap-3">
          <div v-if="mvpAward" class="flex items-center gap-2">
            <AwardArtwork :award="mvpAward" size="xs" decorative />
            <div class="flex flex-col text-left leading-tight">
              <span
                class="font-mono text-[0.55rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {{ $t("trophies.mvp") }}
              </span>
              <span class="text-xs font-medium">{{ mvpAward.name }}</span>
            </div>
          </div>
          <span
            v-if="pool"
            class="font-sans text-base font-bold tabular-nums text-[hsl(var(--tac-amber))]"
          >
            {{ pool }}
          </span>
        </div>
      </div>

      <template v-if="hasStandings">
        <div class="grid items-end gap-3 sm:grid-cols-3">
          <div
            v-for="entry in standingEntries"
            :key="entry.index"
            :class="[
              'relative overflow-hidden rounded-lg border border-border bg-card/40 px-4 py-4 text-center [backdrop-filter:blur(6px)]',
              TIERS[entry.index].frame,
              TIERS[entry.index].order,
            ]"
          >
            <div
              :class="[
                'font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em]',
                TIERS[entry.index].label,
              ]"
            >
              {{ entry.prize?.place || `#${entry.index + 1}` }}
            </div>
            <div class="mt-1 flex items-center justify-center gap-2">
              <div
                v-if="entry.prize"
                :class="[
                  'font-sans text-[1.35rem] font-bold leading-none tabular-nums',
                  TIERS[entry.index].amount,
                ]"
              >
                {{ entry.prize.prize }}
              </div>
              <AwardArtwork v-if="entry.award" :award="entry.award" size="xs" />
            </div>
            <div
              :class="[
                'absolute inset-x-0 bottom-0 h-[3px]',
                TIERS[entry.index].bar,
              ]"
            ></div>
          </div>
        </div>

        <ul
          v-if="extras.length > 0"
          class="flex flex-col divide-y divide-border/60 border-t border-dashed border-border pt-1"
        >
          <li
            v-for="prize in extras"
            :key="prize.id"
            class="flex items-center justify-between gap-4 py-2"
          >
            <span
              class="font-mono text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
            >
              {{ prize.place }}
            </span>
            <span class="text-right text-sm font-medium">{{ prize.prize }}</span>
          </li>
        </ul>
      </template>
    </div>
  </Card>
</template>
