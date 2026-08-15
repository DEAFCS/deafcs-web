<script setup lang="ts">
import {
  ref,
  reactive,
  onMounted,
  onBeforeUnmount,
  type ComponentPublicInstance,
} from "vue";
import WhepPlayer from "~/components/match/WhepPlayer.vue";
import { Video, VideoOff, ChevronDown, ArrowLeft } from "lucide-vue-next";
import {
  cameraAdminWhepUrl,
  cameraAdminTalkWhipUrl,
  cameraAdminTalkHangupUrl,
  fetchCameraPlayers,
  type CameraPlayerStatus,
} from "~/composables/useCameraApi";

// Opened via window.open() from MatchActions.vue's "Watch Camera" menu
// item — a real popup window showing the whole team's cameras in a
// grid at once, not an in-page overlay/dialog one player at a time.
definePageMeta({
  layout: false,
});

const route = useRoute();
const matchId = computed(() => String(route.params.id));

const loading = ref(true);
const error = ref<string | null>(null);
const data = ref<{
  lineup_1: { id: string; name: string; players: CameraPlayerStatus[] };
  lineup_2: { id: string; name: string; players: CameraPlayerStatus[] };
} | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchCameraPlayers(matchId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// --- Video call ("talk") state, keyed by steamId ---
type CallState = {
  talking: boolean;
  connecting: boolean;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
};
const calls = reactive<Record<string, CallState>>({});

function callState(steamId: string): CallState {
  if (!calls[steamId]) {
    calls[steamId] = { talking: false, connecting: false, pc: null, stream: null };
  }
  return calls[steamId];
}

// Per-player local-preview <video> elements — admin's own mini camera
// box while on a call, same PiP pattern the player's join page uses
// for the admin's incoming feed. v-for template refs need a callback,
// not a single ref().
const localVideoEls: Record<string, HTMLVideoElement | null> = {};
function setLocalVideoEl(
  steamId: string,
  el: Element | ComponentPublicInstance | null,
) {
  localVideoEls[steamId] = (el as HTMLVideoElement) ?? null;
}

// --- Device preview (Discord-style "pick your camera" step) before a
// call actually starts -- same fix as the player-facing camera pages.
// Admin can only be setting up one call at a time, so a single shared
// preview slot (keyed by which player it's for) is enough; the video
// element and device list live outside the per-player `calls` map.
const previewSteamId = ref<string | null>(null);
let previewStream: MediaStream | null = null;
const previewVideoEl = ref<HTMLVideoElement | null>(null);
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
    : {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
      };
  const stream = await navigator.mediaDevices.getUserMedia({
    video: constraints,
    audio: true,
  });
  previewStream?.getTracks().forEach((t) => t.stop());
  previewStream = stream;
  if (previewVideoEl.value) previewVideoEl.value.srcObject = stream;
  return stream;
}

async function openCallPreview(steamId: string) {
  const state = callState(steamId);
  if (state.talking || state.connecting) return;
  previewSteamId.value = steamId;
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
    alert(`Could not access camera: ${err instanceof Error ? err.message : err}`);
    cancelCallPreview();
  }
}

watch(selectedDeviceId, (id, oldId) => {
  if (previewSteamId.value && id && id !== oldId) {
    startPreviewDevice(id).catch(() => {});
  }
});

function cancelCallPreview() {
  previewStream?.getTracks().forEach((t) => t.stop());
  previewStream = null;
  if (previewVideoEl.value) previewVideoEl.value.srcObject = null;
  previewSteamId.value = null;
}

// Publishes whatever previewStream the preview step already has -- the
// actual WHIP handshake, unchanged from the old single-step startCall().
async function confirmCall() {
  const steamId = previewSteamId.value;
  const stream = previewStream;
  if (!steamId || !stream) return;
  const state = callState(steamId);
  state.connecting = true;
  previewSteamId.value = null;
  previewStream = null; // ownership moves to state.stream below
  try {
    state.stream = stream;
    const localVideoEl = localVideoEls[steamId];
    if (localVideoEl) localVideoEl.srcObject = stream;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    state.pc = pc;
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

    const res = await fetch(cameraAdminTalkWhipUrl(matchId.value, steamId), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) throw new Error(await res.text());
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    state.talking = true;
  } catch (err) {
    alert(
      `Could not start call: ${err instanceof Error ? err.message : err}`,
    );
    endCall(steamId, { notifyServer: false });
  } finally {
    state.connecting = false;
  }
}

