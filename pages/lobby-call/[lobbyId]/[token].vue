<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { LucideX, LucideMicOff, LucideMic } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import {
  lobbyCallPlayerWhipUrl,
  lobbyCallPlayerStatusUrl,
  lobbyCallPlayerHangupUrl,
  lobbyCallPlayerPeerWhepUrl,
  fetchLobbyCallStatus,
  fetchLobbyCallParticipantsForToken,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

// Standalone, chrome-free tool page -- reached by scanning the QR code
// with a phone, or via the "connect on this computer" popup, exactly
// like the required-webcam feature's join page. UNLIKE that feature
// (a one-way publish-only feed the admin watches), this is a real
// two-way call between lobby members: this page both publishes the
// phone's own camera AND pulls video for everyone else currently in
// the call, same as the desktop popout window does.
definePageMeta({ layout: false });

const route = useRoute();
const lobbyId = computed(() => String(route.params.lobbyId));
const token = computed(() => String(route.params.token));

type Phase = "idle" | "requesting" | "connected" | "error";
const phase = ref<Phase>("idle");
const errorMessage = ref<string | null>(null);
const muted = ref(false);
const mySteamId = ref<string | null>(null);

const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

// Always request a landscape frame, regardless of how the phone is
// physically held — the call grid's tiles are 16:9 boxes (aspect-video),
// and a portrait stream squeezed into one of those looks tiny/wrong.
// This is the opposite tradeoff from the required-webcam feature's join
// page (which matches the phone's current orientation to avoid a
// crop/zoom look for a single full-width preview) — here the fixed
// landscape grid layout is the priority.
function videoConstraints(): MediaTrackConstraints {
  return {
    facingMode: { ideal: "user" },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    aspectRatio: { ideal: 16 / 9 },
    frameRate: { ideal: 20, max: 25 },
  };
}

async function startCall() {
  phase.value = "requesting";
  errorMessage.value = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints(),
      audio: true,
    });
    camStream = stream;
    if (previewEl.value) previewEl.value.srcObject = stream;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    camPc = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") resolve();
      });
      setTimeout(resolve, 1500);
    });

    const res = await fetch(lobbyCallPlayerWhipUrl(token.value), {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    phase.value = "connected";
    pollStatus();
    pollParticipants();
  } catch (err) {
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

function pollStatus() {
  statusPollTimer = setTimeout(async () => {
    const { ready, steamId } = await fetchLobbyCallStatus(
      lobbyCallPlayerStatusUrl(token.value),
    );
    if (steamId) mySteamId.value = steamId;
    if (!ready && phase.value === "connected") {
      phase.value = "error";
      errorMessage.value = "Connection dropped — tap Join call to reconnect.";
      teardownStream();
      return;
    }
    pollStatus();
  }, 2000);
}

function toggleMute() {
  if (!camStream) return;
  muted.value = !muted.value;
  camStream.getAudioTracks().forEach((t) => (t.enabled = !muted.value));
}

function teardownStream() {
  if (statusPollTimer) {
    clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
  stopParticipantsPolling();
  if (camPc) {
    camPc.close();
    camPc = null;
  }
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  if (previewEl.value) previewEl.value.srcObject = null;
}

async function leaveCall() {
  teardownStream();
  phase.value = "idle";
  try {
    await fetch(lobbyCallPlayerHangupUrl(token.value), { method: "POST" });
  } catch {
    // best-effort
  }
}

// --- Everyone else currently in the call (WHEP pull, token-gated) ---
// No websocket on this anonymous device (never logged into deafcs.net),
// so participants are polled on an interval instead of pushed.
const participants = ref<LobbyCallParticipant[]>([]);
const tileRefs = ref<Record<string, HTMLVideoElement | null>>({});
const activePeerConnections = new Map<string, RTCPeerConnection>();
let participantsPollTimer: ReturnType<typeof setTimeout> | null = null;

const otherParticipants = computed(() =>
  participants.value.filter((p) => p.steamId !== mySteamId.value),
);

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
    const res = await fetch(lobbyCallPlayerPeerWhepUrl(token.value, steamId), {
      method: "POST",
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

function pollParticipants() {
  participantsPollTimer = setTimeout(async () => {
    participants.value = await fetchLobbyCallParticipantsForToken(token.value);
    const otherIds = new Set(otherParticipants.value.map((p) => p.steamId));
    for (const id of otherIds) {
      if (!activePeerConnections.has(id)) connectTile(id);
    }
    for (const id of [...activePeerConnections.keys()]) {
      if (!otherIds.has(id)) disconnectTile(id);
    }
    if (phase.value === "connected") pollParticipants();
  }, 2500);
}

function stopParticipantsPolling() {
  if (participantsPollTimer) {
    clearTimeout(participantsPollTimer);
    participantsPollTimer = null;
  }
  for (const id of [...activePeerConnections.keys()]) disconnectTile(id);
  participants.value = [];
}

onBeforeUnmount(() => {
  teardownStream();
});
</script>

<template>
  <div
    class="min-h-screen w-full bg-background text-foreground flex flex-col items-center gap-4 p-4"
  >
    <h1 class="text-lg font-semibold text-center">Lobby webcam call</h1>

    <!-- Everyone else currently in the call -->
    <div
      v-if="otherParticipants.length > 0"
      class="grid gap-2 w-full max-w-lg"
      :class="otherParticipants.length === 1 ? 'grid-cols-1' : 'grid-cols-2'"
    >
      <div
        v-for="p in otherParticipants"
        :key="p.steamId"
        class="relative aspect-video rounded-lg overflow-hidden bg-black border border-border"
      >
        <video
          :ref="setTileRef(p.steamId)"
          autoplay
          playsinline
          class="w-full h-full object-cover"
        />
        <span
          class="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5 truncate max-w-[85%]"
        >
          {{ p.name || p.steamId }}
        </span>
      </div>
    </div>

    <!-- My own camera -->
    <div
      class="relative w-full max-w-[420px] rounded-xl overflow-hidden bg-black border border-border"
    >
      <video ref="previewEl" autoplay playsinline muted class="w-full h-auto block" />

      <button
        v-if="phase === 'connected'"
        type="button"
        :title="muted ? 'Unmute' : 'Mute'"
        class="absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        @click="toggleMute"
      >
        <LucideMicOff v-if="muted" class="w-5 h-5" />
        <LucideMic v-else class="w-5 h-5" />
      </button>
      <span
        v-if="phase === 'connected'"
        class="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/60 rounded px-2 py-0.5"
      >
        You
      </span>
    </div>

    <button
      v-if="phase === 'connected'"
      type="button"
      title="Leave call"
      aria-label="Leave call"
      class="flex items-center justify-center w-14 h-14 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors shadow-lg"
      @click="leaveCall"
    >
      <LucideX class="w-6 h-6" />
    </button>

    <div class="text-center max-w-sm space-y-3">
      <template v-if="phase === 'connected'">
        <p class="text-sm text-muted-foreground font-medium">
          Keep this page open while you're in the call.
        </p>
      </template>
      <template v-else-if="phase === 'requesting'">
        <p class="text-sm text-muted-foreground">Requesting camera & mic access…</p>
      </template>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          Tap below to join the lobby's webcam call.
        </p>
        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>
        <Button size="lg" class="rounded-full" @click="startCall">
          Join call
        </Button>
      </template>
    </div>
  </div>
</template>
