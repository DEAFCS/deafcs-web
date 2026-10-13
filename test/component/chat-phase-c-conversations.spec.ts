import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, shallowMount, flushPromises } from "@vue/test-utils";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onMounted,
  ref,
  watch,
} from "vue";
import ChatPanel from "../../components/hub/ChatPanel.vue";
import NewConversation from "../../components/hub/NewConversation.vue";
import { useChatTabs } from "../../composables/useChatTabs";
import { useDockShortcutPrefs } from "../../composables/useDockShortcutPrefs";
import { useChatHubSection } from "../../composables/useChatHubSection";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/composables/useHubState", () => ({
  currentHub: () => "chat",
  setActiveHub: vi.fn(),
}));
vi.mock("~/composables/useIncomingDirectMessages", () => ({
  markDirectMessagesRead: vi.fn(),
}));
vi.mock("~/composables/useTournamentWebcamStatus", () => ({
  useTournamentWebcamStatus: () => ({ participants: ref([]) }),
}));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => ({ lobbyChat: {}, myMatches: [] }),
}));
vi.mock("~/components/chat/ChatLobby.vue", () => ({
  default: defineComponent({
    props: ["lobbyId", "isActiveTab"],
    setup: (props) => () =>
      h("div", {
        "data-live-room": props.lobbyId,
        "data-active": String(props.isActiveTab),
      }),
  }),
}));
vi.mock("~/components/matchmaking-lobby/LobbyCallPanel.vue", () => ({
  default: defineComponent({
    setup: () => () => h("div", { "data-lobby-call": "" }),
  }),
}));
vi.mock("~/composables/useDirectMessage", () => ({
  openDirectMessage: vi.fn(),
}));
vi.mock("~/components/ui/context-menu", () => {
  const part = defineComponent({
    emits: ["select"],
    setup:
      (_props, { slots }) =>
      () =>
        h("div", slots.default?.()),
  });
  return {
    ContextMenu: part,
    ContextMenuTrigger: part,
    ContextMenuContent: part,
    ContextMenuItem: part,
  };
});

const passthrough = { template: "<div><slot /><slot name='trigger' /></div>" };
let wrapper: ReturnType<typeof mount> | undefined;
const tabs = useChatTabs();
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  tabs.clearAll();
  useChatHubSection().setSection("all");
  tabs.setTabOrder([]);
  for (const [name, value] of Object.entries({
    nextTick,
    onMounted,
    computed,
    ref,
    watch,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useAuthStore", () => ({
    me: { steam_id: "1" },
    isRoleAbove: () => false,
  }));
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "local.invalid" },
  }));
  vi.stubGlobal("useMatchmakingStore", () => ({
    friends: [],
    onlineFriends: [],
  }));
  tabs.openTab(
    {
      id: "global:global",
      type: "global",
      lobbyId: "global",
      label: "Global",
      instance: "global",
      pinned: true,
    },
    { setActive: false },
  );
  tabs.openTab(
    {
      id: "direct:1:2",
      type: "direct",
      lobbyId: "1:2",
      label: "Friend",
      instance: "direct",
      otherSteamId: "2",
    },
    { setActive: false },
  );
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  tabs.clearAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function panel() {
  wrapper = mount(ChatPanel, {
    props: { isSidebarOpen: true, isTabActive: true },
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        TooltipProvider: passthrough,
        Tooltip: passthrough,
        TooltipTrigger: passthrough,
        TooltipContent: passthrough,
        ChatMatchHeader: true,
        LiveAvatarImg: true,
        ChatDirectProfileLink: true,
        ChatParticipantsList: true,
        Empty: passthrough,
        NewConversation: true,
      },
    },
  });
  return wrapper;
}
function layout(w: ReturnType<typeof mount>) {
  const rail = w.get('[data-chat-tab-id="direct:1:2"]').element.parentElement!
    .parentElement!.parentElement!.parentElement!.parentElement!;
  // Identify the ref-backed rail directly rather than relying on stub nesting.
  const vm = w.vm as any;
  const actualRail = vm.$.setupState.chatRailRef ?? rail;
  vi.spyOn(actualRail, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 64,
    top: 0,
    bottom: 200,
    height: 200,
    width: 64,
  } as DOMRect);
  w.findAll("[data-chat-tab-id]").forEach((button, index) =>
    vi.spyOn(button.element, "getBoundingClientRect").mockReturnValue({
      left: 10,
      right: 54,
      top: index * 48,
      bottom: index * 48 + 44,
      height: 44,
      width: 44,
    } as DOMRect),
  );
}

