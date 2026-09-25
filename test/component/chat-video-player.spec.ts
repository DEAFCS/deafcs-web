import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ChatVideoPlayer from "../../components/chat/ChatVideoPlayer.vue";

const wrappers: ReturnType<typeof mount>[] = [];

function mountPlayer() {
  const wrapper = mount(ChatVideoPlayer, {
    props: { src: "https://api.deafcs.net/matches/chat-video/media/media-1" },
  });
  wrappers.push(wrapper);
  return wrapper;
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

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Short Video chat player", () => {
  it("is muted, inline, and has no native or audio controls", () => {
    const wrapper = mountPlayer();
    const video = wrapper.find("video");

    expect(video.exists()).toBe(true);
    expect(video.attributes()).not.toHaveProperty("controls");
    expect(video.attributes()).toHaveProperty("muted");
    expect(video.attributes()).toHaveProperty("playsinline");
    expect(video.attributes()).toHaveProperty(
      "controlslist",
      "nodownload noplaybackrate noremoteplayback",
    );
    expect(video.attributes()).toHaveProperty("disablepictureinpicture");
    expect(video.attributes()).toHaveProperty("disableremoteplayback");
    expect(video.attributes()).not.toHaveProperty("autoplay");
    expect(video.attributes()).toHaveProperty("preload", "auto");
    expect(video.attributes("src")).toBe(
      "https://api.deafcs.net/matches/chat-video/media/media-1#t=0.001",
    );
    expect(video.attributes("src")?.split("#")[0]).toBe(
      "https://api.deafcs.net/matches/chat-video/media/media-1",
    );
    expect((video.element as HTMLVideoElement).muted).toBe(true);
    expect((video.element as HTMLVideoElement).defaultMuted).toBe(true);
    expect((video.element as HTMLVideoElement).controls).toBe(false);
    expect(wrapper.find("audio").exists()).toBe(false);

    const labels = wrapper
      .findAll("button")
      .map((button) => button.attributes("aria-label"));
    expect(labels).toEqual(["Play video", "Enter fullscreen"]);
    expect(wrapper.text()).not.toMatch(/volume|mute|download|picture.in.picture/i);
    expect(wrapper.text()).not.toMatch(/speed|three.dot/i);
  });

  it("seeks to and pauses on a real initial frame without starting playback", async () => {
    const wrapper = mountPlayer();
    const video = wrapper.find("video").element as HTMLVideoElement;
    const frame = mockDecodedFrame(video);

    await wrapper.find("video").trigger("loadeddata");

    expect(frame.getCurrentTime()).toBe(0.1);
    expect(frame.pause).toHaveBeenCalled();
    expect(wrapper.find('button[aria-label="Play video"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Pause video"]').exists()).toBe(false);
    expect(video.muted).toBe(true);
  });

  it("shows its only two controls on pointer interaction", async () => {
    const wrapper = mountPlayer();
    const controls = wrapper.find('[aria-label="Video controls"]');

    expect(controls.classes()).toContain("opacity-0");
    expect(controls.classes()).not.toContain("opacity-100");

    await wrapper.trigger("pointermove");

    expect(controls.classes()).toContain("opacity-100");
    expect(
      wrapper.findAll("button").map((button) => button.attributes("aria-label")),
    ).toEqual(["Play video", "Enter fullscreen"]);
  });

  it("keeps controls visible briefly after a touch ends", async () => {
    const wrapper = mountPlayer();
    const controls = wrapper.find('[aria-label="Video controls"]');

    await wrapper.trigger("pointerdown", { pointerType: "touch" });
    await wrapper.trigger("pointerleave", { pointerType: "touch" });

    expect(controls.classes()).toContain("opacity-100");
  });

  it("toggles custom Play and Pause buttons", async () => {
    const wrapper = mountPlayer();
    const video = wrapper.find("video").element as HTMLVideoElement;
    let paused = true;
    Object.defineProperty(video, "paused", {
      configurable: true,
      get: () => paused,
    });
    Object.defineProperty(video, "ended", {
      configurable: true,
      get: () => false,
    });
    const play = vi.fn(async () => {
      paused = false;
    });
    const pause = vi.fn(() => {
      paused = true;
    });
    Object.defineProperty(video, "play", { configurable: true, value: play });
    Object.defineProperty(video, "pause", {
      configurable: true,
      value: pause,
    });

    await wrapper.find('button[aria-label="Play video"]').trigger("click");
    await flushPromises();
    expect(play).toHaveBeenCalledOnce();
    expect(wrapper.find('button[aria-label="Pause video"]').exists()).toBe(true);

    await wrapper.find('button[aria-label="Pause video"]').trigger("click");
    expect(pause).toHaveBeenCalledOnce();
    expect(wrapper.find('button[aria-label="Play video"]').exists()).toBe(true);
  });

  it("has a working custom fullscreen button", async () => {
    const wrapper = mountPlayer();
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(wrapper.element, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });

    await wrapper
      .find('button[aria-label="Enter fullscreen"]')
      .trigger("click");

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });
});
