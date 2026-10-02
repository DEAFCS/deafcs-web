import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { onMounted, ref, watch } from "vue";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ChatComposerMenu from "../../components/chat/ChatComposerMenu.vue";
import ChatInput from "../../components/chat/ChatInput.vue";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/utilities/searchGifs", () => ({
  searchGifs: vi.fn().mockResolvedValue([]),
}));
const original = ["userAgent", "platform", "maxTouchPoints"].map(
  (key) => [key, Object.getOwnPropertyDescriptor(navigator, key)] as const,
);
beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, descriptor] of original) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});
function menu(
  userAgent: string,
  platform: string,
  touch: number,
  enabled = true,
) {
  for (const [key, value] of Object.entries({
    userAgent,
    platform,
    maxTouchPoints: touch,
  }))
    Object.defineProperty(navigator, key, { configurable: true, value });
  return mount(ChatComposerMenu, {
    props: { liveVideoEnabled: enabled },
    global: {
      mocks: { $t: (_key: string, fallback: string) => fallback },
      stubs: {
        Popover: { template: "<div><slot /></div>" },
        PopoverContent: { template: "<div><slot /></div>" },
        PopoverTrigger: { template: "<div><slot /></div>" },
      },
    },
  });
}
describe("current (+) menu Live video device rules", () => {
  it.each([
    ["Windows", "Mozilla Windows NT 10.0", "Win32", 0, true],
    ["macOS", "Mozilla Macintosh", "MacIntel", 0, true],
    ["Linux", "Mozilla Linux x86_64", "Linux x86_64", 0, true],
    ["Android", "Mozilla Android 15", "Linux armv8l", 5, true],
    ["iPhone", "Mozilla iPhone", "iPhone", 0, false],
    ["iPad", "Mozilla iPad", "iPad", 5, false],
    ["iPod", "Mozilla iPod", "iPod", 0, false],
    ["iPadOS desktop UA", "Mozilla Macintosh", "MacIntel", 5, false],
  ])(
    "%s preserves attachment/GIF and gates only Live video",
    async (_label, ua, platform, touch, visible) => {
      const wrapper = menu(ua, platform, touch);
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain("Attach a file (up to 200 MB)");
      expect(wrapper.text()).toContain("Choose a GIF");
      expect(wrapper.text().includes("Live video")).toBe(visible);
      expect(
        wrapper.find('input[type="file"]').attributes(),
      ).not.toHaveProperty("capture");
      if (visible) {
        await wrapper
          .findAll("button")
          .find((button) => button.text() === "Live video")!
          .trigger("click");
        expect(wrapper.emitted("live-video")).toHaveLength(1);
      }
      wrapper.unmount();
    },
  );
  it.each([
    "global",
    "tournament",
    "direct",
    "team",
    "draft",
    "matchmaking",
    "organizers",
    "captain_pick_team",
  ])("allows Live video in current media-capable %s rooms", (type) => {
    expect(
      (ChatInput as any).computed.liveVideoEnabled.call({
        attachmentEnabled: true,
        roomId: "room",
        chatType: type,
      }),
    ).toBe(true);
  });
  it.each(["match", "match_team", "announcement"])(
    "blocks Live video in %s",
    (type) => {
      expect(
        (ChatInput as any).computed.liveVideoEnabled.call({
          attachmentEnabled: true,
          roomId: "room",
          chatType: type,
        }),
      ).toBe(false);
    },
  );
  it("uses the recorder independently without clearing the typed draft", () => {
    const recorder = { openRecorder: vi.fn() },
      draft = { values: { message: "typed text" }, resetForm: vi.fn() };
    (ChatInput as any).methods.openLiveVideo.call({
      liveVideoEnabled: true,
      isWebsiteRestricted: false,
      $refs: { liveVideoRecorder: recorder },
      form: draft,
    });
    expect(recorder.openRecorder).toHaveBeenCalledOnce();
    expect(draft.values.message).toBe("typed text");
    expect(draft.resetForm).not.toHaveBeenCalled();
    (ChatInput as any).methods.openLiveVideo.call({
      liveVideoEnabled: true,
      isWebsiteRestricted: true,
      $refs: { liveVideoRecorder: recorder },
    });
    expect(recorder.openRecorder).toHaveBeenCalledOnce();
  });
  it("preserves current generic attachment validation and upload utilities byte for byte", () => {
    for (const p of [
      "utilities/chatAttachmentValidation.ts",
      "utilities/uploadChatAttachment.ts",
    ]) {
      expect(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n")).toBe(
        execFileSync("git", ["show", `HEAD:${p}`], {
          encoding: "utf8",
        }).replace(/\r\n/g, "\n"),
      );
    }
  });
});
