import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
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

// Phase B: the restored Lobby panel and its queue line (5Stack's LobbyPanel
// and PartyQueueLine), with DEAFCS's search clock correction, Captain Pick
// naming, squad list, lobby access setting and lobby webcam call.

const mocks = vi.hoisted(() => ({
  socketEvents: [] as Array<[string, unknown]>,
  stub: (name: string, attrs: Record<string, string> = {}) => async () => {
    const { defineComponent, h } = await import("vue");
    return {
      default: defineComponent({
        name,
        inheritAttrs: false,
        props: ["lobby", "lobbyId", "showBar", "type", "instance"],
        emits: ["open-call", "status"],
        setup: (props, { emit }) => () =>
          h("div", {
            "data-stub": name,
            "data-lobby-id": (props as any).lobbyId ?? (props as any).lobby?.id,
            onClick: () => emit("open-call"),
            ...attrs,
          }),
      }),
    };
  },
}));

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
vi.mock("~/components/matchmaking-lobby/MatchLobbyExpanded.vue", mocks.stub("MatchLobbyExpanded"));
vi.mock("~/components/matchmaking-lobby/MatchmakingLobbyAccess.vue", mocks.stub("MatchmakingLobbyAccess"));
vi.mock("~/components/matchmaking-lobby/LobbyCallPanel.vue", mocks.stub("LobbyCallPanel"));
vi.mock("~/components/matchmaking-lobby/LobbyInvites.vue", mocks.stub("LobbyInvites"));
vi.mock("~/components/chat/ChatLobby.vue", mocks.stub("ChatLobby"));
// The search pill imports the store module itself; it gets the same stand-in.
vi.mock("~/stores/MatchmakingStore", () => ({
  useMatchmakingStore: () => (globalThis as any).useMatchmakingStore(),
}));

const store = reactive<any>({
  currentLobby: null,
  lobbyInvites: [],
  friends: [],
  joinedMatchmakingQueues: {},
  creatingLobby: false,
  viewingMatchId: null,
  createLobby: vi.fn(),
});
const matchLobbyStore = reactive<any>({ myMatches: [] });
const auth = reactive<any>({
  me: { steam_id: "1" },
  isRoleAbove: () => false,
});

vi.stubGlobal("ref", ref);
vi.stubGlobal("computed", computed);
vi.stubGlobal("watch", watch);
vi.stubGlobal("onMounted", onMounted);
vi.stubGlobal("onBeforeUnmount", onBeforeUnmount);
vi.stubGlobal("useMatchmakingStore", () => store);
vi.stubGlobal("useMatchLobbyStore", () => matchLobbyStore);
vi.stubGlobal("useAuthStore", () => auth);
vi.stubGlobal("useSound", () => ({ playMatchFoundSound: vi.fn() }));
vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));

import { useQuickQueue } from "../../composables/useQuickQueue";
import PartyQueueLine from "../../components/hub/PartyQueueLine.vue";
import LobbyPanel from "../../components/hub/LobbyPanel.vue";
import { useMatchReadyModal } from "../../composables/useMatchReadyModal";
import { useRightSidebar } from "../../composables/useRightSidebar";
import { setActiveHub } from "../../composables/useHubState";
import { useChatTabs } from "../../composables/useChatTabs";

const NuxtLink = defineComponent({
  props: ["to"],
  setup: (props, { slots }) => () =>
    h(
      "a",
      { "data-to": typeof props.to === "string" ? props.to : JSON.stringify(props.to) },
      slots.default?.(),
    ),
});
const global = {
  mocks: {
    $t: (key: string, params?: unknown) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    $apollo: { mutate: vi.fn() },
  },
  stubs: { NuxtLink, Transition: false },
};

const NOW = Date.parse("2026-10-11T12:00:00Z");
const lobby = (captain = "1") => ({
  id: "lobby-1",
  players: [
    { captain: captain === "1", status: "Accepted", player: { steam_id: "1", name: "Me" } },
    { captain: captain === "2", status: "Accepted", player: { steam_id: "2", name: "Leader" } },
  ],
});

