<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { hapticTap } from "~/utilities/haptics";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "~/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "~/components/ui/dropdown-menu";
import MessageRequests from "~/components/hub/MessageRequests.vue";
import MessageRequestsRailButton from "~/components/hub/MessageRequestsRailButton.vue";
import {
  useMessageRequests,
  type MessageRequest,
} from "~/composables/useMessageRequests";
import { openDirectMessage } from "~/composables/useDirectMessage";
import socket from "~/web-sockets/Socket";
import { toast } from "~/components/ui/toast";
import NewConversation from "~/components/hub/NewConversation.vue";
import NewChatRailButton from "~/components/hub/NewChatRailButton.vue";
import {
  isDefaultDockRoomType,
  useDockShortcutPrefs,
} from "~/composables/useDockShortcutPrefs";
import { hideTeamChat } from "~/composables/useTeamChatRoom";
import { useMediaQuery } from "@vueuse/core";
import {
  Megaphone,
  Merge,
  Sword,
  Shield,
  MessageSquare,
  ExternalLink,
  Trophy,
  Globe,
  X,
  Video,
  Gavel,
  MoreHorizontal,
} from "lucide-vue-next";
import { useRouter, useRoute } from "#app";
import Tooltip from "~/components/ui/tooltip/Tooltip.vue";
import ChatLobby from "~/components/chat/ChatLobby.vue";
import ChatMatchHeader from "~/components/chat/ChatMatchHeader.vue";
import ChatParticipantsList from "~/components/chat/ChatParticipantsList.vue";
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";
import ChatDirectProfileLink from "~/components/chat/ChatDirectProfileLink.vue";
import ChatTeamProfileLink from "~/components/chat/ChatTeamProfileLink.vue";
import LobbyCallPanel from "~/components/matchmaking-lobby/LobbyCallPanel.vue";
import { currentHub } from "~/composables/useHubState";
import { useTournamentWebcamStatus } from "~/composables/useTournamentWebcamStatus";
import {
  TOURNAMENT_WEBCAM_MAX,
  tournamentWebcamPopoutPath,
} from "~/composables/useWebcamRoomApi";
import {
  chatHubViewId,
  useChatTabs,
  type ChatTab,
} from "~/composables/useChatTabs";
import { markDirectMessagesRead } from "~/composables/useIncomingDirectMessages";
import TooltipProvider from "~/components/ui/tooltip/TooltipProvider.vue";
import TooltipTrigger from "~/components/ui/tooltip/TooltipTrigger.vue";
import TooltipContent from "~/components/ui/tooltip/TooltipContent.vue";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";
import { formatBadgeCount } from "~/utilities/formatBadgeCount";
import { isUrgentChatType, splitTabBadge } from "~/utilities/chatBadgeCounts";
import { e_player_roles_enum } from "~/generated/zeus";

const props = defineProps<{
  isSidebarOpen: boolean;
  isTabActive: boolean;
}>();

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
// The hub stays mounted across profile navigation; dispose portalled rail tooltips.
const tooltipEpoch = ref(0);
watch(
  () => route.fullPath,
  () => tooltipEpoch.value++,
);

const {
  tabs,
  unreadCounts,
  mentionCounts,
  setActiveTab,
  resetUnread,
  incrementUnread,
  incrementMention,
  noteActivity,
  closeTab,
  activeTabId,
  manualOrder,
  setTabOrder,
} = useChatTabs();

// Amber = calm unread; red = private messages, announcements and @-mentions.
function tabBadge(tab: { id: string; type: string }) {
  return splitTabBadge(
    unreadCounts.value[tab.id],
    mentionCounts.value[tab.id],
    tab.type,
  );
}

// Tabs silently registered by an incoming chat:new-message ping (see
// Socket.ts) haven't actually been opened yet -- mounting a live
// <ChatLobby> for them anyway would join their lobby room in the
// background, and every message after that first one would then be
// double-counted (once by the always-on chat:new-message ping, once
// more by this newly-joined lobby's own realtime "chat" event). Only
// mount tabs the user has actually looked at at least once.
function viewId(tab: ChatTab) {
  return chatHubViewId(tab, tabs.value);
}
function isTeamRoom(tab: ChatTab) {
  return tab.type === "match_team" || tab.type === "captain_pick_team";
}
function canShowRoom(tab: ChatTab) {
  return (
    (tab.type !== "match" && !isTeamRoom(tab)) || !!useAuthStore().me?.steam_id
  );
}
function isDisplayedTeamRoom(tab: ChatTab) {
  const parent = viewId(tab);
  if (parent === tab.id) return false;
  // During Captain Pick's handover the draft and finalized lineup rooms
  // can briefly coexist. Show the draft's own room until its context ends.
  const teamRooms = tabs.value.filter(
    (room) => !room.unopened && isTeamRoom(room) && viewId(room) === parent,
  );
  return (
    (
      teamRooms.find((room) => room.type === "captain_pick_team") ??
      teamRooms[0]
    )?.id === tab.id
  );
}
const mountedTabs = computed(() =>
  tabs.value
    .filter(
      (tab) =>
        !tab.unopened &&
        canShowRoom(tab) &&
        (!isTeamRoom(tab) || isDisplayedTeamRoom(tab)),
    )
    .sort((a, b) => Number(isTeamRoom(a)) - Number(isTeamRoom(b))),
);

const isAdmin = computed(() =>
  useAuthStore().isRoleAbove(e_player_roles_enum.administrator),
);

// Everyone can read Announcements (see joinMatchLobby's Announcement
// case), but only admins can post -- every other channel type is
// unrestricted here (ChatLobby's own `canSend` prop defaults to true).
// A room a page offers read-only (a Draft room spectator, see
// draftChatHubContext) shows its history with no composer.
function canSendToTab(tab: ChatTab) {
  if (awaitingReply(tab)) return false;
  if (tab.readOnly) return false;
  if (tab.type === "announcement") return isAdmin.value;
  return true;
}

function readonlyHintFor(tab: ChatTab) {
  if (awaitingReply(tab))
    return t("layouts.chat_panel.requests.awaiting_reply", { name: tab.label });
  if (tab.readOnly && tab.type === "draft") {
    return t("draft_games.room.chat_players_only");
  }
  // A moderator reading a running match's Match Chat (matchChatHubContext).
  if (tab.readOnly && tab.type === "match") {
    return t("chat.match_staff_readonly");
  }
  if (tab.type === "announcement") {
    return t("chat.announcement_readonly", "Only admins can post here.");
  }
  return undefined;
}

