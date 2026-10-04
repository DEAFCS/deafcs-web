import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import {
  nearestPipCorner,
  oneToOneLayout,
  PHONE_CALL_QUERY,
  pipBox,
  pipCornerPosition,
  PIP_DRAG_THRESHOLD,
} from "../../composables/useCallVideoLayout";

// 1-to-1 webcam call polish:
//  1. desktop: the call area fills the window between header and Leave,
//     two equal cells that grow and shrink with it;
//  2. fullscreen puts the whole call area in fullscreen (not just the other
//     person's video), with my camera kept visible as a picture-in-picture;
//  3. on a phone my PiP can be dragged and snaps to one of four corners.

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("PiP corner helpers", () => {
  it("places each of the four corners inside the safe area, past the view's controls", () => {
    const insets = { top: 32, right: 0, bottom: 40, left: 0 };
    expect(pipCornerPosition("bottom-right", insets)).toEqual({
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 52px)",
      right: "calc(env(safe-area-inset-right, 0px) + 12px)",
    });
    expect(pipCornerPosition("top-left", insets)).toEqual({
      top: "calc(env(safe-area-inset-top, 0px) + 44px)",
      left: "calc(env(safe-area-inset-left, 0px) + 12px)",
    });
    expect(Object.keys(pipCornerPosition("top-right"))).toEqual(["top", "right"]);
    expect(Object.keys(pipCornerPosition("bottom-left"))).toEqual(["bottom", "left"]);
  });

  it("snaps to the corner of the quadrant the PiP was dropped in", () => {
    expect(nearestPipCorner(10, 10, 360, 640)).toBe("top-left");
    expect(nearestPipCorner(350, 10, 360, 640)).toBe("top-right");
    expect(nearestPipCorner(10, 630, 360, 640)).toBe("bottom-left");
    expect(nearestPipCorner(350, 630, 360, 640)).toBe("bottom-right");
  });

  it("keeps the phone PiP small and allows a larger one in desktop fullscreen", () => {
    expect(Math.floor(pipBox(360, 640, 16 / 9)!.width)).toBe(100);
    expect(pipBox(1920, 1000, 16 / 9)!.width).toBe(200);
    expect(pipBox(1920, 1000, 16 / 9, 320)!.width).toBe(320);
  });

  it("desktop fullscreen: other person main, me as PiP; normal desktop stays 50/50", () => {
    const base = { keys: ["them", "me"], localKey: "me", aspects: { them: 16 / 9, me: 16 / 9 }, phone: false, stageWidth: 1900, stageHeight: 1000 };
    expect(oneToOneLayout(base).mode).toBe("split");
    const fs = oneToOneLayout({ ...base, fullscreen: true, pipCorner: "top-left" });
    expect(fs.mode).toBe("pip");
    expect(fs.roles).toEqual({ them: "main", me: "pip" });
    expect(fs.styles.them).toEqual({ width: "100%", height: "100%" });
    expect(fs.styles.me).toMatchObject({ position: "absolute", width: "320px" });
    expect(fs.styles.me.top).toContain("safe-area-inset-top");
  });
});

// --- mounted call ------------------------------------------------------------
const videoSizes = new WeakMap<HTMLVideoElement, { w: number; h: number }>();
Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
  configurable: true,
  get() {
    return videoSizes.get(this)?.w ?? 0;
  },
});
Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
  configurable: true,
  get() {
    return videoSizes.get(this)?.h ?? 0;
  },
});

vi.mock("~/web-sockets/Socket", () => ({
  default: { listen: () => ({ stop: () => {} }) },
}));
const whepProps: Array<Record<string, unknown>> = [];
vi.mock("~/components/match/WhepPlayer.vue", () => ({
  default: defineComponent({
    props: ["whepUrl", "muted", "objectFit", "fullscreenTarget"],
    setup(props) {
      whepProps.push(props as Record<string, unknown>);
      return () => h("div", { class: "whep" }, [h("video", { class: "object-contain" })]);
    },
  }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async (u: string) => `data:qr,${u}` } }));

