import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import {
  createDropWatcher,
  DROP_GRACE_POLLS,
  MAX_AUTO_RECONNECTS,
  STABLE_POLLS_RESET,
  WEBCAM_REMOVED_MESSAGE,
} from "../../composables/useWebcamConnectionWatch";

// Tournament webcam: 4-person room on the shared modern group grid, open-slot
// handling, and connection-drop recovery. The server-side rules (cap, kick
// authorization, slot release) are covered in api-deafcs
// tournament-call.service.spec.ts.

const ME = "76561190000000001";
const T1 = "11111111-1111-4111-8111-111111111111";

const hoisted = vi.hoisted(() => ({ status: vi.fn() }));

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
vi.mock("~/components/match/WhepPlayer.vue", () => ({
  default: defineComponent({
    props: ["whepUrl", "muted", "objectFit"],
    setup: () => () => h("div", { class: "whep" }, [h("video")]),
  }),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: async (u: string) => `data:qr,${u}` } }));
vi.mock("~/composables/useLobbyCallApi", async (orig) => ({
  ...(await orig<any>()),
  fetchLobbyCallStatus: (...args: unknown[]) => hoisted.status(...args),
}));

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const DESKTOP = { width: 1200, height: 700 };
const PHONE_PORTRAIT = { width: 390, height: 700 };
let stage = { ...DESKTOP };
const wrappers: VueWrapper[] = [];
let whipPosts = 0;

beforeEach(() => {
  socketListeners.clear();
  whipPosts = 0;
  stage = { ...DESKTOP };
  hoisted.status.mockReset();
  hoisted.status.mockResolvedValue({ ready: true, steamId: ME });
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: ME } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.test", webDomain: "web.test" },
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("whip/")) whipPosts++;
      return { ok: true, text: async () => "v=0" };
    }),
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
    return this.dataset?.testid === "webcam-stage" ? stage.width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset?.testid === "webcam-stage" ? stage.height : 0;
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

function tournamentRoom(participants: ReturnType<typeof people>, extra: Record<string, unknown> = {}) {
  return {
    kind: "tournament",
    roomId: T1,
    channel: `lobby:tournament:${T1}`,
    title: "Tournament webcam call",
    maxParticipants: 4,
    joinPageUrl: (t: string) => `join/${t}`,
    playerWhipUrl: (t: string) => `whip/${t}`,
    playerStatusUrl: (t: string) => `status/${t}`,
    playerHangupUrl: (t: string) => `hangup/${t}`,
    playerPeerWhepUrl: (t: string, s: string) => `pwhep/${t}/${s}`,
    peerWhepUrl: (s: string) => `whep/${s}`,
    fetchParticipantsForToken: vi.fn(async () => participants),
    fetchParticipants: vi.fn(async () => ({ participants, canKick: false })),
    join: vi.fn(async () => ({ token: "tok", participants, canKick: false })),
    kick: vi.fn(async () => ({ ok: true })),
    ...extra,
  };
}

const mocks = {
  $t: (key: string, fallback?: any, params?: any) =>
    typeof fallback === "string"
      ? fallback
          .replace("{count}", String(params?.count ?? ""))
          .replace("{max}", String(params?.max ?? ""))
      : key,
};

