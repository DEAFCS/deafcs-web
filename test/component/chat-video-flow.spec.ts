import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
} from "vue";
import QRCode from "qrcode";
import ChatVideoComposer from "../../components/chat/ChatVideoComposer.vue";
import PhoneVideoPage from "../../pages/chat-video.vue";

vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn() } }));

const wrappers: ReturnType<typeof mount>[] = [];
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalMediaPlay = HTMLMediaElement.prototype.play;
const originalSrcObject = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "srcObject",
);

function mountComposer() {
  const wrapper = mount(ChatVideoComposer, {
    props: { type: "Global", roomId: "global" },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function mountPhonePage() {
  const wrapper = mount(PhoneVideoPage);
  wrappers.push(wrapper);
  return wrapper;
}

function stubRecorder() {
  class FakeMediaRecorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    mimeType = "video/webm;codecs=vp9";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() {
      this.state = "recording";
      this.ondataavailable?.({
        data: new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
          type: this.mimeType,
        }),
      });
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  }
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
}

async function clickButton(wrapper: ReturnType<typeof mount>, label: string) {
  const button = wrapper
    .findAll("button")
    .find((candidate) => candidate.text().includes(label));
  expect(button, `button containing '${label}' should exist`).toBeDefined();
  await button!.trigger("click");
  await flushPromises();
}

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("shallowRef", shallowRef);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.deafcs.net" },
  }));
  vi.stubGlobal("definePageMeta", vi.fn());
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:chat-video-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
    configurable: true,
    get() {
      return (this as any).__srcObject;
    },
    set(value) {
      (this as any).__srcObject = value;
    },
  });
  vi.mocked(QRCode.toDataURL).mockResolvedValue("data:image/png;base64,qr");
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: originalCreateObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: originalRevokeObjectURL,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: originalMediaPlay,
  });
  if (originalSrcObject)
    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", originalSrcObject);
  else delete (HTMLMediaElement.prototype as any).srcObject;
});

describe("Short Video anonymous phone recorder", () => {
  it("preserves the QR capability in /chat-video#TOKEN and explicitly creates a phone session", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "draft-1", token: "temporary-capability" }),
    } as Response);

    const wrapper = mountComposer();
    await wrapper
      .find('[title="Record a sign-language video message"]')
      .trigger("click");
    await clickButton(wrapper, "Use phone");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.deafcs.net/matches/chat-video/sessions",
    );
    expect(vi.mocked(QRCode.toDataURL)).toHaveBeenCalledWith(
      `${window.location.origin}/chat-video#temporary-capability`,
      { width: 240, margin: 1 },
    );
    expect(
      wrapper.find('img[alt="Temporary phone recording QR code"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain("No DEAFCS login is needed");
  });

  it("keeps the URL fragment as a bearer capability and gives an invalid/expired token no recorder actions", async () => {
    window.location.hash = "#expired-capability";
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response);

    const wrapper = mountPhonePage();
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.deafcs.net/matches/chat-video/phone",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer expired-capability" },
    });
    expect(wrapper.text()).toContain(
      "This link has expired or was already used",
    );
    expect(wrapper.text()).not.toContain("Open camera");
    expect(wrapper.text()).not.toContain("Cancel session");
  });

  it("validates a valid capability without signing the phone into the PC account", async () => {
    window.location.hash = "#valid-capability";
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ state: "recording", expiresAt: new Date().toISOString() }),
    } as Response);

    const wrapper = mountPhonePage();
    await flushPromises();

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer valid-capability" },
    });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("credentials");
    expect(wrapper.text()).toContain("Open camera");
    expect(wrapper.text()).not.toContain("DEAFCS account");
  });
});

