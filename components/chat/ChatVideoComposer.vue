<script setup lang="ts">
import QRCode from "qrcode";
import { Camera, RefreshCw, Smartphone, Video, X } from "lucide-vue-next";

type VideoDraft = {
  sessionId: string;
  media: { id: string; mimeType: string; durationMs: number; size: number };
};
const props = defineProps<{
  type: string;
  roomId: string;
  modelValue: VideoDraft | null;
}>();
const emit = defineEmits<{ "update:modelValue": [value: VideoDraft | null] }>();
const config = useRuntimeConfig();
const open = ref(false);
const step = ref<"choice" | "camera" | "recorded" | "phone">("choice");
const error = ref("");
const stream = shallowRef<MediaStream | null>(null);
const recorder = shallowRef<MediaRecorder | null>(null);
const preview = ref<HTMLVideoElement>();
const blobUrl = ref("");
const blob = shallowRef<Blob | null>(null);
const countdown = ref(0);
const recording = ref(false);
const secondsLeft = ref(60);
const busy = ref(false);
const startingPhone = ref(false);
const qrDataUrl = ref("");
const phoneSessionId = ref("");
let chunks: BlobPart[] = [];
let countTimer: ReturnType<typeof setInterval> | undefined;
let maxTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;
let recordedDurationMs = 0;
let phoneToken = "";
let facingMode: "user" | "environment" = "user";
const api = `https://${config.public.apiDomain}/matches/chat-video`;
const mediaUrl = computed(() =>
  props.modelValue ? `${api}/media/${props.modelValue.media.id}` : "",
);

