<script setup lang="ts">
import ChatHeader from "~/components/chat/ChatHeader.vue";
import ChatMessages from "~/components/chat/ChatMessages.vue";
import ChatInput from "~/components/chat/ChatInput.vue";
import ChatMatchHeader from "~/components/chat/ChatMatchHeader.vue";
import Empty from "~/components/ui/empty/Empty.vue";
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";
</script>

<template>
  <Teleport to="#global-chat-container" v-if="global" defer>
    <div
      v-bind="$attrs"
      class="fixed bottom-4 bg-background border rounded-lg shadow-lg z-50 transition-all duration-300 ease-in-out flex flex-col w-96"
      :class="{ 'h-12': isMinimized, 'h-96': !isMinimized }"
      :style="{
        right: rightSidebarOffset + 'px',
      }"
    >
      <ChatHeader
        variant="global"
        :is-minimized="isMinimized"
        :unread-count="unreadCount"
        @toggle-minimize="toggleMinimize"
      >
        <template #title>
          <slot name="chat-label">{{ $t("chat.lobby_chat") }}</slot>
        </template>
      </ChatHeader>
      <div
        v-if="matchInfo"
        class="px-3 py-2 border-b border-border/40 text-[11px] text-muted-foreground flex items-center justify-between gap-2 bg-background/80"
      >
        <div class="flex flex-col gap-0.5 min-w-0">
          <NuxtLink
            :to="`/matches/${(matchInfo as any).id}`"
            class="text-xs font-medium text-primary hover:underline truncate max-w-[220px]"
            @click.stop
          >
            {{ matchLabel }}
          </NuxtLink>
          <NuxtLink
            :to="`/matches/${(matchInfo as any).id}`"
            class="text-[11px] text-primary hover:underline truncate max-w-[220px]"
            @click.stop
          >
            {{ matchMetaText }}
          </NuxtLink>
        </div>
        <div
          v-if="matchScoreText"
          class="text-xs font-semibold whitespace-nowrap"
        >
          {{ matchScoreText }}
        </div>
      </div>
      <div
        class="flex items-center justify-between px-3 py-1 text-[11px] text-muted-foreground border-b border-border/40"
      >
        <div class="flex items-center gap-1.5">
          <div class="relative inline-flex">
            <span
              v-if="participantsCount > 0"
              class="absolute inline-flex h-2.5 w-2.5 rounded-full animate-ping bg-emerald-500/60"
            ></span>
            <span
              class="relative inline-flex h-2.5 w-2.5 rounded-full"
              :class="
                participantsCount > 0 ? 'bg-emerald-400' : 'bg-zinc-500/60'
              "
            ></span>
          </div>
          <button
            type="button"
            class="underline-offset-2 hover:underline"
            @click.stop="showParticipants = !showParticipants"
          >
            {{ participantsCount }} {{ $t("chat.in_chat") }}
          </button>
        </div>
      </div>
      <div
        v-if="showParticipants"
        class="absolute z-50 top-11 left-2 right-2 rounded-md border bg-popover text-popover-foreground shadow-md p-3 text-xs max-h-52 overflow-y-auto"
      >
        <div
          v-if="participantsCount === 0"
          class="text-muted-foreground text-[11px]"
        >
          {{ $t("chat.no_participants", "No one else is in this chat yet.") }}
        </div>
        <ul v-else class="space-y-1.5">
          <li
            v-for="user in participants"
            :key="(user as any).steam_id"
            class="flex items-center gap-2"
          >
            <LiveAvatarImg
              :steam-id="(user as any).steam_id"
              :fallback-url="(user as any).avatar_url"
              img-class="h-5 w-5 rounded-full"
            />
            <span class="truncate text-[11px]">
              {{ (user as any).name }}
            </span>
          </li>
        </ul>
      </div>
      <div
        v-if="!isMinimized"
        class="flex flex-col flex-1 min-h-0 transition-opacity duration-200"
        :class="{ 'opacity-0': isMinimized, 'opacity-100': !isMinimized }"
      >
        <div class="relative flex flex-1 min-h-0 flex-col">
          <ChatMessages
            v-if="messages.length"
            ref="chatMessagesRef"
            :messages="messages"
            variant="global"
            :is-minimized="isMinimized"
            class="flex-1 overflow-y-auto max-h-96"
            :last-read-count="0"
            @bottom-state-change="handleBottomStateChange"
          />
          <Empty v-else class="flex-1 text-muted-foreground">
            <div class="space-y-1">
              <p class="text-sm font-medium">
                {{ $t("chat.no_messages_yet", "No messages yet") }}
              </p>
              <p class="text-xs text-muted-foreground/80">
                {{
                  $t(
                    "chat.start_the_conversation",
                    "Say something to start the conversation.",
                  )
                }}
              </p>
            </div>
          </Empty>
        </div>
        <ChatInput
          v-if="canSend"
          ref="chatInputRef"
          variant="global"
          :placeholder="messagePlaceholder"
          @send-message="handleSendMessage"
        />
        <div
          v-else
          class="px-3 py-2 text-center text-xs text-muted-foreground"
        >
          {{ readonlyHint || $t("chat.readonly") }}
        </div>
      </div>
    </div>
  </Teleport>
  <div v-else v-bind="$attrs" :class="embeddedContainerClasses">
    <ChatMatchHeader
      v-if="isGlobalContext && hideParticipantsSummary && matchInfo"
      :match="matchInfo"
    />
    <div
      v-else-if="!hideParticipantsSummary"
      class="mb-2 flex items-center justify-between text-[11px] text-muted-foreground gap-3"
    >
      <div class="flex items-center gap-1.5">
        <span
          class="inline-flex h-2.5 w-2.5 rounded-full"
          :class="participantsCount > 0 ? 'bg-emerald-400' : 'bg-zinc-500/60'"
        ></span>
        <button
          type="button"
          class="underline-offset-2 hover:underline"
          @click.stop="showParticipants = !showParticipants"
        >
          {{ participantsCount }} in chat
        </button>
      </div>
      <NuxtLink
        v-if="isGlobalContext && matchInfo"
        :to="`/matches/${(matchInfo as any).id}`"
        class="flex items-center gap-1.5 text-xs text-primary hover:underline whitespace-nowrap"
      >
        {{ matchMetaText }}
      </NuxtLink>
    </div>
    <div
      v-if="showParticipants"
      class="absolute z-20 top-10 right-4 left-4 rounded-md border bg-popover text-popover-foreground shadow-md p-3 text-xs max-h-52 overflow-y-auto"
    >
      <div
        v-if="participantsCount === 0"
        class="text-muted-foreground text-[11px]"
      >
        {{ $t("chat.no_participants", "No one else is in this chat yet.") }}
      </div>
      <ul v-else class="space-y-1.5">
        <li
          v-for="user in participants"
          :key="(user as any).steam_id"
          class="flex items-center gap-2"
        >
          <LiveAvatarImg
            :steam-id="(user as any).steam_id"
            :fallback-url="(user as any).avatar_url"
            img-class="h-5 w-5 rounded-full"
          />
          <span class="truncate text-[11px]">
            {{ (user as any).name }}
          </span>
        </li>
      </ul>
    </div>
    <div class="relative flex flex-1 min-h-0 flex-col gap-2">
      <ChatMessages
        v-if="messages.length"
        ref="chatMessagesRef"
        :messages="messages"
        variant="embedded"
        class="flex-1 min-h-0 overflow-y-auto"
        :last-read-count="0"
        @bottom-state-change="handleBottomStateChange"
      />
      <Empty v-else class="flex-1 text-muted-foreground">
        <div class="space-y-1">
          <p class="text-sm font-medium">
            {{ $t("chat.no_messages_yet", "No messages yet") }}
          </p>
          <p class="text-xs text-muted-foreground/80">
            {{
              $t(
                "chat.start_the_conversation",
                "Say something to start the conversation.",
              )
            }}
          </p>
        </div>
      </Empty>
      <ChatInput
        v-if="canSend"
        ref="chatInputRef"
        variant="embedded"
        :placeholder="messagePlaceholder"
        @send-message="handleSendMessage"
      />
      <div
        v-else
        class="px-3 py-2 text-center text-xs text-muted-foreground"
      >
        {{ readonlyHint || $t("chat.readonly") }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import type { PropType } from "vue";
import socket from "~/web-sockets/Socket";
import type { Lobby, ChatType } from "~/web-sockets/Socket";

import { useRightSidebar } from "~/composables/useRightSidebar";
import { useSound } from "~/composables/useSound";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";

const { rightSidebarOpen } = useRightSidebar();
const { playNotificationSound } = useSound();

interface ChatMessagesRef {
  scrollToBottom: (force?: boolean) => void;
  scrollToNewDivider?: () => void;
}

export default {
  inheritAttrs: false,
  props: {
    instance: {
      type: String,
      required: true,
    },
    lobbyId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      validator: (value: string) =>
        [
          "match",
          "team",
          "matchmaking",
          "organizers",
          "tournament",
          "draft",
          "match_team",
          "global",
          "direct",
        ].includes(value),
    },
    global: {
      type: Boolean,
      default: false,
    },
    playNotificationSound: {
      type: Boolean,
      default: true,
    },
    tabId: {
      type: String,
      required: false,
    },
    frameless: {
      type: Boolean,
      default: false,
    },
    isGlobalContext: {
      // Global floating/tabs context (styling + metadata), separate from Teleport.
      type: Boolean,
      default: false,
    },
    isActiveTab: {
      // Whether this lobby's tab is currently selected in the global tabs UI.
      type: Boolean,
      default: true,
    },
    hideParticipantsSummary: {
      type: Boolean,
      default: false,
    },
    match: {
      type: Object as PropType<unknown>,
      required: false,
    },
    disableAutoFocusOnActivate: {
      type: Boolean,
      default: false,
    },
    canSend: {
      type: Boolean,
      default: true,
    },
    readonlyHint: {
      type: String,
      required: false,
    },
  },
  data() {
    return {
      messages: [] as any[],
      lobby: undefined as Lobby | undefined,
      lobbyListener: undefined as { stop: () => void } | undefined,
      isMinimized: false,
      unreadCount: 0,
      lastReadMessageCount: 0,
      showParticipants: false,
      isAtBottom: true,
    };
  },
  computed: {
    rightSidebarOffset() {
      const baseOffset = 96;

      if (rightSidebarOpen?.value) {
        return baseOffset + 288;
      }

      return baseOffset;
    },
    participantsMap() {
      const key = `${this.type}:${this.lobbyId}`;
      return useMatchLobbyStore().lobbyChat[key];
    },
    participants() {
      const map = this.participantsMap as Map<
        string,
        { steam_id: string; name: string; avatar_url?: string }
      >;
      if (!map) {
        return [];
      }
      return Array.from(map.values());
    },
    participantsCount() {
      return this.participants.length;
    },
    messagePlaceholder() {
      if (this.type === "match") {
        return this.$t("chat.message_placeholder_global");
      }
      if (this.type === "match_team") {
        return this.$t("chat.message_placeholder_team");
      }
      return undefined;
    },
    matchInfo() {
      if (this.type !== "match") {
        return null;
      }

      if (this.match) {
        return this.match;
      }

      const store = useMatchLobbyStore();
      const matches = (store.myMatches as unknown as any[]) || [];
      return matches.find((m) => m.id === this.lobbyId) || null;
    },
    matchLabel() {
      const match = this.matchInfo as any;
      if (!match) {
        return "";
      }
      return (
        match.label ||
        `${match.lineup_1?.name ?? this.$t("common.tbd")} vs ${match.lineup_2?.name ?? this.$t("common.tbd")}`
      );
    },
    matchStatusText() {
      const match = this.matchInfo as any;
      return match?.e_match_status?.description || "";
    },
    matchScoreText() {
      const match = this.matchInfo as any;
      if (!match?.match_maps || match.match_maps.length === 0) {
        return "";
      }
      let lineup1 = 0;
      let lineup2 = 0;
      for (const mm of match.match_maps) {
        lineup1 += mm.lineup_1_score ?? 0;
        lineup2 += mm.lineup_2_score ?? 0;
      }
      return `${lineup1} - ${lineup2}`;
    },
    matchMapName() {
      const match = this.matchInfo as any;
      if (!match?.match_maps || match.match_maps.length === 0) {
        return "";
      }
      const current = match.match_maps.find((mm: any) => mm.is_current_map);
      const first = current || match.match_maps[0];
      return first?.map?.name || "";
    },
    matchMetaText() {
      const parts: string[] = [];
      if (this.matchStatusText) {
        parts.push(this.matchStatusText);
      }
      if (this.matchMapName) {
        parts.push(this.matchMapName);
      }
      if (this.matchScoreText) {
        parts.push(this.matchScoreText);
      }
      return parts.join(" • ");
    },
    embeddedContainerClasses() {
      if (this.frameless) {
        // Used inside the global tab window – fill available height so the
        // input stays pinned to the bottom even with few messages.
        return "relative flex flex-1 min-h-0 flex-col rounded-b-xl bg-transparent px-3 pb-3 pt-2";
      }

      // Fixed height, not a min/max range -- matches the floating/global
      // variant above (h-96, toggled to h-12 when minimized), which never
      // had this problem. A min-height plus a separate max-height still
      // left room for the card to visibly grow between those two points
      // before ChatMessages' overflow-y-auto took over; a single fixed
      // height removes that window entirely so the card is always exactly
      // this size and the message list is the only thing that scrolls.
      // 307px = 96 (384px) sized down ~20%, per feedback that h-96 read
      // too tall for the match-page chats specifically.
      return "relative flex h-[307px] flex-col rounded-xl bg-muted/50 p-4";
    },
  },
  methods: {
    updateLobbyMessages(newMessages: any) {
      // Clone rather than alias: `newMessages` is the shared array living on
      // the socket module's `lobby` object, reused by every ChatLobby
      // instance watching this same (type, lobbyId) pair (e.g. the embedded
      // page chat + the floating global-chat widget for the same match).
      // Assigning it directly made every instance's `this.messages` point
      // at the SAME array, so each instance's own per-message push (below,
      // and in the lobbyId watcher's listenChat callback) landed in that one
      // shared array once per mounted instance -- every message rendered
      // duplicated as many times as there were concurrent widgets for it.
      this.messages = [...newMessages].sort((a: any, b: any) => {
        return a.timestamp - b.timestamp;
      });
    },
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
    },
    safeScrollToBottom(force = false) {
      this.$nextTick(() => {
        const chatMessagesRef = this.$refs.chatMessagesRef as ChatMessagesRef;
        if (
          chatMessagesRef &&
          typeof chatMessagesRef.scrollToBottom === "function"
        ) {
          chatMessagesRef.scrollToBottom(force);
        }
      });
    },
    handleSendMessage(message: string) {
      socket.chat(
        this.type as ChatType,
        this.lobbyId,
        message,
      );
      // Snap to latest after sending.
      this.safeScrollToBottom(true);
      // Sending a message counts as catching up – clear the \"New\" line.
      this.lastReadMessageCount = this.messages.length + 1;
      this.$emit("message-received", {
        tabId: this.tabId,
        message,
        direction: "outbound",
      });
    },
    handleBottomStateChange(atBottom: boolean) {
      this.isAtBottom = atBottom;
    },
    handleJumpToBottom() {
      this.safeScrollToBottom(true);
      // Jumping to bottom counts as reading everything currently in view, so
      // advance the lastReadMessageCount to the latest message.
      this.lastReadMessageCount = this.messages.length;
    },
    handleJumpToNewLine() {
      this.$nextTick(() => {
        const chatMessagesRef = this.$refs.chatMessagesRef as ChatMessagesRef;
        if (
          chatMessagesRef &&
          typeof chatMessagesRef.scrollToNewDivider === "function"
        ) {
          chatMessagesRef.scrollToNewDivider();
        }
      });
    },
  },
  watch: {
    lobbyId: {
      immediate: true,
      handler() {
        this.lobbyListener?.stop();
        this.lobby?.leave();
        this.lobby = socket.joinLobby(
          this.instance,
          this.type as ChatType,
          this.lobbyId,
        );
        this.updateLobbyMessages(this.lobby.messages);
        // Initialize lastReadMessageCount only the first time we join this lobby.
        if (this.lastReadMessageCount === 0) {
          this.lastReadMessageCount = this.messages.length;
        }
        this.lobby.on("lobby:messages", (newMessages: any) => {
          this.updateLobbyMessages(newMessages);
          // Reported bug: reopening a sidebar you'd already read showed a
          // "New" divider on messages that were minutes/seconds old. Root
          // cause -- this "lobby:messages" event is the join-time history
          // catch-up (server round-trip, arrives *after* mount), distinct
          // from the per-message "chat" event below which is genuine
          // realtime delivery. lastReadMessageCount above was captured
          // synchronously at mount time from whatever partial/stale
          // snapshot this.lobby.messages already had cached -- when this
          // event later replaced it with the true, longer history, that
          // count was never resynced, so the gap wrongly rendered as
          // "New". Every full history catch-up means "caught up", so
          // always resync here.
          this.lastReadMessageCount = this.messages.length;
        });
        this.lobbyListener = socket.listenChat(
          this.type,
          this.lobbyId,
          (message: any) => {
            this.messages.push(message);

            const mySteamId = useAuthStore().me?.steam_id;
            const fromSteamId = message?.from?.steam_id;
            const isOwnMessage =
              mySteamId != null &&
              fromSteamId != null &&
              String(fromSteamId) === String(mySteamId);
            // Distinct from isOwnMessage above: steam_id alone can't tell
            // "this exact browser/app session sent it" apart from "my
            // account sent it from a *different* session" (e.g. phone),
            // which was exactly why a PC session's unread badge/sound
            // never fired for a message its own account had just sent
            // from mobile -- it was being treated as this session's own
            // outbound message. Only the badge/sound/emit below need this
            // narrower check; the "mark as read everywhere" behaviour
            // right after intentionally keeps using the broader
            // steam_id-based isOwnMessage.
            const isOwnSession = message?.clientId === socket.sessionId;

            if (this.isMinimized && this.global && !isOwnSession) {
              this.unreadCount++;
            }
            // Auto-scroll only when already at the bottom.
            this.safeScrollToBottom(false);

            // Treat our own messages as read everywhere (a parallel
            // ChatLobby instance for the same lobby receives the echo too
            // and would otherwise render a \"New\" divider on our own text).
            // Otherwise, only advance when actively viewing at the bottom.
            if (
              isOwnMessage ||
              (this.isActiveTab && !this.isMinimized && this.isAtBottom)
            ) {
              this.lastReadMessageCount = this.messages.length;
            }
            if (this.playNotificationSound && !isOwnSession) {
              playNotificationSound();
            }

            this.$emit("message-received", {
              tabId: this.tabId,
              message,
              direction: isOwnSession ? "outbound" : "inbound",
            });
          },
        );
      },
    },
    messages: {
      immediate: true,
      handler(current, prev) {
        this.safeScrollToBottom(!prev || prev.length === 0);
      },
    },
    isMinimized: {
      handler(minimized) {
        if (!minimized) {
          this.unreadCount = 0;
          this.$nextTick(() => {
            this.safeScrollToBottom(true);
          });
        }
      },
    },
    isActiveTab: {
      handler(active) {
        // When leaving the tab, consider everything read so the \"New\" line
        // and jump pill are cleared the next time it's opened.
        if (!active) {
          this.lastReadMessageCount = this.messages.length;
          return;
        }

        // When activating a tab, always jump to the bottom so the latest
        // messages are immediately visible, and optionally focus the input.
        if (active && !this.isMinimized) {
          this.safeScrollToBottom(true);
          if (!this.disableAutoFocusOnActivate) {
            this.$nextTick(() => {
              const chatInput = this.$refs.chatInputRef as any;
              if (chatInput) {
                if (typeof chatInput.focus === "function") {
                  chatInput.focus();
                } else if (chatInput.$el) {
                  // Fallback: try to focus the first input inside the component root.
                  const el = chatInput.$el.querySelector(
                    "input, textarea, [tabindex]",
                  ) as HTMLElement | null;
                  el?.focus();
                }
              }
            });
          }
        }
      },
    },
  },
  beforeUnmount() {
    this.lobby?.leave();
    this.lobbyListener?.stop();
  },
};
</script>