describe("upstream conversation management with legacy persistence", () => {
  it("Rooms and People filter the sidebar without closing live conversations", async () => {
    const w = panel();
    useChatHubSection().setSection("rooms");
    await nextTick();
    expect(w.find('[data-chat-tab-id="global:global"]').exists()).toBe(true);
    expect(w.find('[data-chat-tab-id="direct:1:2"]').exists()).toBe(false);
    useChatHubSection().setSection("people");
    await nextTick();
    expect(w.find('[data-chat-tab-id="direct:1:2"]').exists()).toBe(true);
    expect(w.find('[data-chat-tab-id="global:global"]').exists()).toBe(false);
    expect(tabs.tabs.value).toHaveLength(2);
  });
  it("reordering People preserves rooms outside the filtered rail", async () => {
    tabs.openTab(
      {
        id: "direct:1:3",
        type: "direct",
        lobbyId: "1:3",
        instance: "direct",
        label: "Other",
      },
      { setActive: false },
    );
    useChatHubSection().setSection("people");
    const w = panel();
    await nextTick();
    (w.vm as any).$.setupState.moveConversation("direct:1:3", 0);
    expect(tabs.manualOrder.value).toEqual([
      "global:global",
      "direct:1:3",
      "direct:1:2",
    ]);
  });
  it("closing and reopening a DM preserves its canonical ID without deleting history", () => {
    tabs.closeTab("direct:1:2");
    expect(tabs.tabs.value.some((t) => t.type === "direct")).toBe(false);
    tabs.openTab({
      id: "direct:1:2",
      type: "direct",
      lobbyId: "1:2",
      instance: "direct",
      label: "Friend",
    });
    expect(
      JSON.parse(localStorage.getItem("chat-open-dm-tabs")!)[0].lobbyId,
    ).toBe("1:2");
  });
  it("persists a validated ordering without duplicate or foreign IDs", () => {
    tabs.setTabOrder(["direct:1:2", "foreign", "global:global", "direct:1:2"]);
    expect(tabs.manualOrder.value).toEqual(["direct:1:2", "global:global"]);
    expect(JSON.parse(localStorage.getItem("chat-tab-manual-order")!)).toEqual(
      tabs.manualOrder.value,
    );
  });
  it("uses the existing per-browser dock pin state", () => {
    const prefs = useDockShortcutPrefs();
    if (prefs.isPinned("direct:1:2")) prefs.togglePin("direct:1:2");
    prefs.togglePin("direct:1:2");
    expect(prefs.isPinned("direct:1:2")).toBe(true);
    prefs.togglePin("direct:1:2");
    expect(prefs.isPinned("direct:1:2")).toBe(false);
  });
  it("keeps room listeners mounted while composing and marks no room read", async () => {
    const w = panel();
    await nextTick();
    const rooms = w.findAll("[data-live-room]");
    expect(rooms).toHaveLength(2);
    await w
      .get('button[aria-label="layouts.chat_panel.new_message"]')
      .trigger("click");
    expect(w.findAll("[data-live-room]")).toHaveLength(2);
    expect(tabs.activeTabId.value).toBeNull();
    expect(w.findAll('[data-active="true"]')).toHaveLength(0);
    await w
      .get('button[aria-label="layouts.chat_panel.new_message"]')
      .trigger("click");
    expect(tabs.activeTabId.value).toBe("global:global");
  });
  it("lets a touch scroll cancel the hold instead of reordering", async () => {
    const w = panel();
    await nextTick();
    const button = w.get('[data-chat-tab-id="direct:1:2"]');
    await button.trigger("pointerdown", {
      pointerType: "touch",
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 70,
    });
    await button.trigger("pointermove", {
      pointerType: "touch",
      clientX: 20,
      clientY: 90,
    });
    await vi.advanceTimersByTimeAsync(500);
    expect((w.vm as any).$.setupState.draggingRoomId).toBeNull();
    expect(tabs.manualOrder.value).toEqual([]);
  });
  it("begins touch drag at 450ms and uses upstream midpoint slots", async () => {
    const w = panel();
    await nextTick();
    layout(w);
    const button = w.get('[data-chat-tab-id="direct:1:2"]');
    await button.trigger("pointerdown", {
      pointerType: "touch",
      button: 0,
      pointerId: 1,
      clientX: 20,
      clientY: 70,
    });
    await vi.advanceTimersByTimeAsync(449);
    expect((w.vm as any).$.setupState.draggingRoomId).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect((w.vm as any).$.setupState.draggingRoomId).toBe("direct:1:2");
    await button.trigger("pointermove", {
      pointerType: "touch",
      clientX: 20,
      clientY: 5,
    });
    await button.trigger("pointerup");
    expect(tabs.manualOrder.value).toEqual(["direct:1:2", "global:global"]);
  });
});

describe("friends-only new conversation picker", () => {
  it("filters pending friends and sorts online friends first", async () => {
    vi.stubGlobal("useMatchmakingStore", () => ({
      friends: [
        { steam_id: "2", name: "Offline" },
        { steam_id: "3", name: "Online" },
        { steam_id: "4", name: "Pending", status: "Pending" },
      ],
      onlineFriends: [{ steam_id: "3" }],
    }));
    wrapper = shallowMount(NewConversation, {
      global: { mocks: { $t: (key: string) => key } },
    });
    await flushPromises();
    expect(
      wrapper.findAll('[role="option"]').map((row) => row.attributes("id")),
    ).toEqual(["new-conversation-3", "new-conversation-2"]);
    await wrapper.get("input").setValue("offline");
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
  });
});
