import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, reactive, ref, nextTick, type EffectScope } from "vue";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import en from "../../i18n/locales/en.json";

const state = vi.hoisted(() => ({
  auth: null as any,
  blocked: null as any,
  histories: null as any,
  next: null as any,
  listeners: new Map<string, Function>(),
  query: vi.fn(),
  mutate: vi.fn(),
  fetch: vi.fn(),
  toast: vi.fn(),
  relationship: vi.fn(),
}));
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => state.auth }));
vi.mock("~/composables/useFriendActions", () => ({
  useFriendActions: () => ({ relationship: state.relationship }),
}));
vi.mock("~/composables/useBlockActions", () => ({
  useBlockActions: () => ({
    isBlocked: (id: string) => state.blocked.has(String(id)),
  }),
}));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    query: state.query,
    mutate: state.mutate,
    subscribe: () => ({
      subscribe: ({ next }: any) => {
        state.next = next;
        return { unsubscribe: vi.fn() };
      },
    }),
  }),
}));
vi.mock("~/composables/useSubscriptionManager", () => ({
  useSubscriptionManager: () => ({ subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));
vi.mock("~/web-sockets/Socket", () => ({
  default: {
    lobbyMessages: (_: string, room: string) => state.histories[room] ?? [],
    listen: (event: string, callback: Function) => {
      state.listeners.set(event, callback);
      return {
        stop: () => {
          if (state.listeners.get(event) === callback)
            state.listeners.delete(event);
        },
      };
    },
  },
}));
vi.mock("~/components/ui/toast", () => ({ toast: state.toast }));
const t = (key: string) =>
  key.split(".").reduce((obj: any, part) => obj?.[part], en) ?? key;
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) =>
      key.split(".").reduce((obj: any, part) => obj?.[part], en) ?? key,
  }),
}));

import { useMessageRequests } from "../../composables/useMessageRequests";
import {
  useIncomingDirectMessages,
  markDirectMessagesRead,
} from "../../composables/useIncomingDirectMessages";
import { useChatTabs } from "../../composables/useChatTabs";
import {
  directChatId,
  directPeerSteamId,
  openDirectMessage,
} from "../../composables/useDirectMessage";
import { useRightSidebar } from "../../composables/useRightSidebar";
import { setActiveHub } from "../../composables/useHubState";
import MessageRequests from "../../components/hub/MessageRequests.vue";
import MessageRequestsRailButton from "../../components/hub/MessageRequestsRailButton.vue";
import MessageRequestsSetting from "../../components/settings/MessageRequestsSetting.vue";

const peer = {
  steam_id: "2",
  name: "Player Two",
  avatar_url: "/avatars/two.png",
};
const request = () => ({ roomId: "1:2", peer, unread: 1 });
const tabs = useChatTabs();
let scope: EffectScope | undefined;
let wrapper: VueWrapper | undefined;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function start() {
  scope = effectScope();
  scope.run(() => useIncomingDirectMessages());
}
function incoming(data: any) {
  state.listeners.get("direct:incoming")?.(data);
}
function setting() {
  wrapper = mount(MessageRequestsSetting, { global: { mocks: { $t: t } } });
  return wrapper;
}
beforeEach(() => {
  localStorage.clear();
  tabs.clearAll();
  state.listeners.clear();
  state.auth = reactive({ me: { steam_id: "1" } });
  state.blocked = reactive(new Set());
  state.histories = reactive({});
  for (const mock of [
    state.query,
    state.mutate,
    state.fetch,
    state.toast,
    state.relationship,
  ])
    mock.mockReset();
  state.relationship.mockReturnValue("none");
  state.fetch.mockResolvedValue({ conversations: [] });
  state.query.mockResolvedValue({
    data: { players_by_pk: { steam_id: "1", allow_message_requests: false } },
  });
  state.mutate.mockResolvedValue({
    data: {
      update_players_by_pk: { steam_id: "1", allow_message_requests: true },
    },
  });
  vi.stubGlobal("useAuthStore", () => state.auth);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.local.invalid" },
  }));
  vi.stubGlobal("useBlockActions", () => ({
    isBlocked: (id: string) => state.blocked.has(String(id)),
  }));
  vi.stubGlobal("useChatTabs", useChatTabs);
  vi.stubGlobal("$fetch", state.fetch);
  useRightSidebar().setRightSidebarOpen(false);
  setActiveHub("chat");
  useMessageRequests().reset();
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  scope?.stop();
  scope = undefined;
  tabs.clearAll();
  useMessageRequests().reset();
  vi.unstubAllGlobals();
});