const OTHER = "76561190000000009";
const api = vi.hoisted(() => ({ join: vi.fn(), hangup: vi.fn() }));
vi.mock("~/composables/useAdminCallApi", () => ({
  joinAdminCall: async () => {
    api.join();
    return { token: "tok-1", participants: [{ steamId: "76561190000000009", name: "Mobile Mo", avatarUrl: null }] };
  },
  fetchAdminCallParticipants: async () => [{ steamId: "76561190000000009", name: "Mobile Mo", avatarUrl: null }],
  fetchAdminCallStatus: async () => ({ ready: true }),
  adminCallJoinUrl: (id: string, t: string) => `https://web.test/admin-call/${id}/${t}`,
  adminCallPeerWhepUrl: (id: string, s: string) => `whep:${s}`,
  adminCallPlayerWhipUrl: (t: string) => `whip:${t}`,
  adminCallPlayerStatusUrl: (t: string) => `status:${t}`,
  adminCallPlayerHangupUrl: (t: string) => `hangup:${t}`,
}));
vi.mock("~/composables/useVerificationCallApi", () => ({
  verificationCallPlayerWhipUrl: (t: string) => `whip/${t}`,
  verificationCallPlayerStatusUrl: (t: string) => `status/${t}`,
  verificationCallPlayerHangupUrl: (t: string) => `hangup/${t}`,
  verificationCallPlayerPeerWhepUrl: (t: string, s: string) => `pwhep/${t}/${s}`,
  fetchVerificationCallStatus: async () => ({ ready: true, steamId: "76561190000000001" }),
  fetchVerificationCallParticipantsForToken: async () => [
    { steamId: "76561190000000001", name: "Me", avatarUrl: null },
    { steamId: "76561190000000002", name: "Admin", avatarUrl: null },
  ],
}));

// Stage size + element rects (happy-dom has no layout).
let stage = { width: 1200, height: 600 };
let pipRect = { left: 248, top: 448, width: 100, height: 180 };
const STAGE_IDS = new Set(["fixed-party-call-stage", "call-stage"]);
const observers: Array<() => void> = [];
const wrappers: VueWrapper[] = [];
let fullscreenElement: Element | null = null;
let getUserMedia: ReturnType<typeof vi.fn>;

function stubPhone(phone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === PHONE_CALL_QUERY ? phone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

beforeEach(() => {
  whepProps.length = 0;
  observers.length = 0;
  fullscreenElement = null;
  stage = { width: 1200, height: 600 };
  pipRect = { left: 248, top: 448, width: 100, height: 180 };
  api.join.mockReset();
  api.hangup.mockReset();
  stubPhone(false);
  vi.stubGlobal("definePageMeta", () => {});
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: "76561190000000001" } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useRoute", () => ({ params: { targetSteamId: OTHER, applicationId: "app-1", token: "tok" }, query: {} }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("hangup")) api.hangup(url);
      return { ok: true, text: async () => "v=0" };
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
        observers.push(cb);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      iceGatheringState = "complete";
      localDescription = { sdp: "v=0" };
      ontrack: unknown = null;
      addTrack() {}
      addTransceiver() {}
      addEventListener() {}
      getSenders() {
        return [];
      }
      async createOffer() {
        return {};
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() {}
    },
  );
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    get: () => fullscreenElement,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as any).__src ?? null;
    },
    set(v) {
      (this as any).__src = v;
    },
  });
  getUserMedia = vi.fn(async () => ({
    getTracks: () => [],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: "cam-1" }) }],
  }));
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "cam-1", label: "Webcam" }],
    },
  });
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0) Chrome/130");
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return STAGE_IDS.has(this.dataset?.testid ?? "") ? stage.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return STAGE_IDS.has(this.dataset?.testid ?? "") ? stage.height : 0;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const r = STAGE_IDS.has(this.dataset?.testid ?? "")
      ? { left: 0, top: 0, width: stage.width, height: stage.height }
      : this.dataset?.key === "local"
        ? pipRect
        : { left: 0, top: 0, width: 0, height: 0 };
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON() {} } as DOMRect;
  });
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (document as any).fullscreenElement;
});

vi.setConfig({ testTimeout: 30_000 });

const mocks = { $t: (_k: string, f?: string) => f ?? _k };

