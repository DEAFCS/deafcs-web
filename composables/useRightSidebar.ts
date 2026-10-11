import { computed, ref } from "vue";

// Same breakpoint as the Chat Hub's own mobile layout (RightHub.vue,
// ChatPanel.vue, useHubState.ts), where the open Hub covers the page.
export const MOBILE_CHAT_HUB_QUERY = "(max-width: 768px)";

// One-off read (not a reactive ref) for decisions taken at a single moment,
// e.g. a click or entering a page.
export function isMobileChatHubLayout() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(MOBILE_CHAT_HUB_QUERY).matches
  );
}

// 5Stack's model: the hub is open for as long as you are using it, or pinned.
// A hover opens it, and leaving it, clicking outside or Escape puts it away
// again. Pinning is what keeps it open, and the only state a reload restores.
//
// DEAFCS: clicking a dock icon is what pins (see RightHub's clickHub), and a
// pin is a desktop state. A phone has no hover to peek with, so a tap simply
// opens the hub, and a reload never brings it back over the page there.
const rightSidebarOpen = ref(false);
const isPinned = ref(false);
const hoverCloseLocks = ref(0);
const hoverCloseSuspended = computed(() => hoverCloseLocks.value > 0);

const SIDEBAR_PIN_STORAGE_KEY = "right-hub-pinned";

if (
  typeof window !== "undefined" &&
  window.localStorage.getItem(SIDEBAR_PIN_STORAGE_KEY) === "1"
) {
  isPinned.value = true;
  rightSidebarOpen.value = !isMobileChatHubLayout();
}

function setPinned(value: boolean) {
  isPinned.value = value;
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(SIDEBAR_PIN_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(SIDEBAR_PIN_STORAGE_KEY);
  }
}

export function useRightSidebar() {
  const setRightSidebarOpen = (value: boolean) => {
    rightSidebarOpen.value = value;
    // Explicitly closing also unpins.
    if (!value && isPinned.value) {
      setPinned(false);
    }
  };

  const toggleRightSidebar = () => {
    setRightSidebarOpen(!rightSidebarOpen.value);
  };

  // Leaving the hub, clicking away from it, Escape: everything but a pin.
  function dismissRightSidebar() {
    if (!isPinned.value) {
      rightSidebarOpen.value = false;
    }
  }

  function suspendHoverClose() {
    hoverCloseLocks.value += 1;
  }

  function resumeHoverClose() {
    hoverCloseLocks.value = Math.max(0, hoverCloseLocks.value - 1);
  }

  // Pinning opens the hub if it was closed; unpinning leaves it open until the
  // pointer leaves, like any other open.
  function togglePin() {
    setPinned(!isPinned.value);
    if (isPinned.value) {
      rightSidebarOpen.value = true;
    }
  }

  return {
    rightSidebarOpen,
    setRightSidebarOpen,
    toggleRightSidebar,
    dismissRightSidebar,
    hoverCloseSuspended,
    suspendHoverClose,
    resumeHoverClose,
    isPinned,
    setPinned,
    togglePin,
  };
}
