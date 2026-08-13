<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
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
} from "lucide-vue-next";
import { useRouter } from "#app";
import ChatLobby from "~/components/chat/ChatLobby.vue";
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";
import { useChatTabs, type ChatTab } from "~/composables/useChatTabs";
import { markDirectMessagesRead } from "~/composables/useIncomingDirectMessages";
import TooltipProvider from "~/components/ui/tooltip/TooltipProvider.vue";
import TooltipTrigger from "~/components/ui/tooltip/TooltipTrigger.vue";
import TooltipContent from "~/components/ui/tooltip/TooltipContent.vue";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";

const props = defineProps<{
  isSidebarOpen: boolean;
  isTabActive: boolean;
}>();

const { t } = useI18n();
const router = useRouter();

const {
  tabs,
  unreadCounts,
  setActiveTab,
  resetUnread,
  incrementUnread,
  closeTab,
  activeTabId,
  manualOrder,
  reorderTab,
} = useChatTabs();

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
  if (id && id !== activeChatId.value && tabs.value.some((t) => t.id === id)) {
    activeChatId.value = id;
    resetUnread(id);
    const tab = tabs.value.find((t) => t.id === id);
    if (tab?.type === "direct") markDirectMessagesRead(tab.lobbyId);
  }
});

const orderedTabs = computed<ChatTab[]>(() => {
  const weight = (tab: ChatTab) => {
    if (tab.type === "organizers" || tab.type === "tournament") return 0;
    if (tab.id.startsWith("matchmaking:")) return 1;
    if (tab.type === "match") return 2;
    if (tab.type === "global") return 3;
    return 4;
  };
  const base = [...tabs.value].sort((a, b) => {
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
  return [...base].sort((a, b) => {
    const pa = position.has(a.id) ? (position.get(a.id) as number) : Infinity;
    const pb = position.has(b.id) ? (position.get(b.id) as number) : Infinity;
    return pa - pb;
  });
});

// Custom pointer-based drag instead of native HTML5 draggable="true" --
// the native version shows the browser/OS's own drag cursor and a
// translucent ghost snapshot (reported as looking "weird" / showing a
// Windows drag icon), which can't be styled away since the OS renders
// it, not the page. This never calls the native drag APIs at all, so
// there's nothing for the OS to draw -- the only thing that moves is
// the button itself, following the pointer directly.
const draggedTabId = ref<string | null>(null);
const draggedTab = computed<ChatTab | null>(
  () => orderedTabs.value.find((t) => t.id === draggedTabId.value) ?? null,
);
// Viewport-space box for the dragged button while held -- position:
// fixed, driven directly by the pointer position, completely decoupled
// from the rail's own flex layout. A relative CSS transform (the
// earlier version) is measured against the button's *own current flow
// position*, which itself moves every time a live reorder shifts the
// button to a new slot mid-drag -- causing the reported "suddenly
// jumps far away, doesn't smoothly follow the cursor" the moment a
// reorder fired. Fixed positioning has no such reference to lose.
const dragBox = ref<{ left: number; top: number; width: number; height: number } | null>(
  null,
);

// FLIP (First-Last-Invert-Play): capture where every rail button
// currently sits, reorder the data, then on the next tick offset each
// moved button back to its old spot with transitions off and
// transition it to zero -- the icons visibly slide out of the way of
// the dragged one, instead of the whole rail just snapping to its new
// order.
function animateReorder(mutate: () => void) {
  const before = new Map<string, number>();
  for (const [id, el] of Object.entries(chatButtonRefs.value)) {
    if (el && id !== draggedTabId.value) before.set(id, el.getBoundingClientRect().top);
  }

  mutate();

  nextTick(() => {
    for (const [id, el] of Object.entries(chatButtonRefs.value)) {
      if (!el || id === draggedTabId.value) continue;
      const prevTop = before.get(id);
      if (prevTop === undefined) continue;
      const delta = prevTop - el.getBoundingClientRect().top;
      if (!delta) continue;

      el.style.transition = "none";
      el.style.transform = `translateY(${delta}px)`;
      // Force a reflow so the browser registers the starting transform
      // before we clear it -- otherwise it'd just skip straight to the
      // end state with no animation at all.
      void el.offsetHeight;
      el.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
      el.style.transform = "";
    }
  });
}

let lastDragOverTarget: string | null = null;

function onTabPointerDown(event: PointerEvent, tab: ChatTab) {
  if (event.button !== 0) return;

  const id = tab.id;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let grabDx = 0;
  let grabDy = 0;

  function onMove(e: PointerEvent) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      // Small threshold so this doesn't hijack a plain click.
      if (Math.hypot(dx, dy) < 4) return;
      dragging = true;
      draggedTabId.value = id;

      const el = chatButtonRefs.value[id];
      const rect = el?.getBoundingClientRect();
      if (rect) {
        // Where inside the button the pointer actually grabbed it, so
        // the icon doesn't snap to have its corner under the cursor.
        grabDx = startX - rect.left;
        grabDy = startY - rect.top;
        dragBox.value = {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        };
      }
    }

    if (dragBox.value) {
      dragBox.value = {
        ...dragBox.value,
        left: e.clientX - grabDx,
        top: e.clientY - grabDy,
      };
    }

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetEl = (el as HTMLElement)?.closest<HTMLElement>(
      "[data-chat-tab-id]",
    );
    const targetId = targetEl?.dataset.chatTabId;
    // Any room can now be a drop target, not just the pinned/standing
    // channels -- the old `targetTab?.pinned` gate meant hovering over a
    // DM tab (always unpinned) anywhere in the rail, including one that
    // happened to land in the middle of the list, silently refused the
    // drop. Reordering itself (reorderTab) was always generic over ids;
    // only this check was blocking it.
    if (targetId && targetId !== id && targetId !== lastDragOverTarget) {
      lastDragOverTarget = targetId;
      animateReorder(() => reorderTab(id, targetId as string));
    }
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    draggedTabId.value = null;
    dragBox.value = null;
    lastDragOverTarget = null;
    // A real drag still fires a trailing click on pointerup in most
    // browsers -- swallow just that one so it doesn't also select the
    // room you dragged over on the way past.
    if (dragging) suppressNextClick = true;
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

let suppressNextClick = false;
function onTabClick(tab: ChatTab) {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  handleSelectRoom(tab);
}

const activeTab = computed<ChatTab | null>(() => {
  if (!activeChatId.value) return null;
  return orderedTabs.value.find((t) => t.id === activeChatId.value) || null;
});

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
      handleSelectRoom(tabs[0]);
    }
  },
  { immediate: true },
);

