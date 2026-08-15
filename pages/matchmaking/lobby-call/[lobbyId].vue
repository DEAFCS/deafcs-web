<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import QRCode from "qrcode";
import { Button } from "~/components/ui/button";
import WhepPlayer from "~/components/match/WhepPlayer.vue";
import {
  LucideX,
  LucideSmartphone,
  LucideMonitor,
  LucideArrowLeft,
  LucideVideo,
  LucideLoaderCircle,
  LucideCamera,
  LucideChevronDown,
} from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  joinLobbyCall,
  fetchLobbyCallParticipants,
  fetchLobbyCallStatus,
  lobbyCallJoinUrl,
  lobbyCallPeerWhepUrl,
  lobbyCallPlayerWhipUrl,
  lobbyCallPlayerStatusUrl,
  lobbyCallPlayerHangupUrl,
  type LobbyCallParticipant,
} from "~/composables/useLobbyCallApi";

// Opened via window.open() from ChatPanel.vue's webcam button — a real
// popup window for the matchmaking-lobby call, same pattern as the
// tournament "Watch Camera" admin grid (pages/matches/[id]/camera-admin.vue).
// Replaces the old inline LobbyCallPanel.vue grid, which was too cramped
// inside the narrow chat sidebar column.
definePageMeta({ layout: false });

const route = useRoute();
const lobbyId = computed(() => String(route.params.lobbyId));
const me = computed(() => useAuthStore().me);
const myId = computed(() => String(me.value?.steam_id ?? ""));

const participants = ref<LobbyCallParticipant[]>([]);

// People who've started joining (token minted) but whose camera isn't
// live yet -- shown as a "waiting for camera…" placeholder tile to
// whoever's already in the call, so it's obvious someone's on their
// way in instead of the grid just silently doing nothing for a few
// seconds. Cleared once their real tile shows up in `participants`,
// they leave, or (as a safety net, in case they close the tab/backend
// call fails without ever reaching WHIP) a timeout expires.
const joiningParticipants = ref<Record<string, LobbyCallParticipant>>({});
const joiningTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function clearJoining(steamId: string) {
  if (joiningTimers[steamId]) {
    clearTimeout(joiningTimers[steamId]);
    delete joiningTimers[steamId];
  }
  if (joiningParticipants.value[steamId]) {
    const next = { ...joiningParticipants.value };
    delete next[steamId];
    joiningParticipants.value = next;
  }
}

// --- Join flow ---
type Step = "idle" | "choose" | "mobile" | "preview" | "connecting" | "in-call";
const step = ref<Step>("idle");
const joinToken = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);
const joinError = ref<string | null>(null);

const joinUrl = computed(() =>
  joinToken.value ? lobbyCallJoinUrl(lobbyId.value, joinToken.value) : null,
);

watch(joinUrl, async (url) => {
  if (!url) {
    qrDataUrl.value = null;
    return;
  }
  qrDataUrl.value = await QRCode.toDataURL(url, { width: 220, margin: 1 });
});

// True only while THIS window is the one publishing the local camera
// (the "this computer" path) -- the QR/phone path publishes from a
// different device, so this window has no local stream to show and
// must pull our own tile back over WHEP like everyone else's.
const publishingLocally = ref(false);

async function refreshParticipants() {
  participants.value = await fetchLobbyCallParticipants(lobbyId.value);
}

async function ensureToken(): Promise<string | null> {
  if (joinToken.value) return joinToken.value;
  joinError.value = null;
  const result = await joinLobbyCall(lobbyId.value);
  if (result.error) {
    joinError.value = result.error;
    return null;
  }
  joinToken.value = result.token;
  participants.value = result.participants;
  return result.token;
}

async function openChoose() {
  const token = await ensureToken();
  if (!token) return;
  step.value = "choose";
}

function chooseMobile() {
  step.value = "mobile";
}

// --- Publish local camera directly from this popout (desktop path) ---
const previewEl = ref<HTMLVideoElement | null>(null);
let camStream: MediaStream | null = null;
let camPc: RTCPeerConnection | null = null;
let statusPollTimer: ReturnType<typeof setTimeout> | null = null;

// Belt-and-suspenders for attaching the local stream: the own-preview
// <video> now lives inside the same v-if="visibleTileCount > 0" grid as
// everyone else (see template), which depends on the server confirming
// us via the participants socket event. That confirmation can arrive a
// tick or more after publishingLocally flips true, so the element may
// not exist yet when confirmJoin()'s single nextTick() runs --
// exactly the silent-no-op black-screen bug described there, just
// reintroduced by a later delay. Watching the ref directly attaches the
// stream whenever the element actually mounts, however long that takes.
watch(previewEl, (el) => {
  if (el && camStream) el.srcObject = camStream;
});

