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
      activeTabIdRef.value = id;
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
      activeTabIdRef.value = next ? next.id : null;
    }
  }

  function setActiveTab(id: string | null) {
    activeTabIdRef.value = id;
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

    order.splice(fromIdx, 1);
    order.splice(order.indexOf(targetId), 0, draggedId);

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
