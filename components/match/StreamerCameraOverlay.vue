<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { Button } from "~/components/ui/button";
import { LucideCamera, LucideChevronDown, LucideCheck } from "lucide-vue-next";
import {
  streamerCameraPublishWhipUrl,
  fetchStreamerCameraStatus,
} from "~/composables/useStreamerCameraApi";

// Blocking overlay for streamer_camera_enabled, mirroring
// CameraRequirementOverlay.vue's shape (fixed full-screen card, stays
// mounted for the whole match, decides its own visibility off live
// status). Deliberately simpler than that one, though: no QR/"connect
// on another device" step -- the player is already on their own
// deafcs.net session right here, so the WHIP publish just happens
// in-place instead of on a separate token-gated page. Device preview
// step is ported from pages/matches/[id]/camera/[token].vue.

const props = defineProps<{
  matchId: string;
}>();

const emit = defineEmits<{ (e: "update:ready", value: boolean): void }>();

type Phase = "idle" | "preview" | "requesting" | "connected" | "error";
const phase = ref<Phase>("idle");
const errorMessage = ref<string | null>(null);

const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;

const availableDevices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref<string | null>(null);
const selectedDeviceLabel = computed(
  () =>
    availableDevices.value.find((d) => d.deviceId === selectedDeviceId.value)
      ?.label || null,
);

async function startPreviewDevice(deviceId?: string | null): Promise<MediaStream> {
  const constraints: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
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

async function confirmPublish() {
  if (!camStream) return;
  phase.value = "requesting";
  errorMessage.value = null;
  try {
    const stream = camStream;
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

    const res = await fetch(streamerCameraPublishWhipUrl(props.matchId), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    phase.value = "connected";
  } catch (err) {
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

function teardownStream() {
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

// Gate on an initial status check before painting anything, same
// reasoning as CameraRequirementOverlay -- a reload after already
// publishing shouldn't flash the blocking card for a moment.
const initialCheckDone = ref(false);
const ready = ref(false);
let statusTimer: ReturnType<typeof setTimeout> | null = null;

async function checkStatus() {
  const { ready: isReady } = await fetchStreamerCameraStatus(props.matchId);
  initialCheckDone.value = true;
  if (isReady !== ready.value) {
    ready.value = isReady;
    emit("update:ready", isReady);
    if (isReady) {
      phase.value = "connected";
    } else if (phase.value === "connected") {
      // Dropped without an explicit stop (network blip, tab backgrounded
      // long enough for the browser to kill the connection) -- let the
      // player know instead of silently staying on the "connected" card.
      phase.value = "error";
      errorMessage.value = "Camera connection dropped. Reconnect below.";
      teardownStream();
    }
  }
  statusTimer = setTimeout(checkStatus, isReady ? 5000 : 1500);
}
checkStatus();

function retry() {
  errorMessage.value = null;
  phase.value = "idle";
}

onBeforeUnmount(() => {
  if (statusTimer) clearTimeout(statusTimer);
  teardownStream();
});
</script>

<template>
  <div
    v-if="initialCheckDone && !ready"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
  >
    <div
      class="w-full max-w-md rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-5 text-center"
    >
      <h2 class="text-lg font-semibold">
        {{ $t("match.streamer_camera.title") }}
      </h2>
      <p class="text-sm text-muted-foreground">
        {{ $t("match.streamer_camera.description") }}
      </p>

      <div
        class="relative w-full rounded-xl overflow-hidden bg-black border border-border"
      >
        <video
          v-show="phase === 'preview' || phase === 'requesting'"
          ref="previewEl"
          autoplay
          playsinline
          muted
          class="w-full h-auto block"
        />
        <div
          v-if="phase === 'idle' || phase === 'error'"
          class="aspect-video flex items-center justify-center"
        >
          <LucideCamera class="w-8 h-8 text-muted-foreground" />
        </div>
      </div>

      <template v-if="phase === 'preview'">
        <div class="w-full space-y-2 text-left">
          <div class="relative">
            <div
              class="flex items-center gap-3 rounded-lg border p-3 pr-9 border-[hsl(var(--tac-amber)/0.5)] bg-[hsl(var(--tac-amber)/0.08)]"
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
                <p class="text-xs text-muted-foreground">
                  {{ $t("match.streamer_camera.selected_device") }}
                </p>
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
        <div class="flex gap-2 w-full">
          <Button variant="outline" class="flex-1" @click="cancelPreview">
            {{ $t("common.back") }}
          </Button>
          <Button class="flex-1" @click="confirmPublish">
            {{ $t("match.streamer_camera.connect") }}
          </Button>
        </div>
      </template>

      <template v-else-if="phase === 'requesting'">
        <p class="text-sm text-muted-foreground">
          {{ $t("match.streamer_camera.connecting") }}
        </p>
      </template>

      <template v-else-if="phase === 'error'">
        <p class="text-sm text-destructive">{{ errorMessage }}</p>
        <Button @click="retry">{{ $t("match.streamer_camera.try_again") }}</Button>
      </template>

      <template v-else>
        <Button size="lg" class="rounded-full" @click="openPreview">
          {{ $t("match.streamer_camera.start") }}
        </Button>
      </template>
    </div>
  </div>
  <!-- Small persistent "you're live" pill once connected -- reassurance
       that the overlay disappearing didn't also stop the publish. -->
  <div
    v-if="ready"
    class="fixed bottom-4 right-4 z-[90] inline-flex items-center gap-1.5 rounded-full bg-green-600/90 text-white px-3 py-1.5 text-xs font-bold shadow-lg"
  >
    <LucideCheck class="w-3.5 h-3.5" />
    {{ $t("match.streamer_camera.live_pill") }}
  </div>
</template>