function handleSelectRoom(tab: ChatTab) {
  activeChatId.value = tab.id;
  setActiveTab(tab.id);
  resetUnread(tab.id);
  if (tab.type === "direct") markDirectMessagesRead(tab.lobbyId);
}

function handleMessageReceived(payload: {
  tabId?: string;
  direction: "inbound" | "outbound";
  message: any;
}) {
  if (payload.direction !== "inbound") return;
  const tabId = payload.tabId ?? activeChatId.value;
  if (!tabId) return;
  const isCurrentRoom = tabId === activeChatId.value;
  const isVisible = props.isSidebarOpen && props.isTabActive && isCurrentRoom;
  if (!isVisible) {
    incrementUnread(tabId);
    return;
  }
  resetUnread(tabId);
  // A notification row is always created for every recipient (see
  // chat.service.ts's notifyLobbyMembers), even one actively looking at
  // this tab right now -- without marking it read here too, a message
  // that arrived while the tab was already open would clear the client
  // badge but leave its DB row unread, so it would still resurface on
  // the next reload just like the F5 bug above.
  const tab = tabs.value.find((t) => t.id === tabId);
  if (tab?.type === "direct") markDirectMessagesRead(tab.lobbyId);
}

function getRoomIcon(tab: ChatTab) {
  if (tab.type === "tournament") return Trophy;
  if (tab.type === "organizers") return Megaphone;
  if (tab.id.startsWith("matchmaking:")) return Merge;
  if (tab.type === "match") return Sword;
  if (tab.type === "team") return Shield;
  if (tab.type === "global") return Globe;
  return MessageSquare;
}

