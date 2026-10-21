<script setup lang="ts">
// DEAFCS: Veto Recovery for staff in the match's "..." menu. This half stays
// mounted with the match's actions: it follows the veto picks, runs
// rewindMapVeto / extendVetoClock, and holds the dialogs (a menu item's own
// dialog would close with the menu). The menu's items are
// MatchVetoRecoveryMenuItems. Ported from upstream 5Stack WEB's MatchActions
// (681116a, #908): subscribeVetoPicks, rewindVeto, extendVetoClock and the
// Undo confirm.
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import gql from "graphql-tag";
import MatchVetoFixDialog from "~/components/match/veto/MatchVetoFixDialog.vue";
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
import {
  registerVetoRecovery,
  unregisterVetoRecovery,
  type VetoRecoveryState,
} from "~/composables/useVetoRecovery";
import { generateSubscription } from "~/graphql/graphqlGen";
import { e_match_status_enum, order_by } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import { vetoTimelineSteps } from "~/utilities/rewind";
import {
  canRecoverVeto,
  vetoRecoveryItems,
  vetoRewindable,
} from "~/utilities/vetoRecovery";
import { mapVetoSteps } from "~/utilities/vetoLineups";

const props = defineProps<{
  match: Record<string, any>;
}>();

const { t } = useI18n();
const nuxtApp = useNuxtApp();

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

// The registered (reactive) state, while this match's veto can be fixed.
const state = shallowRef<VetoRecoveryState | undefined>();
let registeredFor: string | undefined;
let picksSub: { unsubscribe: () => void } | undefined;

// While the veto runs, or a finished veto can still be taken back.
const scope = computed(() => {
  const match = props.match;
  const fixable =
    match?.status === e_match_status_enum.Veto || vetoRewindable(match, 1);
  return fixable &&
    canRecoverVeto(match, (role) => useAuthStore().isRoleAbove(role))
    ? match.id
    : "";
});

async function rewindVeto(step: number, expected?: number) {
  const current = state.value;
  if (!current || current.busy) {
    return;
  }
  current.busy = true;
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: REWIND_MAP_VETO,
      variables: {
        matchId: props.match.id,
        step,
        expected: expected ?? current.picks.length,
      },
    });
    current.fixOpen = false;
    toast({ title: t("match.fix_menu.rewound", { step }) });
  } catch (error) {
    toast({
      title: t("match.fix_menu.rewind_failed"),
      description: (error as Error)?.message,
      variant: "destructive",
    });
  } finally {
    current.busy = false;
  }
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

function stop() {
  picksSub?.unsubscribe();
  picksSub = undefined;
  if (registeredFor && state.value) {
    unregisterVetoRecovery(registeredFor, state.value);
  }
  state.value = undefined;
  registeredFor = undefined;
}

function start(matchId: string) {
  const current = registerVetoRecovery(matchId, {
    picks: [],
    fixOpen: false,
    fixStep: 1,
    undoOpen: false,
    undoStep: 0,
    undoExpected: 0,
    busy: false,
    extendVetoClock,
  });
  state.value = current;
  registeredFor = matchId;
  picksSub = nuxtApp.$apollo.defaultClient
    .subscribe({
      query: generateSubscription({
        match_map_veto_picks: [
          {
            where: { match_id: { _eq: matchId } },
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
        current.picks = data?.match_map_veto_picks ?? [];
      },
    });
}

watch(
  scope,
  (matchId) => {
    stop();
    if (matchId) {
      start(matchId);
    }
  },
  { immediate: true },
);

onBeforeUnmount(stop);

const timeline = computed(() => {
  const current = state.value;
  if (!current) {
    return [];
  }
  const names = new Map(
    (props.match.options?.map_pool?.maps ?? []).map((map: any) => [
      map.id,
      map.name,
    ]),
  );
  return vetoTimelineSteps(mapVetoSteps(props.match, current.picks), (id) =>
    String(names.get(id) ?? ""),
  );
});

const undoDescription = computed(() =>
  state.value
    ? (vetoRecoveryItems(t, props.match, state.value.picks).find(
        (item) => item.key === "undo_last",
      )?.description ?? "")
    : "",
);

async function confirmUndo() {
  const current = state.value;
  if (!current) {
    return;
  }
  current.undoOpen = false;
  await rewindVeto(current.undoStep, current.undoExpected);
}
</script>

<template>
  <template v-if="state">
    <MatchVetoFixDialog
      v-model:open="state.fixOpen"
      :steps="timeline"
      :done="state.picks.length"
      :lineup1="match.lineup_1?.name ?? ''"
      :lineup2="match.lineup_2?.name ?? ''"
      :initial-step="state.fixStep"
      :best-of="match.options?.best_of ?? 1"
      :busy="state.busy"
      @confirm="rewindVeto"
    />

    <AlertDialog :open="state.undoOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{
            $t("match.fix_menu.undo_last_title")
          }}</AlertDialogTitle>
          <AlertDialogDescription>{{ undoDescription }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="state.undoOpen = false">
            {{ $t("common.cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="veto-undo-confirm"
            @click="confirmUndo"
          >
            {{ $t("match.fix_menu.undo_confirm") }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </template>
</template>
