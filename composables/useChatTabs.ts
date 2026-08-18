import { ref, computed } from "vue";

type ChatType =
  | "match"
  | "team"
  | "matchmaking"
  | "organizers"
  | "tournament"
  | "global"
  | "direct";

export interface ChatTab {
  id: string;
  label: string;
  instance: string;
  type: ChatType;
  lobbyId: string;
  pinned: boolean;
  // Direct-message tabs render the other player's own avatar as the tab
  // icon instead of a lucide icon (see ChatPanel.vue).
  otherSteamId?: string;
  avatarUrl?: string;
  // Set only by registerTabIfMissing, cleared the moment the user
  // actually activates the tab (see setActiveTab). ChatPanel.vue skips
  // mounting a live <ChatLobby> for these -- every OTHER tab is mounted
  // unconditionally (v-show only) on the assumption that a tab existing
  // at all means the user wants it actively joined/listening, which a
  // silently-registered background tab explicitly does not. Mounting it
  // anyway double-counts unread: the background tab's own listenChat
  // would join the lobby and start receiving the same realtime "chat"
  // event chat:new-message already pings for.
  unopened?: boolean;
}

const tabsRef = ref<ChatTab[]>([]);
const unreadCountsRef = ref<Record<string, number>>({});
const activeTabIdRef = ref<string | null>(null);

const TAB_ORDER_STORAGE_KEY = "chat-tab-manual-order";

function loadManualOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TAB_ORDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// User-dragged custom order for the channel rail (ChatPanel.vue) --
// separate from tabsRef's own array order, which is just insertion
// order. Only ids the user has actually dragged end up here; anything
// else keeps falling back to the default weight-based sort.
const manualOrderRef = ref<string[]>(loadManualOrder());

export function useChatTabs() {
  const tabs = computed(() => tabsRef.value);
  const unreadCounts = computed(() => unreadCountsRef.value);
  const activeTabId = computed(() => activeTabIdRef.value);

  function findTabIndex(id: string) {
    return tabsRef.value.findIndex((t) => t.id === id);
  }

  function openTab(payload: Omit<ChatTab, "pinned"> & { pinned?: boolean }) {
    const id = payload.id;
    const existingIndex = findTabIndex(id);

    if (existingIndex !== -1) {
      // Explicitly opening a tab that only existed as a silent
      // background registration (see registerTabIfMissing) promotes it
      // to a real, live-joined tab -- clear the flag via setActiveTab
      // below rather than duplicating that logic here.
      setActiveTab(id);
      return tabsRef.value[existingIndex];
    }

    const tab: ChatTab = {
      ...payload,
      pinned: payload.pinned ?? false,
    };

    tabsRef.value.push(tab);
    activeTabIdRef.value = id;

    return tab;
  }

  // Registers a tab without stealing focus -- unlike openTab, does NOT
  // set it as the active tab, and marks it `unopened` so ChatPanel.vue
  // doesn't mount a live, lobby-joined <ChatLobby> for it. Used when a
  // message arrives for a conversation the user has never opened this
  // session (e.g. a first-ever DM from someone new): there needs to be
  // a tab for the unread badge to attach to, but arriving in the
  // background must not yank the user away from whatever they're
  // actually looking at, nor silently join them to the lobby (which
  // would then double-count every later message via two parallel
  // delivery paths -- see the ChatTab.unopened comment).
  function registerTabIfMissing(
    payload: Omit<ChatTab, "pinned"> & { pinned?: boolean },
  ) {
    if (findTabIndex(payload.id) !== -1) {
      return;
    }
    tabsRef.value.push({
      ...payload,
      pinned: payload.pinned ?? false,
      unopened: true,
    });
  }

  function closeTab(id: string) {
    const idx = findTabIndex(id);
    if (idx === -1) {
      return;
    }

    const [removed] = tabsRef.value.splice(idx, 1);
    delete unreadCountsRef.value[removed.id];

    if (activeTabIdRef.value === removed.id) {
      const next =
        tabsRef.value[idx] ||
        tabsRef.value[idx - 1] ||
        tabsRef.value[0] ||
        null;
      // Routes through setActiveTab (not a raw assignment) so landing on
      // an unopened background tab here also clears its flag and mounts
      // it live -- see setActiveTab.
      setActiveTab(next ? next.id : null);
    }
  }

  function setActiveTab(id: string | null) {
    activeTabIdRef.value = id;
    if (id === null) return;
    const idx = findTabIndex(id);
    if (idx !== -1 && tabsRef.value[idx].unopened) {
      tabsRef.value[idx] = { ...tabsRef.value[idx], unopened: false };
    }
  }

  function setPinned(id: string, pinned: boolean) {
    const idx = findTabIndex(id);
    if (idx === -1) {
      return;
    }
    tabsRef.value[idx] = {
      ...tabsRef.value[idx],
      pinned,
    };
  }

  function incrementUnread(id: string) {
    unreadCountsRef.value[id] = (unreadCountsRef.value[id] || 0) + 1;
  }

  function resetUnread(id: string) {
    if (unreadCountsRef.value[id]) {
      unreadCountsRef.value[id] = 0;
    }
  }

  function setUnread(id: string, value: number) {
    unreadCountsRef.value[id] = value;
  }

  function clearAll() {
    tabsRef.value = [];
    unreadCountsRef.value = {};
    activeTabIdRef.value = null;
  }

  const manualOrder = computed(() => manualOrderRef.value);

  function reorderTab(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const currentIds = tabsRef.value.map((t) => t.id);
    // Seed from whatever manual order already exists, keeping only ids
    // that still exist, then append any tab not yet positioned (new
    // tabs land at the end in their natural/weight order).
    const order = manualOrderRef.value.filter((id) => currentIds.includes(id));
    for (const id of currentIds) {
      if (!order.includes(id)) order.push(id);
    }

    const fromIdx = order.indexOf(draggedId);
    const toIdx = order.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    // Re-deriving the target's index via indexOf *after* the removal
    // (the previous version) is wrong for downward moves: removing an
    // earlier item shifts every later index down by one, so
    // re-inserting "at the target" actually landed the dragged item
    // one slot short -- for an adjacent middle item it was a full
    // no-op, which is exactly the "can only move up" bug. splice's own
    // two-step remove-then-insert-at-the-original-index already
    // produces the correct result without any recomputation.
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, draggedId);

    manualOrderRef.value = order;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(order));
    }
  }

  return {
    tabs,
    unreadCounts,
    activeTabId,
    manualOrder,
    openTab,
    registerTabIfMissing,
    closeTab,
    setActiveTab,
    setPinned,
    incrementUnread,
    resetUnread,
    setUnread,
    clearAll,
    reorderTab,
  };
}
