<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { LucideX, LucideRefreshCw } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { fetchLobbyCallStatus } from "~/composables/useLobbyCallApi";
import {
  createDropWatcher,
  WEBCAM_DROPPED_MESSAGE,
  WEBCAM_REMOVED_MESSAGE,
} from "~/composables/useWebcamConnectionWatch";
import {
  groupGridFallbackStyle,
  groupGridLayout,
  layoutTiles,
  useElementSize,
  useVideoTileDimensions,
} from "~/composables/useCallVideoLayout";
import type {
  WebcamTokenRoom,
  WebcamRoomParticipant as LobbyCallParticipant,
} from "~/composables/useWebcamRoomApi";

// Standalone, chrome-free tool page -- reached by scanning the QR code
// with a phone, or via the "connect on this computer" popup, exactly
// like the required-webcam feature's join page. UNLIKE that feature
// (a one-way publish-only feed the admin watches), this is a real
// two-way call between lobby members: this page both publishes the
// phone's own camera AND pulls video for everyone else currently in
// the call, same as the desktop popout window does. Shared by the
// matchmaking-lobby call (pages/lobby-call/[lobbyId]/[token].vue) and the
// tournament webcam support room (pages/tournament-call/[tournamentId]/
// [token].vue); everything room-specific goes through `room`.
const props = defineProps<{ room: WebcamTokenRoom; token: string }>();
const token = computed(() => props.token);

type Phase = "idle" | "requesting" | "connected" | "error";
const phase = ref<Phase>("idle");
const errorMessage = ref<string | null>(null);
const mySteamId = ref<string | null>(null);
// True while a dropped call is being re-established automatically.
const reconnecting = ref(false);
// A removed/expired link can never reconnect, so the Join button is hidden.
const linkExpired = ref(false);
const watcher = createDropWatcher();

const pageTitle = computed(() => props.room.title ?? "Lobby webcam call");

// Phones switch the screen off after a while, which suspends the camera and
// the WebRTC session and is a common cause of "Connection dropped". Keep it
// awake while in the call where the browser supports it (best effort).
let wakeLock: { release?: () => Promise<void> | void } | null = null;
async function acquireWakeLock() {
  try {
    const api = (navigator as any).wakeLock;
    if (api?.request) wakeLock = await api.request("screen");
  } catch {
    wakeLock = null;
  }
}
function releaseWakeLock() {
  try {
    void wakeLock?.release?.();
  } catch {
    // best-effort
  }
  wakeLock = null;
}

const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;
let facingMode: "user" | "environment" = "user";
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

// Always request landscape, regardless of how the phone is physically
// held. Two reasons this beats matching the phone's current
// orientation:
// 1. Stability: orientation was only ever checked once, at call start
//    -- rotating the phone mid-call left the capture shape stuck at
//    whatever it was when the call began, so a viewer could end up
//    seeing a portrait-shaped stream sideways-crammed into a landscape
//    tile. Never asking for portrait removes the mismatch entirely.
// 2. Android zoom: Chrome on Android crops much more aggressively than
//    iOS Safari when the requested shape is far from the camera's
//    native aspect ratio -- a 9:16 portrait request was the extreme
//    case, producing a heavily "zoomed in" picture on Android phones
//    that iPhones didn't show. Landscape is closer to most front
//    cameras' native orientation, which reduces (though may not fully
//    eliminate -- some of it is a genuine front-camera field-of-view
//    difference between phone models) that crop.
// The grid tiles below show each feed whole (object-contain) in stable
// cells, so whatever shape the camera really delivers is letterboxed
// rather than cropped.
function videoConstraints(mode: "user" | "environment"): MediaTrackConstraints {
  return {
    facingMode: { ideal: mode },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 20, max: 25 },
  };
}

// No audio: this is a video-only feature for deaf players. Never
// requesting a mic means there's no track to publish, nothing to mute,
// and nothing to pull from peers either (see connectTile below).
async function getCameraStream(mode: "user" | "environment"): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: videoConstraints(mode),
    audio: false,
  });
}

