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
// Whichever shows more video wins. Only used for a LONE tile now (a feed
// at its own ratio): sizing two people from their cameras made a portrait
// phone huge next to a small landscape webcam, so 1-to-1 calls use
// oneToOneLayout and group rooms groupGridLayout below.
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
// A group call keeps a STABLE grid of equal
// outer cells (Discord-style): nobody's tile grows because their camera is
// landscape. Each feed is shown whole inside its cell (object-contain), so
// a portrait phone gets dark bars left/right and a landscape webcam dark
// bars top/bottom. Lobby rooms hold at most 5 people (API MAX_PARTICIPANTS), the tournament webcam 4.
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

// --- 1-to-1 calls ----------------------------------------------------------
// Both people matter equally, whatever their camera's shape:
//  - desktop/tablet ("split"): two EQUAL cells side by side, each feed shown
//    whole inside its cell (object-contain, dark bars);
//  - phone ("pip"), Facebook/WhatsApp style: the OTHER person fills the call
//    area, my own camera is a small picture-in-picture in the bottom-right
//    corner, also while the phone is turned sideways.
// Sizing the cells from the feeds' shapes (layoutTiles) gave a portrait
// phone a huge tile and a landscape webcam a small one; layoutTiles is now
// only used for a lone tile, at its feed's own ratio.

// Same phone breakpoint as the Chat Hub (MOBILE_CHAT_HUB_QUERY, 768px wide),
// plus a phone turned sideways (short, touch screen), which is wider than
// 768px but must stay in the phone layout.
export const PHONE_CALL_QUERY =
  "(max-width: 768px), (orientation: landscape) and (max-height: 500px) and (pointer: coarse)";

export function isPhoneCallLayout(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_CALL_QUERY).matches
  );
}

// Reactive version, re-evaluated on resize, rotation and media query change.
export function usePhoneCallLayout() {
  const phone = ref(isPhoneCallLayout());
  if (typeof window === "undefined") return phone;
  const update = () => {
    phone.value = isPhoneCallLayout();
  };
  const mql =
    typeof window.matchMedia === "function" ? window.matchMedia(PHONE_CALL_QUERY) : null;
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  mql?.addEventListener?.("change", update);
  if (getCurrentInstance()) {
    onBeforeUnmount(() => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mql?.removeEventListener?.("change", update);
    });
  }
  return phone;
}

export type OneToOneMode = "single" | "split" | "pip" | "grid";
export type TileCss = Record<string, string>;
export type OneToOneLayout = {
  mode: OneToOneMode;
  styles: Record<string, TileCss>;
  roles: Record<string, "main" | "pip" | "cell">;
};

export const PIP_MARGIN = 12;
const px = (n: number) => `${Math.floor(n)}px`;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// Two equal cells side by side (never stacked on desktop/tablet), kept
// between 9:16 and 16:9 so a very wide or very tall window does not turn
// them into slivers.
export function splitCell(stageWidth: number, stageHeight: number, gap = 12): TileBox | null {
  if (!(stageWidth > 0) || !(stageHeight > 0)) return null;
  let width = Math.max(0, (stageWidth - gap) / 2);
  let height = stageHeight;
  if (width / height > GROUP_CELL_MAX_ASPECT) width = height * GROUP_CELL_MAX_ASPECT;
  if (width / height < GROUP_CELL_MIN_ASPECT) height = width / GROUP_CELL_MIN_ASPECT;
  return { width, height };
}

// The picture-in-picture box for my own camera: about 28% of the width on
// a phone held upright, 22% sideways, between 88px and 200px wide, in my
// camera's own shape (contained), never taller than 40% of the call area.
export function pipBox(
  stageWidth: number,
  stageHeight: number,
  localAspect: number,
  maxWidth = 200,
): TileBox | null {
  if (!(stageWidth > 0) || !(stageHeight > 0)) return null;
  const aspect = clamp(localAspect, GROUP_CELL_MIN_ASPECT, GROUP_CELL_MAX_ASPECT);
  const share = stageWidth > stageHeight ? 0.22 : 0.28;
  let width = clamp(stageWidth * share, 88, maxWidth);
  let height = width / aspect;
  const maxHeight = stageHeight * 0.4;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return { width, height };
}

