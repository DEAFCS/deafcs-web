<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import {
  LucideRefreshCw,
  LucideX,
  LucideCheck,
  LucideVideo,
  LucideCamera,
  LucideChevronDown,
  LucideArrowLeft,
} from "lucide-vue-next";
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

type Phase = "idle" | "preview" | "requesting" | "connected" | "error";
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

// --- Device preview (Discord-style "pick your camera" step) ---
// Grants camera access and shows a live preview + device picker
// *before* publishing anything, instead of the old flow which
// requested a camera and started broadcasting in the same step.
// Ported from the matchmaking lobby-call popup's identical fix.
const availableDevices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref<string | null>(null);
const selectedDeviceLabel = computed(
  () =>
    availableDevices.value.find((d) => d.deviceId === selectedDeviceId.value)
      ?.label || null,
);

async function startPreviewDevice(deviceId?: string | null): Promise<MediaStream> {
  // deviceId picks a specific camera by ID (device-picker path);
  // omitting it falls back to the orientation-aware facingMode request
  // above (first preview, or after flipCamera during an active call).
  const constraints: MediaTrackConstraints = deviceId
    ? {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 20, max: 25 },
      }
    : videoConstraints(facingMode);
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints,
    audio: false,
  });
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = stream;
  if (previewEl.value) previewEl.value.srcObject = stream;
  return stream;
}

async function openPreview() {
  phase.value = "preview";
  errorMessage.value = null;
  try {
    const stream = await startPreviewDevice();
    // Device labels are only populated once permission has been
    // granted, so enumerate *after* the first getUserMedia succeeds.
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableDevices.value = devices.filter((d) => d.kind === "videoinput");
    selectedDeviceId.value =
      stream.getVideoTracks()[0]?.getSettings().deviceId ??
      availableDevices.value[0]?.deviceId ??
      null;
  } catch (err) {
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

watch(selectedDeviceId, (id, oldId) => {
  if (phase.value === "preview" && id && id !== oldId) {
    startPreviewDevice(id).catch((err) => {
      errorMessage.value = err instanceof Error ? err.message : String(err);
    });
  }
});

function cancelPreview() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  if (previewEl.value) previewEl.value.srcObject = null;
  phase.value = "idle";
}

// Publishes whatever camStream the preview step already has -- the
// actual WHIP handshake, unchanged from the old single-step startCamera().
async function confirmJoin() {
  if (!camStream) return;
  phase.value = "requesting";
  errorMessage.value = null;
  try {
    const stream = camStream;
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
        <p class="text-sm text-muted-foreground">Connecting…</p>
      </template>
      <!-- Device preview -- camera access is already granted by the
           time this shows (openPreview requested it), so this is
           purely picking a device and confirming, not another
           permission prompt. DEAFCS amber accent, same pattern as the
           matchmaking lobby-call popup's identical step. -->
      <template v-else-if="phase === 'preview'">
        <div class="space-y-2 text-left">
          <div class="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <LucideCamera class="w-3.5 h-3.5" />
            Camera
          </div>
          <div class="relative">
            <div
              class="flex items-center gap-3 rounded-lg border p-3 pr-9 transition-colors"
              :class="
                availableDevices.length
                  ? 'border-[hsl(var(--tac-amber)/0.5)] bg-[hsl(var(--tac-amber)/0.08)]'
                  : 'border-border bg-card'
              "
            >
              <div
                class="flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--tac-amber)/0.15)] text-[hsl(var(--tac-amber))] shrink-0"
              >
                <LucideCamera class="w-4 h-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ selectedDeviceLabel || "Camera" }}
                </p>
                <p class="text-xs text-muted-foreground">Selected device</p>
              </div>
              <LucideChevronDown class="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
            <!-- Real (invisible) select handles the actual picking --
                 keeps native accessibility/keyboard support while the
                 div above provides the DEAFCS-styled look. -->
            <select
              v-if="availableDevices.length > 1"
              v-model="selectedDeviceId"
              aria-label="Select camera"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              <option v-for="d in availableDevices" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || "Camera" }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>

        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="cancelPreview">
            <LucideArrowLeft class="w-4 h-4" /> Back
          </Button>
          <Button class="flex-1" @click="confirmJoin"> Connect camera </Button>
        </div>
      </template>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          Tap below to start your camera. It needs to stay connected for the
          whole match.
        </p>
        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>
        <Button size="lg" class="rounded-full" @click="openPreview">
          Start camera
        </Button>
      </template>
    </div>
  </div>
</template>