// --- Device preview (Discord-style "pick your camera" step) ---
// Grants camera access and shows a live preview + device picker
// *before* publishing anything, instead of the old flow which
// requested the default camera and started broadcasting in the same
// step. Reuses whatever stream is already flowing when the device
// list changes -- no double permission prompt.
const availableDevices = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref<string | null>(null);
const selectedDeviceLabel = computed(
  () =>
    availableDevices.value.find((d) => d.deviceId === selectedDeviceId.value)
      ?.label || null,
);

function videoConstraintsFor(deviceId?: string | null): MediaTrackConstraints {
  return deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
    : {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        aspectRatio: { ideal: 16 / 9 },
      };
}

async function startPreviewDevice(deviceId?: string | null): Promise<MediaStream> {
  // No audio: this is a video-only feature for deaf players.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: videoConstraintsFor(deviceId),
    audio: false,
  });
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = stream;
  if (previewEl.value) previewEl.value.srcObject = stream;
  return stream;
}

async function chooseThisComputer() {
  const token = await ensureToken();
  if (!token) return;
  step.value = "preview";
  try {
    const stream = await startPreviewDevice();
    // Device labels are only populated once permission has been
    // granted, so enumerate *after* the first getUserMedia succeeds --
    // doing it earlier would just show blank "Camera 1"/"Camera 2".
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableDevices.value = devices.filter((d) => d.kind === "videoinput");
    selectedDeviceId.value =
      stream.getVideoTracks()[0]?.getSettings().deviceId ??
      availableDevices.value[0]?.deviceId ??
      null;
  } catch (err) {
    joinError.value = err instanceof Error ? err.message : String(err);
    step.value = "choose";
  }
}

watch(selectedDeviceId, (id, oldId) => {
  if (step.value === "preview" && id && id !== oldId) {
    startPreviewDevice(id).catch((err) => {
      joinError.value = err instanceof Error ? err.message : String(err);
    });
  }
});

function cancelPreview() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  if (previewEl.value) previewEl.value.srcObject = null;
  step.value = "choose";
}

