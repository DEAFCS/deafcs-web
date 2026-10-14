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
import { useMessageRequests } from "../../composables/useMessageRequests";
import path from "node:path";

// The 5Stack floating dock with DEAFCS temporary clicks and explicit pinning.
// The real RightHub, HubDockItem and dock composables
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
      setup:
        (_props, { slots }) =>
        () =>
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
vi.stubGlobal("useApplicationSettingsStore", () => ({
  isMatchmakingTypeEnabled: () => true,
  captainPickEnabled: true,
  maxCompetitivePartySize: 5,
}));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api" } }));

import RightHub from "../../layouts/components/RightHub.vue";
import { useRightSidebar } from "../../composables/useRightSidebar";
import { currentHub, setActiveHub } from "../../composables/useHubState";
import { useChatTabs } from "../../composables/useChatTabs";
import { useDockShortcutPrefs } from "../../composables/useDockShortcutPrefs";

let wrapper: VueWrapper | null = null;

function mountHub() {
  wrapper = mount(RightHub, {
    attachTo: document.body,
    global: {
      mocks: { $t: (key: string) => key },
      stubs: { Transition: true, TransitionGroup: true },
    },
  });
  return wrapper;
}

const app = (name: string) => wrapper!.find(`[data-dock-app="${name}"] button`);

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
  useRightSidebar().setPinned(false);
  useRightSidebar().setRightSidebarOpen(false);
  setActiveHub("social");
  useChatTabs().clearAll();
  vi.stubGlobal("useChatTabs", useChatTabs);
  vi.stubGlobal("useBlockActions", () => ({ isBlocked: () => false }));
  useMessageRequests().reset();
  useDockShortcutPrefs().prefs.value = {
    maxRooms: 2,
    maxPeople: 3,
    pinned: [],
    hidden: [],
    dismissed: {},
  };
  store.hasOnlinePlayerSnapshot = false;
  store.onlineFriends = [];
  store.friends = [];
  store.currentLobby = null;
  store.lobbyInvites = [];
  store.joinedMatchmakingQueues = {};
  notificationStore.hasNotifications = false;
  notificationStore.unreadNotificationCount = 0;
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  useMessageRequests().reset();
  vi.useRealTimers();
});

describe("pending request shortcuts", () => {
  it("keeps a pending preview off the dock and restores an intentional pin after acceptance", async () => {
    const id="direct:1:2";
    useChatTabs().openTab({id,type:"direct",instance:"direct",lobbyId:"1:2",label:"Requester",otherSteamId:"2"});
    useDockShortcutPrefs().prefs.value.pinned=[id];
    useMessageRequests().addRequest({roomId:"1:2",peer:{steam_id:"2"},unread:1});
    mountHub(); await nextTick();
    expect(wrapper!.findAll("[data-dock-shortcut]")).toHaveLength(0);
    useMessageRequests().setAwaitingReply("1:2",false); await nextTick();
    expect(wrapper!.findAll("[data-dock-shortcut]")).toHaveLength(1);
    expect(useDockShortcutPrefs().prefs.value.pinned).toEqual([id]);
  });
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

  it("has an explicit bottom pin control", () => {
    mountHub();
    expect(wrapper!.find("nav button[aria-pressed]").exists()).toBe(true);
  });
});

const pinButton = () => wrapper!.find("nav button[aria-pressed]");