async function joinAdminCallWithWebcam() {
  const mod = await import("../../pages/players/call/[targetSteamId].vue");
  const w = mount(mod.default, { attachTo: document.body, global: { mocks } });
  wrappers.push(w);
  await flushPromises();
  await w.get('[data-testid="fixed-party-call-webcam"]').trigger("click");
  await flushPromises();
  await w.get('[data-testid="fixed-party-call-join"]').trigger("click");
  await flushPromises();
  return w;
}

const tile = (w: VueWrapper, key: string) =>
  w.get(`[data-testid="fixed-party-call-tile"][data-key="${key}"]`);
const px = (v: string) => Number(v.replace("px", ""));
const size = (w: VueWrapper, key: string) => {
  const st = (tile(w, key).element as HTMLElement).style;
  return { width: px(st.width), height: px(st.height) };
};
async function resizeStage(width: number, height: number) {
  stage = { width, height };
  observers.forEach((cb) => cb());
  window.dispatchEvent(new Event("resize"));
  await flushPromises();
}
function pointer(el: Element, type: string, x: number, y: number) {
  el.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }),
  );
}

describe("desktop: the call fills the window", () => {
  it("full-width card, call area and stage take the free height, equal cells grow and shrink", async () => {
    const w = await joinAdminCallWithWebcam();
    const card = w.get('[data-testid="fixed-party-call-area"]').element.parentElement!;
    expect(card.className).toContain("max-w-none");
    expect(card.className).not.toContain("max-w-5xl");
    expect(w.get('[data-testid="fixed-party-call-area"]').classes()).toContain("flex-1");
    expect(w.get('[data-testid="fixed-party-call-stage"]').classes()).toContain("flex-1");

    expect(w.get('[data-testid="fixed-party-call-stage"]').attributes("data-layout")).toBe("split");
    expect(size(w, OTHER)).toEqual(size(w, "local"));
    expect(size(w, OTHER)).toEqual({ width: 594, height: 600 });

    await resizeStage(1800, 900);
    expect(size(w, OTHER)).toEqual(size(w, "local"));
    expect(size(w, OTHER)).toEqual({ width: 894, height: 900 });

    await resizeStage(900, 500);
    expect(size(w, OTHER)).toEqual(size(w, "local"));
    expect(size(w, OTHER).height).toBe(500);
  });
});

describe("fullscreen keeps my own camera", () => {
  it("fullscreen targets the call area, not just the other person's video", async () => {
    const w = await joinAdminCallWithWebcam();
    const area = w.get('[data-testid="fixed-party-call-area"]').element;
    expect(whepProps.at(-1)?.fullscreenTarget).toBe(area);
    // Both tiles and the Leave button live inside that fullscreen element.
    expect(area.contains(tile(w, OTHER).element)).toBe(true);
    expect(area.contains(tile(w, "local").element)).toBe(true);
    expect(area.contains(w.get('[data-testid="fixed-party-call-leave"]').element)).toBe(true);
  });

  it("in fullscreen the other person is main and my camera a PiP; leaving restores 50/50, no reconnect", async () => {
    const w = await joinAdminCallWithWebcam();
    const area = w.get('[data-testid="fixed-party-call-area"]');
    const requestsBefore = (globalThis.fetch as any).mock.calls.length;
    const joinsBefore = api.join.mock.calls.length;

    fullscreenElement = area.element;
    document.dispatchEvent(new Event("fullscreenchange"));
    await resizeStage(1900, 1000);

    expect(area.attributes("data-fullscreen")).toBe("true");
    expect(w.get('[data-testid="fixed-party-call-stage"]').attributes("data-layout")).toBe("pip");
    expect(tile(w, OTHER).attributes("data-role")).toBe("main");
    const pip = tile(w, "local");
    expect(pip.attributes("data-role")).toBe("pip");
    expect(pip.attributes("data-corner")).toBe("bottom-right");
    expect((pip.element as HTMLElement).style.position).toBe("absolute");
    expect(size(w, "local").width).toBe(320);
    expect(pip.text()).toContain("You");
    // The other person's name moves to the top so it is not under the player's buttons.
    expect(tile(w, OTHER).find("span").classes()).toContain("top-2");
    expect(w.find('[data-testid="fixed-party-call-leave"]').exists()).toBe(true);

    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
    await resizeStage(1200, 600);
    expect(area.attributes("data-fullscreen")).toBe("false");
    expect(w.get('[data-testid="fixed-party-call-stage"]').attributes("data-layout")).toBe("split");
    expect(size(w, OTHER)).toEqual(size(w, "local"));
    expect(tile(w, OTHER).find("span").classes()).toContain("bottom-2");

    // Fullscreen is presentation only: no new join, WHIP/WHEP or other request.
    expect(api.join.mock.calls.length).toBe(joinsBefore);
    expect((globalThis.fetch as any).mock.calls.length).toBe(requestsBefore);
    expect(w.get('[data-testid="fixed-party-call"]').attributes("data-step")).toBe("in-call");
  });

  it("another element going fullscreen does not switch the call layout", async () => {
    const w = await joinAdminCallWithWebcam();
    fullscreenElement = document.createElement("div");
    document.dispatchEvent(new Event("fullscreenchange"));
    await flushPromises();
    expect(w.get('[data-testid="fixed-party-call-stage"]').attributes("data-layout")).toBe("split");
  });
});

