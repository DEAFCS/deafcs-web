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

function mountComposer() {
  const wrapper = mount(ChatVideoComposer, {
    props: { type: "Global", roomId: "global", modelValue: null },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function mountPhonePage() {
  const wrapper = mount(PhoneVideoPage);
  wrappers.push(wrapper);
  return wrapper;
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
      json: async () => ({ expiresAt: new Date().toISOString() }),
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
    ["NotAllowedError", "Camera access was denied"],
    ["NotFoundError", "No camera is available on this device"],
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

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "pc-draft", token: "pc-capability" }),
      } as Response)
      .mockResolvedValueOnce({ ok: false, status: 400 } as Response);

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

    await clickButton(wrapper, "Use Video");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.deafcs.net/matches/chat-video/sessions/pc-draft/upload",
    );
    expect(wrapper.text()).toContain(
      "Upload failed. Please try again or retake the video.",
    );
    expect(wrapper.text()).toContain("Retake");
    expect(wrapper.text()).toContain("Use Video");
    expect(
      wrapper.find('img[alt="Temporary phone recording QR code"]').exists(),
    ).toBe(false);

    await clickButton(wrapper, "Retake");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Start recording");
    expect(
      wrapper.find('img[alt="Temporary phone recording QR code"]').exists(),
    ).toBe(false);
  });
});
