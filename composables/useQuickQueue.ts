import { computed } from "vue";
import { useNow } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import socket from "~/web-sockets/Socket";
import { localServerTime } from "~/utilities/matchmakingDeadline";
import type { MatchmakingQueueVariant } from "~/utilities/matchmakingModes";

// The search as the hub dock and the Lobby panel show it: what is being
// searched for and for how long (5Stack's useQuickQueue).
//
// DEAFCS: only the read side and the leader's cancel are ported. Upstream also
// queues from here with its own mode picker, but DEAFCS's queue rules (Captain
// Pick, verified-only modes, the matchmaking switches, party sizes) live on
// /play, so the Lobby panel sends the leader there instead of starting a
// search on a second path that could disagree with it.

type QueueDetails = {
  type: string;
  variant?: MatchmakingQueueVariant;
  regions?: string[];
  joinedAt?: string;
  serverNow?: string;
  receivedAt?: number;
};

export function useQuickQueue() {
  const { t } = useI18n();
  const matchmakingStore = useMatchmakingStore();

  const queue = computed(
    () =>
      (matchmakingStore.joinedMatchmakingQueues as any)?.details as
        | QueueDetails
        | undefined,
  );

  // When the search started on this device's clock. The server stamps
  // joinedAt on its own clock and sends its clock with it (Theft's
  // serverNow/receivedAt), so a device whose clock is off still counts from
  // the real start.
  const startedAt = computed(() =>
    localServerTime(queue.value?.joinedAt, queue.value),
  );

  // How long the search has been running, as m:ss. Only reads the clock while
  // a search is on, so an idle dock never re-renders on the tick.
  const now = useNow({ interval: 1000 });
  const clock = computed(() => {
    const started = startedAt.value;
    if (started === undefined) return null;
    const seconds = Math.max(
      0,
      Math.floor((now.value.getTime() - started) / 1000),
    );
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });

  // The same name /play gives the mode: Captain Pick by its queue name,
  // everything else by its match type.
  function modeTitle(details: Pick<QueueDetails, "type" | "variant">) {
    return details.variant === "CaptainPick"
      ? t("matchmaking.captain_pick.title")
      : details.type;
  }

  // Exactly what /play sends (Matchmaking.vue's leaveMatchmaking): no data.
  function leave() {
    socket.event(
      "matchmaking:leave",
      undefined as unknown as Record<string, unknown>,
    );
  }

  return { queue, clock, modeTitle, leave };
}
