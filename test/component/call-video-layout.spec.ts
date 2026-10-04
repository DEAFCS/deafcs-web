import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import {
  aspectOf,
  classifyVideoShape,
  DIMENSION_RECHECK_MS,
  FALLBACK_ASPECT,
  layoutTiles,
  readVideoDimensions,
  watchVideoDimensions,
} from "../../composables/useCallVideoLayout";

// Active verification/admin call tiles take each feed's REAL shape (read
// from the decoded video, re-read whenever it can change), so a landscape
// desktop webcam next to a portrait phone is no longer cropped into a
// tall cell. Covers Android-style late/changing dimensions.

// --- fake decoded video sizes for happy-dom <video> elements -------------
const videoSizes = new WeakMap<HTMLVideoElement, { w: number; h: number }>();
function setVideoSize(video: HTMLVideoElement, w: number, h: number) {
  videoSizes.set(video, { w, h });
}
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

describe("shape detection", () => {
  it("classifies from real dimensions", () => {
    expect(classifyVideoShape({ width: 1280, height: 720 })).toBe("landscape");
    expect(classifyVideoShape({ width: 720, height: 1280 })).toBe("portrait");
    expect(classifyVideoShape({ width: 640, height: 640 })).toBe("square");
    expect(classifyVideoShape({ width: 0, height: 0 })).toBe("unknown");
    expect(classifyVideoShape(null)).toBe("unknown");
  });

  it("falls back to a stable 16:9 until a size is known", () => {
    expect(aspectOf(null)).toBe(FALLBACK_ASPECT);
    expect(aspectOf({ width: 0, height: 480 })).toBe(FALLBACK_ASPECT);
    expect(aspectOf({ width: 480, height: 640 })).toBeCloseTo(0.75);
  });

  it("prefers the decoded frame, then track settings, else unknown", () => {
    const video = document.createElement("video");
    expect(readVideoDimensions(video)).toBeNull();

    // Before the first frame: the track's own settings.
    (video as any).srcObject = {
      getVideoTracks: () => [{ getSettings: () => ({ width: 1280, height: 720 }) }],
    };
    expect(readVideoDimensions(video)).toEqual({ width: 1280, height: 720 });

    // Decoded frame wins (already rotated by the browser, e.g. Android).
    setVideoSize(video, 720, 1280);
    expect(readVideoDimensions(video)).toEqual({ width: 720, height: 1280 });
  });
});

describe("watching for late and changing dimensions (Android safety)", () => {
  afterEach(() => vi.useRealTimers());

  it("updates on metadata, on the video resize event, on rotation and on a timer", async () => {
    vi.useFakeTimers();
    const video = document.createElement("video");
    const seen: Array<string> = [];
    const stop = watchVideoDimensions(video, (d) =>
      seen.push(d ? `${d.width}x${d.height}` : "none"),
    );
    expect(seen).toEqual([]); // nothing known yet, nothing reported

    setVideoSize(video, 640, 480);
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(seen).toEqual(["640x480"]);

    // Front camera reports again rotated (late Android metadata).
    setVideoSize(video, 480, 640);
    video.dispatchEvent(new Event("resize"));
    expect(seen).toEqual(["640x480", "480x640"]);

    // Phone rotated after joining.
    setVideoSize(video, 640, 480);
    window.dispatchEvent(new Event("orientationchange"));
    expect(seen.at(-1)).toBe("640x480");

    // A browser that fires no event at all: caught by the recheck timer.
    setVideoSize(video, 360, 640);
    vi.advanceTimersByTime(DIMENSION_RECHECK_MS);
    expect(seen.at(-1)).toBe("360x640");

    // Same size again: no duplicate reports.
    const count = seen.length;
    video.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(DIMENSION_RECHECK_MS * 3);
    expect(seen.length).toBe(count);

    // Cleanup stops everything.
    stop();
    setVideoSize(video, 1920, 1080);
    video.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(DIMENSION_RECHECK_MS * 3);
    expect(seen.length).toBe(count);
  });
});

