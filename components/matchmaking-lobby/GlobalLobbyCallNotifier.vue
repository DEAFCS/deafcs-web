<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { Button } from "~/components/ui/button";
import { LucidePhoneIncoming } from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  fetchLobbyCallParticipants,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

// Site-wide "X is calling…" popup for the matchmaking-lobby webcam call
// -- mounted once in layouts/default.vue so it reaches a player no
// matter what page they're on or whether the chat sidebar is even
// open, unlike LobbyCallPanel.vue's in-chat banner (which stays scoped
// to the chat UI on purpose, that one's just the "still ongoing, join
// whenever" reminder). Both listen to the same call-joined/call-left
// broadcast; only this one owns the incoming-call popup itself.
const authStore = useAuthStore();
const lobbyId = computed(() => authStore.me?.current_lobby_id ?? null);
const myId = computed(() => String(authStore.me?.steam_id ?? ""));

const incomingCall = ref<LobbyCallParticipant | null>(null);
let incomingCallTimer: ReturnType<typeof setTimeout> | null = null;
let alreadyInCall = false;

async function refreshAlreadyInCall(id: string) {
  const participants = await fetchLobbyCallParticipants(id);
  alreadyInCall = participants.some((p) => p.steamId === myId.value);
}

function showIncomingCall(participant: LobbyCallParticipant) {
  if (alreadyInCall) return;
  if (myId.value === participant.steamId) return;
  incomingCall.value = participant;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
  incomingCallTimer = setTimeout(() => {
    incomingCall.value = null;
  }, 15_000);
}

function dismiss() {
  incomingCall.value = null;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
}

function accept() {
  dismiss();
  const id = lobbyId.value;
  if (!id) return;
  const w = 960;
  const h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "location=no",
    "menubar=no",
    "toolbar=no",
    "status=no",
  ].join(",");
  window.open(`/matchmaking/lobby-call/${id}`, "lobby-call", features);
}

let unlistenJoined: (() => void) | null = null;
let unlistenLeft: (() => void) | null = null;
let subscribedLobbyId: string | null = null;

function unsubscribe() {
  unlistenJoined?.();
  unlistenLeft?.();
  unlistenJoined = null;
  unlistenLeft = null;
  subscribedLobbyId = null;
  alreadyInCall = false;
  dismiss();
}

function subscribe(id: string) {
  refreshAlreadyInCall(id);

  const joinedListener = socket.listen(
    `lobby:matchmaking:${id}:call-joined`,
    (data: LobbyCallParticipant) => {
      if (data.steamId === myId.value) alreadyInCall = true;
      showIncomingCall(data);
    },
  );
  unlistenJoined = () => joinedListener?.stop();

  const leftListener = socket.listen(
    `lobby:matchmaking:${id}:call-left`,
    (data: { steamId: string }) => {
      if (data.steamId === myId.value) alreadyInCall = false;
    },
  );
  unlistenLeft = () => leftListener?.stop();

  subscribedLobbyId = id;
}

watch(
  lobbyId,
  (id) => {
    if (subscribedLobbyId && subscribedLobbyId !== id) unsubscribe();
    if (id && subscribedLobbyId !== id) subscribe(id);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unsubscribe();
});
</script>

<template>
  <Transition name="lobby-item">
    <div
      v-if="incomingCall"
      class="fixed z-[100] top-4 left-1/2 -translate-x-1/2 w-[min(92vw,380px)] rounded-lg border border-[hsl(var(--tac-amber))]/50 bg-zinc-900/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-2xl"
    >
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tac-amber))]/15 animate-pulse"
      >
        <LucidePhoneIncoming class="h-4.5 w-4.5 text-[hsl(var(--tac-amber))]" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold truncate">
          {{ incomingCall.name || "Someone" }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ $t("matchmaking.lobby_call.tooltip", "Webcam call") }}…
        </div>
      </div>
      <Button size="sm" variant="secondary" @click="dismiss">
        {{ $t("common.decline", "Decline") }}
      </Button>
      <Button size="sm" @click="accept">
        {{ $t("common.accept", "Accept") }}
      </Button>
    </div>
  </Transition>
</template>

<style scoped>
/* Only fades -- the element already carries its own -translate-x-1/2
   via Tailwind, and animating `transform` here too would fight that. */
.lobby-item-enter-active,
.lobby-item-leave-active {
  transition: opacity 0.2s ease;
}
.lobby-item-enter-from,
.lobby-item-leave-to {
  opacity: 0;
}
</style>