const matchLobbyStore = useMatchLobbyStore();
const isMobile = useMediaQuery("(max-width: 768px)");

const activeChatId = ref<string | null>(null);

// Something outside this component changed the active tab (e.g. the
// "Message" button on a friend/profile calling openDirectMessage, or an
// incoming first-contact DM auto-opening its tab) -- activeChatId above
// is a separate local ref from useChatTabs' own shared activeTabId, so
// without this it silently kept showing whatever was already open
// (reported as "clicking Message lands on Global Chat instead").
watch(activeTabId, (id) => {
  if (id) composing.value = false;
  const requested = tabs.value.find((tab) => tab.id === id);
  const view = requested ? viewId(requested) : null;
  if (view && view !== activeChatId.value) {
    activeChatId.value = view;
    resetUnread(id);
    const tab = tabs.value.find((t) => t.id === id);
    if (tab?.type === "direct") markDirectMessagesRead(tab.lobbyId);
  }
});

const orderedTabs = computed<ChatTab[]>(() => {
  // Default (pre-drag) order: Global, Announcements, Organizers,
  // Tournament, then everything else -- matchmaking lobby, per-match chat,
  // DMs, etc. Anything a user has manually dragged still overrides this via
  // manualOrder below; this is only the fallback for untouched tabs.
  const weight = (tab: ChatTab) => {
    if (tab.type === "announcement") return 1;
    if (tab.type === "organizers") return 2;
    if (tab.type === "global") return 0;
    if (tab.type === "tournament") return 3;
    if (tab.type === "team") return 4;
    return 5;
  };
  const base = tabs.value
    .filter((tab) => canShowRoom(tab) && !isTeamRoom(tab))
    .sort((a, b) => {
      const wa = weight(a);
      const wb = weight(b);
      if (wa !== wb) return wa - wb;
      return a.label.localeCompare(b.label);
    });

  if (!manualOrder.value.length) return base;

  // Positions the user has actually dragged win; anything else keeps its
  // relative weight-sorted order (Array.sort is stable, so ties fall
  // through unchanged).
  const position = new Map(manualOrder.value.map((id, i) => [id, i]));
  const ordered = [...base].sort((a, b) => {
    const pa = position.has(a.id) ? (position.get(a.id) as number) : Infinity;
    const pb = position.has(b.id) ? (position.get(b.id) as number) : Infinity;
    return pa - pb;
  });
  // Preserve saved drag positions except for the requested Global/Announcements priority.
  const globalIndex = ordered.findIndex((tab) => tab.type === "global");
  const announcementIndex = ordered.findIndex(
    (tab) => tab.type === "announcement",
  );
  if (announcementIndex >= 0 && globalIndex > announcementIndex) {
    [ordered[announcementIndex], ordered[globalIndex]] = [
      ordered[globalIndex],
      ordered[announcementIndex],
    ];
  }
  return ordered;
});

// Dragging a conversation around the rail.
//
// Pointer events rather than HTML5 drag-and-drop, and rather than a sortable
// library. HTML5 drag never fires on touch at all, and its drop target is
// whatever element happens to be under the cursor -- which left dead zones
// between the buttons where a drop did nothing and, worse, a drag that came
// back onto the rail through one of those gaps still counted as "dropped
// outside" and removed the conversation.
//
// Here the rail itself is the drop target and the slot is worked out from the
// pointer's position, so there is nowhere on it that does not resolve to a
// slot.
const draggingRoomId = ref<string | null>(null);
// Where the dragged conversation would land, as an index into the rail's
// conversations. Null while the pointer is off the rail.
const dropIndex = ref<number | null>(null);
const dropOutside = ref(false);
// iOS's editing mode: long-press, everything wiggles, and each conversation
// grows a badge to remove it. Touch only -- a mouse has a right button.
const wiggling = ref(false);

const LONG_PRESS_MS = 450;
// Enough that a tap or a scroll is never mistaken for the start of a drag.
const DRAG_SLOP_PX = 8;
// How far past the rail counts as taking the conversation off it. The rail is
// 64px wide around a 44px button, so the bare edge leaves about ten pixels of
// slack -- far too little between "reordering" and "removing".
const REMOVE_MARGIN_PX = 32;

let pressTimer: ReturnType<typeof setTimeout> | null = null;
let pressOrigin: { x: number; y: number } | null = null;
let pressRoomId: string | null = null;
let pressIsTouch = false;
// Set once a drag actually starts, so the click that follows the release does
// not also select the room.
let suppressClick = false;

function directTabsInOrder(): ChatTab[] {
  return orderedTabs.value;
}

// Drawn absolutely rather than as an element between the buttons: an inline
// indicator adds its own height to the rail, which moves every button below it
// and so moves the midpoints this is measured against -- the slot flickers
// between two values as the pointer sits still.
const dropIndicatorY = ref(0);

// Which slot the pointer is over, by comparing against each conversation's
// midpoint. Returns null when the pointer is off the rail entirely, which is
// what removal is judged on.
function slotAt(clientX: number, clientY: number): number | null {
  const rail = chatRailRef.value;

  if (!rail) {
    return null;
  }

  const bounds = rail.getBoundingClientRect();

  if (
    clientX < bounds.left - REMOVE_MARGIN_PX ||
    clientX > bounds.right + REMOVE_MARGIN_PX ||
    clientY < bounds.top - REMOVE_MARGIN_PX ||
    clientY > bounds.bottom + REMOVE_MARGIN_PX
  ) {
    return null;
  }

  const tabs = directTabsInOrder();
  // Absolutely positioned children of a scrolling container are placed against
  // the content box, so a viewport delta has to have the scroll added back.
  const toContentY = (viewportY: number) =>
    viewportY - bounds.top + rail.scrollTop;

  let lastBottom = 0;

  for (const [index, tab] of tabs.entries()) {
    const button = chatButtonRefs.value[tab.id];

    if (!button) {
      continue;
    }

    const rect = button.getBoundingClientRect();
    lastBottom = rect.bottom;

    if (clientY < rect.top + rect.height / 2) {
      dropIndicatorY.value = toContentY(rect.top) - 3;
      return index;
    }
  }

  // Below the last conversation. The channels above resolve through the loop
  // instead -- the first conversation's midpoint is beneath them, so a pointer
  // up there lands in the top slot rather than nowhere.
  dropIndicatorY.value = lastBottom ? toContentY(lastBottom) + 1 : 0;

  return tabs.length;
}

