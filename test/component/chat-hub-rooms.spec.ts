import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, onMounted, reactive } from "vue";

const mocks = vi.hoisted(() => ({
  hubCalls: [] as string[],
  matchLobbyStore: null as any,
  route: { params: {} as Record<string, string>, query: {} as any },
  lobbyProps: [] as any[],
  emptyComponent: async () => {
    const { defineComponent, h } = await import("vue");
    return { default: defineComponent({ setup: () => () => h("div") }) };
  },
}));

vi.mock("~/composables/useHubState", () => ({
  setActiveHub: (hub: string) => mocks.hubCalls.push(hub),
}));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => mocks.matchLobbyStore,
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("#app", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ resolve: () => ({ href: "/chat/x" }), push: vi.fn() }),
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: { steam_id: "1" }, isRoleAbove: () => false }),
}));
vi.mock("@vue/apollo-composable", () => ({ useApolloClient: () => ({}) }));

// A stand-in for ChatLobby that records what the Hub mounts and can play a
// realtime message into the Hub the way the real one emits it.
vi.mock("~/components/chat/ChatLobby.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({
    name: "ChatLobby",
    props: {
      instance: String,
      type: String,
      lobbyId: String,
      tabId: String,
      canSend: { type: Boolean, default: true },
      allowChatAttachments: { type: Boolean, default: true },
      isActiveTab: Boolean,
    },
    emits: ["message-received"],
    setup(props) {
      mocks.lobbyProps.push(props);
      return () => h("div", { "data-lobby": `${props.type}:${props.lobbyId}` });
    },
  }) };
});
vi.mock("~/components/chat/ChatParticipantsList.vue", mocks.emptyComponent);
vi.mock("~/components/LiveAvatarImg.vue", mocks.emptyComponent);
vi.mock("~/components/matchmaking-lobby/LobbyCallPanel.vue", mocks.emptyComponent);
vi.mock("~/composables/useTournamentWebcamStatus", async () => {
  const vue = await import("vue");
  return { useTournamentWebcamStatus: () => ({ participants: vue.ref([]) }) };
});
vi.mock("~/composables/useIncomingDirectMessages", () => ({
  markDirectMessagesRead: vi.fn(),
}));

import socket from "../../web-sockets/Socket";
import ChatPanel from "../../components/hub/ChatPanel.vue";
import ChatPopoutPage from "../../pages/chat/[tabId].vue";
import { useChatTabs, type ChatTab } from "../../composables/useChatTabs";
import { useRightSidebar } from "../../composables/useRightSidebar";
import { useChatNotificationNavigation } from "../../composables/useChatNotificationNavigation";
import { useChatTabSetup } from "../../composables/useChatTabSetup";
import {
  matchChatHubContext,
  useChatHubContext,
} from "../../composables/useChatHubContext";

const room = (
  type: ChatTab["type"],
  lobbyId: string,
  label: string,
): ChatTab => ({
  id: `${type}:${lobbyId}`,
  label,
  instance: type,
  type,
  lobbyId,
  pinned: true,
});

const PassThrough = defineComponent({
  setup: (_p, { slots }) => () => h("div", slots.default?.()),
});

function mountPanel() {
  return mount(ChatPanel, {
    props: { isSidebarOpen: true, isTabActive: true },
    global: {
      stubs: {
        Tooltip: PassThrough,
        TooltipProvider: PassThrough,
        TooltipTrigger: PassThrough,
        TooltipContent: PassThrough,
        Empty: PassThrough,
      },
      mocks: { $t: (key: string) => key },
    },
  });
}

