import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import {
  DIMENSION_RECHECK_MS,
  PHONE_CALL_QUERY,
  groupGridFallbackStyle,
  groupGridLayout,
} from "../../composables/useCallVideoLayout";

// Lobby / tournament group webcam rooms: a STABLE grid of equal outer cells
// (Discord-style), each feed shown whole inside its cell (object-contain,
// dark letterboxing), shapes re-read live for Android/iOS rotation. The
// 1-to-1 calls keep their adaptive layout (call-video-layout.spec.ts).

// --- fake decoded video sizes -------------------------------------------
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

const DESKTOP = { width: 1200, height: 700 };
const PHONE_PORTRAIT = { width: 360, height: 640 };
const PHONE_LANDSCAPE = { width: 740, height: 300 };

describe("group grid rules", () => {
  const cells = (n: number, s: { width: number; height: number }) =>
    groupGridLayout(n, s.width, s.height);

  it("desktop: 1 alone, 2 side by side, 3 and 4 as 2x2, 5 as 3+2", () => {
    expect([1, 2, 3, 4, 5].map((n) => [cells(n, DESKTOP).columns, cells(n, DESKTOP).rows])).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
      [2, 2],
      [3, 2],
    ]);
  });

  it("phone held upright: 2 stack, 3 and 4 as 2x2, 5 as 2+2+1", () => {
    expect([2, 3, 4, 5].map((n) => [cells(n, PHONE_PORTRAIT).columns, cells(n, PHONE_PORTRAIT).rows])).toEqual([
      [1, 2],
      [2, 2],
      [2, 2],
      [2, 3],
    ]);
  });

  it("phone in landscape: 2 side by side, 4 as 2x2", () => {
    expect([cells(2, PHONE_LANDSCAPE).columns, cells(2, PHONE_LANDSCAPE).rows]).toEqual([2, 1]);
    expect([cells(4, PHONE_LANDSCAPE).columns, cells(4, PHONE_LANDSCAPE).rows]).toEqual([2, 2]);
  });

  it("outer cells are regular and fit the stage, never slivers", () => {
    for (const stage of [DESKTOP, PHONE_PORTRAIT, PHONE_LANDSCAPE, { width: 2400, height: 500 }]) {
      for (const n of [2, 3, 4, 5]) {
        const g = cells(n, stage);
        const cell = g.cell!;
        expect(cell.width * g.columns + 12 * (g.columns - 1)).toBeLessThanOrEqual(stage.width + 0.5);
        expect(cell.height * g.rows + 12 * (g.rows - 1)).toBeLessThanOrEqual(stage.height + 0.5);
        expect(cell.width / cell.height).toBeLessThanOrEqual(16 / 9 + 1e-6);
        expect(cell.width / cell.height).toBeGreaterThanOrEqual(9 / 16 - 1e-6);
      }
    }
  });

  it("has a stable CSS fallback before the stage is measured", () => {
    const g = groupGridLayout(4, 0, 0);
    expect(g.cell).toBeNull();
    expect(groupGridFallbackStyle(g)).toEqual({
      width: "calc((100% - 12px) / 2)",
      height: "calc((100% - 12px) / 2)",
    });
  });
});

