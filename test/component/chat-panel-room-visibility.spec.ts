import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import BrokenChatPanel from "./fixtures/BrokenChatPanel.vue";
import FixedChatPanel from "./fixtures/FixedChatPanel.vue";

// Regression test for: "all chat rooms displayed together in the Right Hub,
// ~4 message composers visible at once."
//
// Root cause: ChatLobby.vue's <template> resolves to a Teleport-or-div pair
// (v-if/v-else) PLUS a sibling <SanctionPlayer v-if="muteTarget">. Vue only
// applies v-show correctly to a component whose template is a single real
// element, or a root-level v-if/v-else *pair* with nothing else -- anything
// wider is a genuine multi-root Fragment. Vue's own runtime explicitly warns
// "Runtime directive used on component with non-element root node. The
// directives will not function as intended." and no-ops the display toggle
// in that case. components/hub/ChatPanel.vue put v-show directly on
// <ChatLobby v-show="..."> (a multi-root component once SanctionPlayer was
// added as a sibling), so every mounted room -- and its own <ChatInput>
// composer -- stayed visible regardless of which tab was active.
//
// fixtures/MultiRootRoom.vue reproduces ChatLobby's exact root shape (a
// Teleport-or-div v-if/v-else pair plus a sibling v-if node) through real
// .vue SFC compilation, the same path components/chat/ChatLobby.vue goes
// through, so this exercises the real compiled v-show directive, not a
// hand-written approximation. This was also verified live in a real
// browser against the Vue 3 runtime (including the same console warning)
// before this file was written.
describe("chat room visibility (multi-root ChatLobby + v-show)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  const tabs = [{ id: "global" }, { id: "announcements" }, { id: "organizers" }];

  it("confirms the bug: v-show directly on <ChatLobby> (multi-root) leaves every room and composer visible", async () => {
    const wrapper = mount(BrokenChatPanel, { props: { tabs } });
    (wrapper.vm as any).activeId = "global";
    await wrapper.vm.$nextTick();

    const visibleComposers = wrapper
      .findAll(".room-composer")
      .filter((el) => isVisible(el.element as HTMLElement));
    // The bug: switching to "global" should leave exactly one composer
    // visible, but v-show silently failed on the multi-root component, so
    // every room (including the two that were never made active) is still
    // showing its own composer.
    expect(visibleComposers.length).toBeGreaterThan(1);

    const warnedAboutNonElementRoot = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes("non-element root node"),
    );
    expect(warnedAboutNonElementRoot).toBe(true);
  });

  it("fixes it: wrapping each room in a real DOM div shows exactly one room and one composer", async () => {
    const wrapper = mount(FixedChatPanel, { props: { tabs } });
    (wrapper.vm as any).activeId = "global";
    await wrapper.vm.$nextTick();

    function visibleRoomIds() {
      return wrapper
        .findAll(".room-wrapper")
        .filter((el) => isVisible(el.element as HTMLElement))
        .map((el) => el.find(".room-root").attributes("data-room"));
    }

    expect(visibleRoomIds()).toEqual(["global"]);

    const visibleComposers = () =>
      wrapper.findAll(".room-composer").filter((el) => isVisible(el.element as HTMLElement));
    expect(visibleComposers()).toHaveLength(1);

    const visibleMessages = () =>
      wrapper.findAll(".room-messages").filter((el) => isVisible(el.element as HTMLElement));
    expect(visibleMessages()).toHaveLength(1);
    expect(visibleMessages()[0].text()).toBe("messages for global");

    // Rapid tab switching: exactly one room visible at every step, no
    // mixed state, no duplicate composers.
    (wrapper.vm as any).activeId = "announcements";
    await wrapper.vm.$nextTick();
    expect(visibleRoomIds()).toEqual(["announcements"]);
    expect(visibleComposers()).toHaveLength(1);

    (wrapper.vm as any).activeId = "organizers";
    await wrapper.vm.$nextTick();
    expect(visibleRoomIds()).toEqual(["organizers"]);
    expect(visibleComposers()).toHaveLength(1);

    const warnedAboutNonElementRoot = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes("non-element root node"),
    );
    expect(warnedAboutNonElementRoot).toBe(false);
  });

  it("keeps a room's mute (SanctionPlayer) drawer scoped to that room, even while its tab is hidden", async () => {
    const wrapper = mount(FixedChatPanel, { props: { tabs } });
    (wrapper.vm as any).activeId = "global";
    (wrapper.vm as any).mutedRoom = "organizers";
    await wrapper.vm.$nextTick();

    // "organizers" isn't the active tab -- its drawer must exist only
    // under its own room wrapper, and must not be visible while that
    // wrapper is hidden.
    const drawers = wrapper.findAll(".sanction-drawer");
    expect(drawers).toHaveLength(1);
    expect(drawers[0].attributes("data-room")).toBe("organizers");
    expect(isVisible(drawers[0].element as HTMLElement)).toBe(false);

    // Switching to that room reveals its own drawer -- still just the one.
    (wrapper.vm as any).activeId = "organizers";
    await wrapper.vm.$nextTick();
    expect(isVisible(drawers[0].element as HTMLElement)).toBe(true);
    expect(wrapper.findAll(".sanction-drawer")).toHaveLength(1);
  });
});

function isVisible(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  while (node) {
    if (node.style.display === "none") return false;
    node = node.parentElement;
  }
  return true;
}

describe("ChatPanel.vue source: v-show is on a real element, not on <ChatLobby> itself", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../components/hub/ChatPanel.vue"),
    "utf8",
  );

  it("does not put v-show directly on the <ChatLobby> tag", () => {
    // Anchored to an actual tag opening (start of line, optional
    // whitespace, then the literal "<ChatLobby" followed by whitespace or
    // a newline) so this can't be fooled by the word "ChatLobby" showing
    // up in prose/comments elsewhere in the file.
    const chatLobbyTagMatch = source.match(/^[ \t]*<ChatLobby[\s>][\s\S]*?\/>/m);
    expect(chatLobbyTagMatch).not.toBeNull();
    expect(chatLobbyTagMatch![0]).not.toContain("v-show");
  });

  it("wraps each mounted room in its own v-show'd element", () => {
    expect(source).toMatch(
      /v-for="tab in mountedTabs"[\s\S]{0,40}:key="tab\.id"[\s\S]{0,60}v-show="tab\.id === activeChatId"/,
    );
  });
});
