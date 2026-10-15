import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, ref, watch } from "vue";
import fs from "node:fs";
import path from "node:path";

// Opening a message request from the Chat Hub's request list landed on Global
// Chat instead of the sender's conversation.
//
// Root cause: openRequest() closes the list (viewingRequests = false) and then
// openDirectMessage() selects the sender's tab. Both run in one tick, so the
// viewingRequests watcher ran in the same flush, after the selection, and put
// the stale activeChatId (the room shown before the list, usually Global)
// back as the active tab. Upstream 5Stack has no such watcher. The fix only
// restores the previous room when nothing else has chosen one.
//
// This runs the real watchers and openRequest from ChatPanel.vue inside a
// mounted component, so Vue's own scheduler decides the order.

const source = fs
  .readFileSync(path.resolve(__dirname, "../../components/hub/ChatPanel.vue"), "utf8")
  .replace(/\r\n/g, "\n");

function block(start: string, end = "\n});\n") {
  const from = source.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf(end, from) + end.length);
}

const ACTIVE_TAB_WATCHER = block("watch(activeTabId, (id) => {");
const VIEWING_WATCHER = block("watch(viewingRequests, (viewing) => {");
const OPEN_REQUEST = block("function openRequest(", "\n}\n").replace(
  ": MessageRequest",
  "",
);
// The watcher as it was before the fix, to prove the test catches the bug.
const OLD_VIEWING_WATCHER = `watch(viewingRequests, (viewing) => {
  setActiveTab(viewing ? null : composing.value ? null : activeChatId.value);
  if (viewing) {
    composing.value = false;
  }
});`;

const GLOBAL = { id: "global", type: "global", lobbyId: "global" };
const peer = (n: number) => ({ steam_id: `7656119800000000${n}`, name: `P${n}` });
const dmId = (p: { steam_id: string }) => `direct:me:${p.steam_id}`;

function harness(viewingWatcher = VIEWING_WATCHER) {
  const tabsRef = ref<any[]>([GLOBAL, { id: "team:t1", type: "team", lobbyId: "t1" }]);
  const activeTabIdRef = ref<string | null>(null);
  let api: any;

  const Panel = defineComponent({
    setup() {
      const tabs = computed(() => tabsRef.value);
      const activeTabId = computed(() => activeTabIdRef.value);
      const setActiveTab = (id: string | null) => (activeTabIdRef.value = id);
      const viewId = (tab: any) => tab.id;
      const composing = ref(false);
      const viewingRequests = ref(false);
      const activeChatId = ref<string | null>(null);
      const opened: string[] = [];
      // Mirrors useDirectMessage's openDirectMessage: openTab, then select.
      const openDirectMessage = (p: any) => {
        const id = dmId(p);
        if (!tabsRef.value.some((tab) => tab.id === id)) {
          tabsRef.value = [...tabsRef.value, { id, type: "direct", lobbyId: id }];
          opened.push(id);
        }
        setActiveTab(id);
      };
      const handleSelectRoom = (tab: any) => {
        activeChatId.value = viewId(tab);
        setActiveTab(viewId(tab));
      };

      const deps = {
        watch,
        tabs,
        activeTabId,
        setActiveTab,
        viewId,
        composing,
        viewingRequests,
        activeChatId,
        openDirectMessage,
        resetUnread: () => {},
        markDirectMessagesRead: () => {},
      };
      const run = new Function(
        ...Object.keys(deps),
        `${ACTIVE_TAB_WATCHER}\n${viewingWatcher}\n${OPEN_REQUEST}\nreturn openRequest;`,
      );
      const openRequest = run(...Object.values(deps));

      api = { activeChatId, viewingRequests, composing, openRequest, handleSelectRoom, opened };
      return () => h("div");
    },
  });

  mount(Panel);
  const flush = () => new Promise((resolve) => setTimeout(resolve));
  return { api, activeTabIdRef, flush };
}

async function viewRequestsFrom(room: any) {
  const t = harness();
  t.api.handleSelectRoom(room);
  await t.flush();
  t.api.viewingRequests.value = true;
  await t.flush();
  expect(t.activeTabIdRef.value).toBeNull();
  return t;
}

describe("opening a message request from the list", () => {
  it("confirms the bug: the old watcher put Global back after the sender's DM was selected", async () => {
    const t = harness(OLD_VIEWING_WATCHER);
    t.api.handleSelectRoom(GLOBAL);
    await t.flush();
    t.api.viewingRequests.value = true;
    await t.flush();

    t.api.openRequest({ roomId: "r1", peer: peer(1), unread: 1 });
    await t.flush();
    expect(t.api.activeChatId.value).toBe("global");
  });

  it("shows that sender's conversation, not Global", async () => {
    const t = await viewRequestsFrom(GLOBAL);
    t.api.openRequest({ roomId: "r1", peer: peer(1), unread: 1 });
    await t.flush();

    expect(t.api.activeChatId.value).toBe(dmId(peer(1)));
    expect(t.activeTabIdRef.value).toBe(dmId(peer(1)));
    expect(t.api.viewingRequests.value).toBe(false);
  });

  it("opens the exact request picked when several are waiting, with one tab each", async () => {
    const t = await viewRequestsFrom(GLOBAL);
    t.api.openRequest({ roomId: "r2", peer: peer(2), unread: 1 });
    await t.flush();
    expect(t.api.activeChatId.value).toBe(dmId(peer(2)));

    t.api.viewingRequests.value = true;
    await t.flush();
    t.api.openRequest({ roomId: "r3", peer: peer(3), unread: 4 });
    await t.flush();
    expect(t.api.activeChatId.value).toBe(dmId(peer(3)));

    t.api.viewingRequests.value = true;
    await t.flush();
    t.api.openRequest({ roomId: "r2", peer: peer(2), unread: 1 });
    await t.flush();
    expect(t.api.activeChatId.value).toBe(dmId(peer(2)));
    expect(t.api.opened).toEqual([dmId(peer(2)), dmId(peer(3))]);
  });

  it("works the same from any room the list was opened from", async () => {
    const t = await viewRequestsFrom({ id: "team:t1", type: "team", lobbyId: "t1" });
    t.api.openRequest({ roomId: "r1", peer: peer(1), unread: 1 });
    await t.flush();
    expect(t.api.activeChatId.value).toBe(dmId(peer(1)));
  });
});

describe("leaving the list without opening a request", () => {
  it("closing it returns to the room shown before", async () => {
    const t = await viewRequestsFrom(GLOBAL);
    t.api.viewingRequests.value = false;
    await t.flush();
    expect(t.activeTabIdRef.value).toBe("global");
    expect(t.api.activeChatId.value).toBe("global");
  });

  it("a room the player clicks instead wins", async () => {
    const t = await viewRequestsFrom(GLOBAL);
    const team = { id: "team:t1", type: "team", lobbyId: "t1" };
    // onTabClick: close the list, then select the clicked room.
    t.api.viewingRequests.value = false;
    t.api.handleSelectRoom(team);
    await t.flush();
    expect(t.activeTabIdRef.value).toBe("team:t1");
    expect(t.api.activeChatId.value).toBe("team:t1");
  });

  it("starting a new message reads no room", async () => {
    const t = await viewRequestsFrom(GLOBAL);
    t.api.composing.value = true;
    t.api.viewingRequests.value = false;
    await t.flush();
    expect(t.activeTabIdRef.value).toBeNull();
  });
});
