import { ref, watch, computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useRightSidebar } from "@/composables/useRightSidebar";
import { useNotificationBadge } from "~/composables/useNotificationBadge";
import { useInvites } from "@/composables/useInvites";
import { useChatTabs } from "~/composables/useChatTabs";

type Hub = "recent-games" | "social" | "chat" | "notifications" | "lobby";

const HUB_STORAGE_KEY = "right-hub-active-tab";

function readSavedHub(): Hub | null {
  if (typeof window === "undefined") return null;
  const saved = window.localStorage.getItem(HUB_STORAGE_KEY) as Hub | null;
  return saved ?? null;
}

const activeHub = ref<Hub | null>("social");

// Initialize from localStorage (client-side only)
const initialSavedHub = readSavedHub();
if (initialSavedHub) {
  activeHub.value = initialSavedHub;
}

export function setActiveHub(hub: Hub) {
  activeHub.value = hub;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(HUB_STORAGE_KEY, hub);
  }
}

export function useHubState() {
  const { rightSidebarOpen, setRightSidebarOpen, setPinned } = useRightSidebar();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { hasNotifications } = useNotificationBadge();
  const { hasLobbyInvites, hasSocialInvites } = useInvites();
  const { unreadCounts } = useChatTabs();

  const totalUnread = computed(() =>
    Object.values(unreadCounts.value).reduce((sum, n) => sum + (n || 0), 0),
  );

  function defaultHub(): Hub {
    if (hasNotifications.value) return "notifications";
    if (hasLobbyInvites.value) return "lobby";
    if (totalUnread.value > 0) return "chat";
    if (hasSocialInvites.value) return "social";
    return "social";
  }

  function selectHub(hub: Hub) {
    if (activeHub.value === hub && rightSidebarOpen.value) {
      // setRightSidebarOpen(false) already unpins internally, so a second
      // click on the active icon both closes the panel and clears the pin.
      setRightSidebarOpen(false);
      activeHub.value = null;
    } else {
      // Clicking a hub icon now pins the panel open instead of leaving it
      // hover-managed -- a click is a deliberate "I want this open" action,
      // but it left hoverCloseSuspended/isPinned both false, so moving the
      // mouse away afterwards (e.g. to actually use whatever the panel just
      // showed) ran straight into the same hover-close timer used for a
      // passing graze, closing a panel the user had just explicitly opened.
      // Pinning here means only that same explicit click (above) closes it.
      activeHub.value = hub;
      setPinned(true);
      setRightSidebarOpen(true);
    }
  }

  function openLastOrDefaultHub() {
    const restored = readSavedHub();
    const target = restored ?? defaultHub();
    activeHub.value = target;
    setRightSidebarOpen(true);
  }

  // Persist active hub selection to localStorage (but keep last non-null when closed)
  watch(
    activeHub,
    (hub) => {
      if (typeof window === "undefined") return;
      if (!hub) return;
      window.localStorage.setItem(HUB_STORAGE_KEY, hub);
    },
    { immediate: true },
  );

  // Sync: open with no hub → prefer saved hub, then fall back to default; close → clear current hub
  watch(
    rightSidebarOpen,
    (open) => {
      if (open && !activeHub.value) {
        const restored = readSavedHub();
        activeHub.value = restored ?? defaultHub();
      }
      if (!open && !isMobile.value) activeHub.value = null;
    },
    { immediate: true },
  );

  return { activeHub, selectHub, openLastOrDefaultHub };
}
