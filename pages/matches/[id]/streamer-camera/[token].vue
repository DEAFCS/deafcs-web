<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import {
  LucideRefreshCw,
  LucideX,
  LucideCheck,
  LucideCamera,
  LucideChevronDown,
  LucideArrowLeft,
} from "lucide-vue-next";
import {
  streamerCameraPlayerWhipUrl,
  fetchStreamerCameraStatus,
} from "~/composables/useStreamerCameraApi";

// Standalone, chrome-free tool page for the streamer-camera feature --
// mirrors pages/matches/[id]/camera/[token].vue closely (same device
// preview -> publish -> stays-open-until-you-close-it shape), minus
// the admin "talk" video-call mode, which has no equivalent here. See
// DEAFCS/deafcs-web#91.
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

// --- Device preview (pick your camera, then confirm) ---
const availableDevices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref<string | null>(null);
const selectedDeviceLabel = computed(
  () =>
    availableDevices.value.find((d) => d.deviceId === selectedDeviceId.value)
      ?.label || null,
);

async function startPreviewDevice(deviceId?: string | null): Promise<MediaStream> {
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

    const res = await fetch(streamerCameraPlayerWhipUrl(token.value), {
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

// Confirms to the player their stream really is reaching the server,
// and keeps the page open + live (per explicit design ask: this page
// stays open showing the camera until the player closes it themselves,
// same as the require-camera join page).
function pollStatus() {
  statusPollTimer = setTimeout(async () => {
    const { ready } = await fetchStreamerCameraStatus(token.value);
    if (!ready && phase.value === "connected") {
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
  // Auto-open the device preview when this page is the "connect on
  // this computer" popup (StreamerCameraOverlay's connectOnThisComputer
  // sets window.opener) -- clicking "This computer" already was the
  // explicit intent to connect a camera. The QR/mobile path is a direct
  // navigation (no opener) and keeps requiring the explicit tap, since
  // mobile browsers can silently refuse a getUserMedia call that isn't
  // tied to a real tap in that page's own context.
  if (typeof window !== "undefined" && window.opener) {
    openPreview();
  }
});

onBeforeUnmount(() => {
  teardownStream();
});
</script>

<template>
  <div
    class="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6"
  >
    <h1 class="text-lg font-semibold text-center">{{ $t("match.streamer_camera.connect_title") }}</h1>

    <div
      class="relative w-full max-w-[420px] rounded-xl overflow-hidden bg-black border border-border"
    >
      <video
        ref="previewEl"
        autoplay
        playsinline
        muted
        class="w-full h-auto block"
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
          {{ $t("match.streamer_camera.live_badge") }}
        </div>
        <p class="text-sm text-muted-foreground font-medium">
          {{ $t("match.streamer_camera.keep_open") }}
        </p>
      </template>
      <template v-else-if="phase === 'requesting'">
        <p class="text-sm text-muted-foreground">{{ $t("match.streamer_camera.connecting") }}</p>
      </template>
      <template v-else-if="phase === 'preview'">
        <div class="space-y-2 text-left">
          <div class="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <LucideCamera class="w-3.5 h-3.5" />
            {{ $t("match.streamer_camera.camera_label") }}
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
                <p class="text-xs text-muted-foreground">{{ $t("match.streamer_camera.selected_device") }}</p>
              </div>
              <LucideChevronDown class="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
            <select
              v-if="availableDevices.length > 1"
              v-model="selectedDeviceId"
              :aria-label="$t('match.streamer_camera.selected_device')"
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
            <LucideArrowLeft class="w-4 h-4" /> {{ $t("common.back") }}
          </Button>
          <Button class="flex-1" @click="confirmJoin">{{ $t("match.streamer_camera.connect") }}</Button>
        </div>
      </template>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          {{ $t("match.streamer_camera.tap_to_start") }}
        </p>
        <p v-if="errorMessage" class="text-sm text-destructive">
          {{ errorMessage }}
        </p>
        <Button size="lg" class="rounded-full" @click="openPreview">
          {{ $t("match.streamer_camera.start") }}
        </Button>
      </template>
    </div>
  </div>
</template>
