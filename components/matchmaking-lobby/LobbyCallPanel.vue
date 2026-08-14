<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { Button } from "~/components/ui/button";
import { LucideVideo, LucidePhoneIncoming } from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  fetchLobbyCallParticipants,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

// Optional (never forced) multi-party webcam call for a matchmaking
// queue lobby -- distinct from the tournament required-webcam feature
// (no blocking overlay here, this is purely opt-in). Stays deliberately
// slim: this panel only tracks who's in the call and shows the
// Facebook-style "X is calling" popup. The actual video grid + QR/PC
// join flow lives in a dedicated popout window (opened by ChatPanel.vue)
// because the narrow chat sidebar column is too cramped for video tiles.
const props = withDefaults(
  defineProps<{ lobbyId: string; showBar?: boolean }>(),
  { showBar: true },
);
const emit = defineEmits<{ (e: "open-call"): void }>();

const me = computed(() => useAuthStore().me);

const participants = ref<LobbyCallParticipant[]>([]);
const isInCall = computed(() =>
  participants.value.some((p) => p.steamId === String(me.value?.steam_id)),
);

async function refreshParticipants() {
  participants.value = await fetchLobbyCallParticipants(props.lobbyId);
}

// --- Incoming call popup (Facebook-style) ---
const incomingCall = ref<LobbyCallParticipant | null>(null);
let incomingCallTimer: ReturnType<typeof setTimeout> | null = null;

function showIncomingCall(participant: LobbyCallParticipant) {
  if (isInCall.value) return;
  if (String(me.value?.steam_id) === participant.steamId) return;
  incomingCall.value = participant;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
  incomingCallTimer = setTimeout(() => {
    incomingCall.value = null;
  }, 15_000);
}

function dismissIncomingCall() {
  incomingCall.value = null;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
}

function answerIncomingCall() {
  dismissIncomingCall();
  emit("open-call");
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
      showIncomingCall(data);
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
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
});

defineExpose({ participants, isInCall });
</script>

<template>
  <div class="relative">
    <!-- Incoming call popup -->
    <Transition name="lobby-item">
      <div
        v-if="incomingCall"
        class="absolute z-30 top-2 left-2 right-2 rounded-lg border border-[hsl(var(--tac-amber))]/50 bg-zinc-900/95 backdrop-blur px-3 py-2.5 flex items-center gap-3 shadow-xl"
      >
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tac-amber))]/15 animate-pulse"
        >
          <LucidePhoneIncoming class="h-4 w-4 text-[hsl(var(--tac-amber))]" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold truncate">
            {{ incomingCall.name || "Someone" }}
          </div>
          <div class="text-xs text-muted-foreground">is calling…</div>
        </div>
        <Button size="sm" variant="secondary" @click="dismissIncomingCall">
          {{ $t("common.decline", "Decline") }}
        </Button>
        <Button size="sm" @click="answerIncomingCall">
          {{ $t("common.accept", "Accept") }}
        </Button>
      </div>
    </Transition>

    <!-- Compact status bar -- the actual video grid always lives in the
         popout window ChatPanel.vue opens via the webcam header button.
         Hidden (but the popup/socket listeners above stay live) while
         the matchmaking tab isn't the active one. -->
    <div
      v-if="showBar"
      class="px-2 py-1.5 flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-950"
    >
      <span v-if="participants.length" class="text-[11px] text-muted-foreground">
        {{
          $t("matchmaking.lobby_call.in_call", "{count} in call", {
            count: participants.length,
          })
        }}
      </span>
      <span v-else class="text-[11px] text-muted-foreground">
        {{ $t("matchmaking.lobby_call.no_call", "No active call") }}
      </span>
      <Button
        size="xs"
        :variant="isInCall ? 'secondary' : 'default'"
        class="h-7 gap-1.5 text-[11px]"
        @click="emit('open-call')"
      >
        <LucideVideo class="h-3.5 w-3.5" />
        {{
          isInCall
            ? $t("matchmaking.lobby_call.in_call_label", "In call")
            : participants.length
              ? $t("matchmaking.lobby_call.join", "Join call")
              : $t("matchmaking.lobby_call.start", "Start webcam call")
        }}
      </Button>
    </div>
  </div>
</template>