// Publishes whatever camStream the preview step already has -- the
// actual WHIP handshake, unchanged from the old single-step flow.
async function confirmJoin() {
  const token = joinToken.value;
  if (!token || !camStream) return;
  step.value = "connecting";
  try {
    const stream = camStream;
    publishingLocally.value = true;
    await nextTick();
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

    const res = await fetch(lobbyCallPlayerWhipUrl(token), {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) throw new Error(await res.text());
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    step.value = "in-call";
    pollStatus(token);
  } catch (err) {
    joinError.value = err instanceof Error ? err.message : String(err);
    teardownStream();
    step.value = "choose";
  }
}

function pollStatus(token: string) {
  statusPollTimer = setTimeout(async () => {
    const { ready } = await fetchLobbyCallStatus(lobbyCallPlayerStatusUrl(token));
    if (!ready && step.value === "in-call") {
      joinError.value = "Connection dropped — click Join call to reconnect.";
      teardownStream();
      step.value = "choose";
      return;
    }
    pollStatus(token);
  }, 2000);
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
  publishingLocally.value = false;
}

async function leaveCall() {
  const token = joinToken.value;
  teardownStream();
  step.value = "idle";
  joinToken.value = null;
  if (token) {
    try {
      await fetch(lobbyCallPlayerHangupUrl(token), { method: "POST" });
    } catch {
      // best-effort
    }
  }
}

function backToChoose() {
  step.value = "choose";
}

// --- Live participant list over the existing chat socket channel ---
let unlistenJoined: (() => void) | null = null;
let unlistenLeft: (() => void) | null = null;
let unlistenJoining: (() => void) | null = null;

onMounted(async () => {
  await refreshParticipants();

  // Clicking the webcam icon in ChatPanel.vue is the "start/join call"
  // action -- don't make the user click again inside this window too.
  // Skip straight to the device picker unless they're already in the
  // call (e.g. this window was reopened after joining from elsewhere).
  if (!isInCall.value) {
    openChoose();
  }

  const joinedListener = socket.listen(
    `lobby:matchmaking:${lobbyId.value}:call-joined`,
    (data: LobbyCallParticipant) => {
      if (!participants.value.some((p) => p.steamId === data.steamId)) {
        participants.value = [...participants.value, data];
      }
      clearJoining(data.steamId);
      // This window's only job during the "mobile" step is showing the
      // QR code -- once the phone that scanned it actually publishes,
      // the call itself lives on the phone (which has its own grid,
      // see pages/lobby-call/[lobbyId]/[token].vue), so this desktop
      // window is just clutter left open at that point.
      if (step.value === "mobile" && data.steamId === myId.value) {
        window.close();
      }
    },
  );
  unlistenJoined = () => joinedListener?.stop();

  const leftListener = socket.listen(
    `lobby:matchmaking:${lobbyId.value}:call-left`,
    (data: { steamId: string }) => {
      participants.value = participants.value.filter(
        (p) => p.steamId !== data.steamId,
      );
      clearJoining(data.steamId);
    },
  );
  unlistenLeft = () => leftListener?.stop();

  const joiningListener = socket.listen(
    `lobby:matchmaking:${lobbyId.value}:call-joining`,
    (data: LobbyCallParticipant) => {
      if (data.steamId === myId.value) return;
      if (participants.value.some((p) => p.steamId === data.steamId)) return;
      joiningParticipants.value = { ...joiningParticipants.value, [data.steamId]: data };
      if (joiningTimers[data.steamId]) clearTimeout(joiningTimers[data.steamId]);
      joiningTimers[data.steamId] = setTimeout(() => clearJoining(data.steamId), 25_000);
    },
  );
  unlistenJoining = () => joiningListener?.stop();
});

onBeforeUnmount(() => {
  unlistenJoined?.();
  unlistenLeft?.();
  unlistenJoining?.();
  for (const steamId of Object.keys(joiningTimers)) clearJoining(steamId);
  if (step.value === "in-call") teardownStream();
  else if (step.value === "preview") camStream?.getTracks().forEach((t) => t.stop());
});

// Grid tiles: everyone except myself-while-publishing-locally (that tile
// is the local preview below instead, no need to pull our own WHEP feed).
const tileParticipants = computed(() =>
  participants.value.filter(
    (p) => !(p.steamId === myId.value && publishingLocally.value),
  ),
);

const isInCall = computed(() =>
  participants.value.some((p) => p.steamId === myId.value),
);

// "Waiting for camera…" placeholders, minus anyone who already has a
// real tile above (clearJoining should already have dropped those, but
// this is a cheap belt-and-suspenders filter against the render).
const joiningList = computed(() =>
  Object.values(joiningParticipants.value).filter(
    (p) => !tileParticipants.value.some((tp) => tp.steamId === p.steamId),
  ),
);

// You should never see anyone else's video before you've actually
// joined the call yourself -- opening this window (or sitting on the
// device picker) must not leak other people's streams.
// +1 for the local-preview tile when publishing from this computer --
// it's rendered as one more grid cell now (see template), not a
// separate box below, so it has to count towards the layout too.
const visibleTileCount = computed(() =>
  isInCall.value
    ? tileParticipants.value.length +
      joiningList.value.length +
      (publishingLocally.value ? 1 : 0)
    : 0,
);
</script>

<template>
  <!-- Fixed to the real viewport height (not min-height, which let the
       grid grow taller than the screen and forced the whole page to
       scroll instead of fitting like Discord does) -- only the video
       grid itself scrolls internally if it ever truly can't fit. -->
  <div class="h-screen w-full bg-zinc-950 text-foreground flex flex-col overflow-hidden p-4 gap-4">
    <div class="flex items-center justify-between shrink-0">
      <h1 class="text-base font-semibold flex items-center gap-2">
        <LucideVideo class="w-4 h-4" />
        {{ $t("matchmaking.lobby_call.tooltip", "Webcam call") }}
      </h1>
      <span class="text-xs text-muted-foreground">
        {{
          participants.length
            ? $t("matchmaking.lobby_call.in_call", "{count} in call", {
                count: participants.length,
              })
            : $t("matchmaking.lobby_call.no_call", "No active call")
        }}
      </span>
    </div>

    <!-- Video grid -- landscape tiles, comfortably sized (this is the
         whole point of the popout: room the narrow chat sidebar never
         had). Falls back to a friendlier width on a lone tile. Only
         rendered once YOU'VE actually joined the call yourself -- you
         must never see anyone else's video before that, even if you've
         opened this window and are just sitting on the device picker. -->
    <div
      v-if="visibleTileCount > 0"
      class="grid gap-3 flex-1 min-h-0 auto-rows-fr overflow-y-auto"
      :class="visibleTileCount === 1 ? 'grid-cols-1 max-w-2xl mx-auto w-full' : 'grid-cols-2'"
    >
      <div
        v-for="p in tileParticipants"
        :key="p.steamId"
        class="relative rounded-lg overflow-hidden bg-black border border-zinc-800"
      >
        <WhepPlayer
          :whep-url="lobbyCallPeerWhepUrl(lobbyId, p.steamId)"
          :muted="false"
          object-fit="cover"
        />
        <span
          class="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/60 rounded px-2 py-0.5 truncate max-w-[80%]"
        >
          {{ p.steamId === myId ? $t("matchmaking.lobby_call.you", "You") : p.name || p.steamId }}
        </span>
      </div>
      <div
        v-for="p in joiningList"
        :key="`joining-${p.steamId}`"
        class="relative rounded-lg overflow-hidden bg-zinc-900 border border-dashed border-zinc-700 flex flex-col items-center justify-center gap-2"
      >
        <LucideLoaderCircle class="w-5 h-5 text-muted-foreground animate-spin" />
        <span class="text-xs text-muted-foreground">Waiting for camera…</span>
        <span
          class="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/60 rounded px-2 py-0.5 truncate max-w-[80%]"
        >
          {{ p.name || p.steamId }}
        </span>
      </div>
      <!-- My own local preview while publishing from this computer --
           rendered as one more equal grid cell, not a separately-sized
           box below, same as the mobile page and Discord treat "you". -->
      <div
        v-if="publishingLocally"
        class="relative rounded-lg overflow-hidden bg-black border border-primary"
      >
        <video ref="previewEl" autoplay playsinline muted class="w-full h-full object-cover" />
        <span class="absolute bottom-2 left-2 text-xs font-medium text-white bg-black/60 rounded px-2 py-0.5">
          {{ $t("matchmaking.lobby_call.you", "You") }}
        </span>
      </div>
    </div>
    <div
      v-else-if="!isInCall"
      class="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-6"
    >
      {{
        participants.length
          ? $t(
              "matchmaking.lobby_call.join_to_see",
              "Join the call to see everyone",
            )
          : $t("matchmaking.lobby_call.no_call", "No active call")
      }}
    </div>

    <!-- Join controls -->
    <div class="mx-auto w-full max-w-sm shrink-0">
      <Button
        v-if="step === 'idle' && !isInCall"
        class="w-full gap-2"
        size="lg"
        @click="openChoose"
      >
        <LucideVideo class="w-4 h-4" />
        {{
          participants.length
            ? $t("matchmaking.lobby_call.join", "Join call")
            : $t("matchmaking.lobby_call.start", "Start webcam call")
        }}
      </Button>

      <Button
        v-if="publishingLocally"
        variant="destructive"
        class="w-full gap-2"
        size="lg"
        @click="leaveCall"
      >
        <LucideX class="w-4 h-4" />
        {{ $t("common.leave", "Leave call") }}
      </Button>

      <p v-if="joinError" class="text-xs text-destructive text-center mt-2">
        {{ joinError }}
      </p>

      <div v-if="step === 'choose'" class="rounded-lg border border-zinc-800 p-4 space-y-3 mt-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">
            {{ $t("matchmaking.lobby_call.choose_device", "Connect with…") }}
          </span>
          <button type="button" class="text-muted-foreground hover:text-foreground" @click="step = 'idle'">
            <LucideArrowLeft class="w-4 h-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-md border border-zinc-800 p-4 hover:border-primary hover:bg-accent transition-colors"
            @click="chooseMobile"
          >
            <LucideSmartphone class="w-5 h-5" />
            <span class="text-xs font-medium">Mobile</span>
          </button>
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-md border border-zinc-800 p-4 hover:border-primary hover:bg-accent transition-colors"
            @click="chooseThisComputer"
          >
            <LucideMonitor class="w-5 h-5" />
            <span class="text-xs font-medium">This computer</span>
          </button>
        </div>
      </div>

      <div v-if="step === 'mobile'" class="rounded-lg border border-zinc-800 p-4 flex flex-col items-center gap-3 mt-2">
        <button
          type="button"
          class="self-start inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          @click="backToChoose"
        >
          <LucideArrowLeft class="w-3.5 h-3.5" /> Back
        </button>
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="QR code"
          width="200"
          height="200"
          class="rounded-lg border border-border bg-white p-2"
        />
        <p class="text-xs text-muted-foreground text-center">
          Scan with your phone's camera app to join with your phone's camera.
        </p>
      </div>

      <!-- Device preview -- Discord-style "pick your camera" step, DEAFCS
           styling (amber accent instead of Discord's orange, matching
           the rest of the site). Camera access is already granted by
           the time this shows (chooseThisComputer requested it), so
           this is purely picking a device and confirming, not another
           permission prompt. -->
      <div
        v-if="step === 'preview'"
        class="rounded-lg border border-zinc-800 bg-zinc-900 p-4 flex flex-col gap-4 mt-2 w-full"
      >
        <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-black">
          <video ref="previewEl" autoplay playsinline muted class="w-full h-full object-cover" />
        </div>

        <div class="space-y-2">
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
                  : 'border-zinc-800 bg-zinc-950'
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

        <div class="flex gap-2">
          <Button variant="outline" class="flex-1" @click="cancelPreview">
            <LucideArrowLeft class="w-4 h-4" /> Back
          </Button>
          <Button class="flex-1" @click="confirmJoin"> Join call </Button>
        </div>
      </div>

      <div v-if="step === 'connecting'" class="text-center text-sm text-muted-foreground mt-2">
        Connecting…
      </div>
    </div>
  </div>
</template>
