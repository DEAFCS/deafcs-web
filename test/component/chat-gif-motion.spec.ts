import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import da from "../../i18n/locales/da_DK.json";
import ChatMessageMedia from "../../components/chat/ChatMessageMedia.vue";
import FadeImage from "../../components/media/FadeImage.vue";
import { normalizeChatMessage } from "../../utilities/chatMessageCompatibility";

// Frozen GIFs in the Chat Hub: a device that asks for less motion (iOS Reduce
// Motion, Windows "Animation effects" off / "best performance", Android
// "Remove animations") reports prefers-reduced-motion: reduce, and the Hub
// then shows GIFs still, as upstream does. Everyone else gets the animation.
const motion = ref("no-preference");
vi.mock("@vueuse/core", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  usePreferredReducedMotion: () => motion,
}));

const i18n = createI18n<Record<string, unknown>, "en">({
  legacy: false,
  locale: "en",
  messages: { en },
});
const t = (key: string, params?: Record<string, unknown>) =>
  i18n.global.t(key, params ?? {});
const mounted: Array<ReturnType<typeof shallowMount>> = [];

// What the picker sends today: GIPHY's original rendition URL.
const giphyUrl =
  "https://media2.giphy.com/media/v1.Y2lkPTc5/3o7aCSPqXE5C6T8tBC/giphy.gif?cid=1&rid=giphy.gif&ct=g";

beforeEach(() => {
  motion.value = "no-preference";
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "local.invalid" },
  }));
});
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

function media(message: Record<string, any>) {
  const wrapper = shallowMount(ChatMessageMedia, {
    props: { message: normalizeChatMessage(message) },
    global: { mocks: { $t: t } },
  });
  mounted.push(wrapper);
  return wrapper;
}

const fade = (wrapper: ReturnType<typeof media>) =>
  wrapper.getComponent(FadeImage).props() as { src: string; still: boolean };

describe("Chat Hub GIFs and reduced motion", () => {
  it("animates a sent GIPHY GIF for a player without a reduced-motion setting", () => {
    const wrapper = media({ message: "", gifUrl: giphyUrl });
    expect(fade(wrapper)).toMatchObject({ src: giphyUrl, still: false });
    expect(wrapper.find("[data-gif-play]").exists()).toBe(false);
  });

  it("animates an id-only GIF through GIPHY's animated webp", () => {
    const wrapper = media({ message: "", gif: { id: "3o7aCSPqXE5C6T8tBC", width: 480, height: 270 } });
    expect(fade(wrapper).src).toBe("https://i.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy.webp");
  });

  it("keeps the GIF still for reduced motion until the player taps play", async () => {
    motion.value = "reduce";
    const wrapper = media({ message: "", gifUrl: giphyUrl });
    expect(fade(wrapper).still).toBe(true);

    const play = wrapper.get("[data-gif-play]");
    expect(play.attributes("aria-label")).toBe("Play GIF");
    expect(play.attributes("aria-pressed")).toBe("false");

    await play.trigger("click");
    expect(fade(wrapper)).toMatchObject({ src: giphyUrl, still: false });
    expect(play.attributes("aria-label")).toBe("Pause GIF");
    expect(play.attributes("aria-pressed")).toBe("true");

    await play.trigger("click");
    expect(fade(wrapper).still).toBe(true);
  });

  it("an id-only GIF switches from GIPHY's still frame to the animation on play", async () => {
    motion.value = "reduce";
    const wrapper = media({ message: "", gif: { id: "3o7aCSPqXE5C6T8tBC", width: 480, height: 270 } });
    expect(fade(wrapper).src).toBe("https://i.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy_s.gif");
    await wrapper.get("[data-gif-play]").trigger("click");
    expect(fade(wrapper).src).toBe("https://i.giphy.com/media/3o7aCSPqXE5C6T8tBC/giphy.webp");
  });

  it("each GIF plays on its own; nothing else starts moving", async () => {
    motion.value = "reduce";
    const first = media({ message: "", gifUrl: giphyUrl });
    const second = media({ message: "", gifUrl: giphyUrl });
    await first.get("[data-gif-play]").trigger("click");
    expect(fade(first).still).toBe(false);
    expect(fade(second).still).toBe(true);
  });

  it("image attachments keep upstream's reduced-motion behaviour", () => {
    motion.value = "reduce";
    const wrapper = media({
      message: "",
      attachments: [{ id: "a1", kind: "image", name: "x.gif", mime_type: "image/gif", width: 10, height: 10 }],
    });
    expect(fade(wrapper).still).toBe(true);
    expect(wrapper.find("[data-gif-play]").exists()).toBe(false);
  });

  it("has English and Danish labels", () => {
    expect(en.chat.gifs).toMatchObject({ play: "Play GIF", pause: "Pause GIF" });
    expect((da as any).chat.gifs.play).toBeTruthy();
    expect((da as any).chat.gifs.pause).toBeTruthy();
  });
});
