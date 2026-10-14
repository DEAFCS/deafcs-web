import { ref } from "vue";

// One queue join at a time across /play, the header and the hub. The API
// keys the queue by lobby, and a second join sent before the first is
// answered (a double click, or two entry points at once) can leave the lobby
// listed under two modes. Set when useQuickQueue sends a join; cleared when
// the server answers (matchmaking:details or matchmaking:error in Socket.ts)
// or after a timeout if the socket drops.
export const JOIN_PENDING_MS = 8000;

const joinPendingSince = ref(0);

export function markJoinPending(now = Date.now()) {
  joinPendingSince.value = now;
}

export function clearPendingJoin() {
  joinPendingSince.value = 0;
}

export function isJoinPending(now = Date.now()) {
  return (
    joinPendingSince.value > 0 &&
    now - joinPendingSince.value < JOIN_PENDING_MS
  );
}