describe("WhepPlayer fullscreen target is opt-in", () => {
  const src = read("components/match/WhepPlayer.vue");
  it("uses the call area when given, its parent otherwise, and no landscape lock for calls", () => {
    expect(src).toContain("fullscreenTarget?: HTMLElement | null;");
    expect(src).toMatch(/props\.fullscreenTarget \?\?\s+containerRef\.value\?\.parentElement \?\?/);
    expect(src).toContain("if (props.fullscreenTarget) return;");
  });
  it("only the 1-to-1 call passes it; streams, deck, camera admin and group rooms do not", () => {
    const users = [
      "components/match/LiveStreamPlayer.vue",
      "components/match/StreamCanvas.vue",
      "components/StreamEmbed.vue",
      "components/webcam/WebcamCallRoom.vue",
      "pages/matches/[id]/camera-admin.vue",
      "pages/stream-deck/[matchId].vue",
    ];
    for (const f of users) expect(read(f), f).not.toContain("fullscreen-target");
    expect(read("components/calls/FixedPartyCall.vue")).toContain(':fullscreen-target="callAreaEl"');
  });
});

describe("phone: drag my PiP to any corner", () => {
  beforeEach(() => {
    stubPhone(true);
    stage = { width: 360, height: 640 };
  });

  it("defaults bottom-right, follows the finger, snaps to each of the 4 corners", async () => {
    const w = await joinAdminCallWithWebcam();
    const pip = () => tile(w, "local");
    expect(pip().attributes("data-role")).toBe("pip");
    expect(pip().attributes("data-corner")).toBe("bottom-right");
    expect(pip().classes()).toContain("touch-none");

    const center = { x: pipRect.left + pipRect.width / 2, y: pipRect.top + pipRect.height / 2 };
    const drag = async (x: number, y: number) => {
      pointer(pip().element, "pointerdown", center.x, center.y);
      pointer(pip().element, "pointermove", x, y);
      await flushPromises();
      const during = (pip().element as HTMLElement).style.transform;
      pointer(pip().element, "pointerup", x, y);
      await flushPromises();
      return during;
    };

    expect(await drag(40, 40)).toContain("translate(");
    expect(pip().attributes("data-corner")).toBe("top-left");
    expect((pip().element as HTMLElement).style.transform).toBe("");
    await drag(330, 40);
    expect(pip().attributes("data-corner")).toBe("top-right");
    await drag(40, 600);
    expect(pip().attributes("data-corner")).toBe("bottom-left");
    await drag(330, 600);
    expect(pip().attributes("data-corner")).toBe("bottom-right");

    // The other person stays the main video throughout.
    expect(tile(w, OTHER).attributes("data-role")).toBe("main");
  });

  it("cannot be dragged out of the call area", async () => {
    const w = await joinAdminCallWithWebcam();
    const el = tile(w, "local").element as HTMLElement;
    pointer(el, "pointerdown", 298, 538);
    pointer(el, "pointermove", -5000, 9000);
    await flushPromises();
    // Clamped: left edge to the stage's left (dx = -248), bottom edge stays at the bottom (dy = 12).
    expect(el.style.transform).toBe("translate(-248px, 12px)");
    pointer(el, "pointerup", -5000, 9000);
    await flushPromises();
    expect(tile(w, "local").attributes("data-corner")).toBe("bottom-left");
  });

  it("a tap is not a drag and a cancelled drag keeps the corner", async () => {
    const w = await joinAdminCallWithWebcam();
    const el = tile(w, "local").element;
    pointer(el, "pointerdown", 298, 538);
    pointer(el, "pointermove", 298 + PIP_DRAG_THRESHOLD - 2, 538);
    pointer(el, "pointerup", 298 + PIP_DRAG_THRESHOLD - 2, 538);
    await flushPromises();
    expect(tile(w, "local").attributes("data-corner")).toBe("bottom-right");

    pointer(el, "pointerdown", 298, 538);
    pointer(el, "pointermove", 40, 40);
    pointer(el, "pointercancel", 40, 40);
    await flushPromises();
    expect(tile(w, "local").attributes("data-corner")).toBe("bottom-right");
    expect((el as HTMLElement).style.transform).toBe("");
  });

  it("keeps the chosen corner when the phone rotates or the window resizes", async () => {
    const w = await joinAdminCallWithWebcam();
    const el = tile(w, "local").element;
    pointer(el, "pointerdown", 298, 538);
    pointer(el, "pointermove", 40, 40);
    pointer(el, "pointerup", 40, 40);
    await flushPromises();
    expect(tile(w, "local").attributes("data-corner")).toBe("top-left");

    await resizeStage(740, 320);
    window.dispatchEvent(new Event("orientationchange"));
    await flushPromises();
    expect(tile(w, "local").attributes("data-role")).toBe("pip");
    expect(tile(w, "local").attributes("data-corner")).toBe("top-left");
    expect(tile(w, OTHER).attributes("data-role")).toBe("main");
  });

  it("the PiP stays clear of the player's controls and never covers Leave", () => {
    const src = read("components/calls/FixedPartyCall.vue");
    expect(src).toContain("const PIP_INSETS: PipInsets = { top: 32, right: 0, bottom: 40, left: 0 };");
    expect(src).toContain("pipInsets: PIP_INSETS,");
  });
});