describe("Short Video PC camera flow", () => {
  it.each([
    [
      "NotAllowedError",
      "Camera access was blocked. Allow camera permission in your browser and try again.",
    ],
    [
      "SecurityError",
      "Camera access was blocked. Allow camera permission in your browser and try again.",
    ],
    [
      "NotReadableError",
      "Camera is unavailable or being used by another app. Close the other app and try again, or use your phone.",
    ],
    [
      "TrackStartError",
      "Camera is unavailable or being used by another app. Close the other app and try again, or use your phone.",
    ],
    [
      "AbortError",
      "Camera is unavailable or being used by another app. Close the other app and try again, or use your phone.",
    ],
    [
      "NotFoundError",
      "No webcam was found on this device. You can use your phone instead.",
    ],
    [
      "DevicesNotFoundError",
      "No webcam was found on this device. You can use your phone instead.",
    ],
    [
      "UnknownError",
      "Could not start your camera. Try again or use your phone.",
    ],
  ])("does not switch to phone mode after a %s", async (name, message) => {
    const failure = Object.assign(new Error("camera unavailable"), { name });
    const getUserMedia = vi.fn().mockRejectedValue(failure);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const wrapper = mountComposer();
    await wrapper
      .find('[title="Record a sign-language video message"]')
      .trigger("click");
    await clickButton(wrapper, "This device");

    expect(wrapper.text()).toContain(message);
    expect(
      wrapper.find('img[alt="Temporary phone recording QR code"]').exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain("Use phone");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("keeps an upload failure on the recorded PC preview and retakes with the PC camera", async () => {
    vi.useFakeTimers();
    const track = { stop: vi.fn() };
    const stream = { getTracks: () => [track] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    stubRecorder();

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "pc-draft", token: "pc-capability" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: "recording" }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 400 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: "recording" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: "recording" }),
      } as Response);

    const wrapper = mountComposer();
    await wrapper
      .find('[title="Record a sign-language video message"]')
      .trigger("click");
    await clickButton(wrapper, "This device");
    expect(fetchMock).not.toHaveBeenCalled();

    await clickButton(wrapper, "Start recording");
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await clickButton(wrapper, "Stop");
    expect(wrapper.text()).toContain("Preview your video before sending");

    await clickButton(wrapper, "Send Video");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[2][0]).toBe(
      "https://api.deafcs.net/matches/chat-video/sessions/pc-draft/upload",
    );
    expect(wrapper.text()).toContain(
      "Video upload failed. Retry Send Video or retake the video.",
    );
    expect(wrapper.text()).toContain("Retake");
    expect(wrapper.text()).toContain("Retry Send Video");
    expect(
      wrapper.find('img[alt="Temporary phone recording QR code"]').exists(),
    ).toBe(false);

    await clickButton(wrapper, "Retake");
    expect(fetchMock.mock.calls[4][0]).toBe(
      "https://api.deafcs.net/matches/chat-video/sessions/pc-draft/retake",
    );
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Start recording");
    expect(
      wrapper.find('img[alt="Temporary phone recording QR code"]').exists(),
    ).toBe(false);
  });

  it("records with a 3-2-1 countdown, auto-stops at 60 seconds, and sends directly to chat", async () => {
    vi.useFakeTimers();
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    stubRecorder();

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "pc-send", token: "pc-token" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: "recording" }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    const wrapper = mountComposer();
    await wrapper
      .find('[title="Record a sign-language video message"]')
      .trigger("click");
    await clickButton(wrapper, "This device");
    await clickButton(wrapper, "Start recording");
    expect(wrapper.text()).toContain("3");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wrapper.text()).toContain("60 seconds left");
    expect(wrapper.text()).toContain("Stop");
    await vi.advanceTimersByTimeAsync(60_000);
    await flushPromises();
    expect(wrapper.text()).toContain("Preview your video before sending");

    await clickButton(wrapper, "Send Video");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.deafcs.net/matches/chat-video/sessions",
      "https://api.deafcs.net/matches/chat-video/sessions/pc-send",
      "https://api.deafcs.net/matches/chat-video/sessions/pc-send/upload",
      "https://api.deafcs.net/matches/chat-video/sessions/pc-send/send",
    ]);
    expect(wrapper.find('[title="Record a sign-language video message"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Video ready");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.find("video").exists()).toBe(false);
  });
});

describe("Short Video phone send flow", () => {
  it("uploads only after preview, then sends and shows the exact success copy", async () => {
    vi.useFakeTimers();
    window.location.hash = "#phone-capability";
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) },
    });
    stubRecorder();
    class FakeXMLHttpRequest {
      upload: Record<string, unknown> = {};
      status = 200;
      onload?: () => void;
      onerror?: () => void;
      open = vi.fn();
      setRequestHeader = vi.fn();
      send = vi.fn(() => this.onload?.());
    }
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ state: "recording" }),
      } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    const wrapper = mountPhonePage();
    await flushPromises();
    await clickButton(wrapper, "Open camera");
    await clickButton(wrapper, "Start recording");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wrapper.text()).toContain("Stop · 60s");
    await clickButton(wrapper, "Stop");
    expect(wrapper.text()).toContain("Preview your video");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await clickButton(wrapper, "Send Video");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.deafcs.net/matches/chat-video/phone/send",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: { Authorization: "Bearer phone-capability" },
    });
    expect(wrapper.text()).toContain("Video sent");
    expect(wrapper.text()).toContain("You can return to your PC.");
  });
});
