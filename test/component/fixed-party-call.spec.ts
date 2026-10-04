import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";

// Verification call and admin call from a player profile.
//  - Called player: accepting stays on the current page; the call opens
//    inline (no window.open, no new tab) straight on the phone QR code,
//    with "use this computer's webcam" as the secondary path. A phone goes
//    straight to its own camera.
//  - Admin/caller: keeps the separate popout window.
// Both use the same Live Video style card; Live Video itself is untouched.

const socketListeners = new Map<string, Set<(data: any) => void>>();
vi.mock("~/web-sockets/Socket", () => ({
  default: {
    listen: (event: string, cb: (data: any) => void) => {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event)!.add(cb);
      return { stop: () => socketListeners.get(event)?.delete(cb) };
    },
  },
}));
const emitSocket = (event: string, data: any) =>
  socketListeners.get(event)?.forEach((cb) => cb(data));

vi.mock("~/components/match/WhepPlayer.vue", () => ({
  default: defineComponent({ setup: () => () => h("div", { class: "whep" }) }),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async (url: string) => `data:image/png;qr,${url}`) },
}));
vi.mock("~/composables/useTabFlash", () => ({
  startCallFlash: () => {},
  stopCallFlash: () => {},
}));

const callApi = vi.hoisted(() => ({
  join: vi.fn(),
  participants: vi.fn(),
  status: vi.fn(),
  respondVerification: vi.fn(),
  respondAdmin: vi.fn(),
}));

vi.mock("~/composables/useVerificationCallApi", () => ({
  joinVerificationCall: (id: string) => callApi.join("verification", id),
  fetchVerificationCallParticipants: () => callApi.participants(),
  fetchVerificationCallStatus: (url: string) => callApi.status(url),
  respondToVerificationRing: (id: string, accepted: boolean) =>
    callApi.respondVerification(id, accepted),
  verificationCallJoinUrl: (id: string, token: string) =>
    `https://web.test/verification-call/${id}/${token}`,
  verificationCallPeerWhepUrl: () => "whep",
  verificationCallPlayerWhipUrl: (token: string) => `whip:${token}`,
  verificationCallPlayerStatusUrl: (token: string) => `status:${token}`,
  verificationCallPlayerHangupUrl: (token: string) => `hangup:${token}`,
}));
vi.mock("~/composables/useAdminCallApi", () => ({
  joinAdminCall: (id: string) => callApi.join("admin", id),
  fetchAdminCallParticipants: () => callApi.participants(),
  fetchAdminCallStatus: (url: string) => callApi.status(url),
  respondToAdminCallRing: (id: string, accepted: boolean) =>
    callApi.respondAdmin(id, accepted),
  fetchActiveAdminCallRing: async () => null,
  adminCallJoinUrl: (id: string, token: string) => `https://web.test/admin-call/${id}/${token}`,
  adminCallPeerWhepUrl: () => "whep",
  adminCallPlayerWhipUrl: (token: string) => `whip:${token}`,
  adminCallPlayerStatusUrl: (token: string) => `status:${token}`,
  adminCallPlayerHangupUrl: (token: string) => `hangup:${token}`,
}));

vi.setConfig({ testTimeout: 30_000 });

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");
const APP = "app-1";
const PLAYER = "76561190000000002";
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148";

let getUserMedia: ReturnType<typeof vi.fn>;
let openSpy: ReturnType<typeof vi.spyOn>;
let closeSpy: ReturnType<typeof vi.spyOn>;
const wrappers: VueWrapper[] = [];

function setUserAgent(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

beforeEach(() => {
  socketListeners.clear();
  callApi.join.mockReset().mockResolvedValue({ token: "tok-1", participants: [] });
  callApi.participants.mockReset().mockResolvedValue([]);
  callApi.status.mockReset().mockResolvedValue({ ready: false });
  callApi.respondVerification.mockReset().mockResolvedValue({ ok: true });
  callApi.respondAdmin.mockReset().mockResolvedValue({ ok: true });
  vi.stubGlobal("definePageMeta", () => {});
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: PLAYER } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  // happy-dom only accepts a real MediaStream for video.srcObject.
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as any).__src ?? null;
    },
    set(v) {
      (this as any).__src = v;
    },
  });
  const fakeStream = {
    getTracks: () => [],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: "cam-1" }) }],
  };
  getUserMedia = vi.fn(async () => fakeStream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "cam-1", label: "Webcam" }],
    },
  });
  openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});
  setUserAgent(DESKTOP_UA);
});

afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const mocks = { $t: (_key: string, fallback?: string) => fallback ?? _key };