function beginDrag(roomId: string) {
  draggingRoomId.value = roomId;
  suppressClick = true;
}

function handlePointerDown(tab: ChatTab, event: PointerEvent) {
  if (event.button !== 0) {
    return;
  }

  pressRoomId = tab.id;
  pressOrigin = { x: event.clientX, y: event.clientY };
  pressIsTouch = event.pointerType !== "mouse";

  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

  // Already in editing mode, so the press has been paid for once and every
  // conversation is grabbable straight away -- the same as a mouse.
  if (!pressIsTouch || wiggling.value) {
    return;
  }

  // Touch waits for the press. Grabbing on the first move instead would mean
  // the rail could never be scrolled.
  pressTimer = setTimeout(() => {
    pressTimer = null;

    // The press may have been released or cancelled while this was pending.
    if (!pressRoomId || draggingRoomId.value) {
      return;
    }

    wiggling.value = true;
    // The press is what enters editing mode, and nothing on screen has moved
    // yet -- the tap back is the only thing telling the player it worked.
    hapticTap();
    beginDrag(pressRoomId);
  }, LONG_PRESS_MS);
}

function handlePointerMove(event: PointerEvent) {
  if (!pressRoomId) {
    return;
  }

  const moved =
    pressOrigin &&
    Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) >
      DRAG_SLOP_PX;

  if (!draggingRoomId.value) {
    if (!moved) {
      return;
    }

    // Moving before the press completed is a scroll, not a drag.
    if (pressIsTouch && !wiggling.value) {
      return cancelPress();
    }

    beginDrag(pressRoomId);
  }

  // Held once dragging: otherwise the rail scrolls out from under the drag on
  // touch, and the browser paints a text selection on desktop.
  event.preventDefault();

  dropIndex.value = slotAt(event.clientX, event.clientY);
  dropOutside.value = dropIndex.value === null;
}

function handlePointerUp() {
  const dragged = draggingRoomId.value;

  if (!dragged) {
    return cancelPress();
  }

  if (dropOutside.value) {
    removeConversation(dragged);
  } else if (dropIndex.value !== null) {
    moveConversation(dragged, dropIndex.value);
  }

  cancelPress();
}

function cancelPress() {
  if (pressTimer) {
    clearTimeout(pressTimer);
    pressTimer = null;
  }

  pressRoomId = null;
  pressOrigin = null;
  draggingRoomId.value = null;
  dropIndex.value = null;
  dropOutside.value = false;

  // Deferred, or the click that follows a release selects whichever room the
  // pointer ended up over. Cleared here rather than on release alone: a drag
  // the browser takes over ends in pointercancel, and a flag left standing
  // swallows every later click on the rail.
  setTimeout(() => {
    suppressClick = false;
  }, 0);
}

function moveConversation(roomId: string, index: number) {
  const order = orderedTabs.value.map((tab) => tab.id);
  const from = order.indexOf(roomId);

  if (from === -1) {
    return;
  }

  const [moved] = order.splice(from, 1);
  // Removing the dragged entry shifts everything after it up by one, so a slot
  // below where it started means one less than the raw index.
  order.splice(index > from ? index - 1 : index, 0, moved);

  setTabOrder(order);
}

// Leaving editing mode. A tap anywhere that is not a remove badge ends it, the
// way iOS does.
function stopWiggling() {
  wiggling.value = false;
}

// Anywhere off the rail counts, not just the rail itself -- the message list,
// the header, the page behind the panel. Without this the only way out was to
// tap a conversation, which is the one gesture someone in editing mode is
// trying not to make.
function handleDocumentPointerDown(event: PointerEvent) {
  const rail = chatRailRef.value;
  const target = event.target as Node | null;

  // The rail's own buttons and remove badges handle themselves.
  if (rail && target && rail.contains(target)) {
    return;
  }

  stopWiggling();
}

// Capture phase, so a tap that opens a menu or navigates still drops editing
// mode on the way past. The tap is deliberately not swallowed: eating it would
// cost a deliberate action to undo a mode the user already meant to leave.
watch(wiggling, (editing) => {
  if (!import.meta.client) {
    return;
  }

  if (editing) {
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return;
  }

  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
});

onUnmounted(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
});

watch(
  () => props.isTabActive && props.isSidebarOpen,
  (open) => {
    if (!open) {
      stopWiggling();
    }
  },
);

function removeConversation(tabId: string) {
  const tab = tabs.value.find((tab) => tab.id === tabId);
  if (!tab || tab.pinned) return;
  // A closed Team Chat stays closed (useChatTabSetup would otherwise open it
  // again on the next load); the team page's Chat entry reopens it.
  if (tab.type === "team") hideTeamChat(tab.lobbyId);
  closeTab(tabId);
  activeChatId.value = activeTabId.value;
}
function onTabClick(tab: ChatTab) {
  if (suppressClick) return;
  if (wiggling.value) return stopWiggling();
  composing.value = false;
  viewingRequests.value = false;
  handleSelectRoom(tab);
}
const composing = ref(false);
// Message requests take over the thread area the same way, one at a time.
const viewingRequests = ref(false);
const {
  requests,
  requestCount,
  isRequest,
  isAwaitingReply,
  decline,
} = useMessageRequests();

watch(composing, (isComposing) => {
  if (isComposing) {
    viewingRequests.value = false;
  }
});

watch(viewingRequests, (viewing) => {
  setActiveTab(viewing ? null : composing.value ? null : activeChatId.value);
  if (viewing) {
    composing.value = false;
  }
});

// Nothing left to show once the last request is answered or denied.
watch(requestCount, (count) => {
  if (count === 0) {
    viewingRequests.value = false;
  }
});

function openRequest(request: MessageRequest) {
  viewingRequests.value = false;
  openDirectMessage(request.peer, {requestPreview: true});
}

const activeRequest = computed(() =>
  activeTab.value?.type === "direct" && isRequest(activeTab.value.lobbyId)
    ? activeTab.value
    : null,
);

async function denyActiveRequest() {
  const tab = activeRequest.value;

  if (!tab) {
    return;
  }

  try {
    await decline(tab.lobbyId);
  } catch {
    toast({
      title: t("layouts.chat_panel.requests.deny_failed"),
      variant: "destructive",
    });
  }
}