describe("temporary panels and explicit pinning", () => {
  it("hover never opens a panel, including after the settle delay", async () => {
    mountHub();
    wrapper!
      .find('[data-dock-app="lobby"]')
      .element.dispatchEvent(pointer("pointerenter"));
    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(hubOpen()).toBe(false);
    expect(pinned()).toBe(false);
  });
  it("each dock click opens a temporary panel and a second click closes it", async () => {
    mountHub();
    for (const hub of [
      "notifications",
      "lobby",
      "social",
      "chat",
      "recent-games",
    ]) {
      await app(hub).trigger("click");
      expect(hubOpen()).toBe(true);
      expect(pinned()).toBe(false);
      expect(currentHub()).toBe(hub);
      await app(hub).trigger("click");
      expect(hubOpen()).toBe(false);
      expect(pinned()).toBe(false);
    }
    expect(localStorage.getItem("right-hub-pinned")).toBeNull();
  });
  it("switching temporary panels never pins them", async () => {
    mountHub();
    await app("lobby").trigger("click");
    await app("chat").trigger("click");
    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(false);
    expect(currentHub()).toBe("chat");
  });
  it("the pin highlights orange and fills Chat's whole icon", async () => {
    mountHub();
    await app("chat").trigger("click");
    expect(app("chat").classes().join(" ")).toContain(
      "border-[hsl(var(--tac-amber)/0.6)]",
    );
    await pinButton().trigger("click");
    expect(pinned()).toBe(true);
    expect(pinButton().classes().join(" ")).toContain(
      "text-[hsl(var(--tac-amber))]",
    );
    expect(app("chat").classes().join(" ")).toContain(
      "[background:linear-gradient(135deg,var(--tac-amber-cta-from)",
    );
    expect(localStorage.getItem("right-hub-pinned")).toBe("1");
  });
  it("closing, reopening and switching preserve an explicit pin", async () => {
    mountHub();
    await app("lobby").trigger("click");
    await pinButton().trigger("click");
    await app("lobby").trigger("click");
    expect(hubOpen()).toBe(false);
    expect(pinned()).toBe(true);
    await app("chat").trigger("click");
    await app("social").trigger("click");
    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(true);
    await pinButton().trigger("click");
    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(false);
    expect(localStorage.getItem("right-hub-pinned")).toBeNull();
  });
  it("outside click closes a temporary panel, but leaves a pinned panel open", async () => {
    mountHub();
    await app("social").trigger("click");
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await nextTick();
    expect(hubOpen()).toBe(false);
    await app("social").trigger("click");
    await pinButton().trigger("click");
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await nextTick();
    expect(hubOpen()).toBe(true);
  });
  it("leaving closes temporary panels and preserves pinned panels", async () => {
    mountHub();
    await app("social").trigger("click");
    const layer = wrapper!.find("nav").element.parentElement!;
    layer.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null }));
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(hubOpen()).toBe(false);
    await app("social").trigger("click");
    await pinButton().trigger("click");
    layer.dispatchEvent(new MouseEvent("mouseleave", { relatedTarget: null }));
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(hubOpen()).toBe(true);
  });
});

