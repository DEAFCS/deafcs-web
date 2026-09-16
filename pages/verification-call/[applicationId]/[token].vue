<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { LucideX, LucideRefreshCw } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import {
  verificationCallPlayerWhipUrl,
  verificationCallPlayerStatusUrl,
  verificationCallPlayerHangupUrl,
  verificationCallPlayerPeerWhepUrl,
  fetchVerificationCallStatus,
  fetchVerificationCallParticipantsForToken,
  type VerificationCallParticipant,
} from "~/composables/useVerificationCallApi";

// applicationId isn't needed for the token-gated participants lookup
// (the token alone resolves it server-side), but the route still
// carries it for a readable URL -- see verificationCallJoinUrl.

// Standalone, chrome-free tool page -- reached by scanning the QR code
// from pages/verification-applications/call/[applicationId].vue's
// "Mobile" option, exactly mirroring pages/lobby-call/[lobbyId]/[token].vue.
// Deliberately a SEPARATE top-level route (not nested under
// pages/verification-applications/call/[applicationId].vue) -- Vue
// Router resolved a nested [applicationId]/[token] under the same
// directory as the [applicationId] popup page to the wrong component,
// same reason the lobby-call feature keeps /lobby-call/[lobbyId]/[token]
// entirely separate from /matchmaking/lobby-call/[lobbyId].
// Real two-way call between admin and applicant: this page both
// publishes the phone's own camera AND pulls video for the other side.
definePageMeta({ layout: false });

const route = useRoute();
const applicationId = computed(() => String(route.params.applicationId));
const token = computed(() => String(route.params.token));

type Phase = "idle" | "requesting" | "connected" | "error";
const phase = ref<Phase>("idle");
const errorMessage = ref<string | null>(null);
const mySteamId = ref<string | null>(null);

const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;
let facingMode: "user" | "environment" = "user";
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

function videoConstraints(mode: "user" | "environment"): MediaTrackConstraints {
  return {
    facingMode: { ideal: mode },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 20, max: 25 },
  };
}

// No audio: video-only feature, matching the lobby call precedent.
async function getCameraStream(mode: "user" | "environment"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints(mode),
    audio: false,
  });
}

async function startCall() {
  phase.value = "requesting";
  errorMessage.value = null;
  try {
    const stream = await getCameraStream(facingMode);
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

    const res = await fetch(verificationCallPlayerWhipUrl(token.value), {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    // Two mutually-exclusive v-if/v-else <video ref="previewEl">
    // elements swap the underlying DOM node when phase flips --
    // re-attach after Vue mounts the new one.
    phase.value = "connected";
    await nextTick();
    if (previewEl.value) previewEl.value.srcObject = camStream;

    pollStatus();
    pollParticipants();
  } catch (err) {
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

function pollStatus() {
  statusPollTimer = setTimeout(async () => {
    const { ready, steamId } = await fetchVerificationCallStatus(
      verificationCallPlayerStatusUrl(token.value),
    );
    if (steamId) mySteamId.value = steamId;
    if (!ready && phase.value === "connected") {
      phase.value = "error";
      errorMessage.value = "Connection dropped, tap Join call to reconnect.";
      teardownStream();
      return;
    }
    pollStatus();
  }, 2000);
}

// Phone-only front/back switch -- the desktop popout only ever has one
// camera to pick from, so this control lives here, not there.
async function flipCamera() {
  if (!camStream) return;
  const nextFacingMode = facingMode === "user" ? "environment" : "user";
  try {
    const newStream = await getCameraStream(nextFacingMode);
    const newTrack = newStream.getVideoTracks()[0];
    const oldStream = camStream;
    if (camPc) {
      const sender = camPc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
    }
    if (previewEl.value) previewEl.value.srcObject = newStream;
    oldStream.getTracks().forEach((t) => t.stop());
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
    await fetch(verificationCallPlayerHangupUrl(token.value), { method: "POST" });
  } catch {
    // best-effort
  }
}

// --- The other party (WHEP pull, token-gated) ---
// No websocket on this anonymous device (never logged into deafcs.net),
// so presence is polled instead of pushed.
const participants = ref<VerificationCallParticipant[]>([]);
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
    const res = await fetch(
      verificationCallPlayerPeerWhepUrl(token.value, steamId),
      {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp ?? "",
      },
    );
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
    participants.value = await fetchVerificationCallParticipantsForToken(
      token.value,
    );
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

// Fixed 2-party call: at most one other tile plus my own -- always a
// single-column stack, no orientation-based multi-column grid needed.
onMounted(() => {});

onBeforeUnmount(() => {
  teardownStream();
});
</script>

<template>
  <div
    class="w-full bg-background text-foreground flex flex-col overflow-hidden p-3 gap-3"
    style="height: 100dvh"
  >
    <h1 v-if="phase !== 'connected'" class="text-base font-semibold text-center shrink-0">
      Verification call
    </h1>

    <div
      v-if="phase === 'connected'"
      class="grid gap-2 auto-rows-fr overflow-y-auto flex-1 min-h-0"
      :style="{ gridTemplateColumns: `repeat(${otherParticipants.length ? 2 : 1}, minmax(0, 1fr))` }"
    >
      <div
        v-for="p in otherParticipants"
        :key="p.steamId"
        class="relative rounded-lg overflow-hidden bg-black border border-border"
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

      <div class="relative rounded-lg overflow-hidden bg-black border border-border">
        <video
          ref="previewEl"
          autoplay
          playsinline
          muted
          class="w-full h-full object-cover"
        />
        <button
          type="button"
          title="Switch camera"
          aria-label="Switch camera"
          class="absolute top-1 left-1 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          @click="flipCamera"
        >
          <LucideRefreshCw class="w-3 h-3" />
        </button>
        <span
          class="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5"
        >
          You
        </span>
      </div>
    </div>

    <div
      v-else
      class="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black border border-border"
    >
      <video
        ref="previewEl"
        autoplay
        playsinline
        muted
        class="w-full h-full object-cover"
      />
      <button
        type="button"
        title="Switch camera"
        aria-label="Switch camera"
        class="absolute top-2.5 left-2.5 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        @click="flipCamera"
      >
        <LucideRefreshCw class="w-5 h-5" />
      </button>
    </div>

    <div class="shrink-0 flex flex-col items-center gap-2">
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

      <div class="text-center max-w-sm">
        <template v-if="phase === 'connected'">
          <p class="text-xs text-muted-foreground font-medium">
            Keep this page open while you're in the call.
          </p>
        </template>
        <template v-else-if="phase === 'requesting'">
          <p class="text-sm text-muted-foreground">Requesting camera access…</p>
        </template>
        <template v-else>
          <p class="text-sm text-muted-foreground">
            Tap below to join the verification call.
          </p>
          <p v-if="errorMessage" class="text-sm text-destructive">
            {{ errorMessage }}
          </p>
          <Button size="lg" class="rounded-full mt-2" @click="startCall">
            Join call
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>
