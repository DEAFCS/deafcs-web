<script setup lang="ts">
import ChatHeader from "~/components/chat/ChatHeader.vue";
import ChatMessages from "~/components/chat/ChatMessages.vue";
import ChatInput from "~/components/chat/ChatInput.vue";
import ChatMatchHeader from "~/components/chat/ChatMatchHeader.vue";
import Empty from "~/components/ui/empty/Empty.vue";
import ChatParticipantsList from "~/components/chat/ChatParticipantsList.vue";
import SanctionPlayer from "~/components/SanctionPlayer.vue";
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
      <div v-if="showParticipants" class="absolute z-50 top-11 left-2 right-2">
        <ChatParticipantsList :participants="participants as any" />
      </div>
      <div
        v-if="!isMinimized"
        class="flex flex-col flex-1 min-h-0 transition-opacity duration-200"
        :class="{ 'opacity-0': isMinimized, 'opacity-100': !isMinimized }"
      >
        <div class="relative flex flex-1 min-h-0 flex-col">
          <ChatMessages
            v-if="visibleMessages.length"
            ref="chatMessagesRef"
            :messages="visibleMessages"
            :chat-type="type"
            :reactions-enabled="reactionsEnabled"
            :absolute-timestamps="absoluteTimestamps"
            variant="global"
            :is-minimized="isMinimized"
            class="flex-1 overflow-y-auto max-h-96"
            :last-read-count="0"
            @bottom-state-change="handleBottomStateChange"
            @edit-message="handleEditMessage"
            @delete-message="handleDeleteMessage"
            @mute-player="handleMutePlayer"
            @toggle-reaction="handleToggleReaction"
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
          v-if="effectiveCanSend"
          ref="chatInputRef"
          variant="global"
          :placeholder="messagePlaceholder"
          :multiline="type === 'announcement'"
          :video-enabled="allowVideoMessages && type !== 'announcement' && effectiveCanSend"
          :chat-type="type"
          :room-id="lobbyId"
          @send-message="handleSendMessage"
        />
        <div v-else class="px-3 py-2 text-center text-xs text-muted-foreground">
          {{ effectiveReadonlyHint }}
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
    <div v-if="showParticipants" class="absolute z-20 top-10 right-4 left-4">
      <ChatParticipantsList :participants="participants as any" />
    </div>
    <div class="relative flex flex-1 min-h-0 flex-col gap-2">
      <ChatMessages
        v-if="visibleMessages.length"
        ref="chatMessagesRef"
        :messages="visibleMessages"
        :chat-type="type"
        :reactions-enabled="reactionsEnabled"
        :absolute-timestamps="absoluteTimestamps"
        variant="embedded"
        class="flex-1 min-h-0 overflow-y-auto"
        :last-read-count="0"
        @bottom-state-change="handleBottomStateChange"
        @edit-message="handleEditMessage"
        @delete-message="handleDeleteMessage"
        @mute-player="handleMutePlayer"
        @toggle-reaction="handleToggleReaction"
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
        v-if="effectiveCanSend"
        ref="chatInputRef"
        variant="embedded"
        :placeholder="messagePlaceholder"
        :multiline="type === 'announcement'"
        :video-enabled="allowVideoMessages && type !== 'announcement' && effectiveCanSend"
        :chat-type="type"
        :room-id="lobbyId"
        @send-message="handleSendMessage"
      />
      <div v-else class="px-3 py-2 text-center text-xs text-muted-foreground">
        {{ effectiveReadonlyHint }}
      </div>
    </div>
  </div>
  <SanctionPlayer
    v-if="muteTarget"
    ref="chatMuteSanctionRef"
    :player="muteTarget"
    :show-trigger="false"
    initial-type="website_chat_mute"
    :evidence-message-id="muteEvidenceMessageId"
    @sanctioned="clearMuteTarget"
  />
</template>

