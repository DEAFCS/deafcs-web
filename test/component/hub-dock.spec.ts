import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import fs from "node:fs";
import path from "node:path";

// Phase B: the 5Stack floating dock (layouts/components/RightHub.vue) with
// DEAFCS's click-to-pin. The real RightHub, HubDockItem and dock composables
// run here; only Nuxt globals, stores, the socket and the panels' contents are
// stand-ins.

const mocks = vi.hoisted(() => {
  const state = { mobile: false };
  // useRightSidebar reads the breakpoint when it loads, so the stub has to
  // exist before any module does.
  (globalThis as any).window.matchMedia = (query: string) => ({
    matches: query.includes("max-width: 768px") ? state.mobile : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  });
  return { state, socketEvents: [] as Array<[string, unknown]> };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));
vi.mock("~/web-sockets/Socket", () => ({
  default: {
    event: (name: string, data?: unknown) =>
      mocks.socketEvents.push([name, data]),
  },
}));

const { panel } = vi.hoisted(() => ({
  panel: (name: string) => async () => {
    const { defineComponent, h } = await import("vue");
    return {
      default: defineComponent({
        name,
        setup: () => () => h("div", { "data-panel": name }),
      }),
    };
  },
}));
vi.mock("~/components/hub/NotificationsPanel.vue", panel("notifications"));
vi.mock("~/components/hub/LobbyPanel.vue", panel("lobby"));
vi.mock("~/components/hub/ChatPanel.vue", panel("chat"));
vi.mock("~/components/hub/SocialPanel.vue", panel("social"));
vi.mock("~/components/hub/RecentGamesPanel.vue", panel("recent-games"));
vi.mock("~/components/matchmaking-lobby/MiniDisplay.vue", panel("mini"));
// The phone sheet needs the layout's SidebarProvider; a plain wrapper is
// enough to see what the dock does inside it.
vi.mock("~/components/ui/sidebar", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    Sidebar: defineComponent({
      name: "Sidebar",
      setup: (_props, { slots }) => () =>
        h("div", { "data-sheet": "" }, slots.default?.()),
    }),
  };
});

const store = reactive<any>({
  currentLobby: null,
  lobbyInvites: [],
  friends: [],
  onlineFriends: [],
  hasOnlinePlayerSnapshot: false,
  joinedMatchmakingQueues: {},
});
const notificationStore = reactive({
  hasNotifications: false,
  hasPersonalNotifications: false,
  hasAdminNotifications: false,
  unreadNotificationCount: 0,
});

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
vi.stubGlobal("useMatchmakingStore", () => store);
vi.stubGlobal("useNotificationStore", () => notificationStore);
vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: "1" } }));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api" } }));

import RightHub from "../../layouts/components/RightHub.vue";
import { useRightSidebar } from "../../composables/useRightSidebar";
import { currentHub, setActiveHub } from "../../composables/useHubState";
import { useChatTabs } from "../../composables/useChatTabs";

let wrapper: VueWrapper | null = null;

function mountHub() {
  wrapper = mount(RightHub, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Transition: false, TransitionGroup: false },
    },
  });
  return wrapper;
}

const app = (name: string) =>
  wrapper!.find(`[data-dock-app="${name}"] button`);

function hubOpen() {
  return useRightSidebar().rightSidebarOpen.value;
}
function pinned() {
  return useRightSidebar().isPinned.value;
}

