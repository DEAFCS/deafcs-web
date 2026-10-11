import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import ChatMessage from "../../components/chat/ChatMessage.vue";
import ChatMessageActions from "../../components/chat/ChatMessageActions.vue";
const message = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  from: { steam_id: "2", name: "Other" },
  message: "long wrapped message ending 😀",
  timestamp: "2026-09-24T12:00:00Z",
};
beforeEach(() => {
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: "1" } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => vi.unstubAllGlobals());
const show = (props = {}) =>
  shallowMount(ChatMessage, {
    props: {
      message,
      room: { type: "global", id: "global" },
      canPost: true,
      reactionsEnabled: true,
      ...props,
    },
    global: { mocks: { $t: (key: string) => key } },
  });
describe("upstream message text and toolbar layout", () => {
  it("reserves the trigger and floats the toolbar above the text", () => {
    const w = show();
    expect(w.classes()).toContain("pr-7");
    expect(w.getComponent(ChatMessageActions).attributes("style")).toContain(
      "- 0.75rem",
    );
    expect(w.get("p").text()).toBe(message.message);
    expect(w.get("p").classes()).toContain("whitespace-pre-wrap");
    w.unmount();
  });
  it("keeps the same reserve on a continuation without a name row", () => {
    const w = show({
      previousMessage: { ...message, timestamp: "2026-09-24T11:59:00Z" },
    });
    expect(w.find("h4").exists()).toBe(false);
    expect(w.classes()).toContain("pr-7");
    expect(w.classes()).toContain("mt-1");
    w.unmount();
  });
  it("starts another group across sender, room or five-minute boundaries", () => {
    for (const previousMessage of [
      { ...message, from: { steam_id: "3" } },
      { ...message, __channel: "team" },
      { ...message, timestamp: "2026-09-24T11:54:00Z" },
    ]) {
      const w = show({ previousMessage });
      expect(w.find("h4").exists()).toBe(true);
      w.unmount();
    }
  });
  it("offers no actions when reactions are disabled or the author is blocked", () => {
    for (const props of [
      { reactionsEnabled: false },
      { message: { ...message, blocked: true } },
    ]) {
      const w = show(props);
      expect(w.findComponent(ChatMessageActions).exists()).toBe(false);
      w.unmount();
    }
  });
});
