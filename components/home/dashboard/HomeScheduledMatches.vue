<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { $, order_by } from "~/generated/zeus";
import { generateSubscription } from "~/graphql/graphqlGen";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import PlayScheduleRow from "~/components/play/PlayScheduleRow.vue";
import { scheduleMatchRow, sortScheduleRows } from "~/components/play/scheduleRow";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import {
  ACTIVE_MATCH_STATUSES,
  homePanelClasses,
  homePanelPaddingClasses,
  lineupHasPlayer,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

// "Your Scheduled Matches": every match that still needs this player, from
// scheduled (any distance ahead, tournament matches included) to live. Rows
// are the /play "Your Schedule" rows (5Stack PlayScheduleRow), so check-in
// and connect work the same way here. Hidden when there is nothing.
const props = defineProps<{ viewer: HomeViewer }>();

const { t } = useI18n();
const matches = ref<any[]>([]);
const sample = ref(false);

const lineupFields = {
  id: true,
  name: true,
  team: { name: true, short_name: true, avatar_url: true },
  lineup_players: [{}, { steam_id: true, checked_in: true }],
};

const query = generateSubscription({
  matches: [
    {
      where: {
        status: { _in: [...ACTIVE_MATCH_STATUSES] },
        ...lineupHasPlayer($("steam_id", "bigint!")),
      },
      order_by: [{ scheduled_at: order_by.asc_nulls_first }],
      limit: 6,
    },
    {
      id: true,
      status: true,
      scheduled_at: true,
      cancels_at: true,
      region: true,
      can_check_in: true,
      connection_link: true,
      options: { best_of: true, type: true },
      lineup_1: lineupFields,
      lineup_2: lineupFields,
      match_maps: [
        {},
        {
          is_current_map: true,
          lineup_1_score: true,
          lineup_2_score: true,
          winning_lineup_id: true,
          map: { name: true, label: true },
        },
      ],
      tournament_brackets: [
        { limit: 1 },
        { stage: { tournament: { id: true, name: true } } },
      ],
    },
  ],
} as any);

let subscription: { unsubscribe: () => void } | undefined;

async function useSamplesIfEmpty() {
  if (!import.meta.dev || !props.viewer.samples || matches.value.length) return;
  const { sampleScheduledMatches } = await import(
    "~/components/home/dashboard/homePreviewSamples"
  );
  matches.value = sampleScheduledMatches(props.viewer.steamId);
  sample.value = true;
}

watch(
  () => props.viewer.steamId,
  (steamId) => {
    subscription?.unsubscribe();
    subscription = undefined;
    matches.value = [];
    sample.value = false;
    if (!steamId || typeof window === "undefined") return;
    subscription = getGraphqlClient()
      .subscribe({ query, variables: { steam_id: steamId } })
      .subscribe({
        next: ({ data }: any) => {
          matches.value = data?.matches ?? [];
          sample.value = false;
          void useSamplesIfEmpty();
        },
        error: (error: any) => {
          console.error("[home] scheduled matches subscription:", error);
          void useSamplesIfEmpty();
        },
      });
  },
  { immediate: true },
);

const now = ref(new Date());
const clock =
  typeof window !== "undefined" ? setInterval(() => (now.value = new Date()), 30_000) : null;

onBeforeUnmount(() => {
  subscription?.unsubscribe();
  if (clock) clearInterval(clock);
});

const rows = computed(() =>
  sortScheduleRows(
    matches.value.map((match) =>
      scheduleMatchRow(match, { t, now: now.value, meSteamId: props.viewer.steamId }),
    ),
  ),
);
const matchesById = computed(() => new Map(matches.value.map((m) => [m.id, m])));
</script>

<template>
  <section
    v-if="rows.length"
    aria-labelledby="home-scheduled-title"
    :class="[homePanelClasses, homePanelPaddingClasses]"
    data-testid="home-scheduled-matches"
  >
    <HomeSectionHeader
      id="home-scheduled-title"
      title="Your Scheduled Matches"
      :sample="sample"
    />
    <div class="home-schedule-grid grid gap-2">
      <PlayScheduleRow
        v-for="row in rows"
        :key="row.key"
        :model="row"
        :match="matchesById.get(row.id)"
      />
    </div>
  </section>
</template>

<style scoped>
/* Same subgrid tracks and phone breakpoint as /play's schedule
   (PlaySchedule.vue); PlayScheduleRow stacks itself below 900px. */
.home-schedule-grid {
  grid-template-columns: 88px minmax(0, 1.4fr) minmax(0, 1fr) auto;
}

@media (max-width: 900px) {
  .home-schedule-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
