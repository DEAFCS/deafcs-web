<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from "vue";
import { LucideX, LucideMicOff, LucideMic, LucideRefreshCw } from "lucide-vue-next";
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
let facingMode: "user" | "environment" = "user";
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

// Always request a landscape frame, regardless of how the phone is
// physically held — the call grid's tiles are 16:9 boxes (aspect-video),
// and a portrait stream squeezed into one of those looks tiny/wrong.
// This is the opposite tradeoff from the required-webcam feature's join
// page (which matches the phone's current orientation to avoid a
// crop/zoom look for a single full-width preview) — here the fixed
// landscape grid layout is the priority.
function videoConstraints(mode: "user" | "environment"): MediaTrackConstraints {
  return {
    facingMode: { ideal: mode },
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
      video: videoConstraints(facingMode),
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

// Same front/back switch the required-webcam join page has -- this is
// a phone-only control (the desktop "this computer" flow only ever has
// one camera), which is why it's only wired up here, not in the
// popout window.
async function flipCamera() {
  if (!camStream) return;
  const nextFacingMode = facingMode === "user" ? "environment" : "user";
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints(nextFacingMode),
      audio: false,
    });
    const newTrack = newStream.getVideoTracks()[0];
    const oldStream = camStream;
    if (camPc) {
      const sender = camPc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
    }
    if (previewEl.value) previewEl.value.srcObject = newStream;
    // Keep the existing audio track alive on the new stream object so
    // toggleMute/leaveCall still see it.
    oldStream.getAudioTracks().forEach((t) => newStream.addTrack(t));
    oldStream.getVideoTracks().forEach((t) => t.stop());
    camStream = newStream;
    facingMode = nextFacingMode;
  } catch (err) {
    alert(`Could not switch camera: ${err instanceof Error ? err.message : err}`);
  }
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
    class="relative min-h-screen w-full bg-background text-foreground flex flex-col items-center gap-4 p-4"
  >
    <h1 v-if="phase !== 'connected'" class="text-lg font-semibold text-center">
      Lobby webcam call
    </h1>

    <!-- Everyone else currently in the call -- the main event once
         connected. My own camera shrinks to a small corner PiP instead
         (see below), same layout every video-call app uses: you watch
         the other person, not yourself. -->
    <div
      v-if="phase === 'connected' && otherParticipants.length > 0"
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
    <div
      v-else-if="phase === 'connected'"
      class="w-full max-w-lg aspect-video rounded-lg border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground"
    >
      Waiting for others to join…
    </div>

    <!-- My own camera -- full-size before/while joining, small corner
         PiP once connected and someone else is visible above. -->
    <div
      class="overflow-hidden bg-black border border-border"
      :class="
        phase === 'connected' && otherParticipants.length > 0
          ? 'absolute bottom-4 right-4 w-28 h-40 rounded-lg border-2 border-white shadow-lg z-10'
          : 'relative w-full max-w-[420px] rounded-xl'
      "
    >
      <video
        ref="previewEl"
        autoplay
        playsinline
        muted
        class="w-full h-full object-cover"
      />

      <button
        v-if="phase === 'connected'"
        type="button"
        :title="muted ? 'Unmute' : 'Mute'"
        class="absolute top-1.5 right-1.5 z-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        :class="otherParticipants.length ? 'w-7 h-7' : 'w-10 h-10 top-2.5 right-2.5'"
        @click="toggleMute"
      >
        <LucideMicOff v-if="muted" :class="otherParticipants.length ? 'w-3.5 h-3.5' : 'w-5 h-5'" />
        <LucideMic v-else :class="otherParticipants.length ? 'w-3.5 h-3.5' : 'w-5 h-5'" />
      </button>

      <button
        v-if="phase !== 'connected'"
        type="button"
        title="Switch camera"
        aria-label="Switch camera"
        class="absolute top-2.5 left-2.5 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        @click="flipCamera"
      >
        <LucideRefreshCw class="w-5 h-5" />
      </button>

      <span
        v-if="phase === 'connected' && !otherParticipants.length"
        class="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/60 rounded px-2 py-0.5"
      >
        You
      </span>
    </div>

    <div v-if="phase === 'connected'" class="flex items-center gap-4">
      <!-- Kept reachable here (not just on the shrunk PiP corner)
           since once the PiP is small there's no comfortable room for
           it on the video itself. -->
      <button
        type="button"
        title="Switch camera"
        aria-label="Switch camera"
        class="flex items-center justify-center w-11 h-11 rounded-full bg-card border border-border text-foreground hover:bg-muted transition-colors"
        @click="flipCamera"
      >
        <LucideRefreshCw class="w-5 h-5" />
      </button>
      <button
        type="button"
        title="Leave call"
        aria-label="Leave call"
        class="flex items-center justify-center w-14 h-14 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors shadow-lg"
        @click="leaveCall"
      >
        <LucideX class="w-6 h-6" />
      </button>
    </div>

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