describe("request state and API synchronization", () => {
  it("hydrates pending requests on login without creating DM tabs or normal unread badges", async () => {
    state.fetch.mockResolvedValue({
      conversations: [{ ...request(), request: true }],
    });
    start();
    await flushPromises();
    expect(useMessageRequests().requestCount.value).toBe(1);
    expect(tabs.tabs.value).toEqual([]);
    expect(tabs.unreadCounts.value).toEqual({});
  });
  it("deduplicates pending events and never renders their supplied message body as a preview", async () => {
    start();
    await flushPromises();
    incoming({
      ...request(),
      from: peer,
      request: true,
      message: { message: "private body" },
    });
    incoming({ ...request(), from: peer, request: true });
    wrapper = mount(MessageRequests, { global: { mocks: { $t: t } } });
    expect(useMessageRequests().requestCount.value).toBe(1);
    expect(wrapper.text()).toContain(peer.name);
    expect(wrapper.text()).not.toContain("private body");
    expect(tabs.tabs.value).toHaveLength(0);
  });
  it.each(["1:2:3", "2:1", "1:1", "2:3", "1:9223372036854775808"])(
    "ignores malformed or unauthorized room %s",
    async (roomId) => {
      start();
      await flushPromises();
      incoming({ roomId, from: peer, request: true });
      expect(useMessageRequests().requestCount.value).toBe(0);
    },
  );
  it("consumes sender awaiting state even after message deletion and clears it on acceptance", async () => {
    start();
    await flushPromises();
    incoming({
      roomId: "1:2",
      from: peer,
      request: false,
      awaitingReply: true,
    });
    expect(useMessageRequests().isAwaitingReply("1:2", "2")).toBe(true);
    state.histories["1:2"] = [];
    expect(useMessageRequests().isAwaitingReply("1:2", "2")).toBe(true);
    incoming({
      roomId: "1:2",
      from: peer,
      request: false,
      awaitingReply: false,
    });
    expect(useMessageRequests().isAwaitingReply("1:2", "2")).toBe(false);
    expect(tabs.tabs.value).toHaveLength(0);
  });
  it("keeps explicit API awaiting state ahead of older peer history", () => {
    state.histories["1:2"] = [
      { from: { steam_id: "2" }, message: "old Redis history" },
    ];
    useMessageRequests().setAwaitingReply("1:2", true);
    expect(useMessageRequests().isAwaitingReply("1:2", "2")).toBe(true);
  });
  it("does not resurrect a successful denial from a late duplicate request event", async () => {
    start();
    await flushPromises();
    incoming({ roomId: "1:2", from: peer, request: true });
    await useMessageRequests().decline("1:2");
    incoming({ roomId: "1:2", from: peer, request: true });
    expect(useMessageRequests().requestCount.value).toBe(0);
  });
  it("keeps friends writable and normal notifications count once", async () => {
    state.relationship.mockReturnValue("friend");
    start();
    await flushPromises();
    incoming({
      roomId: "1:2",
      from: peer,
      request: false,
      awaitingReply: true,
    });
    expect(useMessageRequests().isAwaitingReply("1:2", "2")).toBe(false);
    const row = {
      id: "notification-1",
      title: peer.name,
      steam_id: "1",
      entity_id: "direct:1:2",
    };
    state.next({ data: { notifications: [row, row] } });
    expect(tabs.tabs.value).toHaveLength(1);
    expect(tabs.unreadCounts.value["direct:1:2"]).toBe(1);
    expect(tabs.activeTabId.value).not.toBe("direct:1:2");
  });
  it("marks both API request read state and legacy notification rows without accepting", async () => {
    useMessageRequests().addRequest(request());
    await markDirectMessagesRead("1:2");
    expect(state.fetch.mock.calls[0][0]).toContain("/1%3A2/read");
    expect(state.mutate).toHaveBeenCalled();
    expect(useMessageRequests().isRequest("1:2")).toBe(true);
  });
  it("previews remain temporary until API acceptance promotes the same tab", async () => {
    start(); await flushPromises();
    useMessageRequests().addRequest(request());
    openDirectMessage(peer, { requestPreview: true });
    expect(JSON.parse(localStorage.getItem("chat-open-dm-tabs")!)).toEqual([]);
    state.histories["1:2"] = [
      { id: "server-confirmed", from: { steam_id: "1" } },
    ];
    expect(useMessageRequests().requestCount.value).toBe(1);
    incoming({roomId:"1:2",from:peer,request:false,awaitingReply:false});
    expect(useMessageRequests().requestCount.value).toBe(0);
    expect(tabs.tabs.value).toHaveLength(1);
    expect(tabs.tabs.value[0].requestPreview).toBe(false);
    expect(JSON.parse(localStorage.getItem("chat-open-dm-tabs")!)).toHaveLength(
      1,
    );
  });
  it("also treats a pending request opened through another Message button as a temporary preview", () => {
    useMessageRequests().addRequest(request()); openDirectMessage(peer);
    expect(tabs.tabs.value[0].requestPreview).toBe(true);
    expect(JSON.parse(localStorage.getItem("chat-open-dm-tabs")!)).toEqual([]);
  });
  it("keeps an existing awaiting conversation reopenable after the peer disables new requests", () => {
    useMessageRequests().setAwaitingReply("1:2",true);
    expect(useMessageRequests().hasConversation("2")).toBe(true);
  });
  it("successful decline closes only the request preview, while failure retains it", async () => {
    useMessageRequests().addRequest(request());
    openDirectMessage(peer, { requestPreview: true });
    state.fetch.mockRejectedValueOnce(Error("offline"));
    await expect(useMessageRequests().decline("1:2")).rejects.toThrow(
      "offline",
    );
    expect(useMessageRequests().requestCount.value).toBe(1);
    state.fetch.mockResolvedValueOnce({ success: true });
    await useMessageRequests().decline("1:2");
    expect(useMessageRequests().requestCount.value).toBe(0);
    expect(tabs.tabs.value).toHaveLength(0);
  });
  it("does not close an accepted conversation when a late decline completes", async () => {
    useMessageRequests().addRequest(request());
    openDirectMessage(peer, { requestPreview: true });
    const pending = deferred<any>();
    state.fetch.mockReturnValueOnce(pending.promise);
    const denial = useMessageRequests().decline("1:2");
    useMessageRequests().setAwaitingReply("1:2", false);
    pending.resolve({ success: true });
    await denial;
    expect(tabs.tabs.value).toHaveLength(1);
  });
  it("blocks inbox rows and late incoming events without touching block records", async () => {
    start();
    await flushPromises();
    incoming({ roomId: "1:2", from: peer, request: true });
    state.blocked.add("2");
    expect(useMessageRequests().requestCount.value).toBe(0);
    incoming({ roomId: "1:2", from: peer, request: true });
    expect(tabs.tabs.value).toHaveLength(0);
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("closes cached request previews immediately when the author is blocked", async () => {
    start(); await flushPromises();
    incoming({roomId:"1:2",from:peer,request:true});
    openDirectMessage(peer,{requestPreview:true});
    state.blocked.add("2"); await nextTick();
    expect(tabs.tabs.value).toHaveLength(0);
    expect(useMessageRequests().requestCount.value).toBe(0);
  });
  it("keeps an incoming event that arrives while a hydration snapshot is loading", async () => {
    const pending = deferred<any>();
    state.fetch.mockReturnValueOnce(pending.promise);
    start();
    incoming({ roomId: "1:2", from: peer, request: true });
    pending.resolve({ conversations: [] });
    await flushPromises();
    expect(useMessageRequests().requestCount.value).toBe(1);
  });
  it("ignores late previous-account hydration and rehydrates after reconnect", async () => {
    const pending = deferred<any>();
    state.fetch.mockReturnValueOnce(pending.promise);
    start();
    state.auth.me = { steam_id: "3" };
    await nextTick();
    pending.resolve({ conversations: [{ ...request(), request: true }] });
    await flushPromises();
    expect(useMessageRequests().requestCount.value).toBe(0);
    state.listeners.get("online")?.();
    await flushPromises();
    expect(state.fetch).toHaveBeenCalledTimes(3);
  });
  it("retains normal DM operation when an older API cannot load requests", async () => {
    state.fetch.mockRejectedValueOnce(Error("404"));
    start();
    await flushPromises();
    state.next({
      data: {
        notifications: [
          {
            id: "n1",
            title: peer.name,
            steam_id: "1",
            entity_id: "direct:1:2",
          },
        ],
      },
    });
    expect(tabs.tabs.value).toHaveLength(1);
  });
  it("cleans listeners on layout disposal", async () => {
    start();
    await flushPromises();
    scope!.stop();
    expect(state.listeners.size).toBe(0);
  });
  it("uses numeric canonical IDs matching the API", () => {
    expect(directChatId("10", "2")).toBe("2:10");
    expect(directPeerSteamId("2:10", "10")).toBe("2");
  });
});

describe("upstream request UI and privacy persistence", () => {
  it("disabling requests preserves pending requests and rereads the saved setting after remount", async () => {
    useMessageRequests().addRequest(request());
    state.query.mockResolvedValue({data:{players_by_pk:{steam_id:"1",allow_message_requests:true}}});
    setting(); await flushPromises();
    state.mutate.mockResolvedValueOnce({data:{update_players_by_pk:{steam_id:"1",allow_message_requests:false}}});
    await wrapper!.get('[role="switch"]').trigger("click"); await flushPromises();
    expect(useMessageRequests().requestCount.value).toBe(1);
    wrapper!.unmount();
    state.query.mockResolvedValue({data:{players_by_pk:{steam_id:"1",allow_message_requests:false}}});
    setting(); await flushPromises();
    expect(wrapper!.get('[role="switch"]').attributes("aria-checked")).toBe("false");
    expect(state.query.mock.calls.at(-1)[0].fetchPolicy).toBe("network-only");
  });
  it.each([375, 1366])(
    "renders accessible inbox controls at width %s",
    async (width) => {
      window.innerWidth = width;
      useMessageRequests().addRequest(request());
      wrapper = mount(MessageRequests, { global: { mocks: { $t: t } } });
      await wrapper.findAll("button")[1].trigger("click");
      expect(wrapper.emitted("open")?.[0][0]).toMatchObject(request());
      expect(wrapper.find("[aria-label]").exists()).toBe(true);
    },
  );
  it("shows the upstream amber inbox count", () => {
    wrapper = mount(MessageRequestsRailButton, {
      props: { count: 2 },
      global: { mocks: { $t: t } },
    });
    expect(wrapper.text()).toContain("2");
    expect(wrapper.find("button").attributes("aria-pressed")).toBe("false");
  });
  it("loads OFF, uses exact copy and confirms the persisted setting", async () => {
    setting();
    await flushPromises();
    const control = wrapper!.get('[role="switch"]');
    expect(control.attributes("aria-checked")).toBe("false");
    expect(wrapper!.text()).toContain("Message Requests");
    expect(wrapper!.text()).toContain(
      "Let players who aren't your friends send you one message. It waits in your requests until you reply.",
    );
    await control.trigger("click");
    await flushPromises();
    expect(state.mutate.mock.calls[0][0].variables).toEqual({
      steamId: "1",
      allow: true,
    });
    expect(control.attributes("aria-checked")).toBe("true");
    expect(state.toast).toHaveBeenCalled();
  });
  it.each([null, { steam_id: "1", allow_message_requests: false }])(
    "reverts an unconfirmed privacy save: %s",
    async (result) => {
      setting();
      await flushPromises();
      state.mutate.mockResolvedValueOnce({
        data: { update_players_by_pk: result },
      });
      await wrapper!.get('[role="switch"]').trigger("click");
      await flushPromises();
      expect(wrapper!.get('[role="switch"]').attributes("aria-checked")).toBe(
        "false",
      );
      expect(state.toast.mock.calls[0][0].variant).toBe("destructive");
    },
  );
  it("keeps an unavailable setting disabled and OFF", async () => {
    state.query.mockRejectedValueOnce(Error("column missing"));
    setting();
    await flushPromises();
    expect(
      wrapper!.get('[role="switch"]').attributes("disabled"),
    ).toBeDefined();
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("does not carry a previous account's privacy response across accounts", async () => {
    const pending = deferred<any>();
    state.query.mockReturnValueOnce(pending.promise);
    setting();
    state.auth.me = { steam_id: "3" };
    await nextTick();
    pending.resolve({
      data: { players_by_pk: { steam_id: "1", allow_message_requests: true } },
    });
    await flushPromises();
    expect(wrapper!.get('[role="switch"]').attributes("aria-checked")).toBe(
      "false",
    );
  });
});