// --- Picture-in-picture corner ---------------------------------------------
// The PiP snaps to one of four corners (bottom-right by default). Its place
// is a logical corner, not pixels, so a rotation or resize keeps it in the
// same corner and the browser recomputes the exact position. Each view
// passes how far its own controls reach into the call area (e.g. the video
// player's buttons along the bottom), so the PiP never sits on top of them;
// phone notches/home bars are respected through the safe-area insets.
export type PipCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export const PIP_CORNERS: PipCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
export const DEFAULT_PIP_CORNER: PipCorner = "bottom-right";
export type PipInsets = { top: number; right: number; bottom: number; left: number };
export const NO_PIP_INSETS: PipInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function pipCornerPosition(corner: PipCorner, insets: PipInsets = NO_PIP_INSETS): TileCss {
  const vertical = corner.startsWith("top") ? "top" : "bottom";
  const horizontal = corner.endsWith("left") ? "left" : "right";
  return {
    [vertical]: `calc(env(safe-area-inset-${vertical}, 0px) + ${PIP_MARGIN + insets[vertical]}px)`,
    [horizontal]: `calc(env(safe-area-inset-${horizontal}, 0px) + ${PIP_MARGIN + insets[horizontal]}px)`,
  };
}

// Corner whose quadrant contains the point (x, y) inside a stage of w x h.
export function nearestPipCorner(x: number, y: number, width: number, height: number): PipCorner {
  return `${y < height / 2 ? "top" : "bottom"}-${x < width / 2 ? "left" : "right"}` as PipCorner;
}

