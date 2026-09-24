<script setup lang="ts">
import { Camera, RefreshCw, Smartphone, X } from "lucide-vue-next";
definePageMeta({ layout: false });

const config = useRuntimeConfig();
const api = `https://${config.public.apiDomain}/matches/chat-video`;
const token = ref("");
const state = ref<
  | "loading"
  | "ready"
  | "camera"
  | "countdown"
  | "recording"
  | "preview"
  | "uploading"
  | "complete"
  | "expired"
  | "error"
>("loading");
const error = ref("");
const stream = shallowRef<MediaStream | null>(null);
const preview = ref<HTMLVideoElement>();
const blob = shallowRef<Blob | null>(null);
const blobUrl = ref("");
const countdown = ref(0);
const secondsLeft = ref(60);
const uploadProgress = ref(0);
const facingMode = ref<"user" | "environment">("user");
let recorder: MediaRecorder | undefined;
let chunks: BlobPart[] = [];
let startedAt = 0;
let durationMs = 0;
let countdownTimer: ReturnType<typeof setInterval> | undefined;
let durationTimer: ReturnType<typeof setInterval> | undefined;

function stopTracks() {
  stream.value?.getTracks().forEach((track) => track.stop());
  stream.value = null;
}
function stopTimers() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (durationTimer) clearInterval(durationTimer);
  countdownTimer = undefined;
  durationTimer = undefined;
}
function chooseMime() {
  return (
    [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || ""
  );
}
async function validate() {
  try {
    const response = await fetch(`${api}/phone`, {
      headers: { Authorization: `Bearer ${token.value}` },
    });
    if (!response.ok) {
      state.value = "expired";
      return;
    }
    state.value = "ready";
  } catch {
    error.value = "Could not reach DEAFCS. Check your connection and reload.";
    state.value = "error";
  }
}
async function openCamera() {
  error.value = "";
  try {
    stopTracks();
    stream.value = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode.value },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 25 },
      },
    });
    state.value = "camera";
    await nextTick();
    if (preview.value) {
      preview.value.srcObject = stream.value;
      await preview.value.play().catch(() => {});
    }
  } catch (cause: any) {
    error.value =
      cause?.name === "NotAllowedError"
        ? "Camera permission was denied. Allow camera access in your browser settings and try again."
        : "No camera is available on this phone.";
    state.value = "error";
  }
}
async function flipCamera() {
  facingMode.value = facingMode.value === "user" ? "environment" : "user";
  await openCamera();
}
function startCountdown() {
  const mime = chooseMime();
  if (!mime || !stream.value) {
    error.value = "This browser cannot record a supported video format.";
    return;
  }
  state.value = "countdown";
  countdown.value = 3;
  countdownTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = undefined;
      try {
        chunks = [];
        recorder = new MediaRecorder(stream.value!, {
          mimeType: mime,
          videoBitsPerSecond: 1_200_000,
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recorder.onstop = () => {
          durationMs = Math.min(60_000, Date.now() - startedAt);
          blob.value = new Blob(chunks, { type: recorder?.mimeType || mime });
          blobUrl.value = URL.createObjectURL(blob.value);
          stopTracks();
          state.value = "preview";
        };
        recorder.start(1000);
        startedAt = Date.now();
        secondsLeft.value = 60;
        state.value = "recording";
        durationTimer = setInterval(() => {
          secondsLeft.value = Math.max(
            0,
            60 - Math.floor((Date.now() - startedAt) / 1000),
          );
          if (!secondsLeft.value) stopRecording();
        }, 250);
      } catch {
        error.value = "Could not start the camera recording.";
        state.value = "error";
        stopTracks();
      }
    }
  }, 1000);
}
function stopRecording() {
  if (durationTimer) clearInterval(durationTimer);
  durationTimer = undefined;
  if (recorder?.state === "recording") recorder.stop();
}
async function retake() {
  stopTimers();
  stopTracks();
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
  blobUrl.value = "";
  blob.value = null;
  chunks = [];
  durationMs = 0;
  await openCamera();
}
function upload() {
  if (!blob.value) return;
  state.value = "uploading";
  uploadProgress.value = 0;
  const body = new FormData();
  body.append(
    "file",
    blob.value,
    blob.value.type.includes("mp4") ? "message.mp4" : "message.webm",
  );
  body.append("durationMs", String(durationMs));
  const request = new XMLHttpRequest();
  request.open("POST", `${api}/phone/upload`);
  request.setRequestHeader("Authorization", `Bearer ${token.value}`);
  request.upload.onprogress = (event) => {
    if (event.lengthComputable)
      uploadProgress.value = Math.round((event.loaded / event.total) * 100);
  };
  request.onload = () => {
    if (request.status >= 200 && request.status < 300) state.value = "complete";
    else {
      error.value =
        request.status === 404
          ? "This video session has expired or was already used."
          : "The video could not be uploaded. Please retry or record it again.";
      state.value = request.status === 404 ? "expired" : "preview";
    }
  };
  request.onerror = () => {
    error.value = "Upload failed. Check your connection and try again.";
    state.value = "preview";
  };
  request.send(body);
}
async function cancel() {
  stopTimers();
  stopTracks();
  await fetch(`${api}/phone/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.value}` },
  }).catch(() => {});
  state.value = "expired";
}
onMounted(() => {
  token.value = window.location.hash.slice(1);
  if (!token.value) {
    state.value = "expired";
    return;
  }
  void validate();
});
onBeforeUnmount(() => {
  stopTimers();
  stopTracks();
  if (blobUrl.value) URL.revokeObjectURL(blobUrl.value);
});
</script>

