// Thumbnail/first-frame handoff adapted from current 5Stack ClipDetailModal.
// MIT License, Copyright (c) 2025 5Stack.gg — see LICENSE.
import { onBeforeUnmount, ref, watch } from "vue";

export function useClipFrameReveal(id: () => string | null, src: () => string | null | undefined) {
  const revealed = ref(false);
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let video: HTMLVideoElement | null = null;
  let frameId: number | null = null;
  function cleanup() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (video && frameId != null) video.cancelVideoFrameCallback?.(frameId);
    video = null;
    frameId = null;
  }
  function reveal(expected: number) {
    if (expected !== generation || !id()) return;
    revealed.value = true;
    cleanup();
  }
  watch([id, src], () => {
    generation++;
    cleanup();
    revealed.value = false;
    // A slow network or refused autoplay must not permanently cover controls.
    if (id() && src()) {
      const expected = generation;
      timer = setTimeout(() => reveal(expected), 3000);
    }
  }, { immediate: true });
  function playerVideo(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLVideoElement) || "preload" in target.dataset) return null;
    if (!src() || target.getAttribute("src") !== src()) return null;
    return target;
  }
  function onPlaying(event: Event) {
    const target = playerVideo(event);
    if (!target || revealed.value || frameId != null) return;
    const expected = generation;
    if (typeof target.requestVideoFrameCallback === "function") {
      video = target;
      frameId = target.requestVideoFrameCallback(() => reveal(expected));
    } else reveal(expected);
  }
  function onLoadedData(event: Event) {
    const target = playerVideo(event);
    if (!target || revealed.value) return;
    const expected = generation;
    if (target.paused && target.readyState >= 2) reveal(expected);
  }
  onBeforeUnmount(() => { generation++; cleanup(); });
  return { revealed, onPlaying, onLoadedData };
}
