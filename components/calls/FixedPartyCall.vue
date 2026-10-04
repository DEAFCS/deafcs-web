<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import QRCode from "qrcode";
import { Button } from "~/components/ui/button";
import WhepPlayer from "~/components/match/WhepPlayer.vue";
import {
  LucideX,
  LucideArrowLeft,
  LucideSmartphone,
  LucideVideo,
  LucideCamera,
  LucideChevronDown,
} from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  oneToOneLayout,
  useElementSize,
  usePhoneCallLayout,
  useVideoTileDimensions,
} from "~/composables/useCallVideoLayout";
import type {
  FixedPartyCallAdapter,
  FixedPartyCallParticipant,
} from "~/components/calls/fixedPartyCallAdapters";

// Fixed two-party webcam call: the verification application call and the
// admin call started from a player profile (see fixedPartyCallAdapters.ts).
// Moved here unchanged from the two near-identical popout pages, which
// mirrored the matchmaking-lobby call's device/QR/preview flow.
//
// Two ways it is shown, one look (the Chat Hub Live Video card:
// components/chat/ChatVideoComposer.vue is the visual reference only):
//   - popout: the admin's separate call window (pages/.../call/...), so the
//     admin can keep using DEAFCS in the main window while waiting.
//   - inline: the called player's panel on the page they are already on
//     (GlobalVerificationCallNotifier / GlobalAdminCallNotifier), no new
//     window or tab. Website stays website, the app stays inside the app.
//
// Desktop opens straight on the phone QR code with "use this computer's
// webcam" as the secondary path. A phone has no use for a QR code to scan
// with itself, so it goes straight to its own camera as before.
const props = defineProps<{
  adapter: FixedPartyCallAdapter;
  title: string;
  inline?: boolean;
  // The admin's own popout right after ringing: wait for the answer.
  ringing?: boolean;
  ringingText?: string;
  declinedTitle?: string;
  declinedText?: string;
  noAnswerTitle?: string;
  noAnswerText?: string;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const me = computed(() => useAuthStore().me);
const myId = computed(() => String(me.value?.steam_id ?? ""));

// Whether THIS window is running on a phone -- if so, the QR code is
// meaningless (this session already is the phone), so the call goes
// straight to this device's own camera. Reported: accepting a call on
// mobile still showed the picker, and picking "Mobile" there did nothing
// useful.
const isMobileDevice = computed(
  () =>
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
);

const participants = ref<FixedPartyCallParticipant[]>([]);

// --- Join flow ---
type Step =
  | "idle"
  | "ringing"
  | "declined"
  | "phone"
  | "preview"
  | "connecting"
  | "in-call";
const step = ref<Step>("idle");
const joinToken = ref<string | null>(null);
const qrDataUrl = ref<string | null>(null);
const joinError = ref<string | null>(null);
// Distinguishes an explicit decline from the other side never answering
// within RINGING_TTL_SECONDS (see the API's timeoutRingIfUnanswered), so
// the admin sees "no answer" rather than a decline that never happened.
const ringTimedOut = ref(false);

// Where a failed or cancelled webcam attempt lands: the QR code on a
// desktop, the plain "Join call" button on a phone.
function fallbackStep(): Step {
  return isMobileDevice.value ? "idle" : "phone";
}

const joinUrl = computed(() =>
  joinToken.value ? props.adapter.joinUrl(joinToken.value) : null,
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

// The phone that scanned the QR code is live: the call carries on there,
// so this window/panel has nothing left to do.
function phoneTookOver() {
  closeWindow();
}

// Inline: hand back to the page underneath. Popout: close the admin's own
// call window (it was opened by script, so window.close() is allowed).
function closeWindow() {
  if (props.inline) emit("close");
  else window.close();
}

async function refreshParticipants() {
  participants.value = await props.adapter.participants();
  // Checked via the token's own status (self-referential: "is my path
  // ready"), not the participants list above -- that list always excludes
  // the caller's own steamId (it exists to render the OTHER party's
  // tiles), so it can never answer "am I live yet" for either device.
  if (step.value === "phone" && joinToken.value) {
    const { ready } = await props.adapter.status(joinToken.value);
    if (ready && step.value === "phone") phoneTookOver();
  }
}

async function ensureToken(): Promise<string | null> {
  if (joinToken.value) return joinToken.value;
  joinError.value = null;
  const result = await props.adapter.join();
  if (result.error) {
    joinError.value = result.error;
    return null;
  }
  joinToken.value = result.token;
  participants.value = result.participants;
  return result.token;
}

async function openJoin() {
  const token = await ensureToken();
  if (!token) return;
  if (isMobileDevice.value) {
    await chooseThisComputer();
    return;
  }
  step.value = "phone";
}

// --- Publish local camera directly from this window (webcam path) ---
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
    step.value = fallbackStep();
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
  step.value = fallbackStep();
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

    const res = await fetch(props.adapter.whipUrl(token), {
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
    step.value = fallbackStep();
  }
}

function pollStatus(token: string) {
  statusPollTimer = setTimeout(async () => {
    const { ready } = await props.adapter.status(token);
    if (!ready && step.value === "in-call") {
      joinError.value = "Connection dropped, click Join call to reconnect.";
      teardownStream();
      step.value = fallbackStep();
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
      await fetch(props.adapter.hangupUrl(token), { method: "POST" });
    } catch {
      // best-effort
    }
  }

  if (props.inline) {
    emit("close");
    return;
  }
  // The popout page has no header/nav of its own (layout: false). On
  // mobile there is no separate popup window (window.open just navigates
  // in place), so leaving the call here otherwise stranded the player on
  // this dead-end screen with no way back into DEAFCS short of
  // force-closing the app.
  if (isMobileDevice.value) {
    await navigateTo("/me");
  }
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

  if (props.ringing) {
    // Wait for the other side to actually answer (the Global*CallNotifier
    // Accept/Decline) instead of jumping straight into the join flow with
    // no idea whether anyone's even seen the ring yet.
    step.value = "ringing";
    responseListener = socket.listen(
      props.adapter.responseEvent,
      (data: Record<string, unknown> & { accepted: boolean; timedOut?: boolean }) => {
        if (!props.adapter.isOwnResponse(data)) return;
        if (data.accepted) {
          openJoin();
        } else {
          ringTimedOut.value = !!data.timedOut;
          step.value = "declined";
        }
      },
    );
    return;
  }

  // The called player accepting -- here to join, don't make them click again.
  openJoin();
});

onBeforeUnmount(() => {
  if (participantsPollTimer) clearTimeout(participantsPollTimer);
  responseListener?.stop();
  if (step.value === "in-call" || step.value === "connecting") teardownStream();
  else if (step.value === "preview") camStream?.getTracks().forEach((t) => t.stop());
});

// Grid tiles: the other party, except myself-while-publishing-locally
// (that tile is the local preview below instead).
const tileParticipants = computed(() =>
  participants.value.filter(
    (p) => !(p.steamId === myId.value && publishingLocally.value),
  ),
);

// participants (from the server) always excludes the caller's own steamId
// -- publishingLocally (true the instant THIS window's own WHIP publish
// succeeds) is the only self-authoritative signal, since there's no
// shared room to echo a "you joined" event back to yourself.
const isInCall = computed(() => publishingLocally.value);

// Total participant count including self, for the header text.
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

// --- Active call layout (oneToOneLayout in useCallVideoLayout.ts) ---
// Desktop/tablet: two EQUAL cells side by side. Phone: the other person
// fills the call area and my own camera is a small picture-in-picture in
// the bottom-right corner (also when the phone is turned sideways). Every
// feed is shown whole (object-contain, dark bars); its real shape is
// re-read whenever it can change, so rotation only re-letterboxes.
const TILE_GAP = 12;
const tileKeys = computed(() => [
  ...tileParticipants.value.map((p) => p.steamId),
  ...(publishingLocally.value ? ["local"] : []),
]);
// Real per-feed dimensions (see useVideoTileDimensions) and stage size.
const {
  tileRef,
  shape: tileShape,
  aspect: tileAspect,
} = useVideoTileDimensions();
const stageEl = ref<HTMLElement | null>(null);
const stageSize = useElementSize(stageEl);

const phoneLayout = usePhoneCallLayout();
const callLayout = computed(() =>
  oneToOneLayout({
    keys: tileKeys.value,
    // My own tile is the local preview, never guessed from list order.
    localKey: publishingLocally.value ? "local" : null,
    aspects: Object.fromEntries(tileKeys.value.map((key) => [key, tileAspect(key)])),
    phone: phoneLayout.value,
    stageWidth: stageSize.value.width,
    stageHeight: stageSize.value.height,
    gap: TILE_GAP,
  }),
);

function tileStyle(key: string) {
  return callLayout.value.styles[key] ?? {};
}
function tileRole(key: string) {
  return callLayout.value.roles[key] ?? "cell";
}
</script>

<template>
  <div
    :class="
      inline
        ? 'fixed inset-0 z-[190] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md'
        : 'flex h-screen w-full items-center justify-center overflow-hidden bg-zinc-950 p-4 text-foreground'
    "
    :role="inline ? 'dialog' : undefined"
    :aria-modal="inline ? 'true' : undefined"
    :aria-label="title"
    data-testid="fixed-party-call"
    :data-mode="inline ? 'inline' : 'popout'"
    :data-step="step"
  >
    <div
      class="flex w-full flex-col rounded-lg border bg-background p-4 text-foreground shadow-xl"
      :class="
        visibleTileCount > 0
          ? 'h-full max-w-5xl'
          : 'max-h-full max-w-md overflow-y-auto'
      "
    >
      <div class="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 class="flex items-center gap-2 text-base font-semibold">
          <LucideVideo class="size-4" />
          {{ title }}
        </h2>
        <div class="flex items-center gap-2">
          <span v-if="totalCount" class="text-xs text-muted-foreground">
            {{
              $t("matchmaking.lobby_call.in_call", "{count} in call", {
                count: totalCount,
              })
            }}
          </span>
          <button
            v-if="inline && !publishingLocally"
            type="button"
            aria-label="Close"
            class="rounded p-1 hover:bg-muted"
            data-testid="fixed-party-call-close"
            @click="emit('close')"
          >
            <LucideX class="size-4" />
          </button>
        </div>
      </div>

      <p
        v-if="joinError"
        class="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive"
      >
        {{ joinError }}
      </p>

      <template v-if="visibleTileCount > 0">
        <!-- Equal cells on desktop, other person + my picture-in-picture
             on a phone (see callLayout); every video is shown whole
             (contain), any spare space is dark. -->
        <div
          ref="stageEl"
          class="relative flex min-h-0 flex-1 flex-wrap content-center items-center justify-center gap-3 overflow-hidden"
          data-testid="fixed-party-call-stage"
          :data-layout="callLayout.mode"
        >
          <div
            v-for="p in tileParticipants"
            :key="p.steamId"
            :ref="tileRef(p.steamId)"
            class="relative shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-black transition-[width,height] duration-200"
            :style="tileStyle(p.steamId)"
            data-testid="fixed-party-call-tile"
            :data-key="p.steamId"
            :data-shape="tileShape(p.steamId)"
            :data-role="tileRole(p.steamId)"
          >
            <WhepPlayer
              :whep-url="adapter.peerWhepUrl(p.steamId)"
              :muted="false"
              object-fit="contain"
            />
            <span
              class="absolute bottom-2 left-2 max-w-[80%] truncate rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white"
            >
              {{
                p.steamId === myId
                  ? $t("matchmaking.lobby_call.you", "You")
                  : p.name || p.steamId
              }}
            </span>
          </div>
          <div
            v-if="publishingLocally"
            :ref="tileRef('local')"
            class="relative shrink-0 overflow-hidden rounded-lg border border-primary bg-black transition-[width,height] duration-200"
            :style="tileStyle('local')"
            data-testid="fixed-party-call-tile"
            data-key="local"
            :data-shape="tileShape('local')"
            :data-role="tileRole('local')"
          >
            <video
              ref="previewEl"
              autoplay
              playsinline
              muted
              class="h-full w-full bg-black object-contain"
            />
            <span
              class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white"
            >
              {{ $t("matchmaking.lobby_call.you", "You") }}
            </span>
          </div>
        </div>
        <div class="mt-3 flex shrink-0 items-center justify-center gap-3">
          <span v-if="step === 'connecting'" class="text-sm text-muted-foreground">
            Connecting…
          </span>
          <Button
            variant="destructive"
            class="gap-2"
            data-testid="fixed-party-call-leave"
            @click="leaveCall"
          >
            <LucideX class="size-4" />
            {{ $t("common.leave", "Leave call") }}
          </Button>
        </div>
      </template>

      <div
        v-else-if="step === 'ringing'"
        class="flex flex-col items-center gap-3 py-6 text-center"
        data-testid="fixed-party-call-waiting"
      >
        <div
          class="h-10 w-10 animate-spin rounded-full border-2 border-transparent border-t-[hsl(var(--tac-amber))]"
        />
        <p class="text-sm text-muted-foreground">{{ ringingText }}</p>
      </div>

      <!-- Stays up until the admin closes the window, so a decline or a
           missed call is never just a window that silently vanished. -->
      <div
        v-else-if="step === 'declined'"
        class="flex flex-col items-center gap-2 py-6 text-center"
        data-testid="fixed-party-call-declined"
      >
        <p class="text-base font-semibold text-destructive">
          {{ ringTimedOut ? noAnswerTitle : declinedTitle }}
        </p>
        <p class="text-sm text-muted-foreground">
          {{ ringTimedOut ? noAnswerText : declinedText }}
        </p>
        <Button
          variant="outline"
          size="sm"
          class="mt-2"
          data-testid="fixed-party-call-declined-close"
          @click="closeWindow"
        >
          {{ $t("common.close", "Close") }}
        </Button>
      </div>

      <div
        v-else-if="step === 'phone'"
        class="space-y-3 text-center"
        data-testid="fixed-party-call-phone"
      >
        <p class="text-sm font-medium">Join this call with your phone</p>
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="Call QR code"
          class="mx-auto size-60 rounded bg-white p-2"
          data-testid="fixed-party-call-qr"
        />
        <div v-else class="mx-auto size-60 animate-pulse rounded bg-muted" />
        <p class="text-sm">
          Scan with your phone camera. No DEAFCS login is needed.
        </p>
        <p class="text-xs text-muted-foreground">
          Prefer to use your computer's webcam?
          <button
            type="button"
            class="font-medium text-[hsl(var(--tac-amber))] hover:underline focus-visible:underline focus-visible:outline-none"
            data-testid="fixed-party-call-webcam"
            @click="chooseThisComputer"
          >
            Click here
          </button>
        </p>
      </div>

      <div
        v-else-if="step === 'preview'"
        class="flex flex-col gap-4"
        data-testid="fixed-party-call-preview"
      >
        <div class="relative aspect-video w-full overflow-hidden rounded bg-black">
          <video
            ref="previewEl"
            autoplay
            playsinline
            muted
            class="h-full w-full object-contain"
          />
        </div>

        <div class="space-y-2">
          <div
            class="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground"
          >
            <LucideCamera class="h-3.5 w-3.5" />
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
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tac-amber)/0.15)] text-[hsl(var(--tac-amber))]"
              >
                <LucideCamera class="h-4 w-4" />
              </div>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ selectedDeviceLabel || "Camera" }}
                </p>
                <p class="text-xs text-muted-foreground">Selected device</p>
              </div>
              <LucideChevronDown class="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <select
              v-if="availableDevices.length > 1"
              v-model="selectedDeviceId"
              aria-label="Select camera"
              class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option v-for="d in availableDevices" :key="d.deviceId" :value="d.deviceId">
                {{ d.label || "Camera" }}
              </option>
            </select>
          </div>
        </div>

        <div class="flex gap-2">
          <Button
            variant="outline"
            class="flex-1 gap-1.5"
            data-testid="fixed-party-call-back-to-phone"
            @click="cancelPreview"
          >
            <template v-if="isMobileDevice">
              <LucideArrowLeft class="h-4 w-4" /> Back
            </template>
            <template v-else>
              <LucideSmartphone class="h-4 w-4" /> Use phone instead
            </template>
          </Button>
          <Button class="flex-1" data-testid="fixed-party-call-join" @click="confirmJoin">
            Join call
          </Button>
        </div>
      </div>

      <Button
        v-else
        class="w-full gap-2"
        size="lg"
        data-testid="fixed-party-call-start"
        @click="openJoin"
      >
        <LucideVideo class="size-4" />
        {{
          participants.length
            ? $t("matchmaking.lobby_call.join", "Join call")
            : $t("matchmaking.lobby_call.start", "Start webcam call")
        }}
      </Button>
    </div>
  </div>
</template>