// The sender of a request writes once, then waits for a reply.
function awaitingReply(tab: ChatTab) {
  return (
    tab.type === "direct" && isAwaitingReply(tab.lobbyId, tab.otherSteamId)
  );
}

const firstDirectTabId = computed(
  () => orderedTabs.value.find((tab) => tab.type === "direct")?.id,
);
// DEAFCS's existing unread paths use activeTabId to decide whether a room is
// being read. The compose screen keeps listeners mounted, but reads no room.
watch(composing, (open) => setActiveTab(open || viewingRequests.value ? null : activeChatId.value));
const { isOnDock: isShortcutOnDock, togglePin: toggleShortcutPin } =
  useDockShortcutPrefs();
function onDock(tab: ChatTab) {
  if(tab.type==='direct' && isRequest(tab.lobbyId)) return false;
  return ![
    "match",
    "match_team",
    "captain_pick_team",
    "draft",
    "matchmaking",
  ].includes(tab.type);
}

const activeTab = computed<ChatTab | null>(() => {
  if (!activeChatId.value) return null;
  return orderedTabs.value.find((t) => t.id === activeChatId.value) || null;
});
const activeMatch = computed(() =>
  activeTab.value?.type === "match"
    ? (matchLobbyStore.myMatches?.find(
        (match) => String(match.id) === activeTab.value?.lobbyId,
      ) ?? null)
    : null,
);

const activeParticipantsCount = computed(() => {
  const tab = activeTab.value;
  if (!tab) return 0;
  const key = `${tab.type}:${tab.lobbyId}`;
  const map = matchLobbyStore.lobbyChat[key] as
    | Map<string, { steam_id: string; name: string; avatar_url?: string }>
    | undefined;
  if (!map) return 0;
  return map.size;
});

const activeParticipants = computed<
  { steam_id: string; name: string; avatar_url?: string }[]
>(() => {
  const tab = activeTab.value;
  if (!tab) return [];
  const key = `${tab.type}:${tab.lobbyId}`;
  const map = matchLobbyStore.lobbyChat[key] as
    | Map<string, { steam_id: string; name: string; avatar_url?: string }>
    | undefined;
  if (!map) return [];
  return Array.from(map.values());
});

const isParticipantsOpen = ref(false);

// Animated indicator for channel rail
const chatRailRef = ref<HTMLElement | null>(null);
const chatButtonRefs = ref<Record<string, HTMLElement | null>>({});
const chatIndicatorY = ref(0);
const chatIndicatorHeight = ref(0);
const chatHasAnimated = ref(false);

function setChatButtonRef(id: string) {
  return (el: any) => {
    chatButtonRefs.value[id] = el as HTMLElement | null;
  };
}

function updateChatIndicator() {
  const rail = chatRailRef.value;
  if (!rail || !activeChatId.value) return;
  const btn = chatButtonRefs.value[activeChatId.value];
  if (!btn) {
    chatIndicatorHeight.value = 0;
    chatHasAnimated.value = false;
    return;
  }
  const railRect = rail.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  chatIndicatorY.value = btnRect.top - railRect.top;
  chatIndicatorHeight.value = btnRect.height;
  nextTick(() => {
    chatHasAnimated.value = true;
  });
}

watch(activeChatId, () => nextTick(updateChatIndicator));
watch(orderedTabs, () => nextTick(updateChatIndicator), { flush: "post" });
onMounted(() => nextTick(updateChatIndicator));

watch(activeChatId, () => {
  isParticipantsOpen.value = false;
});

const showChatIndicator = computed(
  () => activeChatId.value && chatIndicatorHeight.value > 0,
);

// Default to first room when panel becomes active with no selection --
// but jump straight to whichever room still has unread messages first,
// if any. Previously this only ever auto-selected on the very first
// open (`!activeChatId.value`), so once any room had been picked once,
// clicking the Chat hub icon just kept re-showing that same room --
// leaving an incoming DM's unread badge on the hub icon stuck lit even
// after "opening chat", since that DM's own tab never got selected and
// therefore never had resetUnread() called on it.
watch(
  () => props.isTabActive,
  (active) => {
    if (!active || orderedTabs.value.length === 0) return;
    // An explicit "open this room" from outside the panel (e.g. the
    // tournament page's Chat Room tab, which switches the hub to chat and
    // then selects its room) that this panel has not applied yet wins
    // over the unread auto-pick below, which would otherwise jump to
    // whichever other room happens to have unread first.
    const requested = activeTabId.value
      ? orderedTabs.value.find((t) => t.id === activeTabId.value)
      : null;
    if (requested && requested.id !== activeChatId.value) {
      handleSelectRoom(requested);
      return;
    }
    const unreadTab = orderedTabs.value.find(
      (t) => unreadCounts.value[t.id] > 0,
    );
    if (unreadTab) {
      handleSelectRoom(unreadTab);
      return;
    }
    if (!activeChatId.value) {
      handleSelectRoom(orderedTabs.value[0]);
    }
  },
);

// Auto-select first room; handle removed active room
watch(
  orderedTabs,
  (tabs) => {
    if (activeChatId.value && !tabs.find((t) => t.id === activeChatId.value)) {
      const next = tabs[0] ?? null;
      activeChatId.value = next?.id ?? null;
    }
    if (!activeChatId.value && tabs.length > 0) {
      // Prefer the shared store's activeTabId if something already set
      // it to a real tab (e.g. a notification click resolving a DM, or
      // the "Message" button) *before* this panel ever mounted --
      // {immediate: true} means this branch always runs once on first
      // mount, so without this check it unconditionally won the race
      // against that earlier selection and silently reset it back to
      // Global Chat (reported: tapping a DM push notification from a
      // cold-started PWA landed on Global Chat instead of the sender).
      const preferred = activeTabId.value
        ? tabs.find((t) => t.id === activeTabId.value)
        : null;
      handleSelectRoom(preferred ?? tabs[0]);
    }
  },
  { immediate: true },
);

function handleSelectRoom(tab: ChatTab) {
  activeChatId.value = viewId(tab);
  setActiveTab(viewId(tab));
  resetUnread(tab.id);
  for (const room of mountedTabs.value) {
    if (viewId(room) === activeChatId.value) resetUnread(room.id);
  }
  if (tab.type === "direct") markDirectMessagesRead(tab.lobbyId);
}

