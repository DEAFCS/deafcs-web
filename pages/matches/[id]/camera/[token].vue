<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { LucideRefreshCw, LucideX, LucideCheck } from "lucide-vue-next";
import {
  cameraPlayerWhipUrl,
  fetchCameraStatus,
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

    <div
      class="relative w-full max-w-[420px] aspect-[3/4] sm:aspect-video rounded-xl overflow-hidden bg-black border border-border"
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
        title="Switch camera"
        aria-label="Switch camera"
        class="absolute top-2.5 right-2.5 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
        @click="flipCamera"
      >
        <LucideRefreshCw class="w-5 h-5" />
      </button>
    </div>

    <button
      v-if="phase === 'connected'"
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
