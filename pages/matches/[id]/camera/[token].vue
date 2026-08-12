<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { LucideRefreshCw, LucideX, LucideCheck, LucideVideo } from "lucide-vue-next";
import {
  cameraPlayerWhipUrl,
  fetchCameraStatus,
  cameraPlayerTalkWhepUrl,
  cameraPlayerTalkStatusUrl,
  cameraPlayerTalkHangupUrl,
  fetchCameraTalkStatus,
} from "~/composables/useCameraApi";

// Standalone, chrome-free tool page — reached either by scanning the
// admin's QR code on a phone, or via the "connect on this computer"
// popup window from the match page's overlay. No site nav wanted here:
// on a phone screen every pixel matters, and a popup window looks odd
// with a full site header anyway.
definePageMeta({
  layout: false,
});

const route = useRoute();
const token = computed(() => String(route.params.token));

type Phase = "idle" | "requesting" | "connected" | "error";
const phase = ref<Phase>("idle");
const errorMessage = ref<string | null>(null);

const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;
let facingMode: "user" | "environment" = "user";
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

// Requesting a fixed landscape resolution regardless of how the phone
// is actually held forces the camera to center-crop (zoom into) a
// portrait sensor frame to satisfy that aspect ratio. Asking for the
// resolution that matches the phone's *current* orientation avoids
// that crop/zoom look entirely.
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

async function startCamera() {
  phase.value = "requesting";
  errorMessage.value = null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints(facingMode),
      audio: false,
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

    const res = await fetch(cameraPlayerWhipUrl(token.value), {
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
    pollTalk(); // start watching for an admin video call now that a user gesture has happened
  } catch (err) {
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

// Confirms to the player their stream really is reaching the server
// (not just that their own WebRTC connection thinks it's open) —
// mirrors what the match-page overlay is itself waiting on.
function pollStatus() {
  statusPollTimer = setTimeout(async () => {
    const { ready } = await fetchCameraStatus(token.value);
    if (!ready && phase.value === "connected") {
      // Dropped without an explicit hang up (e.g. network blip) — let
      // the user know instead of silently pretending it's still live.
      phase.value = "error";
      errorMessage.value =
        "Connection dropped — tap Start camera to reconnect.";
      teardownStream();
      return;
    }
    pollStatus();
  }, 2000);
}

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
      const sender = camPc
        .getSenders()
        .find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
    }
    if (previewEl.value) previewEl.value.srcObject = newStream;
    oldStream.getTracks().forEach((t) => t.stop());
    camStream = newStream;
    facingMode = nextFacingMode;
  } catch (err) {
    alert(
      `Could not switch camera: ${err instanceof Error ? err.message : err}`,
    );
  }
}

function teardownStream() {
  if (statusPollTimer) {
    clearTimeout(statusPollTimer);
    statusPollTimer = null;
  }
  if (talkPollTimer) {
    clearTimeout(talkPollTimer);
    talkPollTimer = null;
  }
  stopTalkPlayback();
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

function disconnect() {
  teardownStream();
  phase.value = "idle";
}

// --- Incoming admin video call ("talk mode") ---
// No accept/decline step: the moment admin starts a call it just
// appears, same as the requirement overlay itself does — proven UX
// from the POC this replaces.
const adminVideoEl = ref<HTMLVideoElement | null>(null);
const talkActive = ref(false);
let talkPc: RTCPeerConnection | null = null;
let talkPollTimer: ReturnType<typeof setTimeout> | null = null;

async function startTalkPlayback() {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  talkPc = pc;
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.ontrack = (e) => {
    if (adminVideoEl.value) adminVideoEl.value.srcObject = e.streams[0];
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await new Promise<void>((resolve) => {
    if (pc.iceGatheringState === "complete") return resolve();
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") resolve();
    });
    setTimeout(resolve, 1500);
  });
  const res = await fetch(cameraPlayerTalkWhepUrl(token.value), {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp ?? "",
  });
  const answer = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
}

function stopTalkPlayback() {
  if (talkPc) {
    talkPc.close();
    talkPc = null;
  }
  if (adminVideoEl.value) adminVideoEl.value.srcObject = null;
}

