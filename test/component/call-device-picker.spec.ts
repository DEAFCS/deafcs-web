import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";

// Phone-first device picker for the verification call and the admin call
// started from a player profile. Phone is the dominant action, "use this
// computer" is a small secondary link into the existing webcam preview
// flow, and the Chat Hub Live Video chooser is untouched.

vi.mock("~/web-sockets/Socket", () => ({
  default: { listen: () => ({ stop: () => {} }) },
}));
vi.mock("~/components/match/WhepPlayer.vue", () => ({
  default: defineComponent({ setup: () => () => h("div", { class: "whep" }) }),
}));
vi.mock("qrcode", () => ({
  default: { toDataURL: vi.fn(async (url: string) => `data:image/png;qr,${url}`) },
}));

const callApi = {
  join: vi.fn(async () => ({ token: "tok-1", participants: [] as any[] })),
  participants: vi.fn(async () => [] as any[]),
  status: vi.fn(async () => ({ ready: false })),
};

vi.mock("~/composables/useVerificationCallApi", () => ({
  joinVerificationCall: () => callApi.join(),
  fetchVerificationCallParticipants: () => callApi.participants(),
  fetchVerificationCallStatus: () => callApi.status(),
  verificationCallJoinUrl: (id: string, token: string) =>
    `https://web.test/verification-call/${id}/${token}`,
  verificationCallPeerWhepUrl: () => "whep",
  verificationCallPlayerWhipUrl: () => "whip",
  verificationCallPlayerStatusUrl: () => "status",
  verificationCallPlayerHangupUrl: () => "hangup",
}));
vi.mock("~/composables/useAdminCallApi", () => ({
  joinAdminCall: () => callApi.join(),
  fetchAdminCallParticipants: () => callApi.participants(),
  fetchAdminCallStatus: () => callApi.status(),
  adminCallJoinUrl: (id: string, token: string) => `https://web.test/admin-call/${id}/${token}`,
  adminCallPeerWhepUrl: () => "whep",
  adminCallPlayerWhipUrl: () => "whip",
  adminCallPlayerStatusUrl: () => "status",
  adminCallPlayerHangupUrl: () => "hangup",
}));

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const PAGES = [
  {
    label: "verification call",
    file: "pages/verification-applications/call/[applicationId].vue",
    params: { applicationId: "app-1" },
    qrUrl: "https://web.test/verification-call/app-1/tok-1",
  },
  {
    label: "admin profile call",
    file: "pages/players/call/[targetSteamId].vue",
    params: { targetSteamId: "76561190000000002" },
    qrUrl: "https://web.test/admin-call/76561190000000002/tok-1",
  },
];

// First mount compiles the full page SFC.
vi.setConfig({ testTimeout: 30_000 });

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  callApi.join.mockClear();
  vi.stubGlobal("definePageMeta", () => {});
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: "76561190000000001" } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  const fakeStream = {
    getTracks: () => [],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: "cam-1" }) }],
  };
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
  getUserMedia = vi.fn(async () => fakeStream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: async () => [{ kind: "videoinput", deviceId: "cam-1", label: "Webcam" }],
    },
  });
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130",
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mountPage(file: string, params: Record<string, string>) {
  vi.stubGlobal("useRoute", () => ({ params, query: {} }));
  const mod = await import(/* @vite-ignore */ path.resolve(__dirname, "../..", file));
  const wrapper = mount(mod.default, {
    global: {
      mocks: { $t: (_key: string, fallback?: string) => fallback ?? _key },
    },
  });
  await flushPromises();
  return wrapper;
}