describe("layout from real shapes", () => {
  const L = 16 / 9;
  const P = 9 / 16;
  const fits = (tiles: { width: number; height: number }[], w: number, h: number, dir: string) => {
    const along = dir === "row" ? tiles.reduce((s, t) => s + t.width, 0) : tiles.reduce((s, t) => s + t.height, 0);
    const gaps = 12 * (tiles.length - 1);
    expect(along + gaps).toBeLessThanOrEqual((dir === "row" ? w : h) + 0.5);
    for (const t of tiles) {
      expect(t.width).toBeLessThanOrEqual(w + 0.5);
      expect(t.height).toBeLessThanOrEqual(h + 0.5);
    }
  };
  const ratio = (t: { width: number; height: number }) => t.width / t.height;

  it("two landscape feeds on a 16:9 desktop: side by side, equal, landscape", () => {
    const out = layoutTiles([L, L], 1200, 600);
    expect(out.direction).toBe("row");
    expect(out.tiles[0].width).toBeCloseTo(out.tiles[1].width);
    out.tiles.forEach((t) => expect(ratio(t)).toBeCloseTo(L));
    fits(out.tiles, 1200, 600, "row");
  });

  it("portrait + landscape: the landscape feed gets more width, both keep their ratio", () => {
    const out = layoutTiles([P, L], 1200, 600);
    expect(out.direction).toBe("row");
    expect(out.tiles[1].width).toBeGreaterThan(out.tiles[0].width * 2.5);
    expect(out.tiles[0].height).toBeCloseTo(out.tiles[1].height);
    expect(ratio(out.tiles[0])).toBeCloseTo(P);
    expect(ratio(out.tiles[1])).toBeCloseTo(L);
    fits(out.tiles, 1200, 600, "row");
  });

  it("two portrait feeds: narrow side-by-side tiles on desktop", () => {
    const out = layoutTiles([P, P], 1200, 600);
    expect(out.direction).toBe("row");
    out.tiles.forEach((t) => {
      expect(ratio(t)).toBeCloseTo(P);
      expect(t.height).toBeCloseTo(600);
    });
    fits(out.tiles, 1200, 600, "row");
  });

  it("small phone viewports stack when that shows more video", () => {
    const portraitPhone = layoutTiles([L, L], 343, 600);
    expect(portraitPhone.direction).toBe("column");
    portraitPhone.tiles.forEach((t) => expect(ratio(t)).toBeCloseTo(L));
    fits(portraitPhone.tiles, 343, 600, "column");

    const mixedPortraitPhone = layoutTiles([P, L], 343, 600);
    fits(mixedPortraitPhone.tiles, 343, 600, mixedPortraitPhone.direction);
    mixedPortraitPhone.tiles.forEach((t, i) => expect(ratio(t)).toBeCloseTo([P, L][i]));

    const landscapePhone = layoutTiles([P, L], 780, 260);
    expect(landscapePhone.direction).toBe("row");
    fits(landscapePhone.tiles, 780, 260, "row");
  });

  it("a single feed keeps its natural ratio and does not stretch to the stage", () => {
    const out = layoutTiles([L], 1200, 800);
    expect(out.tiles).toHaveLength(1);
    expect(ratio(out.tiles[0])).toBeCloseTo(L);
    expect(out.tiles[0].width).toBeCloseTo(1200);
    expect(out.tiles[0].height).toBeLessThan(800);

    const portrait = layoutTiles([P], 1200, 800);
    expect(ratio(portrait.tiles[0])).toBeCloseTo(P);
    expect(portrait.tiles[0].height).toBeCloseTo(800);
    expect(portrait.tiles[0].width).toBeLessThan(500);
  });

  it("gives no fixed sizes before the stage is measured", () => {
    expect(layoutTiles([L, L], 0, 0).tiles).toEqual([]);
    expect(layoutTiles([], 1200, 600).tiles).toEqual([]);
  });
});

// --- the real call component in an active call --------------------------
vi.mock("~/web-sockets/Socket", () => ({
  default: { listen: () => ({ stop: () => {} }) },
}));
const whepProps: Array<Record<string, unknown>> = [];
vi.mock("~/components/match/WhepPlayer.vue", () => ({
  default: defineComponent({
    props: ["whepUrl", "muted", "objectFit"],
    setup(props) {
      whepProps.push(props as Record<string, unknown>);
      return () =>
        h("div", { class: "whep" }, [
          h("video", { class: props.objectFit === "cover" ? "object-cover" : "object-contain" }),
        ]);
    },
  }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async (u: string) => `data:qr,${u}` } }));