beforeEach(() => {
  localStorage.clear();
  useChatTabs().clearAll();
  useRightSidebar().setRightSidebarOpen(false);
  mocks.hubCalls.length = 0;
  mocks.lobbyProps.length = 0;
  mocks.matchLobbyStore = reactive({ myMatches: [], lobbyChat: {} });
  vi.stubGlobal("nextTick", nextTick);
  vi.stubGlobal("onMounted", onMounted);
  vi.stubGlobal("useAuthStore", () => ({
    me: { steam_id: "1" },
    isRoleAbove: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chat Hub room list", () => {
  it("lists Team Chat right below its match's Match Chat", async () => {
    const { openTab } = useChatTabs();
    for (const tab of [
      room("match_team", "m1:l1", "Team Alpha"),
      room("match", "m2", "Aardvark vs Zebra"),
      room("match", "m1", "Team Alpha vs Team Bravo"),
      room("tournament", "t1", "Cup"),
    ]) {
      openTab(tab, { setActive: false });
    }
    const wrapper = mountPanel();
    await flushPromises();

    const order = wrapper
      .findAll("[data-chat-tab-id]")
      .map((el) => el.attributes("data-chat-tab-id"));
    expect(order).toEqual([
      "tournament:t1",
      "match:m2",
      "match:m1",
      "match_team:m1:l1",
    ]);
    wrapper.unmount();
  });

  it("shows the Team Chat subtitle for match and Captain Pick team rooms", async () => {
    const { openTab } = useChatTabs();
    openTab(room("match_team", "m1:l1", "Team Alpha"), { setActive: false });
    openTab(room("captain_pick_team", "d1:1", "Team Anna"), {
      setActive: false,
    });
    openTab(room("draft", "d9", "Host's Draft Room"), { setActive: false });
    const wrapper = mountPanel();
    await flushPromises();

    const text = wrapper.text();
    expect(text.match(/chat_room_subtitles\.team/g)?.length).toBe(2);
    expect(text).toContain("chat_room_subtitles.draft");
    wrapper.unmount();
  });

  it("never counts unread for match, team, draft or Captain Pick team rooms, but still does for tournament chat", async () => {
    const { openTab, unreadCounts } = useChatTabs();
    const rooms = [
      room("global", "global", "Global"),
      room("match", "m1", "A vs B"),
      room("match_team", "m1:l1", "Team A"),
      room("draft", "d1", "Draft"),
      room("captain_pick_team", "d2:1", "Team X"),
      room("tournament", "t1", "Cup"),
    ];
    rooms[0].id = "global";
    for (const tab of rooms) openTab(tab, { setActive: false });
    useChatTabs().setActiveTab("global");

    const wrapper = mountPanel();
    await flushPromises();

    for (const lobby of wrapper.findAllComponents({ name: "ChatLobby" })) {
      lobby.vm.$emit("message-received", {
        tabId: lobby.props("tabId"),
        direction: "inbound",
        message: { id: "x" },
      });
    }
    await flushPromises();

    expect(unreadCounts.value["tournament:t1"]).toBe(1);
    for (const id of [
      "match:m1",
      "match_team:m1:l1",
      "draft:d1",
      "captain_pick_team:d2:1",
    ]) {
      expect(unreadCounts.value[id] ?? 0).toBe(0);
    }
    wrapper.unmount();
  });

  it("mounts each room once with its canonical type and id, without attachments for match rooms", async () => {
    const { openTab } = useChatTabs();
    openTab(room("match", "m1", "A vs B"), { setActive: false });
    openTab(room("match_team", "m1:l1", "Team A"), { setActive: false });
    openTab(room("captain_pick_team", "d1:2", "Team B"), { setActive: false });
    const wrapper = mountPanel();
    await flushPromises();

    const mounted = wrapper
      .findAllComponents({ name: "ChatLobby" })
      .map((c) => ({
        type: c.props("type"),
        lobbyId: c.props("lobbyId"),
        attachments: c.props("allowChatAttachments"),
      }));
    expect(mounted).toEqual([
      { type: "match", lobbyId: "m1", attachments: false },
      { type: "match_team", lobbyId: "m1:l1", attachments: false },
      { type: "captain_pick_team", lobbyId: "d1:2", attachments: true },
    ]);
    wrapper.unmount();
  });
});

describe("session tab setup", () => {
  const match = (id: string) => ({
    id,
    label: null,
    lineup_1: { id: `${id}-a`, name: "Alpha", is_on_lineup: true },
    lineup_2: { id: `${id}-b`, name: "Bravo", is_on_lineup: false },
  });

  function mountSetup() {
    const Root = defineComponent({
      setup() {
        useChatTabSetup();
        return () => h("div");
      },
    });
    return mount(Root);
  }

  it("keeps a playing participant's own Team Chat next to Match Chat, on every page and after F5", async () => {
    const m1 = match("m1");
    Object.assign(mocks.matchLobbyStore, {
      myMatches: [m1],
      currentMatch: m1,
      chatTournaments: [],
      chatTournamentsLoaded: true,
    });
    const wrapper = mountSetup();
    await flushPromises();

    const ids = useChatTabs().tabs.value.map((t) => t.id);
    expect(ids).toContain("match:m1");
    expect(ids).toContain("match_team:m1:m1-a");
    expect(ids).not.toContain("match_team:m1:m1-b");

    // The match ends: both go.
    mocks.matchLobbyStore.myMatches = [];
    mocks.matchLobbyStore.currentMatch = undefined;
    await flushPromises();
    const after = useChatTabs().tabs.value.map((t) => t.id);
    expect(after).not.toContain("match:m1");
    expect(after).not.toContain("match_team:m1:m1-a");
    wrapper.unmount();
  });

  it("does not sweep away the Match Chat an admin is watching on its page", async () => {
    Object.assign(mocks.matchLobbyStore, {
      myMatches: [],
      currentMatch: undefined,
      chatTournaments: [],
      chatTournamentsLoaded: true,
    });
    const setup = mountSetup();
    const Page = defineComponent({
      setup() {
        useChatHubContext(() =>
          matchChatHubContext(match("m9"), true, null, (k) => k),
        );
        return () => h("div");
      },
    });
    const page = mount(Page);

    // The admin's own match list changes while they watch.
    mocks.matchLobbyStore.myMatches = [match("m1")];
    await flushPromises();
    expect(useChatTabs().tabs.value.map((t) => t.id)).toContain("match:m9");

    page.unmount();
    expect(useChatTabs().tabs.value.map((t) => t.id)).not.toContain(
      "match:m9",
    );
    setup.unmount();
  });
});

describe("Chat pop-out", () => {
  const popout = (type: string, lobbyId: string) => {
    mocks.route.params = { tabId: `${type}:${lobbyId}` };
    mocks.route.query = { type, lobbyId, instance: type, label: "Room" };
    vi.stubGlobal("useHead", vi.fn());
    vi.stubGlobal("definePageMeta", vi.fn());
    return mount(ChatPopoutPage, {
      global: { mocks: { $t: (key: string) => key } },
    });
  };

  it.each([
    ["match", "m1", false],
    ["match_team", "m1:l1", false],
    ["captain_pick_team", "d1:1", true],
  ])("joins the %s room with its canonical id", (type, lobbyId, attachments) => {
    const wrapper = popout(type, lobbyId);
    const lobby = wrapper.findComponent({ name: "ChatLobby" });
    expect(lobby.props("type")).toBe(type);
    expect(lobby.props("lobbyId")).toBe(lobbyId);
    expect(lobby.props("allowChatAttachments")).toBe(attachments);
    expect(wrapper.text()).toContain(`chat_tab_labels.${type}`);
    wrapper.unmount();
  });
});

describe("chat notification click", () => {
  it("routes a Team Chat notification to its match page and focuses the room there", async () => {
    const navigateTo = vi.fn();
    vi.stubGlobal("navigateTo", navigateTo);
    const { openChatFromNotification } = useChatNotificationNavigation();

    await openChatFromNotification("ChatMessage", "match_team:m1:l1");
    expect(navigateTo).toHaveBeenCalledWith("/matches/m1");

    await openChatFromNotification("ChatMessage", "captain_pick_team:d1:2");
    expect(navigateTo).toHaveBeenCalledWith("/play/captain-pick");

    await openChatFromNotification("ChatMessage", "draft:d9");
    expect(navigateTo).toHaveBeenCalledWith("/draft-room/d9");

    // Nothing is opened here directly: the page offers the room.
    expect(useChatTabs().tabs.value).toEqual([]);
  });
});

describe("shared room cache", () => {
  const handles: Array<{ leave: () => void }> = [];
  const listeners: Array<{ stop: () => void }> = [];

  beforeEach(() => {
    (socket as any).connected = true;
    (socket as any).connection = { send: vi.fn() };
  });

  afterEach(() => {
    for (const l of listeners.splice(0)) l.stop();
    for (const handle of handles.splice(0)) handle.leave();
    (socket as any).connected = false;
    (socket as any).connection = undefined;
  });

  it("stores a message once even when the page chat and the Hub both listen to the room", () => {
    const received: string[] = [];
    // Inline match page chat + the same room in the Chat Hub.
    for (const instance of ["matches/id", "match"]) {
      handles.push(socket.joinLobby(instance, "match_team", "m1:l1"));
      listeners.push(
        socket.listenChat("match_team", "m1:l1", (m) =>
          received.push(`${instance}:${m.id}`),
        ),
      );
    }

    socket.emit("lobby:match_team:m1:l1:chat", {
      id: "msg-1",
      message: "rotate B",
      timestamp: 1,
    });

    expect(received).toEqual(["matches/id:msg-1", "match:msg-1"]);
    const fresh = socket.joinLobby("fresh-mount", "match_team", "m1:l1");
    handles.push(fresh);
    expect(fresh.messages.map((m: any) => m.id)).toEqual(["msg-1"]);
  });

  it("leaves the room only when the last instance leaves", () => {
    const send = (socket as any).connection.send as ReturnType<typeof vi.fn>;
    const page = socket.joinLobby("matches/id", "match", "m1");
    const hub = socket.joinLobby("match", "match", "m1");

    page.leave();
    expect(
      send.mock.calls.some((c) => String(c[0]).includes("lobby:leave")),
    ).toBe(false);

    hub.leave();
    expect(
      send.mock.calls.some((c) => String(c[0]).includes("lobby:leave")),
    ).toBe(true);
  });
});