function handleMessageReceived(payload: {
  tabId?: string;
  direction: "inbound" | "outbound";
  message: any;
}) {
  const tabId = payload.tabId ?? activeChatId.value;
  if (!tabId) return;
  // Either side keeps a conversation on the hub dock (5Stack).
  noteActivity(tabId);
  if (payload.direction !== "inbound") return;
  const room = tabs.value.find((tab) => tab.id === tabId);
  const isCurrentRoom = room && viewId(room) === activeChatId.value;
  const tab = tabs.value.find((t) => t.id === tabId);
  // The lobby's chat is also shown in the Lobby panel; reading it there is
  // reading it.
  const isOnLobbyPanel =
    tab?.type === "matchmaking" &&
    props.isSidebarOpen &&
    currentHub() === "lobby";
  const isVisible =
    (!composing.value &&
      !viewingRequests.value &&
      props.isSidebarOpen &&
      props.isTabActive &&
      isCurrentRoom) ||
    isOnLobbyPanel;
  if (!isVisible) {
    // Direct messages are fully owned by useIncomingDirectMessages.ts
    // instead -- it independently subscribes to the same ChatMessage
    // notification row chat.service.ts inserts for every DM recipient,
    // and already bumps unread from it. Once a DM's tab exists (e.g.
    // persisted from an earlier session) its lobby room stays joined
    // and live "chat" events like this one keep arriving too, so
    // incrementing here as well double-counted every DM's unread badge
    // (reported: sending one message gave the recipient two alerts).
    // Live match all-chat/team-chat is high-volume and expected to be
    // open during a match already, so it's excluded from the unread
    // badge the same way DMs are excluded above (for a different reason).
    // Draft chat has the same no-badge policy on the API side, and
    // Captain Pick team chat never had a Hub badge before it had a room
    // here, so both stay badge-free.
    if (
      tab?.type !== "direct" &&
      tab?.type !== "match" &&
      tab?.type !== "match_team" &&
      tab?.type !== "draft" &&
      tab?.type !== "captain_pick_team"
    ) {
      incrementUnread(tabId);
      const mySteamId = useAuthStore().me?.steam_id;
      const mentions: Array<{ steam_id: string }> =
        payload.message?.mentions ?? [];
      if (
        mySteamId &&
        mentions.some(
          (mention) => String(mention.steam_id) === String(mySteamId),
        )
      ) {
        incrementMention(tabId);
      }
    }
    return;
  }
  resetUnread(tabId);
  // A notification row is always created for every recipient (see
  // chat.service.ts's notifyLobbyMembers), even one actively looking at
  // this tab right now -- without marking it read here too, a message
  // that arrived while the tab was already open would clear the client
  // badge but leave its DB row unread, so it would still resurface on
  // the next reload just like the F5 bug above.
  if (tab?.type === "direct") markDirectMessagesRead(tab.lobbyId);
}

function getRoomIcon(tab: ChatTab) {
  if (tab.type === "announcement") return Megaphone;
  if (tab.type === "tournament") return Trophy;
  if (tab.type === "organizers") return Gavel;
  if (tab.id.startsWith("matchmaking:")) return Merge;
  if (tab.type === "match" || tab.type === "draft") return Sword;
  if (
    tab.type === "team" ||
    tab.type === "match_team" ||
    tab.type === "captain_pick_team"
  )
    return Shield;
  if (tab.type === "global") return Globe;
  return MessageSquare;
}

function getRoomSubtitle(tab: ChatTab) {
  if (tab.type === "announcement") return t("chat_room_subtitles.announcement");
  if (tab.type === "organizers") return t("chat_room_subtitles.organizers");
  if (tab.type === "tournament") return t("chat_room_subtitles.tournament");
  if (tab.id.startsWith("matchmaking:"))
    return t("chat_room_subtitles.matchmaking");
  if (tab.type === "match") return t("chat_room_subtitles.match");
  if (
    tab.type === "team" ||
    tab.type === "match_team" ||
    tab.type === "captain_pick_team"
  )
    return t("chat_room_subtitles.team");
  if (tab.type === "draft") return t("chat_room_subtitles.draft");
  if (tab.type === "global") return t("chat_room_subtitles.global");
  if (tab.type === "direct") return t("chat_room_subtitles.direct");
  return "";
}

function handleCloseTab(event: Event, tabId: string) {
  event.stopPropagation();
  closeTab(tabId);
}

function handlePopOut() {
  const id = activeChatId.value;
  if (!id) return;

  const tab = orderedTabs.value.find((t) => t.id === id);
  if (!tab) return;

  const route = router.resolve({
    name: "chat-tabId",
    params: { tabId: id },
    query: {
      type: tab.type,
      lobbyId: tab.lobbyId,
      instance: tab.instance,
      label: tab.label,
    },
  });

  const w = 420;
  const h = 560;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "location=no",
    "menubar=no",
    "toolbar=no",
    "status=no",
  ].join(",");
  window.open(route.href, "_blank", features);
}

// A player is only ever in one matchmaking lobby at a time (see
// useChatTabSetup's ensureDefaultTabs), so there's at most one
// matchmaking tab -- but it needn't be the *active* tab for its
// LobbyCallPanel to stay mounted: syncPersistentChatJoins keeps every
// open tab's socket joined regardless of which one is active, so the
// "X is calling" popup must listen the same way, or a callee looking
// at a different tab (e.g. Global chat) would silently miss it.
const lobbyCallStatus = ref<{ count: number; isInCall: boolean }>({
  count: 0,
  isInCall: false,
});

const matchmakingTab = computed(() =>
  orderedTabs.value.find((t) => t.id.startsWith("matchmaking:")),
);

function openLobbyCallWindow() {
  const tab = matchmakingTab.value;
  if (!tab) return;
  const w = 960;
  const h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "location=no",
    "menubar=no",
    "toolbar=no",
    "status=no",
  ].join(",");
  window.open(`/matchmaking/lobby-call/${tab.lobbyId}`, "lobby-call", features);
}

// Tournament webcam support room for the active tournament chat. Only
// the header icon's state lives here; there is no popup/ring path.
const activeTournamentId = computed(() =>
  activeTab.value?.type === "tournament" ? activeTab.value.lobbyId : null,
);
const { participants: tournamentWebcamParticipants } =
  useTournamentWebcamStatus(activeTournamentId);
