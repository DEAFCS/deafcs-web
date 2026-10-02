<script setup lang="ts">
import { Maximize2, Minimize2, Pause, Play } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { primeVideoFrame, videoPreviewSource } from "~/utils/videoPreview";

const props = withDefaults(
  defineProps<{
    src: string;
    label?: string;
  }>(),
  { label: "Video message" },
);

const previewSrc = computed(() => videoPreviewSource(props.src));
const player = ref<HTMLDivElement>();
const video = ref<HTMLVideoElement>();
const isPlaying = ref(false);
const isFullscreen = ref(false);
const controlsVisible = ref(false);
let hideControlsTimer: ReturnType<typeof setTimeout> | undefined;

function keepVideoMuted() {
  if (!video.value) return;
  video.value.defaultMuted = true;
  video.value.muted = true;
}

function revealControls() {
  controlsVisible.value = true;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  hideControlsTimer = setTimeout(() => {
    controlsVisible.value = false;
    hideControlsTimer = undefined;
  }, 2500);
}

function hideControls() {
  controlsVisible.value = false;
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  hideControlsTimer = undefined;
}

function handlePointerLeave(event: PointerEvent) {
  // Touch browsers can dispatch pointerleave as soon as a tap ends. Keep the
  // controls available briefly so a second tap can reach Play/Pause or Fullscreen.
  if (event.pointerType !== "touch") hideControls();
}

async function togglePlayback() {
  if (!video.value) return;
  revealControls();
  keepVideoMuted();
  if (video.value.paused || video.value.ended) {
    try {
      await video.value.play();
      isPlaying.value = true;
    } catch {
      isPlaying.value = false;
    }
  } else {
    video.value.pause();
    isPlaying.value = false;
  }
}

function syncPlaybackState() {
  if (!video.value) return;
  keepVideoMuted();
  isPlaying.value = !video.value.paused && !video.value.ended;
}

function primePreviewFrame() {
  if (video.value) primeVideoFrame(video.value, previewSrc.value);
}

async function toggleFullscreen() {
  if (!player.value) return;
  revealControls();
  try {
    if (document.fullscreenElement === player.value) {
      await document.exitFullscreen?.();
    } else {
      await player.value.requestFullscreen?.();
    }
  } catch {
    // Fullscreen is optional on browsers that do not support the API.
  }
}

function syncFullscreenState() {
  isFullscreen.value = document.fullscreenElement === player.value;
}

onMounted(() => {
  keepVideoMuted();
  document.addEventListener("fullscreenchange", syncFullscreenState);
});

onBeforeUnmount(() => {
  if (hideControlsTimer) clearTimeout(hideControlsTimer);
  document.removeEventListener("fullscreenchange", syncFullscreenState);
});
</script>

<template>
  <div
    ref="player"
    class="chat-video-player group relative isolate w-full overflow-hidden rounded-md bg-black"
    role="group"
    :aria-label="label"
    @pointerdown="revealControls"
    @pointermove="revealControls"
    @pointerleave="handlePointerLeave"
    @touchstart.passive="revealControls"
    @focusin="revealControls"
  >
    <video
      ref="video"
      :src="previewSrc"
      muted
      playsinline
      preload="auto"
      controlslist="nodownload noplaybackrate noremoteplayback"
      disablepictureinpicture
      disableremoteplayback
      tabindex="0"
      :aria-label="label"
      class="block max-h-[55vh] w-full bg-black object-contain"
      @click="togglePlayback"
      @keydown.space.prevent="togglePlayback"
      @keydown.enter.prevent="togglePlayback"
      @play="syncPlaybackState"
      @pause="syncPlaybackState"
      @ended="syncPlaybackState"
      @volumechange="keepVideoMuted"
      @loadedmetadata="primePreviewFrame"
      @loadeddata="primePreviewFrame"
      @canplay="primePreviewFrame"
    >
      Your browser does not support video playback.
    </video>

    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      :class="{
        'pointer-events-auto opacity-100': controlsVisible,
      }"
      role="group"
      aria-label="Video controls"
    >
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        :aria-label="isPlaying ? 'Pause video' : 'Play video'"
        :title="isPlaying ? 'Pause video' : 'Play video'"
        @click.stop="togglePlayback"
      >
        <Pause v-if="isPlaying" class="size-4" aria-hidden="true" />
        <Play v-else class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
        :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
        @click.stop="toggleFullscreen"
      >
        <Minimize2 v-if="isFullscreen" class="size-4" aria-hidden="true" />
        <Maximize2 v-else class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-video-player:fullscreen {
  display: flex;
  width: 100vw;
  height: 100vh;
  max-height: none;
  align-items: center;
  justify-content: center;
}

.chat-video-player:fullscreen video {
  width: 100%;
  height: 100%;
  max-height: 100vh;
}
</style>