<script lang="ts">
import type { PropType } from "vue";
import socket from "~/web-sockets/Socket";
import type { Lobby, ChatType } from "~/web-sockets/Socket";
import type { ChatReaction } from "~/utils/chatReactions";

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
          "announcement",
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
    // Restricts the rendered history to one map's time window within a
    // BO2+ series' otherwise-flat per-match chat log (there's no
    // per-map chat lobby -- see MatchChatLog.vue) -- both are ISO
    // timestamp strings. null/undefined shows the full history.
    historyRange: {
      type: Object as PropType<{ start: string; end: string | null } | null>,
      required: false,
      default: null,
    },
    // See ChatMessage.vue -- plain local clock time instead of "X
    // minutes ago", for the post-match chat log page.
    absoluteTimestamps: {
      type: Boolean,
      default: false,
    },
    allowVideoMessages: {
      type: Boolean,
      default: true,
    },
    reactionsEnabled: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      messages: [] as any[],
      lobby: undefined as Lobby | undefined,
      lobbyListener: undefined as { stop: () => void } | undefined,
      lobbyEditedListener: undefined as { stop: () => void } | undefined,
      lobbyDeletedListener: undefined as { stop: () => void } | undefined,
      lobbyReactionListener: undefined as { stop: () => void } | undefined,
      muteStatusListener: undefined as { stop: () => void } | undefined,
      muteExpiryTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      chatMuteStatus: { ...socket.websiteChatMuteStatus },
      muteTarget: null as any,
      muteEvidenceMessageId: null as string | null,
      isMinimized: false,
      unreadCount: 0,
      lastReadMessageCount: 0,
      showParticipants: false,
      isAtBottom: true,
    };
  },
  computed: {
    visibleMessages() {
      if (!this.historyRange) {
        return this.messages;
      }
      const start = new Date(this.historyRange.start).getTime();
      const end = this.historyRange.end
        ? new Date(this.historyRange.end).getTime()
        : Infinity;
      return (this.messages as any[]).filter((message) => {
        const t = new Date(message.timestamp).getTime();
        return t >= start && t <= end;
      });
    },
    effectiveCanSend() {
      return (
        this.canSend && this.chatMuteStatus.known && !this.chatMuteStatus.active
      );
    },
    effectiveReadonlyHint() {
      if (!this.canSend) {
        return this.readonlyHint || this.$t("chat.readonly");
      }
      if (!this.chatMuteStatus.known) {
        return this.$t(
          "chat.checking_permissions",
          "Checking chat permissions…",
        );
      }
      if (this.chatMuteStatus.active) {
        if (this.chatMuteStatus.expiresAt) {
          return this.$t("chat.muted_until", {
            date: new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(this.chatMuteStatus.expiresAt)),
          });
        }
        return this.$t("chat.muted", "You are muted from website chat.");
      }
      return this.readonlyHint || this.$t("chat.readonly");
    },
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
    handleMuteStatus(status: {
      active: boolean;
      expiresAt: string | null;
      permanent: boolean;
    }) {
      if (this.muteExpiryTimer) {
        clearTimeout(this.muteExpiryTimer);
        this.muteExpiryTimer = undefined;
      }
      this.chatMuteStatus = { known: true, ...status };
      if (status.active && status.expiresAt) {
        const delay = Math.max(
          0,
          new Date(status.expiresAt).getTime() - Date.now(),
        );
        this.muteExpiryTimer = setTimeout(
          () => {
            if (Date.now() < new Date(status.expiresAt as string).getTime()) {
              this.handleMuteStatus(status);
              return;
            }
            this.chatMuteStatus = {
              known: true,
              active: false,
              expiresAt: null,
              permanent: false,
            };
          },
          Math.min(delay, 2_147_483_647),
        );
      }
    },
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
      const incoming = [...newMessages] as any[];

      // Reported bug: a message sent right around the time a tab mounted
      // showed up on mobile but silently never appeared on a PC session
      // open at the same time. Root cause -- this method also runs for the
      // async "lobby:messages" history catch-up (see the lobbyId watcher
      // below), which can lose a race against a message that already
      // arrived live via listenChat's push: if the server's history query
      // for that catch-up started before the live message was committed,
      // the snapshot it returns doesn't include it, and wholesale-replacing
      // `this.messages` with that snapshot silently dropped it from view
      // even though it's already in the DB. Keep any locally-held message
      // strictly newer than the latest timestamp this snapshot knows about
      // -- the snapshot query couldn't possibly have seen it yet. Anything
      // at or before that point is trusted fully from `newMessages`, so
      // deletes/edits (which flow through this same handler via
      // listenChatDeleted/listenChatEdited) still apply correctly.
      const latestIncomingTimestamp = incoming.length
        ? Math.max(...incoming.map((m: any) => m.timestamp))
        : 0;
      const racedAheadLocalMessages = (this.messages as any[]).filter(
        (m: any) => m.timestamp > latestIncomingTimestamp,
      );

      this.messages = [...incoming, ...racedAheadLocalMessages].sort(
        (a: any, b: any) => a.timestamp - b.timestamp,
      );
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
    handleSendMessage(payload: { message: string }) {
      if (!this.effectiveCanSend) {
        return;
      }
      socket.chat(
        this.type as ChatType,
        this.lobbyId,
        payload.message,
      );
      // Snap to latest after sending.
      this.safeScrollToBottom(true);
      // Sending a message counts as catching up – clear the \"New\" line.
      this.lastReadMessageCount = this.messages.length + 1;
      this.$emit("message-received", {
        tabId: this.tabId,
        message: payload.message || "Video message",
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
    // Announcement-only -- ChatService re-checks the admin role itself
    // regardless of what this sends, see editAnnouncement/deleteAnnouncement.
    handleEditMessage({ id, message }: { id: string; message: string }) {
      socket.editChat(id, message);
    },
    handleDeleteMessage({ id }: { id: string }) {
      socket.deleteChat(this.type as ChatType, this.lobbyId, id);
    },
    handleToggleReaction({
      messageId,
      reaction,
    }: {
      messageId: string;
      reaction: ChatReaction;
    }) {
      if (!this.reactionsEnabled || !messageId) return;
      socket.reactToChatMessage(
        this.type as ChatType,
        this.lobbyId,
        messageId,
        reaction,
      );
    },
    handleMutePlayer({
      player,
      messageId,
    }: {
      player: any;
      messageId: string;
    }) {
      this.muteTarget = player;
      this.muteEvidenceMessageId = messageId;
      this.$nextTick(() => {
        (this.$refs.chatMuteSanctionRef as any)?.openSanction(
          "website_chat_mute",
        );
      });
    },
    clearMuteTarget() {
      this.muteTarget = null;
      this.muteEvidenceMessageId = null;
    },
  },
  created() {
    this.muteStatusListener = socket.listen(
      "chat:mute-status",
      this.handleMuteStatus,
    );
    if (socket.websiteChatMuteStatus.known) {
      this.handleMuteStatus(socket.websiteChatMuteStatus);
    }
  },
  watch: {
    lobbyId: {
      immediate: true,
      handler() {
        this.lobbyListener?.stop();
        this.lobbyEditedListener?.stop();
        this.lobbyDeletedListener?.stop();
        this.lobbyReactionListener?.stop();
        this.lobby?.leave();
        this.lobbyReactionListener = socket.listenChatReaction(
          this.type,
          this.lobbyId,
          () => {},
        );
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
        this.lobby.on(
          "lobby:messages",
          (newMessages: any, isHistorySnapshot = false) => {
            this.updateLobbyMessages(newMessages);
            // A reaction updates the shared cache without changing read
            // state. Only a server history snapshot resyncs the last-read
            // divider after a catch-up.
            if (isHistorySnapshot) {
              this.lastReadMessageCount = this.messages.length;
            }
          },
        );
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

        // Announcement-only -- every other chat type has no persisted
        // messages to edit/delete, so these events simply never fire
        // for them (see ChatService.editAnnouncement/deleteAnnouncement).
        // No callback body needed here beyond subscribing: both route
        // through lobby.setMessages internally (see Socket.ts), which
        // already re-invokes the "lobby:messages" handler registered
        // above -- updateLobbyMessages there is what actually refreshes
        // this.messages.
        this.lobbyEditedListener = socket.listenChatEdited(
          this.type,
          this.lobbyId,
          () => {},
        );
        this.lobbyDeletedListener = socket.listenChatDeleted(
          this.type,
          this.lobbyId,
          () => {},
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
    this.lobbyEditedListener?.stop();
    this.lobbyDeletedListener?.stop();
    this.lobbyReactionListener?.stop();
    this.muteStatusListener?.stop();
    if (this.muteExpiryTimer) {
      clearTimeout(this.muteExpiryTimer);
    }
  },
};
</script>
