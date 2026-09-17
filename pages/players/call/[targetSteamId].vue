<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import QRCode from "qrcode";
import { Button } from "~/components/ui/button";
import WhepPlayer from "~/components/match/WhepPlayer.vue";
import {
  LucideX,
  LucideSmartphone,
  LucideMonitor,
  LucideArrowLeft,
  LucideVideo,
  LucideCamera,
  LucideChevronDown,
} from "lucide-vue-next";
import {
  joinAdminCall,
  fetchAdminCallParticipants,
  fetchAdminCallStatus,
  adminCallJoinUrl,
  adminCallPeerWhepUrl,
  adminCallPlayerWhipUrl,
  adminCallPlayerStatusUrl,
  adminCallPlayerHangupUrl,
  type AdminCallParticipant,
} from "~/composables/useAdminCallApi";
import socket from "~/web-sockets/Socket";

// Opened via window.open() -- either by the admin clicking the camera
// icon on a player profile (pages/players/[id].vue), or by the player
// accepting the "Admin is calling..." popup (GlobalAdminCallNotifier.vue).
// Direct copy of pages/verification-applications/call/[applicationId].vue
// (itself mirroring the matchmaking-lobby call), just keyed by the
// target player's own steamId instead of an application id -- same
// fixed 2-party call, no shared "room" to broadcast presence over.
definePageMeta({ layout: false });

const route = useRoute();
const targetSteamId = computed(() => String(route.params.targetSteamId));
const me = computed(() => useAuthStore().me);
const myId = computed(() => String(me.value?.steam_id ?? ""));

// Set by startAdminCall's window.open when THIS window is the admin's
// own popup right after ringing -- distinguishes "I just rang, wait
// for the player to actually answer" from "I'm the player accepting"
// or "reopening an already-established call", both of which should
// still jump straight to the device picker like before.
const isRingingAdmin = computed(() => route.query.ringing === "1");

const participants = ref<AdminCallParticipant[]>([]);

// --- Join flow ---
type Step =
  | "idle"
  | "ringing"
  | "declined"
  | "choose"
  | "mobile"
  | "preview"
  | "connecting"
  | "in-call";
const step = ref<Step>("idle");
const joinToken = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);
const joinError = ref<string | null>(null);

