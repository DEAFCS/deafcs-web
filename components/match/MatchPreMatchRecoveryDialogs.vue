<script setup lang="ts">
// DEAFCS: Reset Veto and Reset Captain Pick for staff in the match's "..."
// menu. This half stays mounted with the match's actions: it follows the veto
// picks and the Captain Pick progress, runs rewindMapVeto (step 1, upstream's
// Redo the Veto) and resetCaptainPick, and holds the confirm dialogs (a menu
// item's own dialog would close with the menu). The menu's items are
// MatchPreMatchRecoveryMenuItems.
import { computed, onBeforeUnmount, shallowRef, watch, watchEffect } from "vue";
import { useI18n } from "vue-i18n";
import gql from "graphql-tag";
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
import { createCaptainPickProgress } from "~/composables/useCaptainPickProgress";
import {
  registerPreMatchRecovery,
  unregisterPreMatchRecovery,
  type PreMatchRecoveryState,
} from "~/composables/usePreMatchRecovery";
import { generateSubscription } from "~/graphql/graphqlGen";
import { e_match_status_enum, order_by } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import {
  canRunPreMatchRecovery,
  captainPickPicks,
  captainPickResettable,
  vetoResettable,
} from "~/utilities/preMatchRecovery";

const props = defineProps<{
  match: Record<string, any>;
}>();

const { t } = useI18n();
const nuxtApp = useNuxtApp();

const RESET_VETO = gql`
  mutation ResetVeto($matchId: uuid!, $expected: Int!) {
    rewindMapVeto(match_id: $matchId, step: 1, expected_picks: $expected) {
      success
    }
  }
`;

const RESET_CAPTAIN_PICK = gql`
  mutation ResetCaptainPick($matchId: uuid!, $expected: Int!) {
    resetCaptainPick(match_id: $matchId, expected_picks: $expected) {
      success
    }
  }
`;

const allowed = computed(() =>
  canRunPreMatchRecovery(props.match, (role) =>
    useAuthStore().isRoleAbove(role),
  ),
);

// The registered (reactive) state, while the viewer is staff for this match.
const state = shallowRef<PreMatchRecoveryState | undefined>();
let registeredFor: string | undefined;

watch(
  () => (allowed.value ? props.match?.id : ""),
  (matchId) => {
    if (registeredFor && state.value) {
      unregisterPreMatchRecovery(registeredFor, state.value);
    }
    state.value = matchId
      ? registerPreMatchRecovery(matchId, {
          vetoPicks: 0,
          canResetVeto: false,
          captainPicks: 0,
          canResetCaptainPick: false,
          confirming: null,
          expected: 0,
          busy: false,
        })
      : undefined;
    registeredFor = matchId || undefined;
  },
  { immediate: true },
);

// The veto picks, while a veto runs or a finished one could still be reset.
let picksSub: { unsubscribe: () => void } | undefined;
const vetoScope = computed(() => {
  const match = props.match;
  const open =
    match?.status === e_match_status_enum.Veto || vetoResettable(match, 1);
  return state.value && open ? match.id : "";
});

watch(
  vetoScope,
  (matchId) => {
    picksSub?.unsubscribe();
    picksSub = undefined;
    if (state.value) {
      state.value.vetoPicks = 0;
    }
    if (!matchId) {
      return;
    }
    const current = state.value!;
    picksSub = nuxtApp.$apollo.defaultClient
      .subscribe({
        query: generateSubscription({
          match_map_veto_picks: [
            {
              where: { match_id: { _eq: matchId } },
              order_by: [{ created_at: order_by.asc }],
            },
            { id: true },
          ],
        }),
      })
      .subscribe({
        next: ({ data }: any) => {
          current.vetoPicks = data?.match_map_veto_picks?.length ?? 0;
        },
      });
  },
  { immediate: true },
);

// The Captain Pick's public progress, while the captains pick.
const captainPick = createCaptainPickProgress(
  useRuntimeConfig().public.apiDomain as string,
);
watch(
  () =>
    state.value
      ? { id: props.match?.id, status: props.match?.status }
      : undefined,
  (match) => captainPick.update(match),
  { immediate: true, deep: true },
);

watchEffect(() => {
  const current = state.value;
  if (!current) {
    return;
  }
  current.canResetVeto = vetoResettable(props.match, current.vetoPicks);
  current.captainPicks = captainPickPicks(captainPick.state.progress);
  current.canResetCaptainPick = captainPickResettable(
    props.match,
    captainPick.state.progress,
  );
});

onBeforeUnmount(() => {
  picksSub?.unsubscribe();
  captainPick.stop();
  if (registeredFor && state.value) {
    unregisterPreMatchRecovery(registeredFor, state.value);
  }
});

const confirm = computed(() => {
  switch (state.value?.confirming) {
    case "veto":
      return {
        key: "reset_veto",
        mutation: RESET_VETO,
      };
    case "captain_pick":
      return {
        key: "reset_captain_pick",
        mutation: RESET_CAPTAIN_PICK,
      };
    default:
      return null;
  }
});

function close() {
  if (state.value) {
    state.value.confirming = null;
  }
}

async function run() {
  const current = state.value;
  const action = confirm.value;
  if (!current || !action || current.busy) {
    return;
  }
  current.busy = true;
  current.confirming = null;
  try {
    await nuxtApp.$apollo.defaultClient.mutate({
      mutation: action.mutation,
      variables: { matchId: props.match.id, expected: current.expected },
    });
    toast({ title: t(`match.recovery.${action.key}.done`) });
  } catch (error) {
    toast({
      title: t(`match.recovery.${action.key}.failed`),
      description: (error as Error)?.message,
      variant: "destructive",
    });
  } finally {
    current.busy = false;
  }
}
</script>

<template>
  <AlertDialog v-if="confirm" :open="!!confirm">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t(`match.recovery.${confirm.key}.title`)
        }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t(`match.recovery.${confirm.key}.description`) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="close">
          {{ $t("common.cancel") }}
        </AlertDialogCancel>
        <AlertDialogAction
          :data-testid="`${confirm.key.replaceAll('_', '-')}-confirm`"
          @click="run"
        >
          {{ $t(`match.recovery.${confirm.key}.confirm`) }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
