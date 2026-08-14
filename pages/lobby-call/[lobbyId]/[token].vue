<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { LucideX, LucideCheck, LucideMicOff, LucideMic } from "lucide-vue-next";
import {
  lobbyCallPlayerWhipUrl,
  lobbyCallPlayerStatusUrl,
  lobbyCallPlayerHangupUrl,
  fetchLobbyCallStatus,
} from "~/composables/useLobbyCallApi";

// Standalone, chrome-free tool page -- reached by scanning the QR code
// with a phone, or via the "connect on this computer" popup, exactly
// like the required-webcam feature's join page. Publishes both video
// and audio (this is a real call between players, not just a presence
// check the required-webcam feature does).
definePageMeta({ layout: false });

const route = useRoute();
const lobbyId = computed(() => String(route.params.lobbyId));
const token = computed(() => String(route.params.token));

type Phase = "idle" | "requesting" | "connected" | "error";
const phase = ref<Phase>("idle");
const errorMessage = ref<string | null>(null);
const muted = ref(false);

const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

function videoConstraints(): MediaTrackConstraints {
  const portrait =
    typeof window !== "undefined" &&
    window.matchMedia("(orientation: portrait)").matches;
  return {
    facingMode: { ideal: "user" },
    width: { ideal: portrait ? 720 : 1280 },
    height: { ideal: portrait ? 1280 : 720 },
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
  } catch (err) {
    phase.value = "error";
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

function pollStatus() {
  statusPollTimer = setTimeout(async () => {
    const { ready } = await fetchLobbyCallStatus(lobbyCallPlayerStatusUrl(token.value));
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

onBeforeUnmount(() => {
  teardownStream();
});
</script>

<template>
  <div
    class="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center gap-6 p-6"
  >
    <h1 class="text-lg font-semibold text-center">Lobby webcam call</h1>

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
        <div
          class="inline-flex items-center gap-2 rounded-full bg-green-600/15 text-green-500 border border-green-600/30 px-3 py-1 text-sm font-medium"
        >
          <LucideCheck class="w-4 h-4" />
          In call
        </div>
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