function pointer(type: string, x = 20, y = 20) {
  return new PointerEvent(type, {
    pointerType: "mouse",
    clientX: x,
    clientY: y,
    bubbles: type !== "pointerenter" && type !== "pointerleave",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.state.mobile = false;
  mocks.socketEvents.length = 0;
  localStorage.clear();
  useRightSidebar().setRightSidebarOpen(false);
  setActiveHub("social");
  useChatTabs().clearAll();
  store.currentLobby = null;
  store.lobbyInvites = [];
  store.joinedMatchmakingQueues = {};
  notificationStore.hasNotifications = false;
  notificationStore.unreadNotificationCount = 0;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.useRealTimers();
});

describe("dock order", () => {
  it("is Alerts, Lobby, Friends, Chat, Recent Matches -- no Voice, no Settings", () => {
    mountHub();
    const apps = wrapper!
      .findAll("[data-dock-app]")
      .map((item) => item.attributes("data-dock-app"));
    expect(apps).toEqual([
      "notifications",
      "lobby",
      "social",
      "chat",
      "recent-games",
    ]);

    const labels = wrapper!
      .findAll("nav button")
      .map((button) => button.attributes("aria-label") ?? "");
    expect(labels.some((label) => /voice/i.test(label))).toBe(false);
    expect(labels.some((label) => /settings/i.test(label))).toBe(false);
  });

  it("has no separate Pin button: the click is the pin", () => {
    mountHub();
    expect(wrapper!.find('nav button[aria-pressed]').exists()).toBe(false);
    expect(wrapper!.html()).not.toContain("layouts.hub.dock.pin\"");
  });
});

describe("hover preview", () => {
  it("resting on an icon opens that app without pinning it", async () => {
    mountHub();
    const item = wrapper!.find('[data-dock-app="lobby"]');
    item.element.dispatchEvent(pointer("pointerenter"));
    vi.advanceTimersByTime(150);
    await nextTick();

    expect(hubOpen()).toBe(true);
    expect(currentHub()).toBe("lobby");
    expect(pinned()).toBe(false);
  });

  it("a pointer passing over an icon opens nothing", async () => {
    mountHub();
    const item = wrapper!.find('[data-dock-app="lobby"]');
    item.element.dispatchEvent(pointer("pointerenter"));
    vi.advanceTimersByTime(50);
    item.element.dispatchEvent(pointer("pointerleave"));
    vi.advanceTimersByTime(500);
    await nextTick();

    expect(hubOpen()).toBe(false);
  });

  it("leaving the hub closes an unpinned preview", async () => {
    mountHub();
    wrapper!.find('[data-dock-app="social"]').element.dispatchEvent(
      pointer("pointerenter"),
    );
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(hubOpen()).toBe(true);

    const layer = wrapper!.find("nav").element.parentElement!;
    layer.dispatchEvent(new MouseEvent("mouseenter"));
    layer.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null }));
    vi.advanceTimersByTime(300);
    await nextTick();

    expect(hubOpen()).toBe(false);
  });

  it("the preview is drawn outlined, a pinned app filled", async () => {
    mountHub();
    wrapper!.find('[data-dock-app="social"]').element.dispatchEvent(
      pointer("pointerenter"),
    );
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(app("social").classes().join(" ")).toContain(
      "border-[hsl(var(--tac-amber)/0.6)]",
    );

    await app("social").trigger("click");
    expect(app("social").classes().join(" ")).toContain(
      "[background:linear-gradient(135deg,var(--tac-amber-cta-from)",
    );
  });
});

describe("click to pin", () => {
  it("a click opens the app and pins the hub at once", async () => {
    mountHub();
    await app("notifications").trigger("click");

    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(true);
    expect(currentHub()).toBe("notifications");
    expect(app("notifications").attributes("aria-current")).toBe("true");
  });

  it("a pinned hub stays when the pointer leaves", async () => {
    mountHub();
    await app("social").trigger("click");
    const layer = wrapper!.find("nav").element.parentElement!;
    layer.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null }));
    vi.advanceTimersByTime(1000);
    await nextTick();

    expect(hubOpen()).toBe(true);
  });

  it("clicking a previewed app pins it rather than closing it", async () => {
    mountHub();
    wrapper!.find('[data-dock-app="chat"]').element.dispatchEvent(
      pointer("pointerenter"),
    );
    vi.advanceTimersByTime(150);
    await nextTick();
    expect(pinned()).toBe(false);

    await app("chat").trigger("click");
    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(true);
  });

  it("clicking the pinned app again closes and unpins the hub", async () => {
    mountHub();
    await app("lobby").trigger("click");
    await app("lobby").trigger("click");

    expect(hubOpen()).toBe(false);
    expect(pinned()).toBe(false);
  });

  it("clicking another app switches and stays pinned", async () => {
    mountHub();
    await app("lobby").trigger("click");
    await app("chat").trigger("click");

    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(true);
    expect(currentHub()).toBe("chat");
  });

  it("a click outside does not close a pinned hub", async () => {
    mountHub();
    await app("social").trigger("click");
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await nextTick();
    expect(hubOpen()).toBe(true);
  });

  it("a pinned hub comes back after a desktop reload", async () => {
    mountHub();
    await app("social").trigger("click");
    expect(localStorage.getItem("right-hub-pinned")).toBe("1");
  });
});

