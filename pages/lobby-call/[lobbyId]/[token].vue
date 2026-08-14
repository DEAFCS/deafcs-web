<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
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

// Request a resolution matching the phone's *current* orientation
// instead of forcing a fixed landscape shape — same fix proven out on
// the required-webcam feature's join page
// (pages/matches/[id]/camera/[token].vue). Forcing `aspectRatio: exact
// 16/9` regardless of how the phone is held isn't reliably honored by
// iOS Safari's front camera, and even when it partially works it
// fights the camera driver for no benefit: the grid tiles below use
// object-cover, which fills the tile from whatever shape the camera
// actually returns, so there's nothing to letterbox either way.
function videoConstraints(mode: "user" | "environment"): MediaTrackConstraints {
  const portrait =
    typeof window !== "undefined" &&
    window.matchMedia("(orientation: portrait)").matches;
  return {
    facingMode: { ideal: mode },
    width: { ideal: portrait ? 720 : 1280 },
    height: { ideal: portrait ? 1280 : 720 },
    frameRate: { ideal: 20, max: 25 },
  };
}

async function getCameraStream(
  mode: "user" | "environment",
  audio: boolean,
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints(mode),
    audio,
  });
}

async function startCall() {
  phase.value = "requesting";
  errorMessage.value = null;
  try {
    const stream = await getCameraStream(facingMode, true);
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

    // The "not connected" and "connected" branches render two
    // different <video ref="previewEl"> elements (mutually exclusive
    // v-if/v-else), so flipping phase here swaps out the DOM node the
    // stream was attached to -- same class of bug fixed earlier in the
    // popout window. Re-attach after Vue mounts the new element.
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
// popout window. Lives on the own-camera video itself (FaceTime-style
// corner icon) so it stays reachable however small the PiP shrinks to.
async function flipCamera() {
  if (!camStream) return;
  const nextFacingMode = facingMode === "user" ? "environment" : "user";
  try {
    const newStream = await getCameraStream(nextFacingMode, false);
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

// --- Grid layout: every tile (including my own camera) the same size,
// none overlapping -- replaces the old "big self + small floating PiP"
// layout, which looked broken in portrait and covered another tile in
// landscape. Column count adapts to both orientation (more columns
// fit in landscape) and headcount (fewer people => fewer columns =>
// bigger tiles, same idea as the required-webcam admin grid but tuned
// per-orientation for a phone).
const isPortrait = ref(true);
function updateOrientation() {
  isPortrait.value =
    typeof window !== "undefined" &&
    window.matchMedia("(orientation: portrait)").matches;
}

const totalTileCount = computed(() => otherParticipants.value.length + 1);
const gridColumns = computed(() => {
  if (totalTileCount.value <= 2) return 1;
  return isPortrait.value ? 2 : 3;
});

onMounted(() => {
  updateOrientation();
  window.addEventListener("resize", updateOrientation);
  window.addEventListener("orientationchange", updateOrientation);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateOrientation);
  window.removeEventListener("orientationchange", updateOrientation);
  teardownStream();
});
</script>

<template>
  <!-- Fixed to the real viewport height (not min-height, so it can never
       overflow into scroll territory) using dvh -- accounts for mobile
       browser chrome (address bar, home indicator) shrinking/growing the
       visible area, so this fits on any phone without scrolling. -->
  <div
    class="w-full bg-background text-foreground flex flex-col overflow-hidden p-3 gap-3"
    style="height: 100dvh"
  >
    <h1 v-if="phase !== 'connected'" class="text-base font-semibold text-center shrink-0">
      Lobby webcam call
    </h1>

    <!-- Video area -- everyone else + my own camera as EQUAL grid
         tiles, none overlapping (replaces the old "big self + small
         floating PiP" layout, which looked broken in portrait and
         covered another tile in landscape). Column count adapts to
         orientation (more columns fit in landscape) and headcount
         (fewer people => fewer columns => bigger tiles). My own tile
         is always in the DOM (never v-if'd) so the srcObject
         assignment above never silently no-ops against a not-yet-
         mounted element -- it's just one more grid cell now instead
         of a specially-positioned box. -->
    <div
      v-if="phase === 'connected'"
      class="grid gap-2 auto-rows-fr overflow-y-auto flex-1 min-h-0"
      :style="{ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }"
    >
      <!-- auto-rows-fr so tiles stretch to fill whatever space is
           available (fewer tiles = bigger, not stuck at a fixed size
           with empty space left over below). object-cover fills the
           tile completely from whatever shape the camera actually
           returns (portrait or landscape) -- no letterbox bars, same
           as every other video-call app's grid. Trades full-frame
           visibility for a filled tile, which is the right tradeoff
           here: object-contain's letterboxing was the actual bug
           being fixed (see videoConstraints above for the capture
           side of this fix). -->
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
          :title="muted ? 'Unmute' : 'Mute'"
          class="absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          @click="toggleMute"
        >
          <LucideMicOff v-if="muted" class="w-3 h-3" />
          <LucideMic v-else class="w-3 h-3" />
        </button>
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

    <!-- Not connected yet -- just my own camera preview, full-size,
         same video element as above (kept mounted throughout). -->
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

    <!-- Controls -->
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
          <p class="text-sm text-muted-foreground">Requesting camera & mic access…</p>
        </template>
        <template v-else>
          <p class="text-sm text-muted-foreground">
            Tap below to join the lobby's webcam call.
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
