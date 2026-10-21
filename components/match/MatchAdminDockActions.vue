<script setup lang="ts">
// The admin dock's controls: the dock half of upstream's MatchActions
// (5Stack WEB 681116a #908, MatchActions.vue with `dock`).
//
// DEAFCS: a component of its own, so the match's "..." menu (MatchActions.vue)
// stays as it is. Only the step-aware recovery controls are here: Pause and
// Resume while a map is played, and Fix a Problem with the veto fixes (Undo the
// Last Step, Fix a Mis-pick, Redo the Veto, Give 30 Seconds More), Restore
// Round and Restart Map. Cancel, Delete, Set Winner, Reboot and the rest stay
// in the "..." menu. Restore Round and Restart Map open the same dialogs as
// the menu and the Rounds tab. The api checks every one of these itself.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import gql from "graphql-tag";
import { Pause, Play } from "lucide-vue-next";
import MatchDockLabel from "~/components/match/MatchDockLabel.vue";
import MatchFixProblemButton from "~/components/match/MatchFixProblemButton.vue";
import MatchRestartMapDialog from "~/components/match/MatchRestartMapDialog.vue";
import MatchRestoreRoundDialog from "~/components/match/MatchRestoreRoundDialog.vue";
import MatchVetoFixDialog from "~/components/match/veto/MatchVetoFixDialog.vue";
import { dockPrimary } from "~/components/match/matchDockClasses";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { generateSubscription } from "~/graphql/graphqlGen";
import {
  e_match_map_status_enum,
  e_match_status_enum,
  e_player_roles_enum,
  e_veto_pick_types_enum,
  order_by,
} from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import { matchFixMenu } from "~/utilities/fixProblem";
import { currentMatchAdminStep } from "~/utilities/matchAdminSteps";
import { vetoTimelineSteps } from "~/utilities/rewind";
import { mapVetoSteps } from "~/utilities/vetoLineups";

const props = defineProps<{
  match: Record<string, any>;
  compact?: boolean;
}>();

defineSlots<{
  // DEAFCS: Captain Pick recovery, shown while the captains pick. It comes
  // with the Captain Pick work, which owns how a pick is taken back.
  "captain-pick"(props: { compact: boolean }): any;
}>();

const { t } = useI18n();
const nuxtApp = useNuxtApp();

const SET_MATCH_PAUSED = gql`
  mutation SetMatchPaused($match_id: uuid!, $paused: Boolean!) {
    setMatchPaused(match_id: $match_id, paused: $paused) {
      success
    }
  }
`;

const REWIND_MAP_VETO = gql`
  mutation RewindMapVeto($matchId: uuid!, $step: Int!, $expected: Int!) {
    rewindMapVeto(match_id: $matchId, step: $step, expected_picks: $expected) {
      success
    }
  }
`;

const EXTEND_VETO_CLOCK = gql`
  mutation ExtendVetoClock($matchId: uuid!, $seconds: Int!) {
    extendVetoClock(match_id: $matchId, seconds: $seconds) {
      success
    }
  }
`;

const fixOpen = ref(false);
const restoreOpen = ref(false);
const restartMapOpen = ref(false);
const undoOpen = ref(false);
const togglingPause = ref(false);
const vetoFixOpen = ref(false);
const vetoFixStep = ref(1);
const vetoRewinding = ref(false);
const vetoPicks = ref<Array<any>>([]);
let vetoPicksSub: { unsubscribe: () => void } | undefined;

const currentMap = computed(() =>
  props.match.match_maps?.find((map: any) => map.is_current_map),
);

const isPaused = computed(
  () => currentMap.value?.status === e_match_map_status_enum.Paused,
);

// DEAFCS: organizers of the match, also while playing in it from
// match_organizer up (the api's rule for the map controls and the veto).
const canControl = computed(
  () =>
    !!props.match.is_organizer &&
    (!props.match.is_in_lineup ||
      useAuthStore().isRoleAbove(e_player_roles_enum.match_organizer)),
);

// MatchActions' canPauseResume.
const canPauseResume = computed(() => {
  if (!canControl.value || props.match.status !== e_match_status_enum.Live) {
    return false;
  }
  const status = currentMap.value?.status;
  return (
    status === e_match_map_status_enum.Live ||
    status === e_match_map_status_enum.Overtime ||
    status === e_match_map_status_enum.Paused
  );
});

const isCaptainPick = computed(
  () => currentMatchAdminStep(props.match) === "captain_pick",
);

const vetoPicksScope = computed(() => {
  const mapsStarted = (props.match.match_maps ?? []).some(
    (map: any) => map.status && map.status !== "Scheduled",
  );
  const rewindable =
    props.match.status === e_match_status_enum.Veto ||
    ([e_match_status_enum.WaitingForServer, e_match_status_enum.Live].includes(
      props.match.status,
    ) &&
      !mapsStarted);
  return canControl.value && props.match.options?.map_veto && rewindable
    ? props.match.id
    : "";
});

function subscribeVetoPicks() {
  if (!vetoPicksScope.value) {
    return;
  }
  vetoPicksSub = nuxtApp.$apollo.defaultClient
    .subscribe({
      query: generateSubscription({
        match_map_veto_picks: [
          {
            where: { match_id: { _eq: props.match.id } },
            order_by: [{ created_at: order_by.asc }],
          },
          {
            id: true,
            type: true,
            side: true,
            match_lineup_id: true,
            auto_picked: true,
            map: { id: true, name: true, label: true },
          },
        ],
      }),
    })
    .subscribe({
      next: ({ data }: any) => {
        vetoPicks.value = data?.match_map_veto_picks ?? [];
      },
    });
}