const OTHER = "76561190000000009";
const api = vi.hoisted(() => ({
  status: vi.fn(),
  hangup: vi.fn(),
}));
vi.mock("~/composables/useAdminCallApi", () => ({
  joinAdminCall: async () => ({
    token: "tok-1",
    participants: [{ steamId: "76561190000000009", name: "Mobile Mo", avatarUrl: null }],
  }),
  fetchAdminCallParticipants: async () => [{ steamId: "76561190000000009", name: "Mobile Mo", avatarUrl: null }],
  fetchAdminCallStatus: (url: string) => api.status(url),
  adminCallJoinUrl: (id: string, t: string) => `https://web.test/admin-call/${id}/${t}`,
  adminCallPeerWhepUrl: (id: string, s: string) => `whep:${s}`,
  adminCallPlayerWhipUrl: (t: string) => `whip:${t}`,
  adminCallPlayerStatusUrl: (t: string) => `status:${t}`,
  adminCallPlayerHangupUrl: (t: string) => `hangup:${t}`,
}));
vi.mock("~/composables/useVerificationCallApi", () => ({}));

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const STAGE = { width: 1200, height: 600 };
const wrappers: VueWrapper[] = [];

beforeEach(() => {
  whepProps.length = 0;
  api.status.mockReset().mockResolvedValue({ ready: true });
  vi.stubGlobal("definePageMeta", () => {});
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: "76561190000000001" } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useRoute", () => ({ params: { targetSteamId: OTHER }, query: {} }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("hangup:")) api.hangup(url);
      return { ok: true, text: async () => "v=0" };
    }),
  );
  vi.stubGlobal(
    "RTCPeerConnection",
    class {
      iceGatheringState = "complete";
      localDescription = { sdp: "v=0" };
      addTrack() {}
      addEventListener() {}
      async createOffer() {
        return {};
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() {}
    },
  );
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as any).__src ?? null;
    },
    set(v) {
      (this as any).__src = v;
    },
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: async () => ({
        getTracks: () => [],
        getVideoTracks: () => [{ getSettings: () => ({ deviceId: "cam-1" }) }],
      }),
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "cam-1", label: "Webcam" }],
    },
  });
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0) Chrome/130");
  // The stage is the only element with a measured size.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset?.testid === "fixed-party-call-stage" ? STAGE.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset?.testid === "fixed-party-call-stage" ? STAGE.height : 0;
  });
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

vi.setConfig({ testTimeout: 30_000 });