// Layout for the fixed two-party calls. `localKey` is MY tile (never
// inferred from order); every other key is the other side.
export function oneToOneLayout(input: {
  keys: string[];
  localKey: string | null;
  aspects: Record<string, number>;
  phone: boolean;
  // The call area is fullscreen: the other person is the main video and
  // my camera stays visible as a picture-in-picture, also on desktop.
  fullscreen?: boolean;
  pipCorner?: PipCorner;
  pipInsets?: PipInsets;
  stageWidth: number;
  stageHeight: number;
  gap?: number;
}): OneToOneLayout {
  const { keys, localKey, aspects, phone, stageWidth, stageHeight } = input;
  const fullscreen = !!input.fullscreen;
  const gap = input.gap ?? 12;
  const aspect = (k: string) => aspects[k] ?? FALLBACK_ASPECT;
  const styles: Record<string, TileCss> = {};
  const roles: Record<string, "main" | "pip" | "cell"> = {};

  if (keys.length === 1) {
    const key = keys[0];
    const box = layoutTiles([aspect(key)], stageWidth, stageHeight, gap).tiles[0];
    styles[key] = box
      ? { width: px(box.width), height: px(box.height) }
      : { width: "100%", aspectRatio: String(aspect(key)), maxHeight: "100%" };
    roles[key] = "main";
    return { mode: "single", styles, roles };
  }

  const hasLocal = !!localKey && keys.includes(localKey);
  if (keys.length === 2 && (phone || fullscreen) && hasLocal) {
    const remote = keys.find((k) => k !== localKey)!;
    styles[remote] = { width: "100%", height: "100%" };
    roles[remote] = "main";
    // A larger PiP in desktop fullscreen, the usual small one on a phone.
    const box = pipBox(stageWidth, stageHeight, aspect(localKey!), phone ? 200 : 320);
    styles[localKey!] = {
      position: "absolute",
      ...pipCornerPosition(input.pipCorner ?? DEFAULT_PIP_CORNER, input.pipInsets),
      zIndex: "10",
      ...(box
        ? { width: px(box.width), height: px(box.height) }
        : { width: "28%", aspectRatio: String(clamp(aspect(localKey!), 9 / 16, 16 / 9)) }),
    };
    roles[localKey!] = "pip";
    return { mode: "pip", styles, roles };
  }

  if (keys.length === 2) {
    const cell = splitCell(stageWidth, stageHeight, gap);
    for (const key of keys) {
      styles[key] = cell
        ? { width: px(cell.width), height: px(cell.height) }
        : { width: `calc((100% - ${gap}px) / 2)`, height: "100%" };
      roles[key] = "cell";
    }
    return { mode: "split", styles, roles };
  }

  // More than two tiles (only ever transient in a two-party call): the
  // same equal grid as the group rooms.
  const grid = groupGridLayout(keys.length, stageWidth, stageHeight, gap);
  for (const key of keys) {
    styles[key] = grid.cell
      ? { width: px(grid.cell.width), height: px(grid.cell.height) }
      : (groupGridFallbackStyle(grid, gap) as TileCss);
    roles[key] = "cell";
  }
  return { mode: "grid", styles, roles };
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

// Drag the picture-in-picture with a finger, mouse or pen, then snap it to
// the nearest corner on release. Dragging only starts after a few pixels of
// movement, so a plain tap (e.g. a button inside the PiP) still works, and
// the click that ends a drag is swallowed. Pointer capture keeps the drag
// going outside the PiP; touch-action: none on the PiP (set by the view)
// stops the page from scrolling meanwhile. The corner lives in memory only,
// for this call.
export const PIP_DRAG_THRESHOLD = 4;

export function usePipDrag(stage: Ref<HTMLElement | null>) {
  const corner = ref<PipCorner>(DEFAULT_PIP_CORNER);
  const dragging = ref(false);
  const offset = ref({ x: 0, y: 0 });
  let pointerId: number | null = null;
  let start = { x: 0, y: 0 };
  let startRect: DOMRect | null = null;
  let stageRect: DOMRect | null = null;
  let pip: HTMLElement | null = null;

  function clampDelta(dx: number, dy: number) {
    if (!startRect || !stageRect) return { x: dx, y: dy };
    return {
      x: clamp(dx, stageRect.left - startRect.left, stageRect.right - startRect.right),
      y: clamp(dy, stageRect.top - startRect.top, stageRect.bottom - startRect.bottom),
    };
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button > 0 || pointerId !== null) return;
    pip = e.currentTarget as HTMLElement;
    pointerId = e.pointerId;
    start = { x: e.clientX, y: e.clientY };
    startRect = pip.getBoundingClientRect();
    stageRect = stage.value?.getBoundingClientRect() ?? null;
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging.value) {
      if (Math.abs(dx) + Math.abs(dy) < PIP_DRAG_THRESHOLD) return;
      dragging.value = true;
      try {
        pip?.setPointerCapture?.(e.pointerId);
      } catch {
        // capture is a nicety; the drag still works without it
      }
    }
    e.preventDefault();
    offset.value = clampDelta(dx, dy);
  }

  function finish(e: PointerEvent, snap: boolean) {
    if (e.pointerId !== pointerId) return;
    if (dragging.value && snap && startRect && stageRect) {
      const centerX = startRect.left + offset.value.x + startRect.width / 2 - stageRect.left;
      const centerY = startRect.top + offset.value.y + startRect.height / 2 - stageRect.top;
      corner.value = nearestPipCorner(centerX, centerY, stageRect.width, stageRect.height);
      // Swallow the click the browser fires at the end of the drag.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      pip?.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => pip?.removeEventListener("click", swallow, { capture: true }), 0);
    }
    try {
      if (dragging.value) pip?.releasePointerCapture?.(e.pointerId);
    } catch {
      // already released
    }
    dragging.value = false;
    offset.value = { x: 0, y: 0 };
    pointerId = null;
    startRect = null;
    stageRect = null;
  }

  const onPointerUp = (e: PointerEvent) => finish(e, true);
  const onPointerCancel = (e: PointerEvent) => finish(e, false);

  // Extra style while dragging: follow the pointer, no size animation.
  const dragStyle = (): TileCss =>
    dragging.value
      ? {
          transform: `translate(${offset.value.x}px, ${offset.value.y}px)`,
          transition: "none",
        }
      : {};

  return {
    corner,
    dragging,
    dragStyle,
    // Plain event names, for v-on="pipDrag.handlers" in a template.
    handlers: {
      pointerdown: onPointerDown,
      pointermove: onPointerMove,
      pointerup: onPointerUp,
      pointercancel: onPointerCancel,
    },
  };
}