async function mountFile(file: string, route?: { params: Record<string, string>; query?: Record<string, string> }) {
  if (route) vi.stubGlobal("useRoute", () => ({ query: {}, ...route }));
  const mod = await import(/* @vite-ignore */ path.resolve(__dirname, "../..", file));
  const wrapper = mount(mod.default, { attachTo: document.body, global: { mocks } });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}

const NOTIFIERS = [
  {
    label: "verification call",
    file: "components/verification/GlobalVerificationCallNotifier.vue",
    ring: () => emitSocket("verification-call:ring", { applicationId: APP, adminName: "Mod" }),
    respond: () => callApi.respondVerification,
    joinArgs: ["verification", APP],
    qrUrl: `https://web.test/verification-call/${APP}/tok-1`,
    title: "Verification call",
  },
  {
    label: "admin profile call",
    file: "components/admin-calls/GlobalAdminCallNotifier.vue",
    ring: () => emitSocket("admin-call:ring", { targetSteamId: PLAYER, adminName: "Admin" }),
    respond: () => callApi.respondAdmin,
    joinArgs: ["admin", PLAYER],
    qrUrl: `https://web.test/admin-call/${PLAYER}/tok-1`,
    title: "Admin call",
  },
];

async function acceptIncoming(n: (typeof NOTIFIERS)[number]) {
  const wrapper = await mountFile(n.file);
  n.ring();
  await flushPromises();
  const accept = wrapper.findAll("button").find((b) => b.text() === "Accept")!;
  expect(accept).toBeTruthy();
  await accept.trigger("click");
  await flushPromises();
  return wrapper;
}

const call = (w: VueWrapper) => w.find('[data-testid="fixed-party-call"]');