watch(
  vetoPicksScope,
  () => {
    vetoPicksSub?.unsubscribe();
    vetoPicksSub = undefined;
    vetoPicks.value = [];
    subscribeVetoPicks();
  },
  { immediate: true },
);

onBeforeUnmount(() => vetoPicksSub?.unsubscribe());

const vetoTimeline = computed(() => {
  const names = new Map(
    (props.match.options?.map_pool?.maps ?? []).map((map: any) => [
      map.id,
      map.name,
    ]),
  );
  return vetoTimelineSteps(mapVetoSteps(props.match, vetoPicks.value), (id) =>
    String(names.get(id) ?? ""),
  );
});

const lastVetoStep = computed(() =>
  vetoPicks.value.at(-1)?.type === e_veto_pick_types_enum.Decider
    ? vetoPicks.value.length - 1
    : vetoPicks.value.length,
);

const fixMenu = computed(() =>
  matchFixMenu(t, props.match, vetoPicks.value, {
    canControl: canControl.value,
    // fix/restart-match: administrators' Restart Match (MatchRestartDialog)
    // joins the menu here, under "restart".
    canRestartMatch: false,
  }),
);

const canFixProblems = computed(
  () => fixMenu.value.now.length + fixMenu.value.anytime.length > 0,
);

const undoDescription = computed(
  () =>
    fixMenu.value.now.find((item) => item.key === "undo_last")?.description ??
    "",
);

let undoExpected = 0;
let undoStep = 0;

async function onFixSelect(action: string) {
  fixOpen.value = false;
  switch (action) {
    case "undo_last":
      undoStep = lastVetoStep.value;
      undoExpected = vetoPicks.value.length;
      undoOpen.value = true;
      break;
    case "mispick":
      vetoFixStep.value = Math.max(1, lastVetoStep.value);
      vetoFixOpen.value = true;
      break;
    case "redo":
      vetoFixStep.value = 1;
      vetoFixOpen.value = true;
      break;
    case "time":
      await extendVetoClock();
      break;
    case "restore":
      restoreOpen.value = true;
      break;
    case "restart_map":
      restartMapOpen.value = true;
      break;
  }
}

async function rewindVeto(step: number, expected = vetoPicks.value.length) {
  if (vetoRewinding.value) {
    return;
  }
  vetoRewinding.value = true;
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: REWIND_MAP_VETO,
      variables: { matchId: props.match.id, step, expected },
    });
    vetoFixOpen.value = false;
    toast({ title: t("match.fix_menu.rewound", { step }) });
  } catch (error) {
    toast({
      title: t("match.fix_menu.rewind_failed"),
      description: (error as Error)?.message,
      variant: "destructive",
    });
  } finally {
    vetoRewinding.value = false;
  }
}

async function confirmUndo() {
  undoOpen.value = false;
  await rewindVeto(undoStep, undoExpected);
}

async function extendVetoClock() {
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: EXTEND_VETO_CLOCK,
      variables: { matchId: props.match.id, seconds: 30 },
    });
    toast({ title: t("match.fix_menu.time_added", { seconds: 30 }) });
  } catch (error) {
    toast({
      title: t("match.fix_menu.time_failed"),
      description: (error as Error)?.message,
      variant: "destructive",
    });
  }
}

// MatchActions' togglePause.
async function togglePause() {
  const paused = !isPaused.value;
  togglingPause.value = true;
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: SET_MATCH_PAUSED,
      variables: { match_id: props.match.id, paused },
    });
    toast({
      title: paused
        ? t("match.actions.match_paused")
        : t("match.actions.match_resumed"),
    });
  } catch (error) {
    toast({
      variant: "destructive",
      title: t("common.error"),
      description: (error as Error)?.message,
    });
  } finally {
    togglingPause.value = false;
  }
}
</script>

<template>
  <slot v-if="isCaptainPick" name="captain-pick" :compact="!!compact" />

  <button
    v-if="canPauseResume"
    type="button"
    :class="dockPrimary"
    :disabled="!match.is_server_online || togglingPause"
    data-testid="dock-pause"
    @click="togglePause"
  >
    <MatchDockLabel
      :label="isPaused ? $t('match.actions.resume') : $t('match.actions.pause')"
      :compact="compact"
    >
      <component :is="isPaused ? Play : Pause" class="h-3 w-3 shrink-0" />
    </MatchDockLabel>
  </button>

  <MatchFixProblemButton
    v-if="canFixProblems"
    v-model:open="fixOpen"
    :menu="fixMenu"
    :compact="compact"
    @select="onFixSelect"
  />

  <MatchVetoFixDialog
    v-model:open="vetoFixOpen"
    :steps="vetoTimeline"
    :done="vetoPicks.length"
    :lineup1="match.lineup_1?.name ?? ''"
    :lineup2="match.lineup_2?.name ?? ''"
    :initial-step="vetoFixStep"
    :best-of="match.options?.best_of ?? 1"
    :busy="vetoRewinding"
    @confirm="rewindVeto"
  />

  <MatchRestoreRoundDialog
    v-if="restoreOpen"
    v-model:open="restoreOpen"
    :match="match"
  />

  <MatchRestartMapDialog
    v-if="restartMapOpen"
    v-model:open="restartMapOpen"
    :match="match"
  />

  <AlertDialog :open="undoOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t("match.fix_menu.undo_last_title")
        }}</AlertDialogTitle>
        <AlertDialogDescription>{{ undoDescription }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="undoOpen = false">
          {{ $t("common.cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction data-testid="dock-undo-confirm" @click="confirmUndo">
          {{ $t("match.fix_menu.undo_confirm") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
