<script setup lang="ts">
import QRCode from "qrcode";
import { Camera, RefreshCw, Smartphone, Video, X } from "lucide-vue-next";
import { onMounted, ref, shallowRef } from "vue";

const props = defineProps<{
  type: string;
  roomId: string;
}>();
const config = useRuntimeConfig();
const open = ref(false);
const isMobileOS = ref(false);
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
const sessionId = ref("");
const uploadComplete = ref(false);
let chunks: BlobPart[] = [];
let countTimer: ReturnType<typeof setInterval> | undefined;
let maxTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let startedAt = 0;
let recordedDurationMs = 0;
let phoneToken = "";
let facingMode: "user" | "environment" = "user";
const api = `https://${config.public.apiDomain}/matches/chat-video`;

onMounted(() => {
  const userAgent = navigator.userAgent || "";
  const usesIPadDesktopUserAgent =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  isMobileOS.value =
    /android|iphone|ipad|ipod/i.test(userAgent) ||
    usesIPadDesktopUserAgent;
});

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
    if (!sessionId.value || !phoneToken) {
      const session = await createSession();
      sessionId.value = session.id;
      phoneToken = session.token;
    }
    qrDataUrl.value = await QRCode.toDataURL(
      `${window.location.origin}/chat-video#${phoneToken}`,
      { width: 240, margin: 1 },
    );
    const phoneSessionId = sessionId.value;
    step.value = "phone";
    pollTimer = setInterval(async () => {
      try {
        const status = await fetch(`${api}/sessions/${phoneSessionId}`, {
          credentials: "include",
        });
        if (!status.ok) return;
        const result = await status.json();
        if (result.state === "sent") {
          finishSent();
        } else if (result.state === "expired") {
          clearTimers();
          sessionId.value = "";
          phoneToken = "";
          step.value = "choice";
          error.value = "This phone session expired. Create a new one.";
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
function finishSent() {
  clearTimers();
  resetRecording();
  sessionId.value = "";
  phoneToken = "";
  uploadComplete.value = false;
  open.value = false;
  step.value = "choice";
  error.value = "";
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
        "Camera access was blocked. Allow camera permission in your browser and try again.";
    } else if (
      name === "NotReadableError" ||
      name === "TrackStartError" ||
      name === "AbortError"
    ) {
      error.value =
        "Camera is unavailable or being used by another app. Close the other app and try again, or use your phone.";
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      error.value =
        "No webcam was found on this device. You can use your phone instead.";
    } else {
      error.value = "Could not start your camera. Try again or use your phone.";
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
  if (countdown.value > 0 || recording.value || busy.value) return;
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
async function sendVideo() {
  const videoBlob = blob.value;
  if (!videoBlob) return;
  busy.value = true;
  error.value = "";
  try {
    if (!sessionId.value || !phoneToken) {
      const session = await createSession();
      sessionId.value = session.id;
      phoneToken = session.token;
    }
    if (!uploadComplete.value) {
      const status = await fetch(`${api}/sessions/${sessionId.value}`, {
        credentials: "include",
      });
      if (status.ok) {
        const result = await status.json();
        if (result.state === "sent") {
          finishSent();
          return;
        }
        if (result.state === "ready" || result.state === "sending")
          uploadComplete.value = true;
        else if (result.state === "expired")
          throw new Error("This video session expired. Record a new video.");
      }
      if (!uploadComplete.value) {
        const body = new FormData();
        body.append(
          "file",
          videoBlob,
          videoBlob.type.includes("mp4") ? "message.mp4" : "message.webm",
        );
        body.append("durationMs", String(recordedDurationMs));
        const response = await fetch(
          `${api}/sessions/${sessionId.value}/upload`,
          { method: "POST", credentials: "include", body },
        );
        if (!response.ok) {
          const recovered = await fetch(`${api}/sessions/${sessionId.value}`, {
            credentials: "include",
          }).catch(() => undefined);
          if (recovered?.ok) {
            const result = await recovered.json();
            if (result.state === "sent") {
              finishSent();
              return;
            }
            if (result.state === "ready" || result.state === "sending") {
              uploadComplete.value = true;
            } else {
              throw new Error(
                "Video upload failed. Retry Send Video or retake the video.",
              );
            }
          } else {
            throw new Error(
              "Video upload failed. Retry Send Video or retake the video.",
            );
          }
        } else {
          uploadComplete.value = true;
        }
      }
    }

    const response = await fetch(`${api}/sessions/${sessionId.value}/send`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      const recovered = await fetch(`${api}/sessions/${sessionId.value}`, {
        credentials: "include",
      }).catch(() => undefined);
      if (recovered?.ok && (await recovered.json()).state === "sent") {
        finishSent();
        return;
      }
      throw new Error(
        "Video could not be sent. Your chat permissions may have changed. Retry or retake the video.",
      );
    }
    finishSent();
  } catch (cause: any) {
    error.value = cause?.message || "Video could not be sent. Please retry.";
  } finally {
    busy.value = false;
  }
}
async function retake() {
  if (busy.value) return;
  let reopenCamera = true;
  busy.value = true;
  error.value = "";
  try {
    if (sessionId.value) {
      const response = await fetch(`${api}/sessions/${sessionId.value}/retake`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 404) {
        sessionId.value = "";
        phoneToken = "";
        uploadComplete.value = false;
      } else if (!response.ok) {
        throw new Error(
          "The video session is busy. Retry or wait for the send to finish.",
        );
      } else {
        const result = await response.json();
        if (result.state === "sent") {
          finishSent();
          reopenCamera = false;
        } else if (result.state === "expired") {
          sessionId.value = "";
          phoneToken = "";
          uploadComplete.value = false;
        }
        uploadComplete.value = false;
      }
    }
  } catch (cause: any) {
    error.value = cause?.message || "Could not reset this video. Please retry.";
    reopenCamera = false;
  } finally {
    busy.value = false;
  }
  if (reopenCamera) {
    resetRecording();
    step.value = "choice";
    await startCamera();
  }
}
async function cancelPhoneSession() {
  clearTimers();
  if (sessionId.value)
    await fetch(`${api}/sessions/${sessionId.value}/cancel`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  resetRecording();
  sessionId.value = "";
  phoneToken = "";
  uploadComplete.value = false;
  qrDataUrl.value = "";
  error.value = "";
  step.value = "choice";
}
async function close() {
  clearTimers();
  stopCamera();
  if (sessionId.value) {
    await fetch(`${api}/sessions/${sessionId.value}/cancel`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
  }
  sessionId.value = "";
  phoneToken = "";
  uploadComplete.value = false;
  open.value = false;
  step.value = "choice";
  error.value = "";
}
onBeforeUnmount(() => {
  clearTimers();
  stopCamera();
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
});
</script>

<template>
  <button
    type="button"
    class="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
    :disabled="busy"
    title="Record a sign-language video message"
    @click="open = true"
  >
    <Video class="size-4" />
  </button>
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
      <div v-if="step === 'choice'" class="grid gap-3 sm:grid-cols-2">
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
          v-if="!isMobileOS"
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
            v-if="recording"
            class="rounded bg-destructive px-4 py-1.5 text-sm text-destructive-foreground"
            type="button"
            :disabled="busy"
            @click="stopRecording"
          >
            Stop recording · {{ secondsLeft }}s
          </button>
          <button
            v-else
            class="rounded bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            type="button"
            :disabled="busy || countdown > 0"
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
            @click="retake"
          >
            <RefreshCw class="mr-1 inline size-3.5" />Retake</button
          ><button
            class="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            type="button"
            :disabled="busy"
            @click="sendVideo"
          >
            {{ busy ? "Sending…" : error ? "Retry Send Video" : "Send Video" }}
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
        <p class="text-xs text-muted-foreground">
          Waiting for your phone to send the video…
        </p>
        <button
          class="rounded border px-3 py-1.5 text-sm"
          type="button"
          @click="cancelPhoneSession"
        >
          Cancel
        </button>
      </div>
      <p v-if="recording" class="mt-3 text-center text-sm text-red-500">
        Recording… {{ secondsLeft }} seconds left
      </p>
    </div>
  </div>
</template>