function search(details: Record<string, unknown>) {
  store.joinedMatchmakingQueues = { details };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.socketEvents.length = 0;
  store.currentLobby = null;
  store.lobbyInvites = [];
  store.joinedMatchmakingQueues = {};
  store.createLobby.mockClear();
  matchLobbyStore.myMatches = [];
  useMatchReadyModal().closeMatchReadyModal();
});

afterEach(() => {
  vi.useRealTimers();
});

function withQueue() {
  let api: ReturnType<typeof useQuickQueue> | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useQuickQueue();
        return () => h("div");
      },
    }),
  );
  return { api: api!, wrapper };
}

describe("search clock (useQuickQueue)", () => {
  it("counts from the server's join time", () => {
    search({ type: "Competitive", joinedAt: new Date(NOW - 65_000).toISOString() });
    expect(withQueue().api.clock.value).toBe("1:05");
  });

  it("is right on a device whose clock is 45 seconds ahead", () => {
    // The server says it is NOW; this device read NOW + 45s on arrival.
    vi.setSystemTime(NOW + 45_000);
    search({
      type: "Competitive",
      joinedAt: new Date(NOW - 10_000).toISOString(),
      serverNow: new Date(NOW).toISOString(),
      receivedAt: NOW + 45_000,
    });
    expect(withQueue().api.clock.value).toBe("0:10");
  });

  it("is right on a device whose clock is 20 seconds behind", () => {
    vi.setSystemTime(NOW - 20_000);
    search({
      type: "Wingman",
      joinedAt: new Date(NOW - 30_000).toISOString(),
      serverNow: new Date(NOW).toISOString(),
      receivedAt: NOW - 20_000,
    });
    expect(withQueue().api.clock.value).toBe("0:30");
  });

  it("keeps counting from the same start after a refresh or reconnect", () => {
    const details = {
      type: "Competitive",
      joinedAt: new Date(NOW - 5_000).toISOString(),
    };
    search(details);
    withQueue().wrapper.unmount();

    // A reload (or a reconnect) re-sends the same queue state a bit later.
    vi.setSystemTime(NOW + 60_000);
    search({ ...details });
    expect(withQueue().api.clock.value).toBe("1:05");
  });

  it("ticks every second while searching", async () => {
    search({ type: "Competitive", joinedAt: new Date(NOW).toISOString() });
    const { api } = withQueue();
    expect(api.clock.value).toBe("0:00");
    vi.advanceTimersByTime(3_000);
    await nextTick();
    expect(api.clock.value).toBe("0:03");
  });

  it("clears when the search ends, is matched or fails", () => {
    search({ type: "Competitive", joinedAt: new Date(NOW).toISOString() });
    const { api } = withQueue();
    expect(api.clock.value).not.toBeNull();
    store.joinedMatchmakingQueues = {};
    expect(api.queue.value).toBeUndefined();
    expect(api.clock.value).toBeNull();
  });

  it("names Captain Pick by its queue name", () => {
    const { api } = withQueue();
    expect(api.modeTitle({ type: "Competitive", variant: "CaptainPick" })).toBe(
      "matchmaking.captain_pick.title",
    );
    expect(api.modeTitle({ type: "Competitive", variant: "Standard" })).toBe(
      "Competitive",
    );
  });

  it("cancel is the same leave the Play page sends", () => {
    withQueue().api.leave();
    expect(mocks.socketEvents).toEqual([["matchmaking:leave", undefined]]);
  });
});

