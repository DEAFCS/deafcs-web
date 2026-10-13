import { computed, ref } from "vue";
import { useFriendActions } from "~/composables/useFriendActions";
import socket from "~/web-sockets/Socket";
import {
  directTabId,
  directPeerSteamId,
  type DirectMessagePeer,
} from "~/composables/useDirectMessage";

// A first message from someone who is not a friend. It waits here rather than
// on the rail: no tab, no badge, no flash, so a flood of them cannot take over
// the chat. Replying accepts it; declining hides it, and the sender is never
// told. The server owns the state -- this mirrors it.
export interface MessageRequest {
  roomId: string;
  peer: DirectMessagePeer;
  unread: number;
}

const requestsRef = ref<MessageRequest[]>([]);
// Conversations the server says are waiting on the other side to reply to this
// player's request, and ones it says are not. A conversation started in this
// session is in neither, and is worked out from its messages instead.
const awaitingRef = ref<Set<string>>(new Set());
const declining = new Set<string>();
// A successful deny must survive a duplicate event already in transit.
const deniedRooms = new Set<string>();
const settledRef = ref<Set<string>>(new Set());

function apiBase() {
  return `https://${useRuntimeConfig().public.apiDomain}/chat/direct/conversations`;
}

export function useMessageRequests() {
  const authStore = useAuthStore();

  const requests = computed(() =>
    requestsRef.value.filter(
      (request) => !useBlockActions().isBlocked(request.peer.steam_id),
    ),
  );
  const requestCount = computed(() => requests.value.length);

  function isRequest(roomId: string | undefined) {
    return (
      !!roomId && requestsRef.value.some((request) => request.roomId === roomId)
    );
  }

  function addRequest(request: MessageRequest) {
    if (
      directPeerSteamId(request.roomId, authStore.me?.steam_id) !==
        String(request.peer?.steam_id) ||
      settledRef.value.has(request.roomId) ||
      deniedRooms.has(request.roomId) ||
      useBlockActions().isBlocked(request.peer.steam_id)
    )
      return;
    useChatTabs().resetUnread(directTabId(request.roomId));
    useChatTabs().setRequestPreview(directTabId(request.roomId), true);
    const existing = requestsRef.value.find(
      ({ roomId }) => roomId === request.roomId,
    );

    if (existing) {
      existing.unread = Math.max(existing.unread, request.unread);
      return;
    }

    requestsRef.value = [request, ...requestsRef.value];
  }

  function removeRequest(roomId: string) {
    requestsRef.value = requestsRef.value.filter(
      (request) => request.roomId !== roomId,
    );
  }

  function setRequests(list: MessageRequest[]) {
    requestsRef.value = [];
    for (const request of [...list].reverse()) addRequest(request);
  }

  // What the server last said about this player's side of a conversation.
  function setAwaitingReply(roomId: string, awaiting: boolean) {
    const awaitingRooms = new Set(awaitingRef.value);
    const settledRooms = new Set(settledRef.value);

    if (awaiting) {
      awaitingRooms.add(roomId);
      settledRooms.delete(roomId);
    } else {
      awaitingRooms.delete(roomId);
      settledRooms.add(roomId);
      deniedRooms.delete(roomId);
      removeRequest(roomId);
      useChatTabs().setRequestPreview(directTabId(roomId), false);
    }

    awaitingRef.value = awaitingRooms;
    settledRef.value = settledRooms;
  }

  // Whether this player has sent their one message and is waiting on a reply.
  // Confirmed API state takes priority; older APIs fall back to room messages.
  function isAwaitingReply(
    roomId: string | undefined,
    peerSteamId: string | undefined,
  ): boolean {
    const me = authStore.me?.steam_id;

    if (!roomId || !peerSteamId || !me) {
      return false;
    }

    const messages = socket.lobbyMessages?.("direct", roomId) ?? [];
    if (!messages.length && !awaitingRef.value.has(roomId)) return false;
    if (useFriendActions().relationship(peerSteamId) === "friend") return false;
    // Explicit API state wins over old Redis history. Message inference is only
    // a fallback for a conversation whose authoritative state has not loaded.
    if (awaitingRef.value.has(roomId)) return true;
    if (settledRef.value.has(roomId)) return false;
    if (
      messages.some(
        (message) => String(message.from?.steam_id) === String(peerSteamId),
      )
    )
      return false;

    return messages.some(
      (message) => String(message.from?.steam_id) === String(me),
    );
  }

  async function decline(roomId: string) {
    const account = authStore.me?.steam_id;
    const key = String(account) + ":" + roomId;
    if (!account || !isRequest(roomId) || declining.has(key)) return;
    declining.add(key);
    try {
      await $fetch(`${apiBase()}/${encodeURIComponent(roomId)}/decline`, {
        method: "POST",
        credentials: "include",
      });
      // A reply from another session or an account switch can finish first.
      if (authStore.me?.steam_id !== account || !isRequest(roomId)) return;
      deniedRooms.add(roomId);
      removeRequest(roomId);
      useChatTabs().closeTab(directTabId(roomId));
    } finally {
      declining.delete(key);
    }
  }

  function reset() {
    declining.clear();
    deniedRooms.clear();
    requestsRef.value = [];
    awaitingRef.value = new Set();
    settledRef.value = new Set();
  }

  return {
    hasConversation: (peer: string) =>
      [...settledRef.value, ...awaitingRef.value].some((room) =>
        room.split(":").includes(String(peer)),
      ) || useChatTabs().tabs.value.some(tab => tab.type === "direct" && !tab.requestPreview && tab.otherSteamId === String(peer)),
    requests,
    requestCount,
    isRequest,
    addRequest,
    removeRequest,
    setRequests,
    setAwaitingReply,
    isAwaitingReply,
    decline,
    reset,
  };
}