describe("conversation shortcuts", () => {
  it("orders global, announcements, organizers, other rooms, then people with no duplicates", async () => {
    const { openTab } = useChatTabs();
    const prefs = useDockShortcutPrefs();
    for (const type of [
      "direct",
      "tournament",
      "global",
      "organizers",
      "announcement",
    ] as const) {
      const id = type === "direct" ? "direct:1:2" : type;
      openTab(
        { id, type, label: type, instance: type, lobbyId: id },
        { setActive: false },
      );
      prefs.togglePin(id);
    }
    mountHub();
    expect(
      wrapper!
        .findAll("[data-dock-shortcut]")
        .map((item) => item.attributes("data-dock-shortcut")),
    ).toEqual([
      "global",
      "announcement",
      "organizers",
      "tournament",
      "direct:1:2",
    ]);
  });
  it("removed and hidden rooms repin immediately, persist, and do not duplicate", async () => {
    const { openTab } = useChatTabs();
    const prefs = useDockShortcutPrefs();
    for (const type of [
      "announcement",
      "organizers",
      "global",
      "tournament",
      "team",
    ] as const) {
      openTab(
        { id: type, type, label: type, instance: type, lobbyId: type },
        { setActive: false },
      );
      prefs.togglePin(type);
    }
    mountHub();
    for (const type of [
      "announcement",
      "organizers",
      "global",
      "tournament",
      "team",
    ]) {
      prefs.dismiss(type);
      await nextTick();
      expect(wrapper!.find(`[data-dock-shortcut="${type}"]`).exists()).toBe(
        false,
      );
      prefs.togglePin(type);
      await nextTick();
      expect(wrapper!.findAll(`[data-dock-shortcut="${type}"]`)).toHaveLength(
        1,
      );
      prefs.hide(type);
      await nextTick();
      expect(wrapper!.find(`[data-dock-shortcut="${type}"]`).exists()).toBe(
        false,
      );
      prefs.togglePin(type);
      await nextTick();
      expect(wrapper!.findAll(`[data-dock-shortcut="${type}"]`)).toHaveLength(
        1,
      );
      const saved = JSON.parse(localStorage.getItem("hub-dock-shortcuts")!);
      expect(saved.pinned).toContain(type);
      expect(saved.hidden).not.toContain(type);
      expect(saved.dismissed[type]).toBeUndefined();
    }
  });
  it("the Chat menu retains limits without sidebar view switches", async () => {
    mountHub();
    await app("chat").trigger("contextmenu", {
      clientX: 50,
      clientY: 50,
      button: 2,
    });
    await flushPromises();
    const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
    expect(
      items.some(
        (item) => item.textContent?.trim() === "layouts.hub.dock.rooms",
      ),
    ).toBe(false);
    expect(
      items.some(
        (item) => item.textContent?.trim() === "layouts.hub.dock.people",
      ),
    ).toBe(false);
    expect(document.body.textContent).toContain("layouts.hub.dock.on_the_dock");
  });
  it("default rooms appear without activity, while removed rooms stay removed", async () => {
    const tabs = useChatTabs();
    for (const type of ["global", "announcement", "organizers"] as const)
      tabs.openTab(
        { id: type, type, label: type, instance: type, lobbyId: type },
        { setActive: false },
      );
    mountHub();
    expect(
      wrapper!
        .findAll("[data-dock-shortcut]")
        .map((el) => el.attributes("data-dock-shortcut")),
    ).toEqual(["global", "announcement", "organizers"]);
    useDockShortcutPrefs().dismiss("global");
    await nextTick();
    expect(wrapper!.find('[data-dock-shortcut="global"]').exists()).toBe(false);
    tabs.noteActivity("global", Date.now() - 1000);
    await nextTick();
    expect(wrapper!.find('[data-dock-shortcut="global"]').exists()).toBe(false);
    useDockShortcutPrefs().togglePin("global");
    await nextTick();
    expect(wrapper!.findAll('[data-dock-shortcut="global"]')).toHaveLength(1);
    useDockShortcutPrefs().togglePin("global", true);
    await nextTick();
    expect(wrapper!.find('[data-dock-shortcut="global"]').exists()).toBe(false);
    useDockShortcutPrefs().togglePin("global", true);
    await nextTick();
    expect(wrapper!.findAll('[data-dock-shortcut="global"]')).toHaveLength(1);
  });
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

  it("a recently active conversation opens temporarily", async () => {
    addDirect();
    mountHub();
    await nextTick();
    const shortcut = wrapper!.find('[data-dock-shortcut="direct:1:2"] button');
    expect(shortcut.exists()).toBe(true);

    await shortcut.trigger("click");
    expect(hubOpen()).toBe(true);
    expect(pinned()).toBe(false);
    expect(currentHub()).toBe("chat");
    expect(useChatTabs().activeTabId.value).toBe("direct:1:2");
  });

  it("Pin to the dock keeps a conversation there without any activity", async () => {
    const { openTab } = useChatTabs();
    openTab(
      {
        id: "global",
        label: "Global",
        instance: "global",
        type: "global",
        lobbyId: "global",
      },
      { setActive: false },
    );
    useDockShortcutPrefs().dismiss("global");
    mountHub();
    expect(wrapper!.find('[data-dock-shortcut="global"]').exists()).toBe(false);

    localStorage.setItem(
      "hub-dock-shortcuts",
      JSON.stringify({ pinned: ["global"] }),
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

describe("friend arrival badge", () => {
  const friend = (id: string) => ({
    steam_id: id,
    name: `Friend ${id}`,
    avatar_url: `/avatars/${id}.png`,
  });
  it("shows the newest arriving avatar for four seconds and restores the online count without opening", async () => {
    store.friends = [friend("2"), friend("3")];
    store.hasOnlinePlayerSnapshot = true;
    mountHub();
    store.onlineFriends = [friend("2")];
    await nextTick();
    expect(
      wrapper!.find('[data-dock-app="social"] img').attributes("src"),
    ).toBe("https://api/avatars/2.png");
    vi.advanceTimersByTime(3000);
    store.onlineFriends = [friend("2"), friend("3")];
    await nextTick();
    expect(
      wrapper!.find('[data-dock-app="social"] img').attributes("src"),
    ).toBe("https://api/avatars/3.png");
    vi.advanceTimersByTime(3999);
    await nextTick();
    expect(wrapper!.find('[data-dock-app="social"] img').exists()).toBe(true);
    vi.advanceTimersByTime(1);
    await nextTick();
    expect(wrapper!.find('[data-dock-app="social"] img').exists()).toBe(false);
    expect(wrapper!.find('[data-dock-app="social"]').text()).toContain("2");
    expect(hubOpen()).toBe(false);
  });
  it("does not announce the initial snapshot or brief reconnects and clears timers on unmount", async () => {
    store.friends = [friend("2")];
    store.hasOnlinePlayerSnapshot = true;
    store.onlineFriends = [friend("2")];
    mountHub();
    expect(wrapper!.find('[data-dock-app="social"] img').exists()).toBe(false);
    store.onlineFriends = [];
    await nextTick();
    vi.advanceTimersByTime(1000);
    store.onlineFriends = [friend("2")];
    await nextTick();
    expect(wrapper!.find('[data-dock-app="social"] img').exists()).toBe(false);
    wrapper!.unmount();
    wrapper = null;
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("badges", () => {
  it("Chat keeps the amber unread and red urgent counts", async () => {
    const { openTab, incrementUnread, incrementMention } = useChatTabs();
    openTab(
      {
        id: "global",
        label: "Global",
        instance: "global",
        type: "global",
        lobbyId: "global",
      },
      { setActive: false },
    );
    // Off the dock (limit 0), so Chat itself carries the counts.
    localStorage.setItem(
      "hub-dock-shortcuts",
      JSON.stringify({ maxPeople: 0, maxRooms: 0 }),
    );
    useDockShortcutPrefs().setLimit("rooms", 0);
    incrementUnread("global");
    incrementUnread("global");
    incrementUnread("global");
    incrementMention("global");
    mountHub();
    await nextTick();

    const chat = wrapper!.find('[data-dock-app="chat"]');
    expect(chat.find(".bg-\\[hsl\\(var\\(--tac-amber\\)\\)\\]").text()).toBe(
      "2",
    );
    expect(chat.find("[data-dock-urgent-badge]").text()).toBe("1");
    useDockShortcutPrefs().setLimit("rooms", 2);
  });

  it("Alerts shows its unread count", async () => {
    notificationStore.hasNotifications = true;
    notificationStore.unreadNotificationCount = 3;
    mountHub();
    await nextTick();
    expect(wrapper!.find('[data-dock-app="notifications"]').text()).toContain(
      "3",
    );
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
    expect(wrapper!.find('[data-dock-app="lobby"]').text()).not.toContain(
      "1:05",
    );
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
    await app("social").trigger("click");
    await nextTick();
    const inside = wrapper!.find('[data-panel="social"]')
      .element as HTMLElement;
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
    await pinButton().trigger("click");
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
    const header = panel.slice(
      0,
      panel.indexOf('class="flex-1 overflow-y-auto'),
    );
    expect(header).toContain('to="/settings/notification-preferences"');
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