function stopCamera() {
  stream.value?.getTracks().forEach((track) => track.stop());
  stream.value = null;
}
function clearTimers() {
  if (countTimer) clearInterval(countTimer);
  if (maxTimer) clearTimeout(maxTimer);
  if (pollTimer) clearInterval(pollTimer);
  countTimer = undefined;
  maxTimer = undefined;
  pollTimer = undefined;
}
function resetRecording() {
  recording.value = false;
  countdown.value = 0;
  clearTimers();
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = "";
  blob.value = null;
  chunks = [];
  stopCamera();
}
async function createSession() {
  const response = await fetch(`${api}/sessions`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: props.type, roomId: props.roomId }),
  });
  if (!response.ok)
    throw new Error(
      "Could not start a video draft. Check your chat permissions and try again.",
    );
  return (await response.json()) as { id: string; token: string };
}
async function choosePhone() {
  error.value = "";
  busy.value = true;
  startingPhone.value = true;
  try {
    if (!phoneSessionId.value || !phoneToken) {
      const session = await createSession();
      phoneSessionId.value = session.id;
      phoneToken = session.token;
    }
    qrDataUrl.value = await QRCode.toDataURL(
      `${window.location.origin}/chat-video#${phoneToken}`,
      { width: 240, margin: 1 },
    );
    const sessionId = phoneSessionId.value;
    step.value = "phone";
    pollTimer = setInterval(async () => {
      try {
        const status = await fetch(`${api}/sessions/${sessionId}`, {
          credentials: "include",
        });
        if (!status.ok) return;
        const result = await status.json();
        if (result.state === "ready" && result.media) {
          clearTimers();
          emit("update:modelValue", {
            sessionId,
            media: result.media,
          });
          step.value = "choice";
          open.value = false;
          phoneSessionId.value = "";
          phoneToken = "";
        }
      } catch {
        /* keep polling through brief network interruptions */
      }
    }, 1800);
  } catch (cause: any) {
    error.value = cause?.message || "Could not start phone recording.";
  } finally {
    startingPhone.value = false;
    busy.value = false;
  }
}
async function startCamera() {
  error.value = "";
  busy.value = true;
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 25 },
      },
    });
    step.value = "camera";
    await nextTick();
    if (preview.value) {
      preview.value.srcObject = stream.value;
      await preview.value.play().catch(() => {});
    }
  } catch (cause: any) {
    const name = cause?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      error.value =
        "Camera access was denied. Allow camera access or choose Use phone.";
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      error.value =
        "No camera is available on this device. You can use your phone instead.";
    } else {
      error.value = "Could not open the camera. Allow access or choose Use phone.";
    }
  } finally {
    busy.value = false;
  }
}
async function flipCamera() {
  facingMode = facingMode === "user" ? "environment" : "user";
  stopCamera();
  try {
    stream.value = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 25 },
      },
    });
    await nextTick();
    if (preview.value) {
      preview.value.srcObject = stream.value;
      await preview.value.play().catch(() => {});
    }
  } catch {
    error.value =
      "Could not switch camera. Keep using the current camera or use your phone.";
  }
}
function preferredMime() {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}
function beginCountdown() {
  const mimeType = preferredMime();
  if (!mimeType) {
    error.value = "This browser cannot record a supported video format.";
    return;
  }
  countdown.value = 3;
  countTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      clearInterval(countTimer);
      countTimer = undefined;
      try {
        const activeStream = stream.value;
        if (!activeStream) return;
        chunks = [];
        const mediaRecorder = new MediaRecorder(activeStream, {
          mimeType,
          videoBitsPerSecond: 1_200_000,
        });
        recorder.value = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
          recordedDurationMs = Math.min(60_000, Date.now() - startedAt);
          blob.value = new Blob(chunks, {
            type: mediaRecorder.mimeType || mimeType,
          });
          blobUrl.value = URL.createObjectURL(blob.value);
          recording.value = false;
          step.value = "recorded";
          stopCamera();
        };
        mediaRecorder.start(1000);
        startedAt = Date.now();
        recording.value = true;
        secondsLeft.value = 60;
        maxTimer = setInterval(() => {
          secondsLeft.value = Math.max(
            0,
            60 - Math.floor((Date.now() - startedAt) / 1000),
          );
          if (!secondsLeft.value) stopRecording();
        }, 250) as any;
      } catch {
        error.value = "Could not start recording. Try again or choose Use phone.";
      }
    }
  }, 1000);
}
function stopRecording() {
  if (maxTimer) clearInterval(maxTimer);
  maxTimer = undefined;
  if (recorder.value?.state === "recording") recorder.value.stop();
}
async function uploadVideo() {
  const videoBlob = blob.value;
  if (!videoBlob) return;
  busy.value = true;
  error.value = "";
  try {
    if (!phoneSessionId.value || !phoneToken) {
      const session = await createSession();
      phoneSessionId.value = session.id;
      phoneToken = session.token;
    }
    const body = new FormData();
    body.append(
      "file",
      videoBlob,
      videoBlob.type.includes("mp4") ? "message.mp4" : "message.webm",
    );
    body.append("durationMs", String(recordedDurationMs));
    const response = await fetch(
      `${api}/sessions/${phoneSessionId.value}/upload`,
      { method: "POST", credentials: "include", body },
    );
    if (!response.ok)
      throw new Error("Upload failed. Please try again or retake the video.");
    const status = await fetch(`${api}/sessions/${phoneSessionId.value}`, {
      credentials: "include",
    });
    const result = await status.json();
    if (result.state !== "ready" || !result.media)
      throw new Error("The uploaded video is not ready yet.");
    emit("update:modelValue", {
      sessionId: phoneSessionId.value,
      media: result.media,
    });
    resetRecording();
    open.value = false;
    step.value = "choice";
  } catch (cause: any) {
    error.value = cause?.message || "Upload failed.";
  } finally {
    busy.value = false;
  }
}
async function discardDraft() {
  const id = props.modelValue?.sessionId || phoneSessionId.value;
  if (id)
    await fetch(`${api}/sessions/${id}/cancel`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  emit("update:modelValue", null);
  resetRecording();
  step.value = "choice";
  phoneSessionId.value = "";
  phoneToken = "";
}
async function close() {
  clearTimers();
  stopCamera();
  if (!props.modelValue && phoneSessionId.value) {
    await fetch(`${api}/sessions/${phoneSessionId.value}/cancel`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }
  phoneSessionId.value = "";
  phoneToken = "";
  open.value = false;
  step.value = "choice";
  error.value = "";
}
onBeforeUnmount(() => {
  clearTimers();
  stopCamera();
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
});
watch(
  () => props.modelValue,
  (value, previous) => {
    if (previous && !value) {
      phoneSessionId.value = "";
      phoneToken = "";
    }
  },
);
</script>

<template>
  <button
    type="button"
    class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    :disabled="busy"
    :title="modelValue ? 'Video ready' : 'Record a sign-language video message'"
    @click="open = true"
  >
    <Video class="size-4" />
  </button>
  <span v-if="modelValue" class="max-w-20 truncate text-xs text-emerald-600"
    >Video ready</span
  >
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Record video message"
    @click.self="close"
  >
    <div class="w-full max-w-lg rounded-lg border bg-background p-4 shadow-xl">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-base font-semibold">Video message</h2>
        <button
          class="rounded p-1 hover:bg-muted"
          type="button"
          aria-label="Close"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>
      <p
        v-if="error"
        class="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive"
      >
        {{ error }}
      </p>
      <div v-if="modelValue" class="space-y-3">
        <video
          :src="mediaUrl"
          controls
          playsinline
          preload="metadata"
          class="max-h-[55vh] w-full rounded bg-black object-contain"
        />
        <div class="flex justify-between">
          <span class="text-sm text-emerald-600">Video ready in composer</span
          ><button
            class="rounded border px-3 py-1.5 text-sm"
            type="button"
            @click="discardDraft"
          >
            Discard video
          </button>
        </div>
      </div>
      <div v-else-if="step === 'choice'" class="grid gap-3 sm:grid-cols-2">
        <button
          class="flex min-h-24 items-center gap-3 rounded border p-4 text-left hover:bg-muted disabled:opacity-50"
          type="button"
          :disabled="busy"
          @click="startCamera"
        >
          <Camera class="size-6" /><span
            ><strong class="block">This device</strong
            ><small>Record with a camera</small></span
          >
        </button>
        <button
          class="flex min-h-24 items-center gap-3 rounded border p-4 text-left hover:bg-muted disabled:opacity-50"
          type="button"
          :disabled="busy"
          @click="choosePhone"
        >
          <Smartphone class="size-6" /><span
            ><strong class="block">Use phone</strong
            ><small>Scan a temporary QR code</small></span
          >
        </button>
        <p
          v-if="startingPhone"
          class="col-span-full text-center text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          Preparing your temporary phone session…
        </p>
      </div>
      <div v-else-if="step === 'camera'" class="space-y-3">
        <div class="relative overflow-hidden rounded bg-black">
          <video
            ref="preview"
            autoplay
            muted
            playsinline
            class="max-h-[55vh] w-full object-contain"
          />
          <div
            v-if="countdown"
            class="absolute inset-0 grid place-items-center bg-black/25 text-7xl font-bold text-white"
          >
            {{ countdown }}
          </div>
        </div>
        <div class="flex justify-between">
          <button
            v-if="!countdown"
            class="rounded border px-3 py-1.5 text-sm"
            type="button"
            @click="flipCamera"
          >
            Flip camera</button
          ><button
            class="rounded bg-primary px-4 py-1.5 text-sm text-primary-foreground"
            type="button"
            @click="beginCountdown"
          >
            Start recording
          </button>
        </div>
      </div>
      <div v-else-if="step === 'recorded'" class="space-y-3">
        <video
          :src="blobUrl"
          controls
          playsinline
          preload="metadata"
          class="max-h-[55vh] w-full rounded bg-black object-contain"
        />
        <p class="text-sm text-muted-foreground">
          Preview your video before sending. Maximum 60 seconds.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="rounded border px-3 py-1.5 text-sm"
            type="button"
            :disabled="busy"
            @click="startCamera"
          >
            <RefreshCw class="mr-1 inline size-3.5" />Retake</button
          ><button
            class="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            type="button"
            :disabled="busy"
            @click="uploadVideo"
          >
            {{ busy ? "Uploading…" : "Use Video" }}
          </button>
        </div>
      </div>
      <div v-else-if="step === 'phone'" class="space-y-3 text-center">
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="Temporary phone recording QR code"
          class="mx-auto size-60 rounded bg-white p-2"
        />
        <p class="text-sm">
          Scan with your phone camera. No DEAFCS login is needed. This link
          expires in 5 minutes.
        </p>
        <p class="text-xs text-muted-foreground">Waiting for your video…</p>
        <button
          class="rounded border px-3 py-1.5 text-sm"
          type="button"
          @click="discardDraft"
        >
          Cancel
        </button>
      </div>
      <p v-if="recording" class="mt-3 text-center text-sm text-red-500">
        Recording… {{ secondsLeft }} seconds left
        <button type="button" class="ml-2 underline" @click="stopRecording">
          Stop
        </button>
      </p>
    </div>
  </div>
</template>
