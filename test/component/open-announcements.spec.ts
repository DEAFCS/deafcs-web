import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// DEAFCS: the menus' Announcements entry opens the Chat Hub on its channel,
// through the Hub's own routing, whether or not the tab is seeded yet.
const state = vi.hoisted(() => ({
  tabs: null as any,
  focus: vi.fn(),
  fromNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("~/composables/useChatTabs", () => ({
  useChatTabs: () => ({ tabs: state.tabs }),
}));
vi.mock("~/composables/useChatHubContext", () => ({
  requestChatHubFocus: state.focus,
}));
vi.mock("~/composables/useChatNotificationNavigation", () => ({
  useChatNotificationNavigation: () => ({
    openChatFromNotification: state.fromNotification,
  }),
}));

import { openAnnouncements } from "~/utilities/openAnnouncements";

describe("openAnnouncements", () => {
  beforeEach(() => {
    state.focus.mockClear();
    state.fromNotification.mockClear();
  });

  it("focuses the Hub's Announcements tab when it is there", () => {
    state.tabs = ref([{ id: "global" }, { id: "announcement" }]);
    openAnnouncements();
    expect(state.focus).toHaveBeenCalledWith("announcement");
    expect(state.fromNotification).not.toHaveBeenCalled();
  });

  it("opens it the way a notification does before the Hub has seeded it", () => {
    state.tabs = ref([{ id: "global" }]);
    openAnnouncements();
    expect(state.focus).not.toHaveBeenCalled();
    expect(state.fromNotification).toHaveBeenCalledWith(
      null,
      "announcement:announcement",
    );
  });
});