const joinUrl = computed(() =>
  joinToken.value
    ? adminCallJoinUrl(targetSteamId.value, joinToken.value)
    : null,
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
// must pull our own tile back over WHEP like the other side's.
const publishingLocally = ref(false);

async function refreshParticipants() {
  participants.value = await fetchAdminCallParticipants(targetSteamId.value);
  // The QR/phone path took over: this desktop window's only job while
  // sitting on the "mobile" step was showing the QR code, and is just
  // clutter once the phone that scanned it actually publishes. Checked
  // via the token's own status (self-referential: "is my path ready"),
  // not the participants list above -- that list always excludes the
  // caller's own steamId (it exists to render the OTHER party's tiles),
  // so it can never answer "am I live yet" for either device.
  if (step.value === "mobile" && joinToken.value) {
    const { ready } = await fetchAdminCallStatus(
      adminCallPlayerStatusUrl(joinToken.value),
    );
    if (ready) window.close();
  }
}

async function ensureToken(): Promise<string | null> {
  if (joinToken.value) return joinToken.value;
  joinError.value = null;
  const result = await joinAdminCall(targetSteamId.value);
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
let participantsPollTimer: ReturnType<typeof setTimeout> | null = null;

watch(previewEl, (el) => {
  if (el && camStream) el.srcObject = camStream;
});

// --- Device preview (Discord-style "pick your camera" step) ---
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
  // No audio: matches the lobby call, video-only.
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

    const res = await fetch(adminCallPlayerWhipUrl(token), {
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
    const { ready } = await fetchAdminCallStatus(
      adminCallPlayerStatusUrl(token),
    );
    if (!ready && step.value === "in-call") {
      joinError.value = "Connection dropped, click Join call to reconnect.";
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
      await fetch(adminCallPlayerHangupUrl(token), { method: "POST" });
    } catch {
      // best-effort
    }
  }
}

function backToChoose() {
  step.value = "choose";
}

function pollParticipants() {
  participantsPollTimer = setTimeout(async () => {
    await refreshParticipants();
    pollParticipants();
  }, 3000);
}

let responseListener: { stop: () => void } | null = null;

onMounted(async () => {
  await refreshParticipants();
  pollParticipants();

  if (isInCall.value) {
    // Reopened after already being in the call -- nothing to wait on.
    return;
  }

  if (isRingingAdmin.value) {
    // Wait for the player to actually answer (see
    // GlobalAdminCallNotifier.vue's Accept/Decline) instead of jumping
    // straight to the device picker with no idea whether anyone's even
    // seen the ring yet.
    step.value = "ringing";
    responseListener = socket.listen(
      "admin-call:response",
      (data: { targetSteamId: string; accepted: boolean }) => {
        if (data.targetSteamId !== targetSteamId.value) return;
        if (data.accepted) {
          openChoose();
        } else {
          step.value = "declined";
        }
      },
    );
    return;
  }

  // The player accepting -- here to join, don't make them click again.
  openChoose();
});

onBeforeUnmount(() => {
  if (participantsPollTimer) clearTimeout(participantsPollTimer);
  responseListener?.stop();
  if (step.value === "in-call") teardownStream();
  else if (step.value === "preview") camStream?.getTracks().forEach((t) => t.stop());
});

// Grid tiles: the other party, except myself-while-publishing-locally
// (that tile is the local preview below instead).
const tileParticipants = computed(() =>
  participants.value.filter(
    (p) => !(p.steamId === myId.value && publishingLocally.value),
  ),
);

// participants (from the server) always excludes the caller's own
// steamId -- publishingLocally (true the instant THIS window's own
// WHIP publish succeeds) is the only self-authoritative signal, since
// there's no shared room to echo a "you joined" event back to yourself.
const isInCall = computed(() => publishingLocally.value);

// Total participant count including self, for the header/messaging
// text -- participants.value alone would always undercount by one
// once you're the one publishing.
const totalCount = computed(
  () => participants.value.length + (publishingLocally.value ? 1 : 0),
);

// You should never see the other side's video before you've actually
// joined the call yourself.
const visibleTileCount = computed(() =>
  isInCall.value
    ? tileParticipants.value.length + (publishingLocally.value ? 1 : 0)
    : 0,
);
</script>

<template>
  <div class="h-screen w-full bg-zinc-950 text-foreground flex flex-col overflow-hidden p-4 gap-4">
    <div class="flex items-center justify-between shrink-0">
      <h1 class="text-base font-semibold flex items-center gap-2">
        <LucideVideo class="w-4 h-4" />
        {{ $t("pages.players.call.title", "Admin call") }}
      </h1>
      <span class="text-xs text-muted-foreground">
        {{
          totalCount
            ? $t("matchmaking.lobby_call.in_call", "{count} in call", {
                count: totalCount,
              })
            : $t("matchmaking.lobby_call.no_call", "No active call")
        }}
      </span>
    </div>

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
          :whep-url="adminCallPeerWhepUrl(targetSteamId, p.steamId)"
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
      v-else-if="step === 'ringing'"
      class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6"
    >
      <div
        class="h-10 w-10 rounded-full border-2 border-transparent border-t-[hsl(var(--tac-amber))] animate-spin"
      />
      <p class="text-sm text-muted-foreground">
        {{ $t("pages.players.call.ringing", "Calling…") }}
      </p>
    </div>
    <div
      v-else-if="step === 'declined'"
      class="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6"
    >
      <p class="text-sm font-medium text-destructive">
        {{
          $t(
            "pages.players.call.declined",
            "The player declined the call.",
          )
        }}
      </p>
    </div>
    <div
      v-else-if="!isInCall"
      class="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-6"
    >
      {{
        participants.length
          ? $t("matchmaking.lobby_call.join_to_see", "Join the call to see everyone")
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
