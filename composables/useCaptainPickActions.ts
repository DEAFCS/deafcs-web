import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";
import {
  isMyCaptainPickTurn,
  localCaptainPickDeadline,
  type CaptainPickDraftState,
} from "~/utilities/captainPickDraft";

export type CaptainPickRequest = {
  confirmationId: string;
  steamId: string;
  pickIndex: number;
};

/** Existing participant action and clock, shared by the canonical Overview. */
export function useCaptainPickActions(
  draft: Ref<CaptainPickDraftState | null>,
  selfSteamId: Ref<string | null>,
  send: (request: CaptainPickRequest) => void,
) {
  const pendingPickIndex = ref<number | null>(null);
  const receivedAt = ref(Date.now());
  const now = ref(Date.now());
  let clock: ReturnType<typeof setInterval> | undefined;

  watch(draft, () => {
    // Only a server snapshot settles a request; never edit rosters locally.
    pendingPickIndex.value = null;
    receivedAt.value = Date.now();
    now.value = Date.now();
  }, { immediate: true });
  watch(selfSteamId, () => { pendingPickIndex.value = null; });

  const localDeadline = computed(() =>
    draft.value ? localCaptainPickDeadline(draft.value, receivedAt.value) : null,
  );
  const timeUp = computed(() =>
    !!localDeadline.value && draft.value?.phase === "Drafting" &&
    now.value >= new Date(localDeadline.value).getTime(),
  );
  const myTurn = computed(() => {
    const current = draft.value;
    const self = selfSteamId.value;
    return !!current && !!self &&
      current.participants.some((p) => String(p.steam_id) === String(self)) &&
      Object.values(current.captains).some((id) => String(id) === String(self)) &&
      isMyCaptainPickTurn(current, self);
  });
  const pending = computed(() => pendingPickIndex.value !== null);
  const canPick = computed(() => myTurn.value && !pending.value && !timeUp.value);

  function pick(steamId: string) {
    const current = draft.value;
    // Recheck wall time on click too, including between clock ticks.
    if (!current || !canPick.value || current.pickIndex === null ||
        !current.available.includes(steamId) ||
        (localDeadline.value && Date.now() >= new Date(localDeadline.value).getTime())) return;
    pendingPickIndex.value = current.pickIndex;
    send({ confirmationId: current.draftId, steamId, pickIndex: current.pickIndex });
  }

  onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 250); });
  onBeforeUnmount(() => { if (clock) clearInterval(clock); });
  return { pick, canPick, myTurn, pending, timeUp, localDeadline };
}