function pollTalk() {
  talkPollTimer = setTimeout(async () => {
    const { ready } = await fetchCameraTalkStatus(
      cameraPlayerTalkStatusUrl(token.value),
    );
    if (ready && !talkActive.value) {
      talkActive.value = true;
      startTalkPlayback();
    } else if (!ready && talkActive.value) {
      talkActive.value = false;
      stopTalkPlayback();
    }
    if (phase.value === "connected") pollTalk();
  }, 1500);
}

async function hangUpTalk() {
  talkActive.value = false;
  stopTalkPlayback();
  try {
    await fetch(cameraPlayerTalkHangupUrl(token.value), { method: "POST" });
  } catch {
    /* best-effort */
  }
}

onMounted(() => {
  // Auto-attempt is intentionally NOT done here — getUserMedia needs a
  // user gesture on most mobile browsers, so the "Start camera" tap is
  // required regardless.
});

onBeforeUnmount(() => {
  teardownStream();
});
</script>

<template>
  <div
    class="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6"
  >
    <h1 class="text-lg font-semibold text-center">Connect your camera</h1>

    <!--
      No forced aspect-ratio on this container, and no object-cover on
      the main video — both crop/zoom the picture to fill a box whose
      ratio doesn't match the actual camera stream, which is exactly
      the "too zoomed in" look reported before. The fix mirrors what
      already works on the join page this replaced: request a
      resolution matching the phone's orientation (videoConstraints
      above) AND let the video render at its own natural size instead
      of being force-fit into a fixed box.
    -->
    <div
      class="relative w-full max-w-[420px] rounded-xl overflow-hidden bg-black border border-border"
    >
      <!-- During a call the admin's video takes over the main frame and
           the player's own camera shrinks to a small corner preview —
           same layout every video-call app uses, so it needs no
           explanation on-screen. The small PiP corner is the one place
           object-cover is fine: it's a tiny fixed-size thumbnail, not
           the frame someone's trying to actually see themselves in. -->
      <video
        v-show="talkActive"
        ref="adminVideoEl"
        autoplay
        playsinline
        class="w-full h-auto block"
      />
      <video
        ref="previewEl"
        autoplay
        playsinline
        muted
        :class="talkActive
          ? 'absolute bottom-2 right-2 w-24 h-32 rounded-lg border-2 border-white shadow-lg z-10 object-cover'
          : 'w-full h-auto block'"
      />

      <div
        v-if="talkActive"
        class="absolute top-2.5 left-2.5 z-10 inline-flex items-center gap-1.5 rounded-full bg-green-600/90 text-white px-3 py-1 text-xs font-bold"
      >
        <LucideVideo class="w-3.5 h-3.5" />
        Admin is calling
      </div>

      <button
        v-if="phase === 'connected' && !talkActive"
        type="button"
        title="Switch camera"
        aria-label="Switch camera"
        class="absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        @click="flipCamera"
      >
        <LucideRefreshCw class="w-5 h-5" />
      </button>

      <button
        v-if="talkActive"
        type="button"
        title="Hang up"
        aria-label="Hang up"
        class="absolute bottom-2 left-2 z-10 flex items-center justify-center w-11 h-11 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors shadow-lg"
        @click="hangUpTalk"
      >
        <LucideX class="w-5 h-5" />
      </button>
    </div>

    <button
      v-if="phase === 'connected' && !talkActive"
      type="button"
      title="Disconnect"
      aria-label="Disconnect"
      class="flex items-center justify-center w-14 h-14 rounded-full bg-red-600 text-white hover:bg-red-500 transition-colors shadow-lg"
      @click="disconnect"
    >
      <LucideX class="w-6 h-6" />
    </button>

    <div class="text-center max-w-sm space-y-3">
      <template v-if="phase === 'connected'">
        <div
          class="inline-flex items-center gap-2 rounded-full bg-green-600/15 text-green-500 border border-green-600/30 px-3 py-1 text-sm font-medium"
        >
          <LucideCheck class="w-4 h-4" />
          Connected
        </div>
        <p class="text-sm text-muted-foreground font-medium">
          Don't close this page — keep it open for the rest of the match.
        </p>
      </template>
      <template v-else-if="phase === 'requesting'">
        <p class="text-sm text-muted-foreground">Requesting camera access…</p>
      </template>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          Tap below to start your camera. It needs to stay connected for the
          whole match.
        </p>
        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>
        <Button size="lg" class="rounded-full" @click="startCamera">
          Start camera
        </Button>
      </template>
    </div>
  </div>
</template>
