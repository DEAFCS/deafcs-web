import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from "vue";

// Active-call video tiles sized from each stream's REAL shape, for the
// fixed two-party calls (components/calls/FixedPartyCall.vue).
//
// Why: forcing every feed into equal tall grid cells with object-cover
// cropped a landscape desktop webcam into a giant zoomed face next to a
// portrait phone. Here each tile gets the aspect ratio of the video it
// actually shows, so nothing needs cropping (object-fit: contain).
//
// Android has reported camera shapes late or changed them after joining
// (front camera first frame, rotation, track renegotiation), so the shape
// is never decided once: it is re-read on every media event that can
// change it, on window resize/rotation, and on a light interval as a
// safety net for browsers that skip the video "resize" event.

export type VideoDimensions = { width: number; height: number };
export type VideoShape = "portrait" | "landscape" | "square" | "unknown";

// Used until a feed reports its size; the common webcam shape, so the
// most frequent case does not jump once the real size arrives.
export const FALLBACK_ASPECT = 16 / 9;

export function classifyVideoShape(
  dims: VideoDimensions | null | undefined,
): VideoShape {
  if (!dims || !(dims.width > 0) || !(dims.height > 0)) return "unknown";
  const ratio = dims.width / dims.height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

export function aspectOf(dims: VideoDimensions | null | undefined): number {
  if (!dims || !(dims.width > 0) || !(dims.height > 0)) return FALLBACK_ASPECT;
  return dims.width / dims.height;
}

// The decoded frame size is authoritative (it already includes any
// rotation the browser applied). Track settings are only a fallback for
// the moment before the first frame is decoded.
export function readVideoDimensions(
  video: HTMLVideoElement | null | undefined,
): VideoDimensions | null {
  if (!video) return null;
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return { width: video.videoWidth, height: video.videoHeight };
  }
  const stream = video.srcObject as MediaStream | null;
  const track =
    stream && typeof stream.getVideoTracks === "function"
      ? stream.getVideoTracks()[0]
      : undefined;
  const settings =
    track && typeof track.getSettings === "function" ? track.getSettings() : null;
  if (settings?.width && settings?.height) {
    return { width: settings.width, height: settings.height };
  }
  return null;
}

const MEDIA_EVENTS = ["loadedmetadata", "loadeddata", "resize", "playing"] as const;
const WINDOW_EVENTS = ["resize", "orientationchange"] as const;
export const DIMENSION_RECHECK_MS = 1000;

// Calls onChange whenever the video's shape changes (including the first
// time it becomes known). Returns a cleanup function.
export function watchVideoDimensions(
  video: HTMLVideoElement,
  onChange: (dims: VideoDimensions | null) => void,
): () => void {
  let last: VideoDimensions | null = null;
  const check = () => {
    const next = readVideoDimensions(video);
    if (next?.width === last?.width && next?.height === last?.height) return;
    last = next;
    onChange(next);
  };
  MEDIA_EVENTS.forEach((e) => video.addEventListener(e, check));
  if (typeof window !== "undefined") {
    WINDOW_EVENTS.forEach((e) => window.addEventListener(e, check));
  }
  const timer = setInterval(check, DIMENSION_RECHECK_MS);
  check();
  return () => {
    MEDIA_EVENTS.forEach((e) => video.removeEventListener(e, check));
    if (typeof window !== "undefined") {
      WINDOW_EVENTS.forEach((e) => window.removeEventListener(e, check));
    }
    clearInterval(timer);
  };
}

export type TileBox = { width: number; height: number };
export type TileLayout = { direction: "row" | "column"; tiles: TileBox[] };

// Largest tiles that keep every feed's own aspect ratio and fit the stage:
//  - row: all tiles share one height, so a landscape feed gets more width
//    than a portrait one;
//  - column: all tiles share one width, stacked.
// Whichever shows more video wins. Two landscape feeds on a wide screen
// end up side by side, two portrait phones on a desktop side by side as
// narrow tiles, a landscape pair on a phone in portrait stacked.
export function layoutTiles(
  aspects: number[],
  stageWidth: number,
  stageHeight: number,
  gap = 12,
): TileLayout {
  const n = aspects.length;
  if (!n || !(stageWidth > 0) || !(stageHeight > 0)) {
    return { direction: "row", tiles: [] };
  }
  const gaps = gap * (n - 1);

  const rowHeight = Math.max(
    0,
    Math.min(stageHeight, (stageWidth - gaps) / aspects.reduce((s, a) => s + a, 0)),
  );
  const row = aspects.map((a) => ({ width: a * rowHeight, height: rowHeight }));

  const columnWidth = Math.max(
    0,
    Math.min(stageWidth, (stageHeight - gaps) / aspects.reduce((s, a) => s + 1 / a, 0)),
  );
  const column = aspects.map((a) => ({ width: columnWidth, height: columnWidth / a }));

  const area = (tiles: TileBox[]) =>
    tiles.reduce((s, t) => s + t.width * t.height, 0);
  // Ties (e.g. a single feed) keep the row.
  return area(column) > area(row) + 1
    ? { direction: "column", tiles: column }
    : { direction: "row", tiles: row };
}