describe("conversation shortcuts", () => {
  function addDirect() {
    const { openTab, noteActivity } = useChatTabs();
    openTab(
      {
        id: "direct:1:2",
        label: "Anders",
        instance: "direct",
        type: "direct",
        lobbyId: "1:2",
      },
      { setActive: false },
    );
    noteActivity("direct:1:2");
  }

  it("a recently active conversation sits under Chat, and a click opens it pinned", async () => {
    addDirect();
    mountHub();
    await nextTick();
    const shortcut = wrapper!.find('[data-dock-shortcut="direct:1:2"] button');
    expect(shortcut.exists()).toBe(true);

    await shortcut.trigger("click");
    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(true);
    expect(currentHub()).toBe("chat");
    expect(useChatTabs().activeTabId.value).toBe("direct:1:2");
  });

  it("Pin to the dock keeps a conversation there without any activity", async () => {
    const { openTab } = useChatTabs();
    openTab(
      { id: "global", label: "Global", instance: "global", type: "global", lobbyId: "global" },
      { setActive: false },
    );
    mountHub();
    expect(wrapper!.find('[data-dock-shortcut="global"]').exists()).toBe(false);

    localStorage.setItem(
      "hub-dock-shortcuts",
      JSON.stringify({ pinned: ["global"] }),
    );
    const { useDockShortcutPrefs } = await import(
      "../../composables/useDockShortcutPrefs"
    );
    useDockShortcutPrefs().togglePin("global");
    await nextTick();
    expect(wrapper!.find('[data-dock-shortcut="global"]').exists()).toBe(true);
    useDockShortcutPrefs().togglePin("global");
  });

  it("match, team and Captain Pick rooms never go on the dock", async () => {
    const { openTab, noteActivity } = useChatTabs();
    for (const [id, type] of [
      ["match:m1", "match"],
      ["match_team:m1:l1", "match_team"],
      ["captain_pick_team:d1:1", "captain_pick_team"],
      ["matchmaking:lobby1", "matchmaking"],
    ] as const) {
      openTab(
        { id, label: id, instance: type, type, lobbyId: id },
        { setActive: false },
      );
      noteActivity(id);
    }
    mountHub();
    expect(wrapper!.findAll("[data-dock-shortcut]")).toHaveLength(0);
  });
});

describe("badges", () => {
  it("Chat keeps the amber unread and red urgent counts", async () => {
    const { openTab, incrementUnread, incrementMention } = useChatTabs();
    openTab(
      { id: "global", label: "Global", instance: "global", type: "global", lobbyId: "global" },
      { setActive: false },
    );
    // Off the dock (limit 0), so Chat itself carries the counts.
    localStorage.setItem(
      "hub-dock-shortcuts",
      JSON.stringify({ maxPeople: 0, maxRooms: 0 }),
    );
    const { useDockShortcutPrefs } = await import(
      "../../composables/useDockShortcutPrefs"
    );
    useDockShortcutPrefs().setLimit("rooms", 0);
    incrementUnread("global");
    incrementUnread("global");
    incrementUnread("global");
    incrementMention("global");
    mountHub();
    await nextTick();

    const chat = wrapper!.find('[data-dock-app="chat"]');
    expect(chat.find(".bg-\\[hsl\\(var\\(--tac-amber\\)\\)\\]").text()).toBe("2");
    expect(chat.find("[data-dock-urgent-badge]").text()).toBe("1");
    useDockShortcutPrefs().setLimit("rooms", 2);
  });

  it("Alerts shows its unread count", async () => {
    notificationStore.hasNotifications = true;
    notificationStore.unreadNotificationCount = 3;
    mountHub();
    await nextTick();
    expect(wrapper!.find('[data-dock-app="notifications"]').text()).toContain("3");
  });

  it("Lobby shows pending invites", async () => {
    store.lobbyInvites = [{ id: "a" }, { id: "b" }];
    mountHub();
    await nextTick();
    expect(wrapper!.find('[data-dock-app="lobby"]').text()).toContain("2");
  });
});

describe("queue clock on the Lobby icon", () => {
  it("shows the search time under the icon and clears when the search ends", async () => {
    vi.setSystemTime(new Date("2026-10-11T12:01:05Z"));
    store.joinedMatchmakingQueues = {
      details: {
        type: "Competitive",
        joinedAt: "2026-10-11T12:00:00Z",
        regions: ["EU"],
      },
    };
    mountHub();
    await nextTick();
    const lobby = wrapper!.find('[data-dock-app="lobby"]');
    expect(lobby.text()).toContain("1:05");

    store.joinedMatchmakingQueues = {};
    await nextTick();
    expect(wrapper!.find('[data-dock-app="lobby"]').text()).not.toContain("1:05");
  });
});

