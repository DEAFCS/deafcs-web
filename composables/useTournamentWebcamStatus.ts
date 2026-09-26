// Live participant count for a tournament webcam support room, for the
// tournament chat header icon in ChatPanel.vue (orange + count while
// anyone is in it).
//
// Deliberately passive: it only reads presence. Nobody is rung, no popup
// or push is shown and nothing opens by itself; people notice the orange
// icon and join by clicking it. It listens on the tournament channel's
// call-joined / call-left events (which only people in that tournament
// chat receive) and re-fetches on an interval, since a dropped
// connection frees its slot server-side without a call-left event.
import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import socket from "~/web-sockets/Socket";
import {
  fetchTournamentWebcamParticipants,
  TOURNAMENT_WEBCAM_POLL_MS,
  type WebcamRoomParticipant,
} from "~/composables/useWebcamRoomApi";

export function useTournamentWebcamStatus(tournamentId: Ref<string | null>) {
  const participants = ref<WebcamRoomParticipant[]>([]);
  let stopListeners: Array<() => void> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let generation = 0;

  function stop() {
    generation++;
    stopListeners.forEach((fn) => fn());
    stopListeners = [];
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    participants.value = [];
  }

  async function refresh(id: string, gen: number) {
    const { participants: next } = await fetchTournamentWebcamParticipants(id);
    if (gen === generation) participants.value = next;
  }

  function start(id: string) {
    stop();
    const gen = generation;
    void refresh(id, gen);

    const joined = socket.listen(
      `lobby:tournament:${id}:call-joined`,
      (data: WebcamRoomParticipant) => {
        if (!participants.value.some((p) => p.steamId === data.steamId)) {
          participants.value = [...participants.value, data];
        }
      },
    );
    const left = socket.listen(
      `lobby:tournament:${id}:call-left`,
      (data: { steamId: string }) => {
        participants.value = participants.value.filter(
          (p) => p.steamId !== data.steamId,
        );
      },
    );
    stopListeners = [() => joined?.stop(), () => left?.stop()];
    pollTimer = setInterval(() => void refresh(id, gen), TOURNAMENT_WEBCAM_POLL_MS);
  }

  watch(
    tournamentId,
    (id) => {
      if (id) start(id);
      else stop();
    },
    { immediate: true },
  );

  onBeforeUnmount(stop);

  return { participants };
}