<template>
  <main class="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
    <div class="mx-auto w-full max-w-xl space-y-4">
      <header class="text-center">
        <h1 class="text-xl font-semibold">DEAFCS video message</h1>
        <p class="mt-1 text-sm text-zinc-400">
          Record a short sign-language video for your chat.
        </p>
      </header>
      <p
        v-if="error"
        class="rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-200"
      >
        {{ error }}
      </p>
      <section
        v-if="state === 'loading'"
        class="rounded-lg border border-zinc-800 p-6 text-center"
      >
        Checking temporary video session…
      </section>
      <section
        v-else-if="state === 'expired'"
        class="rounded-lg border border-zinc-800 p-6 text-center"
      >
        <X class="mx-auto mb-2 size-8 text-zinc-400" />
        <h2 class="font-semibold">This link has expired or was already used</h2>
        <p class="mt-2 text-sm text-zinc-400">
          Return to your PC and create a new video session.
        </p>
      </section>
      <section
        v-else-if="state === 'ready' || state === 'error'"
        class="space-y-3 rounded-lg border border-zinc-800 p-5 text-center"
      >
        <p class="text-sm text-zinc-300">
          This temporary link only transfers one video draft. It does not sign
          you in to DEAFCS.
        </p>
        <button
          class="inline-flex min-h-12 items-center gap-2 rounded bg-indigo-600 px-5 font-medium hover:bg-indigo-500"
          type="button"
          @click="openCamera"
        >
          <Camera class="size-5" />Open camera</button
        ><button
          class="block w-full text-sm text-zinc-400 underline"
          type="button"
          @click="cancel"
        >
          Cancel session
        </button>
      </section>
      <section
        v-else-if="
          state === 'camera' || state === 'countdown' || state === 'recording'
        "
        class="space-y-3"
      >
        <div class="relative overflow-hidden rounded-lg bg-black">
          <video
            ref="preview"
            autoplay
            muted
            playsinline
            class="max-h-[65vh] min-h-64 w-full object-contain"
          />
          <div
            v-if="countdown"
            class="absolute inset-0 grid place-items-center bg-black/30 text-8xl font-bold"
          >
            {{ countdown }}
          </div>
        </div>
        <div class="flex justify-between">
          <button
            v-if="state === 'camera'"
            class="min-h-11 rounded border border-zinc-700 px-4"
            type="button"
            @click="flipCamera"
          >
            <RefreshCw class="mr-1 inline size-4" />Flip camera</button
          ><button
            v-if="state === 'camera'"
            class="min-h-11 rounded bg-indigo-600 px-4"
            type="button"
            @click="startCountdown"
          >
            Start recording</button
          ><button
            v-if="state === 'recording'"
            class="min-h-11 rounded bg-red-600 px-4"
            type="button"
            @click="stopRecording"
          >
            Stop · {{ secondsLeft }}s
          </button>
        </div>
      </section>
      <section v-else-if="state === 'preview'" class="space-y-3">
        <video
          :src="blobUrl"
          controls
          playsinline
          preload="metadata"
          class="max-h-[65vh] w-full rounded-lg bg-black object-contain"
        />
        <p class="text-sm text-zinc-400">
          Preview your video. You can retake it before uploading.
        </p>
        <div class="grid grid-cols-2 gap-3">
          <button
            class="min-h-12 rounded border border-zinc-700"
            type="button"
            @click="retake"
          >
            <RefreshCw class="mr-1 inline size-4" />Retake</button
          ><button
            class="min-h-12 rounded bg-indigo-600 font-medium"
            type="button"
            @click="upload"
          >
            Use Video
          </button>
        </div>
      </section>
      <section
        v-else-if="state === 'uploading'"
        class="rounded-lg border border-zinc-800 p-6 text-center"
      >
        <p>Uploading video… {{ uploadProgress }}%</p>
        <progress class="mt-3 w-full" :value="uploadProgress" max="100" />
      </section>
      <section
        v-else-if="state === 'complete'"
        class="rounded-lg border border-emerald-900 bg-emerald-950/40 p-6 text-center"
      >
        <Smartphone class="mx-auto mb-2 size-8 text-emerald-400" />
        <h2 class="font-semibold text-emerald-300">
          Video sent to your DEAFCS chat
        </h2>
        <p class="mt-2 text-sm text-zinc-300">
          You can return to your PC. The message will not be published until you
          click Send there.
        </p>
      </section>
      <p class="text-center text-xs text-zinc-500">
        Camera only. No microphone permission is requested. Maximum recording
        time: 60 seconds.
      </p>
    </div>
  </main>
</template>