async function endCall(
  steamId: string,
  opts: { notifyServer?: boolean } = { notifyServer: true },
) {
  const state = callState(steamId);
  if (state.pc) {
    state.pc.close();
    state.pc = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  const localVideoEl = localVideoEls[steamId];
  if (localVideoEl) localVideoEl.srcObject = null;
  state.talking = false;
  if (opts.notifyServer !== false) {
    try {
      await fetch(cameraAdminTalkHangupUrl(matchId.value, steamId), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* best-effort */
    }
  }
}

onBeforeUnmount(() => {
  for (const steamId of Object.keys(calls)) {
    if (calls[steamId].talking) endCall(steamId);
  }
  previewStream?.getTracks().forEach((t) => t.stop());
});
</script>

<template>
  <div class="min-h-screen w-full bg-background text-foreground p-4">
    <div v-if="loading" class="flex items-center justify-center h-[60vh]">
      <p class="text-muted-foreground">Loading cameras…</p>
    </div>

    <div
      v-else-if="error"
      class="flex items-center justify-center h-[60vh] text-center"
    >
      <p class="text-destructive max-w-sm">{{ error }}</p>
    </div>

    <template v-else-if="data">
      <div
        v-for="lineup in [data.lineup_1, data.lineup_2]"
        :key="lineup.id"
        class="mb-6"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {{ lineup.name }}
        </h2>
        <!-- flex-wrap + justify-center (not a CSS grid) so a lone
             leftover tile on the last row centers itself under the
             row above instead of hugging the left edge — the layout
             the user actually asked for. Each tile is pinned to
             ~50% width so two always sit side by side rather than
             stacking, however wide/narrow the popup ends up. -->
        <div class="flex flex-wrap justify-center gap-3">
          <div
            v-for="player in lineup.players"
            :key="player.steamId"
            class="rounded-lg border border-border bg-card overflow-hidden w-[calc(50%-0.375rem)]"
            :class="{ 'border-green-500': callState(player.steamId).talking }"
          >
            <div class="aspect-video bg-black relative">
              <WhepPlayer
                v-if="player.ready"
                :whep-url="cameraAdminWhepUrl(matchId, player.steamId)"
                :muted="!callState(player.steamId).talking"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
              >
                Not connected
              </div>

              <!-- Admin's own mini camera box while on a call — same
                   corner-PiP pattern the player's join page uses for
                   the admin's incoming feed, just mirrored. -->
              <video
                v-show="callState(player.steamId).talking"
                :ref="(el) => setLocalVideoEl(player.steamId, el)"
                autoplay
                playsinline
                muted
                class="absolute bottom-2 right-2 w-20 h-16 object-cover rounded-md border-2 border-white shadow-lg z-10"
              />
            </div>
            <div class="px-2 py-1.5 flex items-center gap-2 text-sm">
              <span
                class="w-2 h-2 rounded-full flex-shrink-0"
                :class="player.ready ? 'bg-green-500' : 'bg-muted-foreground/40'"
              />
              <span class="truncate flex-1">{{ player.name || player.steamId }}</span>
            </div>
            <!-- Call button lives below the video, not overlaid on top
                 of it — a small corner icon on the picture itself was
                 easy to miss entirely. Same "controls below the frame,
                 not on it" layout as the player's own join page. -->
            <button
              type="button"
              :disabled="callState(player.steamId).connecting"
              class="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium transition-colors disabled:opacity-50"
              :class="callState(player.steamId).talking ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-primary text-primary-foreground hover:opacity-90'"
              @click="
                callState(player.steamId).talking
                  ? endCall(player.steamId)
                  : openCallPreview(player.steamId)
              "
            >
              <VideoOff v-if="callState(player.steamId).talking" class="w-4 h-4" />
              <Video v-else class="w-4 h-4" />
              {{ callState(player.steamId).talking ? "End call" : "Video call" }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- Device preview -- same "pick your camera" step as the player
         pages, before the actual WHIP call starts. Modal instead of a
         page navigation since this button lives inline in the grid,
         not behind a popup-window flow. -->
    <div
      v-if="previewSteamId"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
    >
      <div
        class="w-full max-w-sm rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-5"
      >
        <h2 class="text-base font-semibold">Video call preview</h2>

        <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
          <video ref="previewVideoEl" autoplay playsinline muted class="w-full h-full object-cover" />
        </div>

        <div class="w-full space-y-2 text-left">
          <div class="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            <Video class="w-3.5 h-3.5" />
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
                <Video class="w-4 h-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ selectedDeviceLabel || "Camera" }}
                </p>
                <p class="text-xs text-muted-foreground">Selected device</p>
              </div>
              <ChevronDown class="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
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

        <div class="flex gap-2 w-full">
          <button
            type="button"
            class="flex-1 py-2 rounded-md border border-border text-sm font-medium hover:bg-accent transition-colors inline-flex items-center justify-center gap-1.5"
            @click="cancelCallPreview"
          >
            <ArrowLeft class="w-4 h-4" /> Cancel
          </button>
          <button
            type="button"
            class="flex-1 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-colors"
            @click="confirmCall"
          >
            Start call
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
