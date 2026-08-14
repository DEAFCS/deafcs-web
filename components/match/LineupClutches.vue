<script lang="ts" setup>
import { computed, ref, watch, onUnmounted } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import gql from "graphql-tag";
import ClutchTeamPanel from "~/components/match/ClutchTeamPanel.vue";
import { useMatchSide } from "~/composables/useMatchSide";
import mapLabel from "~/utilities/mapLabel";

type ClutchOutcome = "won" | "lost" | "saved";

type Clutch = {
  outcome: ClutchOutcome;
  round: number;
  match_map_id: string;
  clutcher_steam_id: string;
  against_count: number;
  kills_in_clutch: number;
  map_label: string;
};

const props = defineProps<{
  match: any;
  lineup1: any;
  lineup2: any;
  selectedMapId?: string | null;
}>();

const side = useMatchSide();
const { t } = useI18n();

// Clutches detected on the backend (v_match_clutches); the client only groups
// by lineup and applies the map + side filter.
const { client: apolloClient } = useApolloClient();
const clutchRows = ref<any[]>([]);
const CLUTCHES_SUB = gql`
  subscription MatchClutches($matchId: uuid!) {
    v_match_clutches(where: { match_id: { _eq: $matchId } }) {
      match_map_id
      round
      match_lineup_id
      clutcher_steam_id
      side
      against_count
      kills_in_clutch
      outcome
    }
  }
`;
let clutchSub: { unsubscribe: () => void } | null = null;
watch(
  () => props.match?.id,
  (id) => {
    clutchSub?.unsubscribe();
    clutchSub = null;
    clutchRows.value = [];
    if (!id) {
      return;
    }
    clutchSub = apolloClient
      .subscribe({ query: CLUTCHES_SUB, variables: { matchId: id } })
      .subscribe({
        next: ({ data }: any) => {
          clutchRows.value = data?.v_match_clutches ?? [];
        },
        error: () => {
          clutchRows.value = [];
        },
      });
  },
  { immediate: true },
);
onUnmounted(() => clutchSub?.unsubscribe());

function sideToken(): "t" | "ct" | null {
  if (side.value === "CT") return "ct";
  if (side.value === "T") return "t";
  return null;
}

function readableMapLabel(matchMapId: string): string {
  const matchMaps = props.match?.match_maps ?? [];
  const index = matchMaps.findIndex(
    (matchMap: any) => matchMap.id === matchMapId,
  );
  if (index < 0) return "";

  const matchMap = matchMaps[index];
  const label = mapLabel(matchMap.map);
  if (label && !/^workshop[\\/]/i.test(label)) return label;

  const order = Number(matchMap.order);
  return t("match.map_number", {
    count: (Number.isFinite(order) ? order : index) + 1,
  });
}

const clutchesByLineup = computed<Record<string, Clutch[]>>(() => {
  const result: Record<string, Clutch[]> = {
    [props.lineup1.id]: [],
    [props.lineup2.id]: [],
  };
  const token = sideToken();
  for (const c of clutchRows.value) {
    if (props.selectedMapId && c.match_map_id !== props.selectedMapId) continue;
    if (token && c.side !== token) continue;
    const arr = result[c.match_lineup_id];
    if (!arr) continue;
    arr.push({
      outcome: c.outcome as ClutchOutcome,
      round: c.round,
      match_map_id: c.match_map_id,
      clutcher_steam_id: String(c.clutcher_steam_id),
      against_count: c.against_count,
      kills_in_clutch: c.kills_in_clutch,
      map_label: readableMapLabel(c.match_map_id),
    });
  }
  return result;
});
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <ClutchTeamPanel
      :lineup="lineup1"
      :match="match"
      :clutches="clutchesByLineup[lineup1.id] || []"
      :selected-map-id="selectedMapId"
    />
    <ClutchTeamPanel
      :lineup="lineup2"
      :match="match"
      :clutches="clutchesByLineup[lineup2.id] || []"
      :selected-map-id="selectedMapId"
    />
  </div>
</template>