function getRoomSubtitle(tab: ChatTab) {
  if (tab.type === "organizers") return t("chat_room_subtitles.organizers");
  if (tab.type === "tournament") return t("chat_room_subtitles.tournament");
  if (tab.id.startsWith("matchmaking:"))
    return t("chat_room_subtitles.matchmaking");
  if (tab.type === "match") return t("chat_room_subtitles.match");
  if (tab.type === "team") return t("chat_room_subtitles.team");
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
</script>

<template>
  <div class="flex h-full">
    <!-- Left channel rail (compact) -->
    <div
      class="w-16 flex-shrink-0 border-r border-border flex flex-col items-center py-2 gap-1"
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

        <TooltipProvider>
          <template v-for="tab in orderedTabs" :key="tab.id">
            <Tooltip>
              <TooltipTrigger as-child>
                <button
                  :ref="setChatButtonRef(tab.id)"
                  :data-chat-tab-id="tab.id"
                  class="relative flex items-center justify-center w-11 h-11 rounded-md transition-colors duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary touch-none select-none"
                  :class="[
                    activeChatId === tab.id
                      ? 'text-zinc-100'
                      : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100',
                    draggedTabId === tab.id
                      ? 'pointer-events-none border-2 border-dashed border-zinc-600 bg-zinc-800/30'
                      : 'z-[1]',
                  ]"
                  type="button"
                  @click="onTabClick(tab)"
                  @pointerdown="onTabPointerDown($event, tab)"
                >
                  <!-- The icon/avatar itself is hidden while this slot is
                       the drag placeholder -- the floating clone below
                       (driven by dragBox) is what actually renders it,
                       following the pointer. This slot stays in flex flow
                       the whole time (unlike the old position:fixed swap,
                       which yanked the button out of flow so its space
                       silently closed up with nothing marking where it
                       had been) so there's always a visible empty square
                       showing exactly where the dragged room will land,
                       iOS-springboard style. -->
                  <template v-if="draggedTabId !== tab.id">
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
                    <div
                      v-else
                      class="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-inherit transition-colors"
                      :class="
                        activeChatId === tab.id
                          ? 'bg-zinc-700'
                          : 'bg-zinc-900/80 group-hover:bg-zinc-700/70'
                      "
                    >
                      <component :is="getRoomIcon(tab)" class="w-3.5 h-3.5" />
                    </div>
                  </template>
                  <span
                    v-if="draggedTabId !== tab.id && unreadCounts[tab.id]"
                    class="absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] px-1 min-w-[1.05rem] h-4 leading-none"
                  >
                    {{ unreadCounts[tab.id] }}
                  </span>
                  <button
                    v-if="!tab.pinned"
                    type="button"
                    class="absolute -top-1 -left-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-zinc-700 hover:bg-red-500 text-zinc-200 hover:text-white"
                    :aria-label="$t('common.close')"
                    @click="handleCloseTab($event, tab.id)"
                  >
                    <X class="w-2.5 h-2.5" />
                  </button>
                </button>
              </TooltipTrigger>
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
          </template>
        </TooltipProvider>

        <!-- Floating clone of whatever's being dragged -- this is the
             piece that actually follows the pointer; the in-flow button
             above just becomes an empty dashed placeholder for the
             duration of the drag. -->
        <div
          v-if="draggedTab && dragBox"
          class="fixed z-20 flex items-center justify-center rounded-md bg-zinc-800 shadow-xl shadow-black/40 scale-110 pointer-events-none text-zinc-100"
          :style="{
            left: `${dragBox.left}px`,
            top: `${dragBox.top}px`,
            width: `${dragBox.width}px`,
            height: `${dragBox.height}px`,
          }"
        >
          <div
            v-if="draggedTab.type === 'direct'"
            class="flex-shrink-0 w-7 h-7 rounded-md overflow-hidden ring-1 ring-inset ring-zinc-500 bg-zinc-900/80"
          >
            <LiveAvatarImg
              :steam-id="draggedTab.otherSteamId"
              :fallback-url="draggedTab.avatarUrl"
              img-class="w-full h-full object-cover"
            />
          </div>
          <div
            v-else
            class="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-zinc-700 text-inherit"
          >
            <component :is="getRoomIcon(draggedTab)" class="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      <div v-else class="flex-1" />
    </div>

    <!-- Right chat area -->
    <div class="flex-1 min-w-0 flex flex-col">
      <template v-if="orderedTabs.length">
        <!-- Header with channel title + participants + controls -->
        <div
          class="flex items-center justify-between px-3 py-3 border-b border-border bg-card/30"
        >
          <div class="min-w-0 flex items-center gap-3">
            <div class="min-w-0">
              <div class="text-xs font-semibold text-foreground truncate">
                {{ activeTab?.label || $t("layouts.chat_panel.default_title") }}
              </div>
              <div
                class="flex items-center gap-2 text-[10px] text-muted-foreground truncate"
              >
                <span>
                  {{ activeTab ? getRoomSubtitle(activeTab) : "" }}
                </span>
                <button
                  type="button"
                  class="text-[10px] text-zinc-400 underline-offset-2"
                  :class="
                    activeParticipantsCount
                      ? 'hover:text-zinc-200 hover:underline cursor-pointer'
                      : 'cursor-default opacity-60'
                  "
                  @click="
                    activeParticipantsCount &&
                    (isParticipantsOpen = !isParticipantsOpen)
                  "
                >
                  {{
                    $t("layouts.chat_panel.participants_in_chat", {
                      count: activeParticipantsCount,
                    })
                  }}
                </button>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <TooltipProvider>
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
            </TooltipProvider>
          </div>
        </div>

        <div
          v-if="isParticipantsOpen && activeParticipants.length"
          class="px-3 py-2 border-b border-zinc-800/60 bg-zinc-950/80 text-[11px] text-zinc-200 flex gap-2 overflow-x-auto"
        >
          <div
            v-for="p in activeParticipants"
            :key="p.steam_id"
            class="flex items-center gap-1.5 bg-zinc-900/70 rounded-full px-2 py-0.5"
          >
            <img
              v-if="p.avatar_url"
              :src="p.avatar_url"
              alt=""
              class="w-4 h-4 rounded-full object-cover"
            />
            <span class="truncate max-w-[8rem]">
              {{ p.name }}
            </span>
          </div>
        </div>

        <div class="flex-1 min-h-0 flex flex-col">
          <ChatLobby
            v-for="tab in tabs"
            :key="tab.id"
            v-show="tab.id === activeChatId"
            :instance="tab.instance"
            :type="tab.type"
            :lobby-id="tab.lobbyId"
            :tab-id="tab.id"
            :frameless="true"
            :is-global-context="true"
            :hide-participants-summary="true"
            :disable-auto-focus-on-activate="isMobile"
            :is-active-tab="
              tab.id === activeChatId && isSidebarOpen && isTabActive
            "
            @message-received="handleMessageReceived"
          />
        </div>
      </template>
      <div v-else class="flex-1 flex flex-col">
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