async function startCall() {
  // Never keep two publishers for one person: drop any previous camera
  // stream / peer connection before opening a new one.
  if (camPc || camStream) teardownStream();
  phase.value = "requesting";
  errorMessage.value = null;
  linkExpired.value = false;
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

    const res = await fetch(props.room.playerWhipUrl(token.value), {
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
    reconnecting.value = false;
    await nextTick();
    if (previewEl.value) previewEl.value.srcObject = camStream;

    void acquireWakeLock();
    pollStatus();
    pollParticipants();
  } catch (err) {
    teardownStream();
    reconnecting.value = false;
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

// One status check -> verdict from the shared drop watcher. A single failed
// or slow request is tolerated; see useWebcamConnectionWatch.ts.
async function checkStatus(afterResume = false) {
  const status = await fetchLobbyCallStatus(
    props.room.playerStatusUrl(token.value),
  );
  if (phase.value !== "connected") return;
  if (status.steamId) mySteamId.value = status.steamId;

  const verdict = watcher.sample(status, { afterResume });
  if (verdict === "expired") {
    teardownStream();
    linkExpired.value = true;
    phase.value = "error";
    errorMessage.value = WEBCAM_REMOVED_MESSAGE;
  } else if (verdict === "dropped") {
    await handleDrop();
  }
}

async function handleDrop() {
  teardownStream();
  if (watcher.canAutoReconnect()) {
    watcher.noteAutoReconnect();
    reconnecting.value = true;
    await startCall();
    return;
  }
  phase.value = "error";
  errorMessage.value = WEBCAM_DROPPED_MESSAGE;
}

function pollStatus() {
  if (statusPollTimer) clearTimeout(statusPollTimer);
  statusPollTimer = setTimeout(async () => {
    statusPollTimer = null;
    await checkStatus();
    // A drop handled above already restarted (or ended) the polling loop.
    if (phase.value === "connected" && !statusPollTimer) pollStatus();
  }, 2000);
}

// Returning to the page after the phone was locked or the browser was in the
// background: the old WebRTC session is already dead, so check right away
// (no grace) and reconnect instead of waiting for several slow polls.
async function onVisibilityChange() {
  if (document.visibilityState !== "visible" || phase.value !== "connected") {
    return;
  }
  if (statusPollTimer) {
    clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
  void acquireWakeLock();
  await checkStatus(true);
  if (phase.value === "connected" && !statusPollTimer) pollStatus();
}

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
});

// Same front/back switch the required-webcam join page has -- this is
// a phone-only control (the desktop "this computer" flow only ever has
// one camera), which is why it's only wired up here, not in the
// popout window. Lives on the own-camera video itself (FaceTime-style
// corner icon) so it stays reachable however small the PiP shrinks to.
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

function joinManually() {
  watcher.reset();
  reconnecting.value = false;
  void startCall();
}

function teardownStream() {
  if (statusPollTimer) {
    clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
  releaseWakeLock();
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
  watcher.reset();
  phase.value = "idle";
  try {
    await fetch(props.room.playerHangupUrl(token.value), { method: "POST" });
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
    const res = await fetch(props.room.playerPeerWhepUrl(token.value, steamId), {
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
    participants.value = await props.room.fetchParticipantsForToken(token.value);
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

// --- Grid layout (see useCallVideoLayout.ts) ---
// Every tile (including my own camera) is an equal cell, none
// overlapping, laid out from the measured screen space: 2 people stack
// on a phone held upright and sit side by side in landscape, 3-4 are a
// 2x2 grid, 5 are 2+2+1 (portrait) or 3+2 (landscape). Each feed is
// shown whole inside its cell (object-contain), so a landscape webcam is
// letterboxed rather than cropped into a zoomed face, and rotating any
// phone just re-letterboxes it. On my own, my camera takes its real ratio.
const TILE_GAP = 8;
// A room that holds exactly 4 (the tournament webcam) shows its one open
// seat as an empty cell once three people are in, so the 2x2 grid keeps its
// shape instead of jumping when the fourth person arrives.
const emptySlotKeys = computed(() =>
  props.room.maxParticipants === 4 && otherParticipants.value.length + 1 === 3
    ? ["empty-0"]
    : [],
);
const tileKeys = computed(() => [
  ...otherParticipants.value.map((p) => p.steamId),
  "local",
  ...emptySlotKeys.value,
]);
const { tileRef, shape: tileShape, aspect: tileAspect } = useVideoTileDimensions();
const stageEl = ref<HTMLElement | null>(null);
const stageSize = useElementSize(stageEl);

const groupGrid = computed(() =>
  groupGridLayout(
    tileKeys.value.length,
    stageSize.value.width,
    stageSize.value.height,
    TILE_GAP,
  ),
);
const singleTile = computed(() =>
  tileKeys.value.length === 1
    ? (layoutTiles(
        [tileAspect("local")],
        stageSize.value.width,
        stageSize.value.height,
      ).tiles[0] ?? null)
    : null,
);

// Exactly N cells wide, so rows always break the same way (last row centred).
const gridWrapperStyle = computed(() => {
  if (tileKeys.value.length === 1 && singleTile.value) {
    return { width: `${Math.floor(singleTile.value.width)}px` };
  }
  const { cell, columns } = groupGrid.value;
  if (!cell) return { width: "100%", height: "100%" };
  return {
    width: `${Math.floor(cell.width * columns + TILE_GAP * (columns - 1))}px`,
  };
});

function tileStyle(key: string) {
  if (tileKeys.value.length === 1) {
    const box = singleTile.value;
    return box
      ? { width: `${Math.floor(box.width)}px`, height: `${Math.floor(box.height)}px` }
      : { width: "100%", aspectRatio: String(tileAspect(key)), maxHeight: "100%" };
  }
  const { cell } = groupGrid.value;
  return cell
    ? { width: `${Math.floor(cell.width)}px`, height: `${Math.floor(cell.height)}px` }
    : groupGridFallbackStyle(groupGrid.value, TILE_GAP);
}
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibilityChange);
  teardownStream();
});
</script>

<template>
  <!-- Fixed to the real viewport height (not min-height, so it can never
       overflow into scroll territory) using dvh -- accounts for mobile
       browser chrome (address bar, home indicator) shrinking/growing the
       visible area, so this fits on any phone without scrolling. -->
  <div
    class="w-full bg-zinc-950 text-foreground flex flex-col overflow-hidden p-3 gap-3"
    style="height: 100dvh"
  >
    <h1 v-if="phase !== 'connected'" class="text-base font-semibold text-center shrink-0">
      {{ pageTitle }}
    </h1>

    <!-- Video area -- everyone else + my own camera as equal cells, none
         overlapping, laid out from the measured space (see tileStyle).
         Each feed is shown whole (object-contain) on black, so nothing
         is cropped whatever shape a camera delivers or however a phone
         is turned. My own tile is always in the DOM while connected so
         the srcObject assignment above never no-ops against a
         not-yet-mounted element. -->
    <div
      v-if="phase === 'connected'"
      ref="stageEl"
      class="flex flex-1 min-h-0 items-center justify-center overflow-hidden"
      data-testid="webcam-stage"
    >
      <div
        class="flex max-h-full flex-wrap content-center justify-center gap-2"
        :style="gridWrapperStyle"
        data-testid="webcam-grid"
        :data-columns="groupGrid.columns"
        :data-rows="groupGrid.rows"
      >
        <div
          v-for="p in otherParticipants"
          :key="p.steamId"
          :ref="tileRef(p.steamId)"
          class="relative shrink-0 rounded-lg overflow-hidden bg-black border border-zinc-800 transition-[width,height] duration-200"
          :style="tileStyle(p.steamId)"
          data-testid="webcam-tile"
          :data-key="p.steamId"
          :data-shape="tileShape(p.steamId)"
        >
          <video
            :ref="setTileRef(p.steamId)"
            autoplay
            playsinline
            class="w-full h-full bg-black object-contain"
          />
          <span
            class="absolute bottom-1.5 left-1.5 text-[10px] font-medium text-white bg-black/60 rounded px-1.5 py-0.5 truncate max-w-[85%]"
          >
            {{ p.name || p.steamId }}
          </span>
        </div>

        <div
          :ref="tileRef('local')"
          class="relative shrink-0 rounded-lg overflow-hidden bg-black border border-zinc-800 transition-[width,height] duration-200"
          :style="tileStyle('local')"
          data-testid="webcam-tile"
          data-key="local"
          :data-shape="tileShape('local')"
        >
          <video
            ref="previewEl"
            autoplay
            playsinline
            muted
            class="w-full h-full bg-black object-contain"
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

        <div
          v-for="key in emptySlotKeys"
          :key="key"
          class="shrink-0 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 flex items-center justify-center text-xs text-muted-foreground"
          :style="tileStyle(key)"
          data-testid="webcam-empty-slot"
        >
          Open slot
        </div>
      </div>
    </div>

    <!-- Not connected yet -- just my own camera preview, full-size,
         same video element as above (kept mounted throughout). -->
    <div
      v-else
      class="relative flex-1 min-h-0 rounded-xl overflow-hidden bg-black border border-zinc-800"
    >
      <video
        ref="previewEl"
        autoplay
        playsinline
        muted
        class="w-full h-full object-contain"
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
          <p class="text-sm text-muted-foreground">
            {{ reconnecting ? "Reconnecting…" : "Requesting camera access…" }}
          </p>
        </template>
        <template v-else>
          <p v-if="!linkExpired" class="text-sm text-muted-foreground">
            Tap below to join the call.
          </p>
          <p v-if="errorMessage" class="text-sm text-destructive">
            {{ errorMessage }}
          </p>
          <Button
            v-if="!linkExpired"
            size="lg"
            class="rounded-full mt-2"
            @click="joinManually"
          >
            Join call
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>
