<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { LucideVideo } from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  fetchLobbyCallParticipants,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

// Optional (never forced) multi-party webcam call for a matchmaking
// queue lobby -- distinct from the tournament required-webcam feature
// (no blocking overlay here, this is purely opt-in). Stays deliberately
// slim: this panel only tracks who's in the call and (only while a
// call is actually live) shows a "N in call — Join" banner + emits a
// status event so ChatPanel.vue's header icon can badge itself. The
// Facebook-style "X is calling" popup lives in
// GlobalLobbyCallNotifier.vue instead (mounted site-wide in
// layouts/default.vue) -- it has to reach a player no matter what page
// they're on or whether the chat sidebar is even open, not just while
// this component happens to be mounted. There's no "Start webcam call"
// button here either -- the header webcam icon in ChatPanel.vue is the
// single, single-click entry point for starting one. The actual video
// grid + QR/PC join flow lives in a dedicated popout window (opened by
// ChatPanel.vue) because the narrow chat sidebar column is too cramped
// for video tiles.
const props = withDefaults(
  defineProps<{ lobbyId: string; showBar?: boolean }>(),
  { showBar: true },
);
const emit = defineEmits<{
  (e: "open-call"): void;
  (e: "status", payload: { count: number; isInCall: boolean }): void;
}>();

const me = computed(() => useAuthStore().me);

const participants = ref<LobbyCallParticipant[]>([]);
const isInCall = computed(() =>
  participants.value.some((p) => p.steamId === String(me.value?.steam_id)),
);

watch(
  participants,
  () => emit("status", { count: participants.value.length, isInCall: isInCall.value }),
  { immediate: true },
);

async function refreshParticipants() {
  participants.value = await fetchLobbyCallParticipants(props.lobbyId);
}

let unlistenJoined: (() => void) | null = null;
let unlistenLeft: (() => void) | null = null;

onMounted(() => {
  refreshParticipants();

  const joinedListener = socket.listen(
    `lobby:matchmaking:${props.lobbyId}:call-joined`,
    (data: LobbyCallParticipant) => {
      if (!participants.value.some((p) => p.steamId === data.steamId)) {
        participants.value = [...participants.value, data];
      }
    },
  );
  unlistenJoined = () => joinedListener?.stop();

  const leftListener = socket.listen(
    `lobby:matchmaking:${props.lobbyId}:call-left`,
    (data: { steamId: string }) => {
      participants.value = participants.value.filter(
        (p) => p.steamId !== data.steamId,
      );
    },
  );
  unlistenLeft = () => leftListener?.stop();
});

onBeforeUnmount(() => {
  unlistenJoined?.();
  unlistenLeft?.();
});

defineExpose({ participants, isInCall });
</script>

<template>
  <!-- Ongoing-call banner -- only rendered while a call is actually
       live, so it never competes with an idle chat for attention.
       Hidden (but the participant tracking above stays live) while the
       matchmaking tab isn't the active one. -->
  <button
    v-if="showBar && participants.length && !isInCall"
    type="button"
    class="w-full flex items-center justify-between gap-2 px-3 py-2 border-b border-[hsl(var(--tac-amber))]/40 bg-[hsl(var(--tac-amber))]/10 hover:bg-[hsl(var(--tac-amber))]/15 transition-colors text-left"
    @click="emit('open-call')"
  >
    <span class="flex items-center gap-2 text-xs font-medium text-[hsl(var(--tac-amber))]">
      <LucideVideo class="h-3.5 w-3.5" />
      {{
        $t("matchmaking.lobby_call.in_call", "{count} in call", {
          count: participants.length,
        })
      }}
    </span>
    <span class="text-xs font-semibold text-[hsl(var(--tac-amber))] underline underline-offset-2">
      {{ $t("matchmaking.lobby_call.join", "Join call") }}
    </span>
  </button>
</template>
