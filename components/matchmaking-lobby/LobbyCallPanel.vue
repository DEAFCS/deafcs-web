<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import QRCode from "qrcode";
import { Button } from "~/components/ui/button";
import {
  LucideVideo,
  LucidePhoneOff,
  LucideSmartphone,
  LucideMonitor,
  LucideArrowLeft,
  LucidePhoneIncoming,
} from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  joinLobbyCall,
  fetchLobbyCallParticipants,
  lobbyCallJoinUrl,
  lobbyCallPeerWhepUrl,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

// Optional (never forced) multi-party webcam call for a matchmaking
// queue lobby -- distinct from the tournament required-webcam feature
// (no blocking overlay here, this is purely opt-in). Reuses the same
// "QR on phone or popup on this PC" join pattern, and the same
// WHIP-publish/WHEP-pull-everyone-else shape server-side.
const props = defineProps<{ lobbyId: string }>();

const me = computed(() => useAuthStore().me);

const participants = ref<LobbyCallParticipant[]>([]);
const isInCall = computed(() =>
  participants.value.some((p) => p.steamId === String(me.value?.steam_id)),
);

type Step = "idle" | "choose" | "mobile" | "pc";
const step = ref<Step>("idle");
const joinToken = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);
const joinError = ref<string | null>(null);

const joinUrl = computed(() =>
  joinToken.value ? lobbyCallJoinUrl(props.lobbyId, joinToken.value) : null,
);

watch(joinUrl, async (url) => {
  if (!url) {
    qrDataUrl.value = null;
    return;
  }
  qrDataUrl.value = await QRCode.toDataURL(url, { width: 220, margin: 1 });
});

async function refreshParticipants() {
  participants.value = await fetchLobbyCallParticipants(props.lobbyId);
}

async function startOrJoin() {
  joinError.value = null;
  const result = await joinLobbyCall(props.lobbyId);
  if (result.error) {
    joinError.value = result.error;
    return;
  }
  joinToken.value = result.token;
  participants.value = result.participants;
  step.value = "choose";
}

function connectOnThisComputer() {
  step.value = "pc";
  if (!joinUrl.value) return;
  window.open(joinUrl.value, "lobby-call-connect", "width=480,height=760");
}

function closePicker() {
  step.value = "idle";
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
  startOrJoin();
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

// --- Video tiles for everyone currently in the call (WHEP pull) ---
const tileRefs = ref<Record<string, HTMLVideoElement | null>>({});
const activePeerConnections = new Map<string, RTCPeerConnection>();

function setTileRef(steamId: string) {
  return (el: any) => {
    tileRefs.value[steamId] = el as HTMLVideoElement | null;
  };
}

async function connectTile(steamId: string) {
  if (activePeerConnections.has(steamId)) return;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  activePeerConnections.set(steamId, pc);
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = (e) => {
    const el = tileRefs.value[steamId];
    if (el) el.srcObject = e.streams[0];
  };
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") resolve();
      });
      setTimeout(resolve, 1500);
    });
    const res = await fetch(lobbyCallPeerWhepUrl(props.lobbyId, steamId), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) throw new Error(await res.text());
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
  } catch {
    disconnectTile(steamId);
  }
}

function disconnectTile(steamId: string) {
  const pc = activePeerConnections.get(steamId);
  if (pc) {
    pc.close();
    activePeerConnections.delete(steamId);
  }
  const el = tileRefs.value[steamId];
  if (el) el.srcObject = null;
}

// Pull video for every OTHER participant currently in the call --
// drop connections for anyone who's left, connect anyone new. My own
// tile is just the local <video> preview on the join page/popup, not
// pulled back over WHEP.
watch(
  participants,
  (list) => {
    const otherIds = new Set(
      list
        .map((p) => p.steamId)
        .filter((id) => id !== String(me.value?.steam_id)),
    );
    for (const id of otherIds) {
      if (!activePeerConnections.has(id)) connectTile(id);
    }
    for (const id of [...activePeerConnections.keys()]) {
      if (!otherIds.has(id)) disconnectTile(id);
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  for (const id of [...activePeerConnections.keys()]) disconnectTile(id);
});
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

    <!-- Participant grid, only rendered while a call is actually live -->
    <div
      v-if="participants.length > 0"
      class="grid gap-1.5 p-2 border-b border-zinc-800"
      :class="participants.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'"
    >
      <div
        v-for="p in participants"
        :key="p.steamId"
        class="relative aspect-video rounded-md overflow-hidden bg-zinc-950 border border-zinc-800"
      >
        <video
          v-if="p.steamId !== String(me?.steam_id)"
          :ref="setTileRef(p.steamId)"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        />
        <div
          v-else
          class="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground"
        >
          {{ $t("matchmaking.lobby_call.you", "You") }}
        </div>
        <span
          class="absolute bottom-1 left-1.5 text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5 truncate max-w-[85%]"
        >
          {{ p.name || p.steamId }}
        </span>
      </div>
    </div>

    <!-- Join/leave picker -->
    <div v-if="step === 'idle'" class="px-2 py-1.5 flex items-center justify-between gap-2">
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
        :disabled="isInCall || (participants.length >= 5 && !isInCall)"
        @click="startOrJoin"
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
    <p v-if="joinError" class="px-2 pb-1.5 text-[11px] text-destructive">
      {{ joinError }}
    </p>

    <div
      v-else-if="step === 'choose'"
      class="px-3 py-3 border-b border-zinc-800 space-y-2"
    >
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium">
          {{ $t("matchmaking.lobby_call.choose_device", "Connect with…") }}
        </span>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground"
          @click="closePicker"
        >
          <LucideArrowLeft class="h-3.5 w-3.5" />
        </button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="flex flex-col items-center gap-1.5 rounded-md border border-border p-3 hover:border-primary hover:bg-accent transition-colors"
          @click="step = 'mobile'"
        >
          <LucideSmartphone class="w-5 h-5" />
          <span class="text-[11px] font-medium">Mobile</span>
        </button>
        <button
          type="button"
          class="flex flex-col items-center gap-1.5 rounded-md border border-border p-3 hover:border-primary hover:bg-accent transition-colors"
          @click="connectOnThisComputer"
        >
          <LucideMonitor class="w-5 h-5" />
          <span class="text-[11px] font-medium">This computer</span>
        </button>
      </div>
    </div>

    <div
      v-else-if="step === 'mobile'"
      class="px-3 py-3 border-b border-zinc-800 flex flex-col items-center gap-2"
    >
      <button
        type="button"
        class="self-start inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        @click="step = 'choose'"
      >
        <LucideArrowLeft class="w-3 h-3" /> Back
      </button>
      <img
        v-if="qrDataUrl"
        :src="qrDataUrl"
        alt="QR code"
        width="160"
        height="160"
        class="rounded-lg border border-border bg-white p-1.5"
      />
    </div>

    <div
      v-else-if="step === 'pc'"
      class="px-3 py-3 border-b border-zinc-800 flex flex-col items-center gap-2"
    >
      <button
        type="button"
        class="self-start inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        @click="step = 'choose'"
      >
        <LucideArrowLeft class="w-3 h-3" /> Back
      </button>
      <p class="text-[11px] text-muted-foreground text-center">
        A window opened to join the call. If it didn't,
        <button type="button" class="underline" @click="connectOnThisComputer">
          click here
        </button>.
      </p>
    </div>
  </div>
</template>
