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
const originalNavigatorDeviceProperties = [
  "userAgent",
  "platform",
  "maxTouchPoints",
].map((name) => [name, Object.getOwnPropertyDescriptor(navigator, name)] as const);

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

function setNavigatorDevice(
  userAgent: string,
  platform: string,
  maxTouchPoints = 0,
) {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(navigator, "maxTouchPoints", {
    configurable: true,
    value: maxTouchPoints,
  });
}

function mockDecodedFrame(video: HTMLVideoElement) {
  let currentTime = 0;
  Object.defineProperty(video, "readyState", {
    configurable: true,
    value: HTMLMediaElement.HAVE_CURRENT_DATA,
  });
  Object.defineProperty(video, "duration", {
    configurable: true,
    value: 1,
  });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (time: number) => {
      currentTime = time;
      video.dispatchEvent(new Event("seeked"));
    },
  });
  const pause = vi.fn();
  Object.defineProperty(video, "pause", {
    configurable: true,
    value: pause,
  });
  return { pause, getCurrentTime: () => currentTime };
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
  for (const [name, descriptor] of originalNavigatorDeviceProperties) {
    if (descriptor) Object.defineProperty(navigator, name, descriptor);
    else Reflect.deleteProperty(navigator, name);
  }
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

describe("Short Video device chooser", () => {
  it("offers phone QR on desktop", async () => {
    setNavigatorDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32");

    const wrapper = mountComposer();
    await wrapper
      .find('[title="Record a sign-language video message"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("This device");
    expect(wrapper.text()).toContain("Use phone");
  });

  it.each([
    [
      "iPhone browser and PWA",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "iPhone",
      0,
    ],
    ["Android phone", "Mozilla/5.0 (Linux; Android 15)", "Linux armv8l", 0],
    [
      "iPadOS desktop user agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      "MacIntel",
      5,
    ],
  ])(
    "hides phone QR on %s",
    async (_name, userAgent, platform, maxTouchPoints) => {
      setNavigatorDevice(userAgent, platform, maxTouchPoints);

      const wrapper = mountComposer();
      await wrapper
        .find('[title="Record a sign-language video message"]')
        .trigger("click");
      await flushPromises();

      expect(wrapper.text()).toContain("This device");
      expect(wrapper.text()).not.toContain("Use phone");
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    },
  );
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

  it("primes the mobile composer preview and retakes with the device camera", async () => {
    vi.useFakeTimers();
    setNavigatorDevice(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      "iPhone",
    );
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
    expect(wrapper.text()).not.toContain("Use phone");
    expect(wrapper.text()).not.toContain("Flip camera");

    await clickButton(wrapper, "Start recording");
    await vi.advanceTimersByTimeAsync(3_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await clickButton(wrapper, "Stop");
    expect(wrapper.text()).toContain("Preview your video before sending");

    const recordedPreview = wrapper.find("video");
    const recordedVideo = recordedPreview.element as HTMLVideoElement;
    const frame = mockDecodedFrame(recordedVideo);
    Object.defineProperty(recordedVideo, "paused", {
      configurable: true,
      value: true,
    });
    const play = vi.fn();
    Object.defineProperty(recordedVideo, "play", {
      configurable: true,
      value: play,
    });
    expect(recordedPreview.attributes("src")).toBe(
      "blob:chat-video-preview#t=0.001",
    );
    expect(recordedPreview.attributes("preload")).toBe("auto");
    expect(recordedPreview.attributes("muted")).toBeDefined();
    expect(recordedPreview.attributes("playsinline")).toBeDefined();
    expect(recordedPreview.attributes("autoplay")).toBeUndefined();
    await recordedPreview.trigger("loadeddata");
    expect(frame.getCurrentTime()).toBe(0.1);
    expect(frame.pause).toHaveBeenCalled();
    expect(recordedVideo.paused).toBe(true);
    expect(play).not.toHaveBeenCalled();

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
    expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith(
      "blob:chat-video-preview",
    );
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
    expect(wrapper.text()).not.toContain("Flip camera");
    await clickButton(wrapper, "Start recording");
    const countdownButton = wrapper
      .findAll("button")
      .find((button) => button.text().includes("Start recording"));
    expect(countdownButton?.attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("3");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wrapper.text()).toContain("Stop recording · 60s");
    expect(wrapper.text()).not.toContain("seconds left");
    expect(
      wrapper.findAll("button").filter((button) => /stop/i.test(button.text())),
    ).toHaveLength(1);
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
    expect(wrapper.text()).toContain("Flip camera");
    await clickButton(wrapper, "Start recording");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(wrapper.text()).toContain("Stop · 60s");
    await clickButton(wrapper, "Stop");
    expect(wrapper.text()).toContain("Preview your video");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const preview = wrapper.find("video");
    const frame = mockDecodedFrame(preview.element as HTMLVideoElement);
    expect(preview.attributes("preload")).toBe("auto");
    expect(preview.attributes("muted")).toBeDefined();
    expect(preview.attributes("playsinline")).toBeDefined();
    expect(preview.attributes("src")).toBe("blob:chat-video-preview#t=0.001");
    await preview.trigger("loadeddata");
    expect(frame.getCurrentTime()).toBe(0.1);
    expect(frame.pause).toHaveBeenCalled();

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