describe("queue line (PartyQueueLine)", () => {
  const line = () => mount(PartyQueueLine, { props: { lobby: store.currentLobby }, global });

  it("searching: mode, clock, regions and Cancel", () => {
    store.currentLobby = lobby();
    search({
      type: "Competitive",
      variant: "CaptainPick",
      joinedAt: new Date(NOW - 42_000).toISOString(),
      regions: ["EU", "NA"],
    });
    const text = line().text();
    expect(text).toContain("matchmaking.captain_pick.title");
    expect(text).toContain("0:42");
    expect(text).toContain("EU, NA");
    expect(text).toContain("layouts.party_room.cancel");
  });

  it("any party member may cancel, as on the Play page", async () => {
    store.currentLobby = lobby("2");
    search({ type: "Competitive", joinedAt: new Date(NOW).toISOString() });
    const wrapper = line();
    await wrapper.find("[data-party-queue-searching] button").trigger("click");
    expect(mocks.socketEvents).toEqual([["matchmaking:leave", undefined]]);
  });

  it("idle leader: starts the search on the Play page", () => {
    store.currentLobby = lobby("1");
    const link = line().find("a");
    expect(link.attributes("data-to")).toBe("/play");
    expect(link.text()).toContain("layouts.lobby_panel.find_match");
  });

  it("idle member: the leader picks", () => {
    store.currentLobby = lobby("2");
    const text = line().text();
    expect(text).toContain("layouts.party_room.leader_picks");
    expect(text).toContain("Leader");
    expect(line().find('a[data-to="/play"]').exists()).toBe(false);
  });

  it("match found: check in from the lobby", async () => {
    store.currentLobby = lobby();
    store.joinedMatchmakingQueues = {
      confirmation: { confirmed: 3, players: 10, matchId: null },
    };
    const wrapper = line();
    expect(wrapper.text()).toContain("matchmaking.match_found");
    await wrapper.find("button").trigger("click");
    expect(useMatchReadyModal().manuallyOpened.value).toBe(true);
  });

  it("in a match (Captain Pick included): links to the match", () => {
    store.currentLobby = lobby();
    matchLobbyStore.myMatches = [
      { id: "m1", status: "PickingPlayers", lineup_1: { name: "A" }, lineup_2: { name: "B" } },
    ];
    const link = line().find("a");
    expect(link.attributes("data-to")).toContain("m1");
    expect(link.text()).toContain("A vs B");
  });
});

describe("Lobby panel", () => {
  const panel = () => mount(LobbyPanel, { global, attachTo: document.body });

  it("with no lobby: the empty state creates one", async () => {
    const wrapper = panel();
    expect(wrapper.text()).toContain("layouts.hub.empty.party_title");
    await wrapper.find("button").trigger("click");
    expect(store.createLobby).toHaveBeenCalled();
  });

  it("shows lobby invites", async () => {
    store.lobbyInvites = [{ id: "i1" }];
    const wrapper = panel();
    await nextTick();
    expect(wrapper.find('[data-stub="LobbyInvites"]').exists()).toBe(true);
  });

  it("in a lobby: squad, access setting, webcam call, queue line and lobby chat", async () => {
    store.currentLobby = lobby();
    const wrapper = panel();
    await nextTick();

    expect(wrapper.find('[data-stub="MatchLobbyExpanded"]').exists()).toBe(true);
    expect(wrapper.find('[data-stub="MatchmakingLobbyAccess"]').exists()).toBe(true);
    expect(wrapper.find('[data-stub="LobbyCallPanel"]').attributes("data-lobby-id")).toBe("lobby-1");
    expect(wrapper.find('[data-stub="ChatLobby"]').exists()).toBe(true);
    expect(wrapper.find('a[data-to="/play"]').exists()).toBe(true);
  });

  it("the webcam button opens the lobby's call window", async () => {
    store.currentLobby = lobby();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const wrapper = panel();
    await nextTick();
    await wrapper.find("[data-lobby-call]").trigger("click");
    expect(open).toHaveBeenCalledWith(
      "/matchmaking/lobby-call/lobby-1",
      "lobby-call",
      expect.any(String),
    );
    open.mockRestore();
  });

  it("reading the lobby chat here clears its Chat badge", async () => {
    store.currentLobby = lobby();
    const { openTab, incrementUnread, unreadCounts } = useChatTabs();
    openTab(
      { id: "matchmaking:lobby-1", label: "Lobby", instance: "matchmaking", type: "matchmaking", lobbyId: "lobby-1" },
      { setActive: false },
    );
    incrementUnread("matchmaking:lobby-1");
    setActiveHub("lobby");
    useRightSidebar().setRightSidebarOpen(true);
    panel();
    await nextTick();
    expect(unreadCounts.value["matchmaking:lobby-1"]).toBe(0);
    useRightSidebar().setRightSidebarOpen(false);
  });
});