async function mountPopout(n: number, extra: Record<string, unknown> = {}) {
  const { default: WebcamCallRoom } = await import("../../components/webcam/WebcamCallRoom.vue");
  const wrapper = mount(WebcamCallRoom, {
    props: { room: tournamentRoom(people(n), extra) },
    attachTo: document.body,
    global: { mocks },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

async function mountPhone(others: number, extra: Record<string, unknown> = {}) {
  const { default: WebcamTokenJoin } = await import("../../components/webcam/WebcamTokenJoin.vue");
  const wrapper = mount(WebcamTokenJoin, {
    props: { room: tournamentRoom(people(others + 1), extra), token: "tok" },
    attachTo: document.body,
    global: { mocks },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.findAll("button").find((b) => b.text().includes("Join call"))!.trigger("click");
  await flushPromises();
  await vi.advanceTimersByTimeAsync(2600);
  await flushPromises();
  return wrapper;
}

const tiles = (w: VueWrapper) => w.findAll('[data-testid="webcam-tile"]');
const emptySlots = (w: VueWrapper) => w.findAll('[data-testid="webcam-empty-slot"]');
const grid = (w: VueWrapper) => w.get('[data-testid="webcam-grid"]');
const dims = (w: VueWrapper) => [grid(w).attributes("data-columns"), grid(w).attributes("data-rows")];
const px = (v: string) => Number(v.replace("px", ""));
const sizeOf = (el: Element) => {
  const st = (el as HTMLElement).style;
  return { width: px(st.width), height: px(st.height) };
};
const hasJoinButton = (w: VueWrapper) =>
  w.findAll("button").some((b) => b.text().includes("Join call"));

describe("connection drop watcher (shared rules)", () => {
  it("ignores isolated misses and only drops after the grace polls in a row", () => {
    const w = createDropWatcher();
    for (let i = 0; i < DROP_GRACE_POLLS - 1; i++) {
      expect(w.sample({ ready: false })).toBe("waiting");
    }
    expect(w.sample({ ready: true })).toBe("ok");
    // a healthy poll resets the count
    for (let i = 0; i < DROP_GRACE_POLLS - 1; i++) {
      expect(w.sample({ ready: false })).toBe("waiting");
    }
    expect(w.sample({ ready: false })).toBe("dropped");
  });

  it("counts the first check after coming back to the foreground immediately", () => {
    const w = createDropWatcher();
    expect(w.sample({ ready: false }, { afterResume: true })).toBe("dropped");
    expect(w.sample({ ready: true }, { afterResume: true })).toBe("ok");
  });

  it("treats an expired link as final, not as a dropped connection", () => {
    const w = createDropWatcher();
    expect(w.sample({ ready: false, reason: "expired" })).toBe("expired");
  });

  it("allows a limited number of automatic reconnects, forgotten after a stable stretch", () => {
    const w = createDropWatcher();
    for (let i = 0; i < MAX_AUTO_RECONNECTS; i++) {
      expect(w.canAutoReconnect()).toBe(true);
      w.noteAutoReconnect();
    }
    expect(w.canAutoReconnect()).toBe(false);
    for (let i = 0; i < STABLE_POLLS_RESET; i++) w.sample({ ready: true });
    expect(w.canAutoReconnect()).toBe(true);
    w.noteAutoReconnect();
    w.reset();
    expect(w.canAutoReconnect()).toBe(true);
  });
});

describe("tournament room definition", () => {
  it("is a 4-person room with its own title, the lobby room is unchanged", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({
      public: { apiDomain: "api.test", webDomain: "web.test" },
    }));
    const api = await import("../../composables/useWebcamRoomApi");
    expect(api.TOURNAMENT_WEBCAM_MAX).toBe(4);
    const token = api.createTournamentWebcamTokenRoom();
    expect(token.maxParticipants).toBe(4);
    expect(token.title).toBe("Tournament webcam call");
    const room = api.createTournamentWebcamRoom(T1);
    expect(room.maxParticipants).toBe(4);
    expect(room.kick).toBeTypeOf("function");
    const lobby = api.createLobbyWebcamRoom("lobby-1");
    expect(lobby.maxParticipants).toBeUndefined();
    expect(lobby.title).toBeUndefined();
  });
});

describe("tournament popout: 1 to 4 participants on the modern grid", () => {
  it("1 alone, 2 side by side, 3 as 2x2 with an open slot, 4 as a full 2x2", async () => {
    const one = await mountPopout(1);
    expect(tiles(one)).toHaveLength(1);
    expect(emptySlots(one)).toHaveLength(0);

    const two = await mountPopout(2);
    expect(dims(two)).toEqual(["2", "1"]);
    expect(emptySlots(two)).toHaveLength(0);

    const three = await mountPopout(3);
    expect(dims(three)).toEqual(["2", "2"]);
    expect(tiles(three)).toHaveLength(3);
    expect(emptySlots(three)).toHaveLength(1);
    expect(three.text()).toContain("Open slot");

    const four = await mountPopout(4);
    expect(dims(four)).toEqual(["2", "2"]);
    expect(tiles(four)).toHaveLength(4);
    expect(emptySlots(four)).toHaveLength(0);
    const sizes = tiles(four).map((t) => sizeOf(t.element));
    sizes.forEach((s) => expect(s).toEqual(sizes[0]));
  });

  it("the open slot is an equal cell of the 2x2, not a stretched or cropped tile", async () => {
    const three = await mountPopout(3);
    const real = sizeOf(tiles(three)[0].element);
    expect(sizeOf(emptySlots(three)[0].element)).toEqual(real);
    three.findAll('[data-testid="webcam-tile"] video').forEach((v) => expect(v.element).toBeTruthy());
    expect(three.find(".object-cover").exists()).toBe(false);
  });

  it("shows the count against the 4-person cap and clear names on every tile", async () => {
    const four = await mountPopout(4);
    expect(four.get('[data-testid="webcam-count"]').text()).toBe("4/4 in call");
    expect(four.text()).toContain("Player 1");
    expect(four.text()).toContain("Player 3");
  });

  it("a phone-sized window keeps 4 as 2x2", async () => {
    stage = { ...PHONE_PORTRAIT };
    expect(dims(await mountPopout(4))).toEqual(["2", "2"]);
    expect(dims(await mountPopout(2))).toEqual(["1", "2"]);
  });

  it("a room without a hard cap (matchmaking lobby) never shows an open slot", async () => {
    const lobby = await mountPopout(3, { kind: "lobby", maxParticipants: undefined });
    expect(emptySlots(lobby)).toHaveLength(0);
    expect(lobby.get('[data-testid="webcam-count"]').text()).toBe("3 in call");
  });

  it("a full room tells the fifth person it is full and does not seat them", async () => {
    const wrapper = await mountPopout(4, {
      join: vi.fn(async () => ({ error: "Webcam room is full (4/4)." })),
      fetchParticipants: vi.fn(async () => ({
        participants: people(4).slice(1),
        canKick: false,
      })),
    });
    expect(wrapper.text()).toContain("Webcam room is full (4/4).");
    expect(wrapper.text()).not.toContain("Connect with");
    expect(tiles(wrapper)).toHaveLength(0);
  });
});

describe("tournament phone page", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("says it is the tournament webcam, not the lobby call", async () => {
    const { default: WebcamTokenJoin } = await import("../../components/webcam/WebcamTokenJoin.vue");
    const w = mount(WebcamTokenJoin, {
      props: { room: tournamentRoom(people(1)), token: "tok" },
      attachTo: document.body,
      global: { mocks },
    });
    wrappers.push(w);
    await flushPromises();
    expect(w.text()).toContain("Tournament webcam call");
    expect(w.text()).not.toContain("Lobby");
  });

  it("phone upright: 4 as 2x2; with 3 people the fourth cell is an open slot", async () => {
    stage = { ...PHONE_PORTRAIT };
    const four = await mountPhone(3);
    expect(dims(four)).toEqual(["2", "2"]);
    expect(tiles(four)).toHaveLength(4);
    expect(emptySlots(four)).toHaveLength(0);

    const three = await mountPhone(2);
    expect(dims(three)).toEqual(["2", "2"]);
    expect(tiles(three)).toHaveLength(3);
    expect(emptySlots(three)).toHaveLength(1);
  });
});

describe("connection drops: reconnection and removal", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));

  it("phone: one failed status poll does not tear the call down", async () => {
    const w = await mountPhone(1);
    expect(whipPosts).toBe(1);
    hoisted.status.mockResolvedValueOnce({ ready: false });
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
    expect(whipPosts).toBe(1);
    expect(w.text()).not.toContain("Connection dropped");
    expect(w.find('button[aria-label="Leave call"]').exists()).toBe(true);
  });

  it("phone: a sustained drop reconnects by itself with one publisher, then asks for a tap", async () => {
    const w = await mountPhone(1);
    hoisted.status.mockResolvedValue({ ready: false });
    // first drop -> auto reconnect #1 -> still failing -> #2 -> then manual
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(whipPosts).toBe(1 + MAX_AUTO_RECONNECTS);
    expect(w.text()).toContain("Connection dropped. Tap Join call to reconnect.");
    expect(hasJoinButton(w)).toBe(true);
    // never more than my own single tile, no duplicate participant
    expect(w.findAll('[data-testid="webcam-tile"][data-key="local"]').length).toBeLessThanOrEqual(1);

    // A manual tap with a healthy connection joins again.
    hoisted.status.mockResolvedValue({ ready: true, steamId: ME });
    await w.findAll("button").find((b) => b.text().includes("Join call"))!.trigger("click");
    await flushPromises();
    expect(whipPosts).toBe(2 + MAX_AUTO_RECONNECTS);
    expect(w.findAll('[data-testid="webcam-tile"][data-key="local"]')).toHaveLength(1);
  });

  it("phone: coming back to the foreground after the phone slept reconnects immediately", async () => {
    await mountPhone(1);
    expect(whipPosts).toBe(1);
    hoisted.status.mockResolvedValue({ ready: false });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();
    // no 6 second wait: the foreground check counts as a drop at once
    expect(whipPosts).toBe(2);
  });

  it("phone: a removed/expired link is explained and cannot be retried", async () => {
    const w = await mountPhone(1);
    hoisted.status.mockResolvedValue({ ready: false, reason: "expired" });
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
    expect(w.text()).toContain(WEBCAM_REMOVED_MESSAGE);
    expect(w.text()).not.toContain("Connection dropped");
    expect(hasJoinButton(w)).toBe(false);
    expect(whipPosts).toBe(1);
  });

  async function popoutInCall() {
    // Not yet in the call, so the room opens straight on the device picker.
    const others = people(3).slice(1);
    const w = await mountPopout(2, {
      fetchParticipants: vi.fn(async () => ({ participants: others, canKick: false })),
    });
    await w.findAll("button").find((b) => b.text().includes("This computer"))!.trigger("click");
    await flushPromises();
    await w.findAll("button").find((b) => b.text().includes("Join call"))!.trigger("click");
    await flushPromises();
    return w;
  }

  it("popout: tolerates one failed poll, auto reconnects a sustained drop with a single publisher", async () => {
    const w = await popoutInCall();
    expect(whipPosts).toBe(1);
    hoisted.status.mockResolvedValueOnce({ ready: false });
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
    expect(whipPosts).toBe(1);

    hoisted.status.mockResolvedValue({ ready: false });
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(whipPosts).toBe(1 + MAX_AUTO_RECONNECTS);
    expect(w.text()).toContain("Connection dropped. Click Join call to reconnect.");
    expect(w.findAll('[data-testid="webcam-tile"][data-key="local"]').length).toBeLessThanOrEqual(1);
  });

  it("popout: an expired link ends the call with the removal message", async () => {
    const w = await popoutInCall();
    hoisted.status.mockResolvedValue({ ready: false, reason: "expired" });
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
    expect(w.text()).toContain(WEBCAM_REMOVED_MESSAGE);
    expect(whipPosts).toBe(1);
  });
});

describe("scope and access", () => {
  it("tournament webcam keeps tournament chat access: no verification or QR-auth flow was added", () => {
    const page = read("pages/tournaments/webcam/[tournamentId].vue");
    expect(page).toContain("createTournamentWebcamRoom");
    expect(page).not.toMatch(/verif|FixedPartyCall/i);
    const room = read("composables/useWebcamRoomApi.ts");
    expect(room).not.toMatch(/useVerificationCallApi|verification/i);
  });

  it("verification and admin 1-to-1 calls do not use the new group-room watcher", () => {
    expect(read("components/calls/FixedPartyCall.vue")).not.toContain("useWebcamConnectionWatch");
  });

  it("the kick button is server-gated by canKick and only removes the camera", () => {
    const comp = read("components/webcam/WebcamCallRoom.vue");
    expect(comp).toContain('v-if="canKick && room.kick && p.steamId !== myId"');
    const api = read("composables/useWebcamRoomApi.ts");
    expect(api).toContain("/kick/");
  });
});