// --- mounted rooms --------------------------------------------------------
const socketListeners = new Map<string, Set<(d: any) => void>>();
vi.mock("~/web-sockets/Socket", () => ({
  default: {
    listen: (event: string, cb: (d: any) => void) => {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event)!.add(cb);
      return { stop: () => socketListeners.get(event)?.delete(cb) };
    },
  },
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
const ME = "76561190000000001";
vi.mock("~/composables/useLobbyCallApi", async (orig) => ({
  ...(await orig<any>()),
  fetchLobbyCallStatus: async () => ({ ready: true, steamId: "76561190000000001" }),
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

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

let stage = { ...DESKTOP };
const STAGE_IDS = new Set(["webcam-stage", "call-stage"]);
const wrappers: VueWrapper[] = [];

beforeEach(() => {
  socketListeners.clear();
  whepProps.length = 0;
  stage = { ...DESKTOP };
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: ME } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("definePageMeta", () => {});
  vi.stubGlobal("useRoute", () => ({ params: { applicationId: "app-1", token: "tok" }, query: {} }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test", webDomain: "web.test" } }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "v=0" })));
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
      getUserMedia: async () => ({ getTracks: () => [], getVideoTracks: () => [] }),
      enumerateDevices: async () => [],
    },
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return STAGE_IDS.has(this.dataset?.testid ?? "") ? stage.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return STAGE_IDS.has(this.dataset?.testid ?? "") ? stage.height : 0;
  });
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

vi.setConfig({ testTimeout: 30_000 });

const people = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    steamId: i === 0 ? ME : `7656119000000010${i}`,
    name: i === 0 ? "Me" : `Player ${i}`,
    avatarUrl: null,
  }));

function fakeRoom(participants: ReturnType<typeof people>, canKick = false) {
  return {
    kind: "lobby",
    roomId: "lobby-1",
    channel: "lobby:matchmaking:lobby-1",
    joinPageUrl: (t: string) => `join/${t}`,
    playerWhipUrl: (t: string) => `whip/${t}`,
    playerStatusUrl: (t: string) => `status/${t}`,
    playerHangupUrl: (t: string) => `hangup/${t}`,
    playerPeerWhepUrl: (t: string, s: string) => `pwhep/${t}/${s}`,
    peerWhepUrl: (s: string) => `whep/${s}`,
    fetchParticipantsForToken: vi.fn(async () => participants),
    fetchParticipants: vi.fn(async () => ({ participants, canKick })),
    join: vi.fn(async () => ({ token: "tok", participants, canKick })),
    kick: vi.fn(async () => ({ ok: true })),
  };
}

const mocks = {
  $t: (key: string, fallback?: any, params?: any) =>
    typeof fallback === "string" ? fallback.replace("{count}", String(params?.count ?? "")) : key,
};

async function mountRoom(n: number, canKick = false) {
  const { default: WebcamCallRoom } = await import("../../components/webcam/WebcamCallRoom.vue");
  const wrapper = mount(WebcamCallRoom, {
    props: { room: fakeRoom(people(n), canKick) },
    attachTo: document.body,
    global: { mocks },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const tiles = (w: VueWrapper) => w.findAll('[data-testid="webcam-tile"]');
const grid = (w: VueWrapper) => w.get('[data-testid="webcam-grid"]');
const px = (v: string) => Number(v.replace("px", ""));
const sizeOf = (el: Element) => {
  const st = (el as HTMLElement).style;
  return { width: px(st.width), height: px(st.height) };
};
const videoOf = (el: Element) => el.querySelector("video") as HTMLVideoElement;

describe("lobby/tournament popout (WebcamCallRoom)", () => {
  it("4 people on desktop: 2x2 of equal cells, every feed whole (contain)", async () => {
    const w = await mountRoom(4, true);
    expect(grid(w).attributes("data-columns")).toBe("2");
    expect(grid(w).attributes("data-rows")).toBe("2");
    const sizes = tiles(w).map((t) => sizeOf(t.element));
    expect(sizes).toHaveLength(4);
    sizes.forEach((s) => expect(s).toEqual(sizes[0]));
    // The wrapper is exactly two cells wide, so rows break 2 + 2.
    expect(px((grid(w).element as HTMLElement).style.width)).toBe(sizes[0].width * 2 + 12);

    expect(whepProps.every((p) => p.objectFit === "contain")).toBe(true);
    expect(w.find('[data-testid="webcam-stage"] .object-cover').exists()).toBe(false);
    tiles(w).forEach((t) => expect(t.classes()).toContain("bg-black"));

    // Labels and moderator controls are still there.
    expect(w.text()).toContain("Player 1");
    expect(w.findAll('[data-testid="webcam-kick"]').length).toBe(3);
  });

  it("mixed shapes stay inside stable cells; rotation and late sizes just update the feed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const w = await mountRoom(4);
    const before = tiles(w).map((t) => sizeOf(t.element));
    const [a, b, c, d] = tiles(w).map((t) => videoOf(t.element));

    // [portrait phone] [PC 16:9] / [PC 16:9] [landscape phone]
    setVideoSize(a, 720, 1280);
    setVideoSize(b, 1280, 720);
    setVideoSize(c, 1280, 720);
    setVideoSize(d, 1280, 720);
    [a, b, c, d].forEach((v) => v.dispatchEvent(new Event("loadedmetadata")));
    await flushPromises();
    expect(tiles(w).map((t) => t.attributes("data-shape"))).toEqual([
      "portrait",
      "landscape",
      "landscape",
      "landscape",
    ]);
    // Outer cells did not move: the portrait feed is letterboxed, not shrunk.
    expect(tiles(w).map((t) => sizeOf(t.element))).toEqual(before);

    // An Android phone rotates after joining (video resize event)...
    setVideoSize(d, 720, 1280);
    d.dispatchEvent(new Event("resize"));
    await flushPromises();
    expect(tiles(w)[3].attributes("data-shape")).toBe("portrait");
    // ...and another one reports its real size late, with no event at all.
    setVideoSize(b, 960, 1280);
    await vi.advanceTimersByTimeAsync(DIMENSION_RECHECK_MS + 50);
    await flushPromises();
    expect(tiles(w)[1].attributes("data-shape")).toBe("portrait");
    expect(tiles(w).map((t) => sizeOf(t.element))).toEqual(before);
  });

  it("2 people: two balanced cells side by side; 3: 2x2 with the last centred", async () => {
    const two = await mountRoom(2);
    expect(grid(two).attributes("data-columns")).toBe("2");
    expect(grid(two).attributes("data-rows")).toBe("1");
    const [s1, s2] = tiles(two).map((t) => sizeOf(t.element));
    expect(s1).toEqual(s2);

    const three = await mountRoom(3);
    expect(grid(three).attributes("data-columns")).toBe("2");
    expect(grid(three).attributes("data-rows")).toBe("2");
    expect(grid(three).classes()).toContain("justify-center");
  });

  it("a lone feed keeps its own ratio instead of filling the window", async () => {
    const w = await mountRoom(1);
    const v = videoOf(tiles(w)[0].element);
    setVideoSize(v, 720, 1280);
    v.dispatchEvent(new Event("loadedmetadata"));
    await flushPromises();
    const s = sizeOf(tiles(w)[0].element);
    expect(s.height).toBe(DESKTOP.height);
    expect(s.width / s.height).toBeCloseTo(720 / 1280, 1);
  });

  it("a phone-sized window uses the phone rules", async () => {
    stage = { ...PHONE_PORTRAIT };
    const two = await mountRoom(2);
    expect(grid(two).attributes("data-columns")).toBe("1");
    const four = await mountRoom(4);
    expect([grid(four).attributes("data-columns"), grid(four).attributes("data-rows")]).toEqual(["2", "2"]);
  });
});

// The phone page reached by scanning the lobby/tournament QR code.
async function mountPhoneRoom(others: number) {
  const { default: WebcamTokenJoin } = await import("../../components/webcam/WebcamTokenJoin.vue");
  const room = fakeRoom(people(others + 1));
  const wrapper = mount(WebcamTokenJoin, {
    props: { room, token: "tok" },
    attachTo: document.body,
    global: { mocks },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.findAll("button").find((b) => b.text().includes("Join call"))!.trigger("click");
  await flushPromises();
  // Participants are polled (no socket on the anonymous phone page).
  await vi.advanceTimersByTimeAsync(2600);
  await flushPromises();
  return wrapper;
}

describe("lobby/tournament phone page (WebcamTokenJoin)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("phone upright, 4 in the call: 2x2, equal cells, no cropping", async () => {
    stage = { ...PHONE_PORTRAIT };
    const w = await mountPhoneRoom(3);
    expect(tiles(w)).toHaveLength(4);
    expect([grid(w).attributes("data-columns"), grid(w).attributes("data-rows")]).toEqual(["2", "2"]);
    const sizes = tiles(w).map((t) => sizeOf(t.element));
    sizes.forEach((s) => expect(s).toEqual(sizes[0]));
    w.findAll('[data-testid="webcam-tile"] video').forEach((v) =>
      expect(v.classes()).toContain("object-contain"),
    );
    expect(w.find(".object-cover").exists()).toBe(false);
    expect(w.text()).toContain("You");
    expect(w.find('button[aria-label="Switch camera"]').exists()).toBe(true);
    expect(w.find('button[aria-label="Leave call"]').exists()).toBe(true);
  });

  it("phone upright, 3 in the call: 2x2 with one balanced gap; 2: stacked", async () => {
    stage = { ...PHONE_PORTRAIT };
    const three = await mountPhoneRoom(2);
    expect([grid(three).attributes("data-columns"), grid(three).attributes("data-rows")]).toEqual(["2", "2"]);
    const two = await mountPhoneRoom(1);
    expect([grid(two).attributes("data-columns"), grid(two).attributes("data-rows")]).toEqual(["1", "2"]);
  });

  it("phone in landscape: 2 side by side, 4 as 2x2", async () => {
    stage = { ...PHONE_LANDSCAPE };
    const two = await mountPhoneRoom(1);
    expect(grid(two).attributes("data-columns")).toBe("2");
    const four = await mountPhoneRoom(3);
    expect([grid(four).attributes("data-columns"), grid(four).attributes("data-rows")]).toEqual(["2", "2"]);
  });

  it("my own camera and a remote feed both update when rotated, without reconnecting", async () => {
    stage = { ...PHONE_PORTRAIT };
    const w = await mountPhoneRoom(1);
    const local = videoOf(w.get('[data-testid="webcam-tile"][data-key="local"]').element);
    const remote = videoOf(tiles(w)[0].element);
    const pcCalls = (globalThis.fetch as any).mock.calls.length;

    setVideoSize(local, 1280, 720);
    local.dispatchEvent(new Event("loadedmetadata"));
    setVideoSize(remote, 720, 1280);
    remote.dispatchEvent(new Event("loadedmetadata"));
    await flushPromises();
    expect(w.get('[data-key="local"]').attributes("data-shape")).toBe("landscape");
    expect(tiles(w)[0].attributes("data-shape")).toBe("portrait");

    // Phone rotated: Android reports the rotated frame via orientationchange.
    setVideoSize(local, 720, 1280);
    window.dispatchEvent(new Event("orientationchange"));
    await flushPromises();
    expect(w.get('[data-key="local"]').attributes("data-shape")).toBe("portrait");
    // No new WHIP/WHEP requests were needed for any of this.
    expect((globalThis.fetch as any).mock.calls.length).toBe(pcCalls);
  });
});

describe("1-to-1 phone page (verification call QR page)", () => {
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

  async function joinPhonePage() {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { default: Page } = await import("../../pages/verification-call/[applicationId]/[token].vue");
    const w = mount(Page, { attachTo: document.body, global: { mocks } });
    wrappers.push(w);
    await flushPromises();
    await w.findAll("button").find((b) => b.text().includes("Join call"))!.trigger("click");
    await flushPromises();
    await vi.advanceTimersByTimeAsync(2600);
    await flushPromises();
    return w;
  }
  const callTile = (w: VueWrapper, key: string) =>
    w.get(`[data-testid="call-tile"][data-key="${key}"]`);
  const ADMIN = "76561190000000002";

  it("on the phone: the admin fills the screen, my camera is a bottom-right PiP, upright and sideways", async () => {
    stubPhone(true);
    stage = { ...PHONE_PORTRAIT };
    const w = await joinPhonePage();
    expect(w.findAll('[data-testid="call-tile"]')).toHaveLength(2);
    expect(w.get('[data-testid="call-stage"]').attributes("data-layout")).toBe("pip");
    expect(callTile(w, ADMIN).attributes("data-role")).toBe("main");
    expect(callTile(w, "local").attributes("data-role")).toBe("pip");
    const main = (callTile(w, ADMIN).element as HTMLElement).style;
    expect([main.width, main.height]).toEqual(["100%", "100%"]);
    const pip = (callTile(w, "local").element as HTMLElement).style;
    expect(pip.position).toBe("absolute");
    expect(callTile(w, "local").attributes("data-corner")).toBe("bottom-right");

    // Admin's PC webcam (landscape) and this phone upright (portrait).
    const remote = videoOf(callTile(w, ADMIN).element);
    const local = videoOf(callTile(w, "local").element);
    setVideoSize(remote, 1280, 720);
    setVideoSize(local, 720, 1280);
    remote.dispatchEvent(new Event("loadedmetadata"));
    local.dispatchEvent(new Event("loadedmetadata"));
    await flushPromises();
    const p = sizeOf(callTile(w, "local").element);
    expect(p.width / p.height).toBeCloseTo(9 / 16, 1);
    expect(p.width).toBeLessThan(PHONE_PORTRAIT.width / 3);

    // Phone turned sideways: still admin main + my PiP (no switch to 50/50).
    setVideoSize(local, 1280, 720);
    window.dispatchEvent(new Event("orientationchange"));
    await flushPromises();
    expect(w.get('[data-testid="call-stage"]').attributes("data-layout")).toBe("pip");
    expect(callTile(w, "local").attributes("data-shape")).toBe("landscape");
    expect(callTile(w, ADMIN).attributes("data-role")).toBe("main");

    // The Leave button is outside the call area, so the PiP cannot cover it.
    const leave = w.get('button[aria-label="Leave call"]').element;
    expect(w.get('[data-testid="call-stage"]').element.contains(leave)).toBe(false);
    w.findAll('[data-testid="call-tile"] video').forEach((v) =>
      expect(v.classes()).toContain("object-contain"),
    );
    expect(w.find(".object-cover").exists()).toBe(false);
  });

  it("on a tablet/desktop screen: two equal cells side by side", async () => {
    stubPhone(false);
    stage = { width: 1000, height: 600 };
    const w = await joinPhonePage();
    expect(w.get('[data-testid="call-stage"]').attributes("data-layout")).toBe("split");
    const remote = videoOf(callTile(w, ADMIN).element);
    const local = videoOf(callTile(w, "local").element);
    setVideoSize(remote, 1280, 720);
    setVideoSize(local, 720, 1280);
    remote.dispatchEvent(new Event("loadedmetadata"));
    local.dispatchEvent(new Event("loadedmetadata"));
    await flushPromises();
    const r = sizeOf(callTile(w, ADMIN).element);
    const l = sizeOf(callTile(w, "local").element);
    expect(r).toEqual(l);
    expect(r.width).toBe(Math.floor((1000 - 8) / 2));
  });
});

describe("scope", () => {
  it("no viewport-orientation grids or cropping left in any call view", () => {
    for (const file of [
      "components/webcam/WebcamCallRoom.vue",
      "components/webcam/WebcamTokenJoin.vue",
      "components/calls/FixedPartyCall.vue",
      "pages/verification-call/[applicationId]/[token].vue",
      "pages/admin-call/[targetSteamId]/[token].vue",
    ]) {
      const src = read(file);
      expect(src, file).not.toContain("gridTemplateColumns");
      expect(src, file).not.toContain("(orientation: portrait)");
      expect(src, file).not.toMatch(/class="[^"]*object-cover/);
      expect(src, file).not.toContain('object-fit="cover"');
    }
  });

  it("shared players and Live Video are unchanged", () => {
    expect(read("components/match/WhepPlayer.vue")).not.toContain("useCallVideoLayout");
    expect(read("components/chat/ChatVideoComposer.vue")).not.toContain("useCallVideoLayout");
    expect(read("pages/chat-video.vue")).not.toContain("useCallVideoLayout");
  });
});