// --- Group / lobby webcam grid --------------------------------------------
// Unlike the 1-to-1 call above, a group call keeps a STABLE grid of equal
// outer cells (Discord-style): nobody's tile grows because their camera is
// landscape. Each feed is shown whole inside its cell (object-contain), so
// a portrait phone gets dark bars left/right and a landscape webcam dark
// bars top/bottom. Rooms hold at most 5 people (API MAX_PARTICIPANTS).
export type GroupGrid = { columns: number; rows: number; cell: TileBox | null };

// Cells are kept between 9:16 and 16:9 so a single row on an ultra-wide
// screen, or a single column on a tall phone, never turns into a sliver.
const GROUP_CELL_MAX_ASPECT = 16 / 9;
const GROUP_CELL_MIN_ASPECT = 9 / 16;

export function groupGridColumns(
  count: number,
  stageWidth: number,
  stageHeight: number,
): number {
  if (count <= 1) return 1;
  const portraitStage =
    stageWidth > 0 && stageHeight > 0 && stageWidth < stageHeight;
  if (count === 2) return portraitStage ? 1 : 2; // stack on a phone held upright
  if (count <= 4) return 2; // 2x2 (3: last tile centred under the first row)
  return portraitStage ? 2 : 3; // 5: 3+2 on wide screens, 2+2+1 on phones
}

export function groupGridLayout(
  count: number,
  stageWidth: number,
  stageHeight: number,
  gap = 12,
): GroupGrid {
  const columns = groupGridColumns(count, stageWidth, stageHeight);
  const rows = Math.max(1, Math.ceil(count / columns));
  if (!count || !(stageWidth > 0) || !(stageHeight > 0)) {
    return { columns, rows, cell: null };
  }
  let width = Math.max(0, (stageWidth - gap * (columns - 1)) / columns);
  let height = Math.max(0, (stageHeight - gap * (rows - 1)) / rows);
  if (height > 0 && width / height > GROUP_CELL_MAX_ASPECT) {
    width = height * GROUP_CELL_MAX_ASPECT;
  } else if (height > 0 && width / height < GROUP_CELL_MIN_ASPECT) {
    height = width / GROUP_CELL_MIN_ASPECT;
  }
  return { columns, rows, cell: { width, height } };
}

// Fallback cell size (CSS) before the stage has been measured.
export function groupGridFallbackStyle(grid: GroupGrid, gap = 12) {
  return {
    width: `calc((100% - ${(grid.columns - 1) * gap}px) / ${grid.columns})`,
    height: `calc((100% - ${(grid.rows - 1) * gap}px) / ${grid.rows})`,
  };
}

// --- Vue helpers shared by the call views ----------------------------------

// Tracks the real dimensions of the <video> inside each tile, keyed by tile.
// Bind with :ref="tileRef(key)" on the tile wrapper; the video is found
// inside it (WhepPlayer's own element, or a plain local/remote <video>), so
// no shared player component needs to change.
export function useVideoTileDimensions() {
  const dims = ref<Record<string, VideoDimensions | null>>({});
  const watchers: Record<string, () => void> = {};
  const elements: Record<string, HTMLElement> = {};
  const refFns: Record<string, (el: unknown) => void> = {};

  function bind(key: string, el: unknown) {
    const element = el instanceof HTMLElement ? el : null;
    if (elements[key] === element) return;
    watchers[key]?.();
    delete watchers[key];
    delete elements[key];
    if (!element) {
      const { [key]: _removed, ...rest } = dims.value;
      dims.value = rest;
      return;
    }
    elements[key] = element;
    const video =
      element instanceof HTMLVideoElement ? element : element.querySelector("video");
    if (!video) return;
    watchers[key] = watchVideoDimensions(video, (next) => {
      dims.value = { ...dims.value, [key]: next };
    });
  }

  // One stable callback per tile: an inline arrow would be a new function
  // on every render, making Vue unbind and rebind the watcher each time.
  function tileRef(key: string) {
    return (refFns[key] ??= (el: unknown) => bind(key, el));
  }

  const shape = (key: string) => classifyVideoShape(dims.value[key]);
  const aspect = (key: string) => aspectOf(dims.value[key]);

  function stop() {
    Object.values(watchers).forEach((fn) => fn());
  }
  if (getCurrentInstance()) onBeforeUnmount(stop);

  return { dims, tileRef, shape, aspect, stop };
}

// Live content size of an element (ResizeObserver, window resize fallback).
export function useElementSize(target: Ref<HTMLElement | null>) {
  const size = ref({ width: 0, height: 0 });
  let stopObserving: () => void = () => {};
  const measure = () => {
    const el = target.value;
    size.value = el
      ? { width: el.clientWidth, height: el.clientHeight }
      : { width: 0, height: 0 };
  };
  watch(target, (el) => {
    stopObserving();
    stopObserving = () => {};
    measure();
    if (!el) return;
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(measure);
      observer.observe(el);
      stopObserving = () => observer.disconnect();
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", measure);
      stopObserving = () => window.removeEventListener("resize", measure);
    }
  });
  if (getCurrentInstance()) onBeforeUnmount(() => stopObserving());
  return size;
}