describe("mobile", () => {
  it("a tap opens the app and keeps it open without pinning", async () => {
    mocks.state.mobile = true;
    mountHub();
    await app("social").trigger("click");

    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(false);
    expect(localStorage.getItem("right-hub-pinned")).toBeNull();
  });

  it("tapping the open app again closes it", async () => {
    mocks.state.mobile = true;
    mountHub();
    await app("chat").trigger("click");
    await app("chat").trigger("click");
    expect(hubOpen()).toBe(false);
  });

  it("tapping another app switches and stays open", async () => {
    mocks.state.mobile = true;
    mountHub();
    await app("chat").trigger("click");
    await app("lobby").trigger("click");
    expect(hubOpen()).toBe(true);
    expect(currentHub()).toBe("lobby");
  });

  it("an open app on a phone is drawn filled, not as a preview", async () => {
    mocks.state.mobile = true;
    mountHub();
    await app("social").trigger("click");
    expect(app("social").classes().join(" ")).not.toContain(
      "border-[hsl(var(--tac-amber)/0.6)]",
    );
  });
});

describe("reload", () => {
  it("a desktop pin reopens the hub, but never over a phone page", async () => {
    localStorage.setItem("right-hub-pinned", "1");

    mocks.state.mobile = false;
    vi.resetModules();
    const desktop = await import("../../composables/useRightSidebar");
    expect(desktop.useRightSidebar().rightSidebarOpen.value).toBe(true);

    mocks.state.mobile = true;
    vi.resetModules();
    const phone = await import("../../composables/useRightSidebar");
    expect(phone.useRightSidebar().rightSidebarOpen.value).toBe(false);
  });

  it("the phone sheet no longer forces itself open for a leftover pin", () => {
    const sync = fs.readFileSync(
      path.resolve(__dirname, "../../layouts/components/SidebarMobileSync.vue"),
      "utf8",
    );
    expect(sync).not.toContain("isPinned.value ? true");
  });
});

describe("keyboard and screen readers", () => {
  it("Escape closes a previewed hub and hands focus back to its icon", async () => {
    mountHub();
    wrapper!.find('[data-dock-app="social"]').element.dispatchEvent(
      pointer("pointerenter"),
    );
    vi.advanceTimersByTime(150);
    await nextTick();
    const inside = wrapper!.find('[data-panel="social"]').element as HTMLElement;
    inside.setAttribute("tabindex", "-1");
    inside.focus();
    inside.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await nextTick();

    expect(hubOpen()).toBe(false);
  });

  it("Escape leaves a pinned hub open", async () => {
    mountHub();
    await app("social").trigger("click");
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await nextTick();
    expect(hubOpen()).toBe(true);
  });

  it("every app is a labelled button, the open one marked current", async () => {
    notificationStore.hasNotifications = true;
    notificationStore.unreadNotificationCount = 2;
    mountHub();
    await app("notifications").trigger("click");

    const label = app("notifications").attributes("aria-label");
    expect(label).toContain("layouts.hub.dock.inbox");
    expect(label).toContain("layouts.hub.dock.waiting");
    expect(app("notifications").attributes("aria-current")).toBe("true");
    expect(app("lobby").attributes("aria-current")).toBeUndefined();
    expect(wrapper!.find("nav").attributes("aria-label")).toBe(
      "layouts.hub.dock.label",
    );
  });

  it("motion respects reduced-motion settings", () => {
    const read = (file: string) =>
      fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(read("layouts/components/RightHub.vue")).toContain(
      "motion-reduce:![transition-duration:1ms]",
    );
    expect(read("components/hub/HubDockItem.vue")).toContain(
      "motion-reduce:![transition-duration:1ms]",
    );
  });
});

describe("Alerts settings", () => {
  it("the settings gear sits inside the Alerts panel header", () => {
    const panel = fs.readFileSync(
      path.resolve(__dirname, "../../components/hub/NotificationsPanel.vue"),
      "utf8",
    );
    const header = panel.slice(0, panel.indexOf('class="flex-1 overflow-y-auto'));
    expect(header).toContain('to="/settings/notifications"');
    expect(header).toContain("data-alerts-settings");
    expect(header).toContain("layouts.notifications.settings");
  });

  it("the dock has no settings app", () => {
    const hub = fs.readFileSync(
      path.resolve(__dirname, "../../layouts/components/RightHub.vue"),
      "utf8",
    );
    expect(hub).not.toContain("/settings");
    expect(hub).not.toMatch(/import\s*{[^}]*\bSettings\b/);
  });
});

void flushPromises;
void defineComponent;
void h;
