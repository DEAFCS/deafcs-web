import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import ChatMessage from "../../components/chat/ChatMessage.vue";

// A wrapped message (or one ending in an emoji) must never run underneath the
// React button / "..." controls in the message's top-right corner.
const message = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  from: { steam_id: "76561190000000456", name: "Other", role: "verified_user" },
  message: "a long message that keeps going and going so that it wraps across lines and ends with an emoji 😀",
  timestamp: "2026-09-24T12:00:00.000Z",
};

// Tailwind spacing scale: 1 unit = 4px.
const px = (cls: string, prefix: string) => {
  const token = cls.split(/\s+/).find((c) => c.startsWith(prefix));
  return token ? Number(token.slice(prefix.length)) * 4 : NaN;
};

describe("chat message text vs. top-right controls", () => {
  beforeEach(() => {
    vi.stubGlobal("useAuthStore", () => ({
      me: { steam_id: "76561190000000123" },
      isRoleAbove: () => false,
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const mountMessage = (props: Record<string, unknown> = {}) =>
    mount(ChatMessage, {
      props: { message, chatType: "global", ...props },
      global: {
        mocks: { $t: (key: string, fallback?: string) => fallback ?? key },
        stubs: { TimeAgo: true, PlayerDisplay: true, FiveStackToolTip: true, ChatMessageActionsMenu: true },
      },
    });
  const spacer = (w: ReturnType<typeof mountMessage>) => w.find('[data-testid="chat-message-actions-spacer"]');

  it("reserves the react button's spot on the first line, before any content", () => {
    const wrapper = mountMessage({ reactionsEnabled: true });
    const reserve = spacer(wrapper);
    expect(reserve.exists()).toBe(true);
    expect(reserve.attributes("aria-hidden")).toBe("true");
    // One line tall only: later lines keep the full width (no extra space).
    expect(reserve.classes()).toEqual(expect.arrayContaining(["float-right", "h-[1lh]", "w-5"]));
    // First in the content column, so it shapes the first line (meta row or text).
    const column = reserve.element.parentElement!;
    expect(column.firstElementChild).toBe(reserve.element);
    // The text itself stays ordinary inline flow, emoji included.
    const text = wrapper.get("p");
    expect(text.text()).toBe(message.message);
    expect(text.classes()).toEqual(expect.arrayContaining(["break-words", "whitespace-pre-wrap"]));
    wrapper.unmount();
  });

  it("the reserved width covers the react button's overlap with the text column", () => {
    const wrapper = mountMessage({ reactionsEnabled: true });
    const row = wrapper.element as HTMLElement;
    const rowPaddingRight = px(row.className, "pr-");
    const react = wrapper.get('[aria-label="React"]');
    const reactRight = px(react.attributes("class")!, "right-");
    const reactWidth = px(react.attributes("class")!, "w-");
    const reserved = px(spacer(wrapper).attributes("class")!, "w-");
    // React spans [reactRight, reactRight + reactWidth] from the row's right
    // edge; the text column ends at rowPaddingRight.
    const intrusion = reactRight + reactWidth - rowPaddingRight;
    expect(intrusion).toBeGreaterThan(0);
    expect(reserved).toBeGreaterThanOrEqual(intrusion);
    // "..." (h-4 w-4 trigger) keeps its place inside the row's own right
    // padding, so it needs no reserve of its own.
    const source = readFileSync(path.resolve(__dirname, "../../components/chat/ChatMessage.vue"), "utf8");
    const dotsClass = source.match(/trigger-class="([^"]+)"/)![1];
    expect(px(dotsClass, "right-") + 16).toBeLessThanOrEqual(rowPaddingRight);
    wrapper.unmount();
  });

  it("continuation messages (no name row) get the same reserve", () => {
    const wrapper = mountMessage({
      reactionsEnabled: true,
      previousMessage: { ...message, id: "prev", timestamp: "2026-09-24T11:59:00.000Z" },
    });
    expect(wrapper.find("h4").exists()).toBe(false);
    expect(spacer(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });

  it("no reserve where there is no react button: reactions off, blocked messages", () => {
    const off = mountMessage();
    expect(off.find('[aria-label="React"]').exists()).toBe(false);
    expect(spacer(off).exists()).toBe(false);
    off.unmount();
    const blocked = mountMessage({ reactionsEnabled: true, message: { ...message, blocked: true } });
    expect(spacer(blocked).exists()).toBe(false);
    blocked.unmount();
  });
});