describe.each(NOTIFIERS)("called player, desktop: $label", (n) => {
  it("accepting stays on the page and opens the call inline on the QR code", async () => {
    const wrapper = await acceptIncoming(n);

    expect(n.respond()).toHaveBeenCalledWith(n.joinArgs[1], true);
    expect(openSpy).not.toHaveBeenCalled();
    expect(callApi.join).toHaveBeenCalledWith(...n.joinArgs);

    const panel = call(wrapper);
    expect(panel.exists()).toBe(true);
    expect(panel.attributes("data-mode")).toBe("inline");
    expect(panel.attributes("role")).toBe("dialog");
    expect(panel.attributes("data-step")).toBe("phone");
    expect(panel.text()).toContain(n.title);
    expect(panel.text()).toContain("Join this call with your phone");
    expect(panel.text()).toContain("Scan with your phone camera. No DEAFCS login is needed.");
    expect(panel.get('[data-testid="fixed-party-call-qr"]').attributes("src")).toBe(
      `data:image/png;qr,${n.qrUrl}`,
    );
    // No device chooser first, no camera prompt yet, no duplicate status text.
    expect(panel.text()).not.toContain("Join the call");
    expect(panel.text()).not.toContain("No active call");
    expect(panel.text()).not.toMatch(/\bMobile\b/);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(document.querySelectorAll('a[target="_blank"]')).toHaveLength(0);
  });

  it("keeps the computer webcam as a small secondary link that switches inline", async () => {
    const wrapper = await acceptIncoming(n);
    const webcam = wrapper.get('[data-testid="fixed-party-call-webcam"]');
    expect(webcam.text()).toBe("Click here");
    expect(webcam.element.parentElement?.textContent).toContain(
      "Prefer to use your computer's webcam?",
    );

    await webcam.trigger("click");
    await flushPromises();

    const panel = call(wrapper);
    expect(panel.attributes("data-mode")).toBe("inline");
    expect(panel.attributes("data-step")).toBe("preview");
    expect(getUserMedia).toHaveBeenCalled();
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false });
    expect(panel.find("video").exists()).toBe(true);
    expect(panel.find('select[aria-label="Select camera"]').exists() || panel.text().includes("Webcam")).toBe(true);
    expect(openSpy).not.toHaveBeenCalled();
    // Same token: no second join for the webcam path.
    expect(callApi.join).toHaveBeenCalledTimes(1);

    // Back to the phone QR code.
    const back = wrapper.get('[data-testid="fixed-party-call-back-to-phone"]');
    expect(back.text()).toContain("Use phone instead");
    await back.trigger("click");
    expect(call(wrapper).attributes("data-step")).toBe("phone");
    expect(wrapper.find('[data-testid="fixed-party-call-qr"]').exists()).toBe(true);
  });

  it("closes the inline panel (no window.close) once the phone that scanned it is live", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrapper = await acceptIncoming(n);
    expect(call(wrapper).exists()).toBe(true);

    callApi.status.mockResolvedValue({ ready: true });
    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();

    expect(callApi.status).toHaveBeenCalledWith("status:tok-1");
    expect(call(wrapper).exists()).toBe(false);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("can be closed from its own close button", async () => {
    const wrapper = await acceptIncoming(n);
    await wrapper.get('[data-testid="fixed-party-call-close"]').trigger("click");
    expect(call(wrapper).exists()).toBe(false);
  });

  it("declining still answers the ring and opens nothing", async () => {
    const wrapper = await mountFile(n.file);
    n.ring();
    await flushPromises();
    await wrapper.findAll("button").find((b) => b.text() === "Decline")!.trigger("click");
    await flushPromises();
    expect(n.respond()).toHaveBeenCalledWith(n.joinArgs[1], false);
    expect(call(wrapper).exists()).toBe(false);
    expect(callApi.join).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe.each(NOTIFIERS)("called player, phone: $label", (n) => {
  it("goes straight to this phone's own camera inline, no QR code to itself, no popup", async () => {
    setUserAgent(PHONE_UA);
    const wrapper = await acceptIncoming(n);

    const panel = call(wrapper);
    expect(panel.attributes("data-mode")).toBe("inline");
    expect(panel.attributes("data-step")).toBe("preview");
    expect(getUserMedia).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="fixed-party-call-qr"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="fixed-party-call-webcam"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="fixed-party-call-back-to-phone"]').text()).toContain("Back");
    expect(openSpy).not.toHaveBeenCalled();

    // Back on a phone returns to the plain Join button, never to a QR code.
    await wrapper.get('[data-testid="fixed-party-call-back-to-phone"]').trigger("click");
    expect(call(wrapper).attributes("data-step")).toBe("idle");
    expect(wrapper.find('[data-testid="fixed-party-call-qr"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="fixed-party-call-start"]').exists()).toBe(true);
  });
});

const PAGES = [
  {
    label: "verification call",
    file: "pages/verification-applications/call/[applicationId].vue",
    params: { applicationId: APP },
    event: "verification-call:response",
    answer: { applicationId: APP },
    otherAnswer: { applicationId: "other" },
    qrUrl: `https://web.test/verification-call/${APP}/tok-1`,
    declined: "The applicant declined the call.",
    noAnswer: "The applicant did not answer.",
    waiting: "Waiting for the applicant…",
    caller: "pages/verification-applications/[id].vue",
    callerUrl: "`/verification-applications/call/${this.$route.params.id}?ringing=1`",
  },
  {
    label: "admin profile call",
    file: "pages/players/call/[targetSteamId].vue",
    params: { targetSteamId: PLAYER },
    event: "admin-call:response",
    answer: { targetSteamId: PLAYER },
    otherAnswer: { targetSteamId: "other" },
    qrUrl: `https://web.test/admin-call/${PLAYER}/tok-1`,
    declined: "The player declined the call.",
    noAnswer: "The player did not answer.",
    waiting: "Waiting for the player…",
    caller: "pages/players/[id].vue",
    callerUrl: "`/players/call/${this.player.steam_id}?ringing=1`",
  },
];

describe.each(PAGES)("admin popout: $label", (p) => {
  it("the caller still opens the separate popout window", () => {
    const caller = read(p.caller);
    expect(caller).toContain("window.open(");
    expect(caller).toContain(p.callerUrl);
  });

  it("waits for the answer, then shows the same Live Video style card on the QR code", async () => {
    const wrapper = await mountFile(p.file, { params: p.params, query: { ringing: "1" } });
    const panel = call(wrapper);
    expect(panel.attributes("data-mode")).toBe("popout");
    expect(panel.attributes("role")).toBeUndefined();
    expect(panel.attributes("data-step")).toBe("ringing");
    expect(panel.get('[data-testid="fixed-party-call-waiting"]').text()).toBe(p.waiting);
    // Compact waiting card: no duplicate status text, no QR or camera yet.
    expect(panel.text()).not.toContain("No active call");
    expect(panel.find('[data-testid="fixed-party-call-qr"]').exists()).toBe(false);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(callApi.join).not.toHaveBeenCalled();

    emitSocket(p.event, { ...p.otherAnswer, accepted: true });
    await flushPromises();
    expect(call(wrapper).attributes("data-step")).toBe("ringing");

    emitSocket(p.event, { ...p.answer, accepted: true });
    await flushPromises();
    expect(call(wrapper).attributes("data-step")).toBe("phone");
    expect(wrapper.get('[data-testid="fixed-party-call-qr"]').attributes("src")).toBe(
      `data:image/png;qr,${p.qrUrl}`,
    );
    // Popout keeps its own window: no inline close button, no extra window.
    expect(wrapper.find('[data-testid="fixed-party-call-close"]').exists()).toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("a decline keeps the popout open on a clear Call declined card until the admin closes it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrapper = await mountFile(p.file, { params: p.params, query: { ringing: "1" } });
    emitSocket(p.event, { ...p.answer, accepted: false });
    await flushPromises();

    const declined = wrapper.get('[data-testid="fixed-party-call-declined"]');
    expect(call(wrapper).attributes("data-step")).toBe("declined");
    expect(declined.text()).toContain("Call declined");
    expect(declined.text()).toContain(p.declined);
    expect(callApi.join).not.toHaveBeenCalled();

    // Nothing closes it by itself, even after the polling keeps running.
    await vi.advanceTimersByTimeAsync(15_000);
    await flushPromises();
    expect(closeSpy).not.toHaveBeenCalled();
    expect(call(wrapper).attributes("data-step")).toBe("declined");

    // Only the admin's own Close does.
    await wrapper.get('[data-testid="fixed-party-call-declined-close"]').trigger("click");
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("an unanswered ring shows No answer the same way", async () => {
    const wrapper = await mountFile(p.file, { params: p.params, query: { ringing: "1" } });
    emitSocket(p.event, { ...p.answer, accepted: false, timedOut: true });
    await flushPromises();
    const declined = wrapper.get('[data-testid="fixed-party-call-declined"]');
    expect(declined.text()).toContain("No answer");
    expect(declined.text()).toContain(p.noAnswer);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("an accept switches straight to the QR code, webcam secondary, no chooser, no extra window", async () => {
    const wrapper = await mountFile(p.file, { params: p.params, query: { ringing: "1" } });
    emitSocket(p.event, { ...p.answer, accepted: true });
    await flushPromises();
    const panel = call(wrapper);
    expect(panel.attributes("data-step")).toBe("phone");
    expect(panel.text()).toContain("Join this call with your phone");
    expect(panel.text()).not.toMatch(/Mobile/);
    expect(panel.text()).not.toContain("This computer");
    const webcam = wrapper.get('[data-testid="fixed-party-call-webcam"]');
    expect(webcam.element.parentElement?.textContent).toContain(
      "Prefer to use your computer's webcam?",
    );
    await webcam.trigger("click");
    await flushPromises();
    expect(call(wrapper).attributes("data-step")).toBe("preview");
    await wrapper.get('[data-testid="fixed-party-call-back-to-phone"]').trigger("click");
    expect(call(wrapper).attributes("data-step")).toBe("phone");
    expect(openSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it("closes its own popout window once the phone is live (unchanged)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrapper = await mountFile(p.file, { params: p.params });
    expect(call(wrapper).attributes("data-step")).toBe("phone");
    callApi.status.mockResolvedValue({ ready: true });
    await vi.advanceTimersByTimeAsync(3100);
    await flushPromises();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("webcam path in the popout still opens the existing preview", async () => {
    const wrapper = await mountFile(p.file, { params: p.params });
    await wrapper.get('[data-testid="fixed-party-call-webcam"]').trigger("click");
    await flushPromises();
    expect(call(wrapper).attributes("data-step")).toBe("preview");
    expect(getUserMedia).toHaveBeenCalled();
  });
});

describe("scope and design", () => {
  it("the called player's accept no longer opens a window", () => {
    for (const n of NOTIFIERS) {
      const src = read(n.file);
      expect(src).not.toContain("window.open");
      expect(src).not.toContain("_blank");
      expect(src).toContain("<FixedPartyCall");
      expect(src).toMatch(/\n\s+inline\n/);
    }
  });

  it("one shared call component for both calls, using Live Video's card language", () => {
    const comp = read("components/calls/FixedPartyCall.vue");
    expect(comp).not.toContain("window.open(");
    expect(comp).toContain("rounded-lg border bg-background p-4 text-foreground shadow-xl");
    expect(comp).toContain("mx-auto size-60 rounded bg-white p-2");
    expect(comp).toContain("mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive");
    // No made-up expiry claim: these call links have no 5 minute limit.
    expect(comp).not.toContain("expires in");
  });

  it("leaves the Chat Hub Live Video chooser unchanged", () => {
    const composer = read("components/chat/ChatVideoComposer.vue");
    expect(composer).not.toContain("FixedPartyCall");
    expect(composer).toContain('<strong class="block">This device</strong');
    expect(composer).toContain('<strong class="block">Use phone</strong');
    expect(composer).toContain("This link\n          expires in 5 minutes.");
    expect(read("components/webcam/WebcamCallRoom.vue")).not.toContain("FixedPartyCall");
  });
});