async function joinWithWebcam() {
  const mod = await import("../../pages/players/call/[targetSteamId].vue");
  const wrapper = mount(mod.default, {
    attachTo: document.body,
    global: { mocks: { $t: (_k: string, f?: string) => f ?? _k } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.get('[data-testid="fixed-party-call-webcam"]').trigger("click");
  await flushPromises();
  await wrapper.get('[data-testid="fixed-party-call-join"]').trigger("click");
  await flushPromises();
  return wrapper;
}

const tile = (w: VueWrapper, key: string) => w.get(`[data-testid="fixed-party-call-tile"][data-key="${key}"]`);
const px = (v: string | undefined) => Number(String(v ?? "0").replace("px", ""));
const size = (w: VueWrapper, key: string) => {
  const style = (tile(w, key).element as HTMLElement).style;
  return { width: px(style.width), height: px(style.height) };
};
const videoIn = (w: VueWrapper, key: string) => tile(w, key).element.querySelector("video") as HTMLVideoElement;

describe("active call tiles (FixedPartyCall)", () => {
  it("starts on a stable fallback, then follows each feed's real and changing shape", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrapper = await joinWithWebcam();

    const stage = wrapper.get('[data-testid="fixed-party-call-stage"]');
    expect(call(wrapper)).toBe("in-call");
    // Unknown sizes: both on the 16:9 fallback, side by side, equal.
    expect(tile(wrapper, OTHER).attributes("data-shape")).toBe("unknown");
    expect(tile(wrapper, "local").attributes("data-shape")).toBe("unknown");
    expect(stage.attributes("data-direction")).toBe("row");
    expect(size(wrapper, OTHER).width).toBe(size(wrapper, "local").width);

    // Local PC webcam reports landscape; the Android phone reports portrait late.
    setVideoSize(videoIn(wrapper, "local"), 1280, 720);
    videoIn(wrapper, "local").dispatchEvent(new Event("loadedmetadata"));
    setVideoSize(videoIn(wrapper, OTHER), 720, 1280);
    videoIn(wrapper, OTHER).dispatchEvent(new Event("loadedmetadata"));
    await flushPromises();

    expect(tile(wrapper, OTHER).attributes("data-shape")).toBe("portrait");
    expect(tile(wrapper, "local").attributes("data-shape")).toBe("landscape");
    const phone = size(wrapper, OTHER);
    const pc = size(wrapper, "local");
    expect(pc.width).toBeGreaterThan(phone.width * 2.5);
    expect(Math.abs(pc.height - phone.height)).toBeLessThanOrEqual(1);
    expect(phone.width / phone.height).toBeCloseTo(720 / 1280, 1);
    expect(pc.width / pc.height).toBeCloseTo(1280 / 720, 1);
    expect(pc.width + phone.width + 12).toBeLessThanOrEqual(STAGE.width);

    // The phone is rotated after joining (video resize event).
    setVideoSize(videoIn(wrapper, OTHER), 1280, 720);
    videoIn(wrapper, OTHER).dispatchEvent(new Event("resize"));
    await flushPromises();
    expect(tile(wrapper, OTHER).attributes("data-shape")).toBe("landscape");
    expect(size(wrapper, OTHER).width).toBe(size(wrapper, "local").width);

    // And back, with no event at all: the recheck timer catches it.
    setVideoSize(videoIn(wrapper, OTHER), 720, 1280);
    await vi.advanceTimersByTimeAsync(DIMENSION_RECHECK_MS + 50);
    await flushPromises();
    expect(tile(wrapper, OTHER).attributes("data-shape")).toBe("portrait");
    expect(size(wrapper, OTHER).width).toBeLessThan(size(wrapper, "local").width);
  });

  it("main tiles show the whole frame (contain), labels intact, leave still works", async () => {
    const wrapper = await joinWithWebcam();

    expect(whepProps.at(-1)?.objectFit).toBe("contain");
    expect(videoIn(wrapper, OTHER).className).toContain("object-contain");
    expect(videoIn(wrapper, "local").className).toContain("object-contain");
    expect(wrapper.find('[data-testid="fixed-party-call-stage"] .object-cover').exists()).toBe(false);

    expect(tile(wrapper, OTHER).text()).toContain("Mobile Mo");
    expect(tile(wrapper, "local").text()).toContain("You");

    await wrapper.get('[data-testid="fixed-party-call-leave"]').trigger("click");
    await flushPromises();
    expect(api.hangup).toHaveBeenCalledWith("hangup:tok-1");
    expect(wrapper.find('[data-testid="fixed-party-call-stage"]').exists()).toBe(false);
  });
});

function call(w: VueWrapper) {
  return w.get('[data-testid="fixed-party-call"]').attributes("data-step");
}

describe("scope", () => {
  it("no viewport-orientation grid or cropping left in the active call", () => {
    const comp = read("components/calls/FixedPartyCall.vue");
    expect(comp).not.toContain("gridTemplateColumns");
    expect(comp).not.toContain("(orientation: portrait)");
    expect(comp).not.toMatch(/class="[^"]*object-cover/);
    expect(comp).not.toContain('object-fit="cover"');
    // Detection is from the media, never from the user agent.
    expect(read("composables/useCallVideoLayout.ts")).not.toContain("userAgent");
  });

  it("Live Video and the shared WhepPlayer are untouched by this", () => {
    expect(read("components/chat/ChatVideoComposer.vue")).not.toContain("useCallVideoLayout");
    expect(read("components/match/WhepPlayer.vue")).not.toContain("useCallVideoLayout");
  });
});