describe("phone QR page: drag my PiP too, the Switch camera tap still works", () => {
  it("drags to a corner and a tap on Switch camera is not swallowed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubPhone(true);
    stage = { width: 360, height: 640 };
    const { default: Page } = await import("../../pages/verification-call/[applicationId]/[token].vue");
    const w = mount(Page, { attachTo: document.body, global: { mocks } });
    wrappers.push(w);
    await flushPromises();
    await w.findAll("button").find((b) => b.text().includes("Join call"))!.trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2600);
    await flushPromises();

    const local = w.get('[data-testid="call-tile"][data-key="local"]');
    expect(local.attributes("data-role")).toBe("pip");
    expect(local.attributes("data-corner")).toBe("bottom-right");

    pointer(local.element, "pointerdown", 298, 538);
    pointer(local.element, "pointermove", 330, 40);
    pointer(local.element, "pointerup", 330, 40);
    await flushPromises();
    expect(w.get('[data-testid="call-tile"][data-key="local"]').attributes("data-corner")).toBe("top-right");

    // The click a browser fires at the end of that drag is swallowed...
    const calls = getUserMedia.mock.calls.length;
    const switchCamera = () => w.get('[data-key="local"] button[aria-label="Switch camera"]');
    await switchCamera().trigger("click");
    await flushPromises();
    expect(getUserMedia.mock.calls.length).toBe(calls);

    // ...but a real tap afterwards still switches the camera.
    await vi.advanceTimersByTimeAsync(50);
    await switchCamera().trigger("click");
    await flushPromises();
    expect(getUserMedia.mock.calls.length).toBe(calls + 1);

    // And a plain tap without dragging first is never swallowed.
    pointer(switchCamera().element, "pointerdown", 260, 60);
    pointer(switchCamera().element, "pointerup", 260, 60);
    await switchCamera().trigger("click");
    await flushPromises();
    expect(getUserMedia.mock.calls.length).toBe(calls + 2);
  });
});