describe.each(PAGES)("$label device picker", ({ file, params, qrUrl }) => {
  it("opens the compact picker with phone as the primary action", async () => {
    const wrapper = await mountPage(file, params);
    const picker = wrapper.get('[data-testid="call-device-picker"]');
    expect(picker.attributes("data-mode")).toBe("choose");

    const phone = picker.get('[data-testid="call-device-phone"]');
    expect(phone.text()).toContain("Use phone");
    expect(phone.text()).toContain("Scan a QR code and continue on your phone");
    // Visually dominant: the amber-bordered card, placed before the PC link.
    expect(phone.classes().join(" ")).toContain("tac-amber");
    const html = picker.html();
    expect(html.indexOf("call-device-phone")).toBeLessThan(html.indexOf("call-device-computer"));

    // No duplicated "No active call" text, no two equal device boxes.
    expect(wrapper.text()).not.toContain("No active call");
    expect(wrapper.text()).not.toContain("This computer\n");
    expect(picker.findAll("button.flex-col")).toHaveLength(0);
  });

  it("keeps PC available as a small secondary link into the existing webcam flow", async () => {
    const wrapper = await mountPage(file, params);
    const pc = wrapper.get('[data-testid="call-device-computer"]');
    expect(pc.text()).toBe("Use this computer instead");
    expect(pc.element.parentElement?.textContent).toContain("Prefer to use your webcam?");
    expect(pc.classes()).toContain("text-[hsl(var(--tac-amber))]");

    await pc.trigger("click");
    await flushPromises();
    // Existing preview: default camera, then the exact selected deviceId.
    expect(getUserMedia).toHaveBeenCalled();
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ audio: false });
    expect(wrapper.find('[data-testid="call-device-picker"]').exists()).toBe(false);
    // Existing webcam preview step (camera select + Join call).
    expect(wrapper.find("video").exists()).toBe(true);
    expect(wrapper.text()).toContain("Join call");
  });

  it("preserves the phone/QR flow and its back navigation", async () => {
    const wrapper = await mountPage(file, params);
    await wrapper.get('[data-testid="call-device-phone"]').trigger("click");
    await flushPromises();

    const picker = wrapper.get('[data-testid="call-device-picker"]');
    expect(picker.attributes("data-mode")).toBe("mobile");
    const img = picker.get('[data-testid="call-device-qr"] img');
    expect(img.attributes("src")).toBe(`data:image/png;qr,${qrUrl}`);
    expect(getUserMedia).not.toHaveBeenCalled();
    // The webcam path stays reachable from the QR step too.
    expect(picker.find('[data-testid="call-device-computer"]').exists()).toBe(true);

    await picker.get('[data-testid="call-device-back"]').trigger("click");
    expect(wrapper.get('[data-testid="call-device-picker"]').attributes("data-mode")).toBe(
      "choose",
    );
    await wrapper.get('[data-testid="call-device-back"]').trigger("click");
    expect(wrapper.find('[data-testid="call-device-picker"]').exists()).toBe(false);
    expect(callApi.join).toHaveBeenCalledTimes(1);
  });

  it("still skips the picker on a phone and uses this device's camera", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148",
    );
    const wrapper = await mountPage(file, params);
    expect(wrapper.find('[data-testid="call-device-picker"]').exists()).toBe(false);
    // Existing preview: default camera, then the exact selected deviceId.
    expect(getUserMedia).toHaveBeenCalled();
  });
});

describe("scope: only the verification and admin profile calls use the picker", () => {
  it("is used by exactly those two pages", () => {
    for (const { file } of PAGES) {
      expect(read(file)).toContain("<CallDevicePicker");
      expect(read(file)).not.toMatch(/<span class="text-xs font-medium">Mobile<\/span>/);
    }
  });

  it("leaves the Chat Hub Live Video chooser unchanged", () => {
    const composer = read("components/chat/ChatVideoComposer.vue");
    expect(composer).not.toContain("CallDevicePicker");
    expect(composer).toContain('<strong class="block">This device</strong');
    expect(composer).toContain('<strong class="block">Use phone</strong');
    expect(composer).toContain("<small>Scan a temporary QR code</small>");
    expect(read("components/webcam/WebcamCallRoom.vue")).not.toContain("CallDevicePicker");
  });
});