const tournamentWebcamCount = computed(
  () => tournamentWebcamParticipants.value.length,
);
const tournamentWebcamLabel = computed(() =>
  tournamentWebcamCount.value
    ? t("tournament.webcam.join_count", {
        count: tournamentWebcamCount.value,
        max: TOURNAMENT_WEBCAM_MAX,
      })
    : t("tournament.webcam.tooltip"),
);

function openTournamentWebcamWindow() {
  const id = activeTournamentId.value;
  if (!id) return;
  const w = 960;
  const h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "location=no",
    "menubar=no",
    "toolbar=no",
    "status=no",
  ].join(",");
  window.open(tournamentWebcamPopoutPath(id), "tournament-webcam", features);
}
</script>

<template>
  <div class="flex h-full">
    <!-- Left channel rail (compact) -->
    <div
      class="w-16 max-[374px]:w-[52px] flex-shrink-0 border-r border-border flex flex-col items-center py-2 gap-1"
    >
      <div
        v-if="orderedTabs.length"
        ref="chatRailRef"
        class="relative flex-1 overflow-y-auto space-y-1 w-full flex flex-col items-center"
      >
        <!-- Sliding left accent bar -->
        <div
          v-show="showChatIndicator"
          class="absolute top-0 left-0 w-0.5 rounded-r-full z-10 pointer-events-none bg-[hsl(var(--tac-amber))]"
          :class="
            chatHasAnimated
              ? 'transition-transform [transition-duration:350ms] [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]'
              : ''
          "
          :style="{
            transform: `translateY(${chatIndicatorY + 4}px)`,
            height: `${chatIndicatorHeight - 8}px`,
          }"
        />

        <TooltipProvider :key="tooltipEpoch" :ignore-non-keyboard-focus="true">
          <template v-for="tab in orderedTabs" :key="tab.id">
            <div
              v-if="tab.id === firstDirectTabId"
              class="flex w-full shrink-0 flex-col items-center"
            >
              <div class="my-1 h-px w-8 bg-border" />
              <MessageRequestsRailButton
                v-if="requestCount > 0"
                :active="viewingRequests"
                :count="requestCount"
                @click="viewingRequests = true"
              />
              <NewChatRailButton
                :active="composing"
                @click="composing = !composing"
              />
            </div>
            <div class="relative">
              <ContextMenu>
                <Tooltip>
                  <!-- ContextMenuTrigger renders a fragment (a virtual anchor at
                       the pointer, then the button), so it must sit OUTSIDE
                       TooltipTrigger's as-child: the other way round the tooltip
                       anchors to that virtual 0x0 point and opens at the top-left
                       of the screen. -->
                  <ContextMenuTrigger as-child>
                    <TooltipTrigger as-child>
                      <button
                        :ref="setChatButtonRef(tab.id)"
                        :data-chat-tab-id="tab.id"
                        class="relative flex items-center justify-center w-11 h-11 rounded-md transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary select-none"
                        :class="[
                          wiggling ? 'touch-none chat-wiggle' : 'touch-pan-y',
                          activeChatId === tab.id
                            ? 'text-zinc-100'
                            : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100',
                          draggingRoomId === tab.id
                            ? 'opacity-40 scale-95'
                            : 'z-[1]',
                        ]"
                        type="button"
                        @click="onTabClick(tab)"
                        @pointerdown="handlePointerDown(tab, $event)"
                        @pointermove="handlePointerMove"
                        @pointerup="handlePointerUp"
                        @pointercancel="cancelPress"
                      >
                        <template v-if="draggingRoomId !== tab.id">
                          <div
                            v-if="tab.type === 'direct'"
                            class="flex-shrink-0 w-7 h-7 rounded-md overflow-hidden ring-1 ring-inset bg-zinc-900/80"
                            :class="
                              activeChatId === tab.id
                                ? 'ring-zinc-500'
                                : 'ring-zinc-700 group-hover:ring-zinc-600'
                            "
                          >
                            <LiveAvatarImg
                              :steam-id="tab.otherSteamId"
                              :fallback-url="tab.avatarUrl"
                              img-class="w-full h-full object-cover"
                            />
                          </div>
                          <!-- A team's logo is shown as uploaded: no tile, ring or
                               crop of our own around it. -->
                          <img
                            v-else-if="tab.type === 'team' && tab.avatarUrl"
                            :src="tab.avatarUrl"
                            alt=""
                            draggable="false"
                            class="flex-shrink-0 w-7 h-7 select-none object-contain"
                          />
                          <div
                            v-else
                            class="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-inherit transition-colors"
                            :class="
                              activeChatId === tab.id
                                ? 'bg-zinc-700'
                                : 'bg-zinc-900/80 group-hover:bg-zinc-700/70'
                            "
                          >
                            <component
                              :is="getRoomIcon(tab)"
                              class="w-3.5 h-3.5"
                            />
                          </div>
                        </template>
                        <span
                          v-if="draggingRoomId !== tab.id && tabBadge(tab).calm"
                          class="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-[hsl(var(--tac-amber))] text-black text-[9px] px-1 min-w-[1.05rem] h-4 leading-none"
                        >
                          {{ formatBadgeCount(tabBadge(tab).calm) }}
                        </span>
                        <span
                          v-if="
                            draggingRoomId !== tab.id &&
                            isUrgentChatType(tab.type) &&
                            tabBadge(tab).urgent
                          "
                          class="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] px-1 min-w-[1.05rem] h-4 leading-none"
                          :title="
                            $t(
                              'chat.urgent_badge',
                              'Private messages, announcements and mentions',
                            )
                          "
                        >
                          {{ formatBadgeCount(tabBadge(tab).urgent) }}
                        </span>
                        <span
                          v-if="
                            draggingRoomId !== tab.id &&
                            !isUrgentChatType(tab.type) &&
                            mentionCounts[tab.id]
                          "
                          class="absolute -bottom-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] px-1 min-w-[1.05rem] h-4 leading-none"
                          :title="
                            $t('chat.mentions_badge', 'You were mentioned')
                          "
                        >
                          @{{ formatBadgeCount(mentionCounts[tab.id]) }}
                        </span>
                      </button>
                    </TooltipTrigger>
                  </ContextMenuTrigger>
                  <TooltipContent
                    side="left"
                    class="bg-zinc-900 text-zinc-50 border border-zinc-800 shadow-lg rounded-md px-3 py-2"
                  >
                    <div class="flex flex-col">
                      <span class="text-xs font-medium">
                        {{ tab.label }}
                      </span>
                      <span
                        v-if="getRoomSubtitle(tab)"
                        class="text-[10px] text-zinc-200/80"
                      >
                        {{ getRoomSubtitle(tab) }}
                      </span>
                    </div>
                  </TooltipContent>
                </Tooltip>
                <ContextMenuContent data-right-hub-interactive>
                  <ContextMenuItem
                    v-if="onDock(tab)"
                    @select="
                      toggleShortcutPin(
                        tab.id,
                        tab.type !== 'direct',
                        isDefaultDockRoomType(tab.type),
                      )
                    "
                    >{{
                      isShortcutOnDock(tab.id, isDefaultDockRoomType(tab.type))
                        ? $t("layouts.hub.dock.unpin_shortcut")
                        : $t("layouts.hub.dock.pin_shortcut")
                    }}</ContextMenuItem
                  >
                  <ContextMenuItem
                    v-if="!tab.pinned"
                    @select="removeConversation(tab.id)"
                    >{{ $t("common.close") }}</ContextMenuItem
                  >
                </ContextMenuContent>
              </ContextMenu>
              <button
                v-if="wiggling && !tab.pinned"
                type="button"
                :aria-label="$t('common.close')"
                class="absolute -top-1 -left-1 z-[2] inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow"
                @pointerdown.stop
                @click.stop="removeConversation(tab.id)"
              >
                <X class="h-2.5 w-2.5" />
              </button>
            </div>
          </template>
        </TooltipProvider>
        <template v-if="!firstDirectTabId">
          <div class="my-1 h-px w-8 shrink-0 bg-border" />
          <MessageRequestsRailButton
            v-if="requestCount > 0"
            :active="viewingRequests"
            :count="requestCount"
            @click="viewingRequests = true"
          />
          <NewChatRailButton
            :active="composing"
            @click="composing = !composing"
          />
        </template>

        <div
          v-if="draggingRoomId && dropIndex !== null"
          class="absolute left-3 right-3 h-0.5 bg-primary pointer-events-none"
          :style="{ top: dropIndicatorY + 'px' }"
        />
      </div>

      <div v-else class="flex-1" />
      <MessageRequestsRailButton
        v-if="!orderedTabs.length && requestCount > 0"
        :active="viewingRequests"
        :count="requestCount"
        @click="viewingRequests = true"
      />
      <NewChatRailButton
        v-if="!orderedTabs.length && !viewingRequests"
        :active="composing"
        @click="composing = !composing"
      />
    </div>

    <!-- Right chat area -->
    <div class="flex-1 min-w-0 flex flex-col">
      <NewConversation v-if="composing" @close="composing = false" />
      <MessageRequests
        v-if="viewingRequests"
        @close="viewingRequests = false"
        @open="openRequest"
      />
      <template v-if="orderedTabs.length">
        <div
          v-if="activeRequest && !viewingRequests && !composing"
          class="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground"
        >
          <span>{{
            $t("layouts.chat_panel.requests.banner", {
              name: activeRequest.label,
            })
          }}</span>
          <button
            type="button"
            class="shrink-0 hover:text-destructive"
            @click="denyActiveRequest"
          >
            {{ $t("layouts.chat_panel.requests.deny") }}
          </button>
        </div>
        <!-- Header with channel title + participants + controls -->
        <div
          v-show="!composing && !viewingRequests"
          class="flex items-center justify-between px-3 py-3 border-b border-border bg-card/30"
        >
          <div class="min-w-0 flex items-center gap-3">
            <ChatDirectProfileLink
              v-if="activeTab?.type === 'direct' && activeTab.otherSteamId"
              :steam-id="activeTab.otherSteamId"
              :name="activeTab.label"
              :avatar-url="activeTab.avatarUrl"
              :subtitle="getRoomSubtitle(activeTab)"
              @navigate="tooltipEpoch++"
            />
            <ChatTeamProfileLink
              v-else-if="activeTab?.type === 'team'"
              :team-id="activeTab.lobbyId"
              :name="activeTab.label"
              :avatar-url="activeTab.avatarUrl"
              :subtitle="getRoomSubtitle(activeTab)"
              @navigate="tooltipEpoch++"
            />
            <template v-else>
              <div class="min-w-0">
                <div class="text-xs font-semibold text-foreground truncate">
                  {{
                    activeTab?.label || $t("layouts.chat_panel.default_title")
                  }}
                </div>
                <div
                  class="flex items-center gap-2 text-[10px] text-muted-foreground truncate"
                >
                  <span>
                    {{ activeTab ? getRoomSubtitle(activeTab) : "" }}
                  </span>
                </div>
              </div>
            </template>
          </div>
          <div class="flex items-center gap-1.5">
            <TooltipProvider :ignore-non-keyboard-focus="true">
              <Tooltip v-if="activeTab?.id?.startsWith('matchmaking:')">
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
                    :class="
                      lobbyCallStatus.count
                        ? 'border-[hsl(var(--tac-amber))]/50 bg-[hsl(var(--tac-amber))]/10 text-[hsl(var(--tac-amber))] animate-pulse'
                        : 'border-border bg-card/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    "
                    @click="openLobbyCallWindow"
                  >
                    <Video class="w-3.5 h-3.5" />
                    <span
                      v-if="lobbyCallStatus.count"
                      class="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-[hsl(var(--tac-amber))] text-black text-[9px] font-bold px-1 min-w-[1.05rem] h-4 leading-none"
                    >
                      {{ lobbyCallStatus.count }}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  class="bg-zinc-900 text-zinc-50 border border-zinc-800 shadow-lg rounded-md px-3 py-1.5 text-[11px]"
                >
                  {{
                    lobbyCallStatus.count
                      ? $t("matchmaking.lobby_call.join", "Join call")
                      : $t("matchmaking.lobby_call.tooltip", "Webcam call")
                  }}
                </TooltipContent>
              </Tooltip>
              <!-- Tournament webcam support room: opt-in. Orange + count
                   while anyone is in it; never rings, pops up or opens by
                   itself. Clicking opens the room window. -->
              <Tooltip v-if="activeTournamentId">
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    data-testid="tournament-webcam-button"
                    class="relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
                    :class="
                      tournamentWebcamCount
                        ? 'border-[hsl(var(--tac-amber))]/50 bg-[hsl(var(--tac-amber))]/10 text-[hsl(var(--tac-amber))]'
                        : 'border-border bg-card/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    "
                    :aria-label="tournamentWebcamLabel"
                    @click="openTournamentWebcamWindow"
                  >
                    <Video class="w-3.5 h-3.5" />
                    <span
                      v-if="tournamentWebcamCount"
                      class="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-[hsl(var(--tac-amber))] text-black text-[9px] font-bold px-1 min-w-[1.05rem] h-4 leading-none"
                    >
                      {{ tournamentWebcamCount }}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  class="bg-zinc-900 text-zinc-50 border border-zinc-800 shadow-lg rounded-md px-3 py-1.5 text-[11px]"
                >
                  {{ tournamentWebcamLabel }}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    v-if="!isMobile"
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    @click="handlePopOut"
                  >
                    <ExternalLink class="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  class="bg-zinc-900 text-zinc-50 border border-zinc-800 shadow-lg rounded-md px-3 py-1.5 text-[11px]"
                >
                  {{ $t("layouts.chat_panel.pop_out_tooltip") }}
                </TooltipContent>
              </Tooltip>
              <DropdownMenu v-if="activeTab">
                <DropdownMenuTrigger as-child>
                  <button
                    type="button"
                    class="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    :aria-label="$t('layouts.chat_panel.conversation_menu')"
                  >
                    <MoreHorizontal class="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  class="w-56"
                  data-right-hub-interactive
                >
                  <DropdownMenuItem
                    v-if="onDock(activeTab)"
                    @select="
                      toggleShortcutPin(
                        activeTab.id,
                        activeTab.type !== 'direct',
                        isDefaultDockRoomType(activeTab.type),
                      )
                    "
                    >{{
                      isShortcutOnDock(
                        activeTab.id,
                        isDefaultDockRoomType(activeTab.type),
                      )
                        ? $t("layouts.hub.dock.unpin_shortcut")
                        : $t("layouts.hub.dock.pin_shortcut")
                    }}</DropdownMenuItem
                  >
                  <DropdownMenuItem
                    v-if="!activeTab.pinned"
                    @select="removeConversation(activeTab.id)"
                    >{{ $t("common.close") }}</DropdownMenuItem
                  >
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          </div>
        </div>

        <!-- Mounted whenever the player has a matchmaking lobby at all --
             not scoped to the active tab, since syncPersistentChatJoins
             keeps that tab's socket joined even while another tab is
             focused, so the "X is calling" popup must stay listening the
             same way or a callee looking at Global chat would miss it.
             The compact status bar itself only shows while that tab is
             actually the active one. -->
        <LobbyCallPanel
          v-if="matchmakingTab"
          :lobby-id="matchmakingTab.lobbyId"
          :show-bar="
            !composing &&
            !viewingRequests &&
            activeTab?.id === matchmakingTab.id
          "
          @open-call="openLobbyCallWindow"
          @status="lobbyCallStatus = $event"
        />

        <div
          v-if="isParticipantsOpen && activeParticipants.length"
          v-show="!composing && !viewingRequests"
          class="px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/80"
        >
          <ChatParticipantsList :participants="activeParticipants" />
        </div>

        <ChatMatchHeader
          v-if="activeMatch && !composing && !viewingRequests"
          :match="activeMatch"
          class="mx-3 mt-2"
        />
        <div
          v-show="!composing && !viewingRequests"
          class="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <!-- ChatLobby's root template is a Teleport-or-div pair plus a
               sibling SanctionPlayer node, so it has no single element
               root -- Vue only special-cases v-show for a component
               whose template resolves to one real element (or a root-level
               v-if/v-else *pair* with nothing else), and warns "Runtime
               directive used on component with non-element root node" for
               anything wider, silently no-op'ing the display toggle. Each
               room therefore gets its own real DOM wrapper to hide instead
               of putting v-show on the ChatLobby component itself. -->
          <div
            v-for="tab in mountedTabs"
            :key="tab.id"
            v-show="!composing && viewId(tab) === activeChatId"
            class="flex-1 basis-0 min-h-0 flex flex-col overflow-hidden"
            :class="
              isTeamRoom(tab) && viewId(tab) !== tab.id
                ? 'border-t border-border'
                : ''
            "
            :data-chat-room-id="tab.id"
          >
            <h3
              v-if="tab.type === 'match' || isTeamRoom(tab)"
              class="shrink-0 px-3 pt-2 text-xs font-semibold text-muted-foreground"
            >
              {{
                tab.type === "match"
                  ? $t("chat.match_chat")
                  : $t("chat.team_chat")
              }}
            </h3>
            <ChatLobby
              :instance="tab.instance"
              :type="tab.type"
              :lobby-id="tab.lobbyId"
              :tab-id="tab.id"
              :frameless="true"
              :is-global-context="true"
              :reactions-enabled="true"
              :hide-participants-summary="true"
              :hide-match-header="true"
              :disable-auto-focus-on-activate="isMobile || isTeamRoom(tab)"
              :is-active-tab="
                !composing &&
                !viewingRequests &&
                viewId(tab) === activeChatId &&
                isSidebarOpen &&
                isTabActive
              "
              :can-send="canSendToTab(tab)"
              :readonly-hint="readonlyHintFor(tab)"
              :allow-chat-attachments="
                tab.type !== 'match' && tab.type !== 'match_team'
              "
              @message-received="handleMessageReceived"
            />
          </div>
        </div>
      </template>
      <div
        v-else-if="!composing && !viewingRequests"
        class="flex-1 flex flex-col"
      >
        <Empty>
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              {{ $t("layouts.chat_panel.no_chats_title") }}
            </p>
            <p class="text-xs text-muted-foreground">
              {{ $t("layouts.chat_panel.no_chats_description") }}
            </p>
          </div>
        </Empty>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 5Stack's touch editing animation, with the same reduced-motion opt-out. */
.chat-wiggle {
  animation: chat-wiggle 0.24s ease-in-out infinite;
  transform-origin: 50% 50%;
}
.chat-wiggle:nth-child(even) {
  animation-delay: -0.12s;
}
@keyframes chat-wiggle {
  0%,
  100% {
    transform: rotate(-1.4deg);
  }
  50% {
    transform: rotate(1.4deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .chat-wiggle {
    animation: none;
  }
}
</style>
