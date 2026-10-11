import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { nextTick, ref } from "vue";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import ChatMessageMedia from "../../components/chat/ChatMessageMedia.vue";
import FadeImage from "../../components/media/FadeImage.vue";
import ChatVideoPlayer from "../../components/chat/ChatVideoPlayer.vue";
import { chatMediaLabel } from "../../utilities/chatAttachments";
import { normalizeChatMessage } from "../../utilities/chatMessageCompatibility";

const motion = ref("reduce");
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

beforeEach(() => {
  motion.value = "reduce";
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

describe("upstream attachment translations", () => {
  it("includes the exact upstream English attachment labels", () => {
    expect(en.chat.attachments).toMatchObject({
      label: "Attachment",
      label_count: "{count} attachments",
      unavailable: "No longer available",
    });
  });

  it("labels video-only deletion previews and attachment counts without raw keys", () => {
    expect(chatMediaLabel({ message: "", media: { type: "video" } }, t)).toBe(
      "Attachment",
    );
    expect(chatMediaLabel({ attachments: [{}, {}] } as any, t)).toBe(
      "2 attachments",
    );
  });

  it("uses the translated unavailable label when an image fails", async () => {
    const wrapper = shallowMount(FadeImage, {
      props: { src: "https://local.invalid/missing.gif" },
      global: {
        mocks: { $t: t },
        stubs: { FadeSwap: { template: "<div><slot /></div>" } },
      },
    });
    mounted.push(wrapper);
    await wrapper.get("img").trigger("error");
    expect(wrapper.find('[aria-label="No longer available"]').exists()).toBe(
      true,
    );
  });
});

describe("legacy GIF reduced motion", () => {
  it("keeps the legacy URL and freezes it through upstream FadeImage", async () => {
    const url = "https://media.giphy.com/media/legacy/giphy.gif";
    const wrapper = media({ gifUrl: url });
    const image = wrapper.getComponent(FadeImage);
    expect(image.props("src")).toBe(url);
    expect(image.props("still")).toBe(true);

    motion.value = "no-preference";
    await nextTick();
    expect(image.props("src")).toBe(url);
    expect(image.props("still")).toBe(false);
  });

  it("retains upstream still-rendition URLs for canonical GIF IDs", () => {
    const wrapper = media({ gif: { id: "abc123", width: 200, height: 100 } });
    const image = wrapper.getComponent(FadeImage);
    expect(image.props("src")).toBe(
      "https://i.giphy.com/media/abc123/giphy_s.gif",
    );
    expect(image.props("still")).toBe(false);
  });

  it("renders no GIF or private video for blocked messages", () => {
    const wrapper = media({
      blocked: true,
      gifUrl: "https://media.giphy.com/media/legacy/giphy.gif",
      media: { id: "private-video", type: "video" },
    });
    expect(wrapper.findComponent(FadeImage).exists()).toBe(false);
    expect(wrapper.findComponent(ChatVideoPlayer).exists()).toBe(false);
  });

  it("preserves the authorized private player for video-only messages", () => {
    const wrapper = media({
      message: "",
      media: { id: "synthetic-video", type: "video" },
    });
    expect(wrapper.getComponent(ChatVideoPlayer).props("src")).toBe(
      "https://local.invalid/matches/chat-video/media/synthetic-video",
    );
    expect(wrapper.findComponent(FadeImage).exists()).toBe(false);
  });
});