describe("search pill (one clock on screen)", () => {
  let mobile = false;
  const realMatchMedia = window.matchMedia;

  beforeEach(() => {
    mobile = false;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("max-width: 768px") ? mobile : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as any;
    useRightSidebar().setRightSidebarOpen(false);
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  async function pill() {
    const { default: Toast } = await import(
      "../../components/matchmaking/MatchmakingSearchToast.vue"
    );
    return mount(Toast, {
      global: {
        ...global,
        mocks: { ...global.mocks, $route: { path: "/matches" } },
        stubs: {
          ...global.stubs,
          ClientOnly: { setup: (_: unknown, { slots }: any) => () => slots.default?.() },
          TimeAgo: {
            props: ["date"],
            setup: (props: any) => () => h("time", String(props.date)),
          },
        },
      },
    });
  }

  it("never shows on a desktop, where the dock's Lobby icon has the clock", async () => {
    search({ type: "Competitive", joinedAt: new Date(NOW).toISOString() });
    expect((await pill()).find("[data-mobile-search-pill]").exists()).toBe(false);
  });

  it("shows on a phone while the hub is closed, and steps aside when it opens", async () => {
    mobile = true;
    search({ type: "Competitive", joinedAt: new Date(NOW).toISOString() });
    const wrapper = await pill();
    expect(wrapper.find("[data-mobile-search-pill]").exists()).toBe(true);

    useRightSidebar().setRightSidebarOpen(true);
    await nextTick();
    expect(wrapper.find("[data-mobile-search-pill]").exists()).toBe(false);
  });

  it("counts from the corrected start on a phone whose clock is off", async () => {
    mobile = true;
    vi.setSystemTime(NOW + 45_000);
    search({
      type: "Competitive",
      joinedAt: new Date(NOW - 10_000).toISOString(),
      serverNow: new Date(NOW).toISOString(),
      receivedAt: NOW + 45_000,
    });
    const wrapper = await pill();
    expect(wrapper.find("time").text()).toBe(String(NOW + 35_000));
  });

  it("is gone once the search ends", async () => {
    mobile = true;
    search({ type: "Competitive", joinedAt: new Date(NOW).toISOString() });
    const wrapper = await pill();
    store.joinedMatchmakingQueues = {};
    await nextTick();
    expect(wrapper.find("[data-mobile-search-pill]").exists()).toBe(false);
  });
});

describe("wiring", () => {
  const read = (file: string) =>
    fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("creating or joining a lobby opens the Lobby panel, not the chat tab", () => {
    const source = read("stores/MatchmakingStore.ts");
    const create = source.slice(source.indexOf("const createLobby"), source.indexOf("const inviteToLobby"));
    const join = source.slice(source.indexOf("const joinLobby"), source.indexOf("function openLobbyHub"));
    expect(create).toContain("openLobbyHub(newLobbyId as string)");
    expect(join).toContain("openLobbyHub(lobby_id)");

    const open = source.slice(source.indexOf("function openLobbyHub"));
    expect(open).toContain('setActiveHub("lobby")');
    expect(open).toContain("{ setActive: false }");
    expect(source).not.toContain('setActiveHub("chat")');
  });

  it("the floating search timer no longer has a desktop position to sit in", () => {
    const toast = read("components/matchmaking/MatchmakingSearchToast.vue");
    expect(toast).not.toContain("md:right-[30.75rem]");
    expect(toast).toContain("shouldShow && isMobile && !rightSidebarOpen");
  });

  it("the hub never starts a search: Captain Pick, verified-only modes and the matchmaking switches stay with /play", () => {
    for (const file of [
      "composables/useQuickQueue.ts",
      "components/hub/PartyQueueLine.vue",
      "components/hub/LobbyPanel.vue",
      "layouts/components/RightHub.vue",
    ]) {
      expect(read(file)).not.toContain("matchmaking:join-queue");
    }
  });

  it("the match-found accept popup and the Play page timer are untouched", () => {
    expect(read("app.vue")).toContain("MatchmakingConfirm");
    expect(read("components/matchmaking/Matchmaking.vue")).toContain(
      "localServerTime(details?.joinedAt, details)",
    );
  });

  it("chat counts the lobby room as read while the Lobby panel shows it", () => {
    expect(read("web-sockets/Socket.ts")).toContain('(hub === "lobby" && type === "matchmaking")');
    expect(read("components/hub/ChatPanel.vue")).toContain('currentHub() === "lobby"');
  });
});
