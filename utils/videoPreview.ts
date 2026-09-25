type VideoFrameState = {
  source: string;
  primed: boolean;
  seeking: boolean;
};

const frameStates = new WeakMap<HTMLVideoElement, VideoFrameState>();

/**
 * Keep the media request URL unchanged while asking WebKit to display a frame
 * from the actual video before playback. URL fragments are client-side only,
 * so they do not change authenticated or Range requests.
 */
export function videoPreviewSource(source: string): string {
  if (!source || source.includes("#")) return source;
  return `${source}#t=0.001`;
}

/** Decode and hold a real frame once enough media data is available. */
export function primeVideoFrame(video: HTMLVideoElement, source: string): void {
  if (!source || !video.paused || video.error || video.readyState < 2) return;

  let state = frameStates.get(video);
  if (!state || state.source !== source) {
    state = { source, primed: false, seeking: false };
    frameStates.set(video, state);
  }
  if (state.primed || state.seeking) return;

  const duration = video.duration;
  const targetTime =
    Number.isFinite(duration) && duration > 0
      ? Math.min(0.1, duration / 2)
      : 0.05;

  video.pause();
  if (Math.abs(video.currentTime - targetTime) < 0.001) {
    state.primed = true;
    return;
  }

  state.seeking = true;
  const finishSeek = () => {
    if (frameStates.get(video) !== state) return;
    video.pause();
    state!.seeking = false;
    state!.primed = true;
  };

  video.addEventListener("seeked", finishSeek, { once: true });
  try {
    video.currentTime = targetTime;
  } catch {
    video.removeEventListener("seeked", finishSeek);
    state.seeking = false;
    state.primed = true;
  }
}
