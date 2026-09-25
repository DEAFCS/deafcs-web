import { ref, computed } from "vue";

type ChatType =
  | "match"
  | "team"
  | "matchmaking"
  | "organizers"
  | "tournament"
  | "global"
  | "direct"
  | "announcement";

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

const DM_TABS_STORAGE_KEY = "chat-open-dm-tabs";

// Every other tab type (matchmaking lobby, current match, tournament,
// global, organizers, announcement) reappears on its own after a page
// reload because it's re-derived from server-side state (see
// useChatTabSetup's ensureDefaultTabs). A DM tab has no such source --
// it only ever exists because the user clicked "Message" on someone --
// so without this it silently vanished on every refresh, and the user
// had to go find that person again to reopen the conversation.
function loadPersistedDmTabs(): ChatTab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DM_TABS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ChatTab =>
        t && typeof t === "object" && t.type === "direct" && typeof t.id === "string",
    );
  } catch {
    return [];
  }
}

function persistDmTabs(tabs: ChatTab[]) {
  if (typeof window === "undefined") return;
  try {
    const dmTabs = tabs
      .filter((t) => t.type === "direct")
      .map((t) => ({
        id: t.id,
        label: t.label,
        instance: t.instance,
        type: t.type,
        lobbyId: t.lobbyId,
        pinned: false,
        otherSteamId: t.otherSteamId,
        avatarUrl: t.avatarUrl,
      }));
    window.localStorage.setItem(DM_TABS_STORAGE_KEY, JSON.stringify(dmTabs));
  } catch {
    // best-effort -- losing the persisted list just means DMs won't
    // survive the next refresh, not a functional break right now.
  }
}

const UNREAD_COUNTS_STORAGE_KEY = "chat-unread-counts";

// DMs already have a durable, more accurate source of truth (see
// useIncomingDirectMessages' notifications.is_read query, re-derived fresh
// on every load) -- persisting those here too would double-count on the
// next load when that subscription re-increments on top of a stale cached
// value. Every other chat type (Global, Announcement, Organizer,
// matchmaking, match, team, tournament) has no database-backed read state
// at all, so without this, their badge was pure in-memory state that a
// plain page refresh silently wiped to zero, however many messages had
// actually arrived unread (reported: Global chat's red badge disappears
// on F5 even though nothing was ever read).
function loadPersistedUnreadCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(UNREAD_COUNTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, number> = {};
    for (const [id, count] of Object.entries(parsed)) {
      if (id.startsWith("direct:")) continue;
      if (typeof count === "number" && count > 0) result[id] = count;
    }
    return result;
  } catch {
    return {};
  }
}

function persistUnreadCounts(counts: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    const toPersist: Record<string, number> = {};
    for (const [id, count] of Object.entries(counts)) {
      if (id.startsWith("direct:")) continue;
      if (count > 0) toPersist[id] = count;
    }
    window.localStorage.setItem(
      UNREAD_COUNTS_STORAGE_KEY,
      JSON.stringify(toPersist),
    );
  } catch {
    // best-effort -- worst case the badge just goes back to resetting on
    // refresh, same as before this fix.
  }
}

const tabsRef = ref<ChatTab[]>(loadPersistedDmTabs());
const unreadCountsRef = ref<Record<string, number>>(
  loadPersistedUnreadCounts(),
);
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

  function openTab(
    payload: Omit<ChatTab, "pinned"> & { pinned?: boolean },
    options?: { setActive?: boolean },
  ) {
    const id = payload.id;
    const existingIndex = findTabIndex(id);
    // Session bootstrap (useChatTabSetup's ensureDefaultTabs) calls this
    // on every page load to (re)seed Global/Announcement/Organizer/
    // matchmaking/match tabs, none of which are a real user action --
    // defaulting to true here (and every genuine user-initiated open,
    // e.g. clicking "Message" on a profile) keeps stealing focus, but
    // bootstrap explicitly opts out via setActive: false. Without this,
    // every fresh page load silently made activeTabId point at whatever
    // tab bootstrap opened last, which made Socket.ts's chat:new-message
    // isVisible check (rightSidebarOpen && activeHub==='chat' &&
    // activeTabId===tabId) one condition away from true before the user
    // had looked at anything -- reported: the first Global chat message
    // after a refresh never got a badge, even with the sidebar closed
    // and chat never opened, because activeHub had also been persisted
    // as "chat" from an earlier session.
    const setActive = options?.setActive ?? true;

    if (existingIndex !== -1) {
      if (setActive) {
        // Explicitly opening a tab that only existed as a silent
        // background registration (see registerTabIfMissing) promotes it
        // to a real, live-joined tab -- clear the flag via setActiveTab
        // below rather than duplicating that logic here.
        setActiveTab(id);
      }
      return tabsRef.value[existingIndex];
    }

    const tab: ChatTab = {
      ...payload,
      pinned: payload.pinned ?? false,
    };

    tabsRef.value.push(tab);
    if (setActive) {
      activeTabIdRef.value = id;
    }
    persistDmTabs(tabsRef.value);

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
    // Reported bug: this deleted the in-memory count but never persisted
    // the change, so localStorage kept the stale value under this tab's
    // id -- on the next page load, loadPersistedUnreadCounts() read it
    // straight back in, resurrecting a badge for a chat that no longer
    // has a tab at all (e.g. a finished tournament's chat).
    if (removed.id in unreadCountsRef.value) {
      delete unreadCountsRef.value[removed.id];
      persistUnreadCounts(unreadCountsRef.value);
    }
    persistDmTabs(tabsRef.value);

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
      // A silently-registered DM (see registerTabIfMissing) only becomes
      // a "genuinely open" conversation worth restoring after refresh
      // once the user actually clicks into it here.
      persistDmTabs(tabsRef.value);
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
    persistUnreadCounts(unreadCountsRef.value);
  }

  function resetUnread(id: string) {
    if (unreadCountsRef.value[id]) {
      unreadCountsRef.value[id] = 0;
      persistUnreadCounts(unreadCountsRef.value);
    }
  }

  function setUnread(id: string, value: number) {
    unreadCountsRef.value[id] = value;
    persistUnreadCounts(unreadCountsRef.value);
  }

  // Clears a stale unread count that has no corresponding tab at all --
  // closeTab can't help here since it requires the tab to still exist in
  // tabsRef. This is for ids that were never reopened this session (e.g.
  // a tournament chat that finished while the player was offline, so
  // ensureTournamentChatTabs's own tab list never included it to begin
  // with, yet a leftover unread count from before it finished was still
  // sitting in localStorage).
  function clearUnread(id: string) {
    if (id in unreadCountsRef.value) {
      delete unreadCountsRef.value[id];
      persistUnreadCounts(unreadCountsRef.value);
    }
  }

  function clearAll() {
    tabsRef.value = [];
    unreadCountsRef.value = {};
    activeTabIdRef.value = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(UNREAD_COUNTS_STORAGE_KEY);
      } catch {
        // best-effort
      }
    }
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
    clearUnread,
    clearAll,
    reorderTab,
  };
}
