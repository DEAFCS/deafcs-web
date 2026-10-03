<script setup lang="ts">
import { Film, RotateCw, SendHorizontal, X } from "lucide-vue-next";
import { Textarea } from "~/components/ui/textarea";

// Enter sends; Shift+Enter inserts a real line break instead -- native
// <textarea> already does that on its own, so this only needs to
// intercept the plain-Enter case.
function handleKeydown(event: KeyboardEvent, submit: () => void) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

// Grows the textarea with its content (Steam-chat-style) instead of
// staying a fixed one-row box that scrolls internally. Capped so a very
// long message doesn't push the send button off-screen.
const MULTILINE_MAX_HEIGHT_PX = 120;
function autoResize(event: Event) {
  const el = event.target as HTMLTextAreaElement;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, MULTILINE_MAX_HEIGHT_PX)}px`;
}
</script>

<template>
  <form
    v-if="variant === 'global'"
    class="relative border-t bg-background p-3 flex-shrink-0"
    @submit.prevent="sendMessage"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      v-if="isDraggingOver"
      class="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/90 text-sm font-medium text-primary"
    >
      {{ $t("chat.drop_file_here", "Drop to attach") }}
    </div>
    <div v-if="pendingAttachment" class="mb-2">
      <div class="relative inline-block h-14 w-14 overflow-hidden rounded-md border border-border bg-muted">
        <img
          v-if="pendingAttachmentPreviewUrl"
          :src="pendingAttachmentPreviewUrl"
          class="h-full w-full object-cover"
          alt=""
        />
        <div v-else class="flex h-full w-full items-center justify-center">
          <Film class="h-5 w-5 text-muted-foreground" />
        </div>
        <div
          v-if="uploadProgress !== null"
          class="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-semibold text-white"
        >
          {{ uploadProgress }}%
        </div>
        <button
          v-else-if="uploadFailed"
          type="button"
          class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-destructive/80 text-white"
          :title="$t('chat.attachment_retry', 'Upload failed -- tap to retry')"
          @click="retryUpload"
        >
          <RotateCw class="h-4 w-4" />
          <span class="text-[9px] font-semibold uppercase tracking-wide">{{ $t("common.retry", "Retry") }}</span>
        </button>
        <button
          v-if="uploadProgress === null"
          type="button"
          class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
          @click="pendingAttachment = null"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>
    <ChatMentionList
      v-if="mentionOpen"
      :results="mentionResults"
      :active-index="mentionIndex"
      :loading="mentionLoading"
      @select="selectMention"
      @hover="mentionIndex = $event"
    />
    <FormField v-slot="{ componentField }" name="message">
      <FormItem>
        <FormControl>
          <div class="flex items-center gap-1.5">
            <ChatComposerMenu
              v-if="attachmentEnabled && !isWebsiteRestricted"
              :live-video-enabled="liveVideoEnabled"
              @live-video="openLiveVideo"
              @pick-file="pendingAttachment = $event"
              @pick-gif="sendGif"
            />
            <Textarea
              ref="inputRef"
              rows="1"
              :placeholder="
                isWebsiteRestricted
                  ? $t('account_restriction.short')
                  : placeholder || $t('chat.message_placeholder')
              "
              :disabled="isWebsiteRestricted"
              autocomplete="off"
              v-bind="componentField"
              class="flex-1 min-h-0 resize-none transition-all duration-200"
              @keydown="
                (event) => {
                  if (!mentionKeydown(event)) handleKeydown(event, sendMessage);
                }
              "
              @keyup="
                (event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                    updateMention(event);
                }
              "
              @click="updateMention"
              @paste="onPaste"
              @input="
                (event) => {
                  autoResize(event);
                  updateMention(event);
                }
              "
              @blur="closeMention"
            />
            <Button
              type="submit"
              size="icon-sm"
              variant="default"
              :loading="sending || uploadProgress !== null"
              :min-loading-ms="0"
              :disabled="isWebsiteRestricted || !isReadyToSend"
              class="shrink-0 rounded-full transition-all duration-200 hover:scale-105"
            >
              <SendHorizontal class="h-4 w-4" />
            </Button>
          </div>
        </FormControl>
      </FormItem>
    </FormField>
  </form>
  <form
    v-else
    class="relative overflow-hidden rounded-lg border bg-background focus-within:ring-1 focus-within:ring-ring"
    @submit.prevent="sendMessage"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div
      v-if="isDraggingOver"
      class="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/90 text-sm font-medium text-primary"
    >
      {{ $t("chat.drop_file_here", "Drop to attach") }}
    </div>
    <div v-if="pendingAttachment" class="px-2 pt-2">
      <div class="relative inline-block h-14 w-14 overflow-hidden rounded-md border border-border bg-muted">
        <img
          v-if="pendingAttachmentPreviewUrl"
          :src="pendingAttachmentPreviewUrl"
          class="h-full w-full object-cover"
          alt=""
        />
        <div v-else class="flex h-full w-full items-center justify-center">
          <Film class="h-5 w-5 text-muted-foreground" />
        </div>
        <div
          v-if="uploadProgress !== null"
          class="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-semibold text-white"
        >
          {{ uploadProgress }}%
        </div>
        <button
          v-else-if="uploadFailed"
          type="button"
          class="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-destructive/80 text-white"
          :title="$t('chat.attachment_retry', 'Upload failed -- tap to retry')"
          @click="retryUpload"
        >
          <RotateCw class="h-4 w-4" />
          <span class="text-[9px] font-semibold uppercase tracking-wide">{{ $t("common.retry", "Retry") }}</span>
        </button>
        <button
          v-if="uploadProgress === null"
          type="button"
          class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
          @click="pendingAttachment = null"
        >
          <X class="h-3 w-3" />
        </button>
      </div>
    </div>
    <ChatMentionList
      v-if="mentionOpen"
      :results="mentionResults"
      :active-index="mentionIndex"
      :loading="mentionLoading"
      @select="selectMention"
      @hover="mentionIndex = $event"
    />
    <FormField v-slot="{ componentField }" name="message">
      <FormItem>
        <FormControl>
          <div class="flex items-center gap-1.5 p-2">
            <ChatComposerMenu
              v-if="attachmentEnabled && !isWebsiteRestricted"
              :live-video-enabled="liveVideoEnabled"
              @live-video="openLiveVideo"
              @pick-file="pendingAttachment = $event"
              @pick-gif="sendGif"
            />
            <Textarea
              ref="inputRef"
              rows="1"
              :placeholder="
                isWebsiteRestricted
                  ? $t('account_restriction.short')
                  : placeholder || $t('chat.message_placeholder')
              "
              :disabled="isWebsiteRestricted"
              autocomplete="off"
              v-bind="componentField"
              class="flex-1 min-h-0 resize-none border-0 shadow-none focus-visible:ring-0"
              @keydown="
                (event) => {
                  if (!mentionKeydown(event)) handleKeydown(event, sendMessage);
                }
              "
              @keyup="
                (event) => {
                  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                    updateMention(event);
                }
              "
              @click="updateMention"
              @paste="onPaste"
              @input="
                (event) => {
                  autoResize(event);
                  updateMention(event);
                }
              "
              @blur="closeMention"
            />
            <Button
              type="submit"
              size="icon-sm"
              variant="default"
              :loading="sending || uploadProgress !== null"
              :min-loading-ms="0"
              :disabled="isWebsiteRestricted || !isReadyToSend"
              class="shrink-0 rounded-full"
            >
              <SendHorizontal class="h-4 w-4" />
            </Button>
          </div>
        </FormControl>
      </FormItem>
    </FormField>
  </form>
  <ChatVideoComposer
    v-if="liveVideoEnabled && !isWebsiteRestricted"
    :key="`${chatType}:${roomId}`"
    ref="liveVideoRecorder"
    :type="chatType"
    :room-id="roomId"
  />
</template>

<script lang="ts">
import { FormControl, FormField, FormItem } from "~/components/ui/form";
import ChatVideoComposer from "~/components/chat/ChatVideoComposer.vue";
import ChatComposerMenu from "~/components/chat/ChatComposerMenu.vue";
import ChatMentionList from "~/components/chat/ChatMentionList.vue";
import * as z from "zod";
import { useForm } from "vee-validate";
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { toast } from "@/components/ui/toast";
import {
  uploadChatAttachment,
  type ChatAttachmentUploadError,
} from "~/utilities/uploadChatAttachment";
import {
  isChatMessageTooLong,
  showChatMessageTooLong,
} from "~/utils/chatMessageActions";
import {
  describeChatAttachmentRejection,
  validateChatAttachment,
} from "~/utilities/chatAttachmentValidation";

// Rooms where @-tagging works -- must match ChatService.MENTION_ENABLED_TYPES
// on the API (which re-checks it). Not match/match_team/draft/direct.
const MENTION_ROOM_TYPES = [
  "global",
  "organizers",
  "tournament",
  "team",
  "matchmaking",
];

// Global is verified_user+ and Organizer is match_organizer+, so the list
// only offers people who can actually read the room there.
const GLOBAL_MENTION_ROLES = [
  "verified_user",
  "streamer",
  "moderator",
  "match_organizer",
  "tournament_organizer",
  "administrator",
];
const ORGANIZER_MENTION_ROLES = [
  "match_organizer",
  "tournament_organizer",
  "administrator",
];

export default {
  components: { ChatComposerMenu, ChatVideoComposer, ChatMentionList },
  props: {
    variant: {
      type: String,
      default: "embedded",
      validator: (value: string) => ["global", "embedded"].includes(value),
    },
    placeholder: {
      type: String,
      required: false,
      default: undefined,
    },
    attachmentEnabled: { type: Boolean, default: false },
    chatType: { type: String, default: "" },
    roomId: { type: String, default: "" },
  },
  emits: ["sendMessage"],
  data() {
    return {
      sending: false,
      pendingAttachment: null as File | null,
      pendingAttachmentPreviewUrl: null as string | null,
      // Uploaded as soon as a file is picked, not on send -- reported: a
      // large video failing was only discovered after pressing send, with
      // no way to tell it apart from "just slow" until then. Send now
      // stays locked until this is set, so there's nothing left to upload
      // by the time Enter/Send actually does anything.
      uploadedAttachment: null as { url: string; contentType: string } | null,
      uploadProgress: null as number | null,
      uploadFailed: false,
      isDraggingOver: false,
      mentionOpen: false,
      mentionLoading: false,
      mentionQuery: "",
      mentionResults: [] as Array<{
        steam_id: string;
        name: string;
        avatar_url?: string;
      }>,
      mentionIndex: 0,
      // Where the "@query" being typed sits in the text, so picking a
      // player replaces exactly that span.
      mentionRange: null as { start: number; end: number } | null,
      // steam_id -> name for everyone picked from the list; only those whose
      // "@name" is still in the text when sending are submitted.
      mentionPicks: {} as Record<string, string>,
      mentionFetchId: 0,
      mentionTimer: undefined as ReturnType<typeof setTimeout> | undefined,
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            message: z.string(),
          }),
        ),
      }),
    };
  },
  watch: {
    // Object URLs must be revoked explicitly or they leak for the life of
    // the tab -- only ever one outstanding at a time (the current pick).
    pendingAttachment(file: File | null) {
      if (this.pendingAttachmentPreviewUrl) {
        URL.revokeObjectURL(this.pendingAttachmentPreviewUrl);
        this.pendingAttachmentPreviewUrl = null;
      }
      if (file && file.type.startsWith("image/")) {
        this.pendingAttachmentPreviewUrl = URL.createObjectURL(file);
      }
      this.uploadedAttachment = null;
      this.uploadFailed = false;
      if (file) {
        this.startUpload(file);
      }
    },
  },
  beforeUnmount() {
    if (this.mentionTimer) {
      clearTimeout(this.mentionTimer);
    }
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
    }
    if (this.pendingAttachmentPreviewUrl) {
      URL.revokeObjectURL(this.pendingAttachmentPreviewUrl);
    }
  },
  computed: {
    mentionEnabled(): boolean {
      return !!this.roomId && MENTION_ROOM_TYPES.includes(this.chatType);
    },
    liveVideoEnabled() {
      return this.attachmentEnabled && !!this.roomId && !!this.chatType &&
        !["match", "match_team", "announcement"].includes(this.chatType);
    },
    isWebsiteRestricted() {
      return useWebsiteRestrictionStore().isRestricted;
    },
    // Nothing to wait on (no attachment), or an attachment that finished
    // uploading. Not ready while it's still uploading, or sitting in a
    // failed state waiting for a retry.
    isReadyToSend() {
      return !this.pendingAttachment || Boolean(this.uploadedAttachment);
    },
  },
  methods: {
    closeMention() {
      this.mentionOpen = false;
      this.mentionRange = null;
      this.mentionResults = [];
      this.mentionIndex = 0;
      this.mentionFetchId++;
      if (this.mentionTimer) {
        clearTimeout(this.mentionTimer);
        this.mentionTimer = undefined;
      }
    },
    // Opens/updates the list while the caret sits right after an "@word"
    // that starts the text or follows whitespace.
    updateMention(event: Event) {
      if (!this.mentionEnabled || this.isWebsiteRestricted) return;
      const el = event.target as HTMLTextAreaElement | null;
      if (!el || typeof el.selectionStart !== "number") return;

      const caret = el.selectionStart;
      const match = /(^|\s)@([^\s@]{0,32})$/.exec(el.value.slice(0, caret));
      if (!match) {
        this.closeMention();
        return;
      }

      const query = match[2];
      this.mentionRange = { start: caret - query.length - 1, end: caret };
      this.mentionOpen = true;
      if (query === this.mentionQuery && this.mentionResults.length) return;
      this.mentionQuery = query;
      this.mentionIndex = 0;

      if (this.mentionTimer) clearTimeout(this.mentionTimer);
      this.mentionTimer = setTimeout(() => this.fetchMentionResults(), 120);
    },
    async fetchMentionResults() {
      const fetchId = ++this.mentionFetchId;
      this.mentionLoading = true;
      try {
        const roles =
          this.chatType === "global"
            ? GLOBAL_MENTION_ROLES
            : this.chatType === "organizers"
              ? ORGANIZER_MENTION_ROLES
              : undefined;
        const mySteamId = useAuthStore().me?.steam_id;
        const response = (await $fetch("/api/players-search", {
          method: "post",
          body: {
            query: this.mentionQuery || undefined,
            registeredOnly: true,
            exclude: mySteamId ? [String(mySteamId)] : [],
            roles,
            per_page: 8,
          },
        })) as {
          hits?: Array<{
            document: { steam_id: string; name: string; avatar_url?: string };
          }>;
        };
        // A newer keystroke (or closing the list) superseded this request.
        if (fetchId !== this.mentionFetchId) return;
        this.mentionResults = (response.hits ?? []).map((hit) => ({
          steam_id: String(hit.document.steam_id),
          name: hit.document.name,
          avatar_url: hit.document.avatar_url,
        }));
        this.mentionIndex = 0;
      } catch (error) {
        if (fetchId === this.mentionFetchId) this.mentionResults = [];
        console.error("[chat] mention search failed", error);
      } finally {
        if (fetchId === this.mentionFetchId) this.mentionLoading = false;
      }
    },
    // Returns true when the key was consumed by the open list, so Enter
    // picks a player instead of sending the message.
    mentionKeydown(event: KeyboardEvent): boolean {
      if (!this.mentionOpen) return false;

      if (event.key === "Escape") {
        event.preventDefault();
        this.closeMention();
        return true;
      }

      if (!this.mentionResults.length) return false;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.mentionIndex = (this.mentionIndex + 1) % this.mentionResults.length;
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.mentionIndex =
          (this.mentionIndex - 1 + this.mentionResults.length) %
          this.mentionResults.length;
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        this.selectMention(this.mentionResults[this.mentionIndex]);
        return true;
      }
      return false;
    },
    selectMention(player: { steam_id: string; name: string }) {
      const range = this.mentionRange;
      if (!range || !player) return;

      const text: string = this.form.values.message ?? "";
      const insert = `@${player.name} `;
      const next = text.slice(0, range.start) + insert + text.slice(range.end);
      const caret = range.start + insert.length;

      this.mentionPicks[player.steam_id] = player.name;
      this.form.setFieldValue("message", next);
      this.closeMention();

      this.$nextTick(() => {
        const el = (this.$refs.inputRef as any)?.$el as
          | HTMLTextAreaElement
          | undefined;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    openLiveVideo() {
      if (this.liveVideoEnabled && !this.isWebsiteRestricted) {
        (this.$refs.liveVideoRecorder as any)?.openRecorder();
      }
    },
    focus() {
      this.$nextTick(() => {
        const el = (this.$refs.inputRef as any)?.$el;
        if (el) el.focus();
      });
    },
    flashSending() {
      this.sending = true;
      if (this.sendTimer) {
        clearTimeout(this.sendTimer);
      }
      this.sendTimer = setTimeout(() => {
        this.sending = false;
        this.sendTimer = undefined;
      }, 1000);
    },
    async startUpload(file: File) {
      this.uploadProgress = 0;
      this.uploadFailed = false;
      try {
        const uploaded = await uploadChatAttachment(
          file,
          (percent) => {
            // The user may have swapped/removed the attachment while this
            // was in flight -- ignore a stale upload's progress/result.
            if (this.pendingAttachment === file) this.uploadProgress = percent;
          },
        );
        if (this.pendingAttachment !== file) return;
        this.uploadedAttachment = {
          url: uploaded.path,
          contentType: uploaded.contentType,
        };
      } catch (error) {
        if (this.pendingAttachment !== file) return;
        console.error("[chat] attachment upload failed", error);
        const upload = error as ChatAttachmentUploadError;
        this.uploadFailed = true;
        // Diagnostic (temporary): the exact numbers, visible without
        // devtools, while tracking down a large-video-from-Photos failure.
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: `${upload?.kind ?? "unknown"} -- ${upload?.bytesSent ?? 0}/${file.size} bytes sent${upload?.status ? `, HTTP ${upload.status}` : ""}`,
          duration: 60000,
        });
      } finally {
        if (this.pendingAttachment === file) this.uploadProgress = null;
      }
    },
    retryUpload() {
      if (this.pendingAttachment) this.startUpload(this.pendingAttachment);
    },
    // Shared by paste and drag-and-drop -- same validation and rejection
    // copy as the "+" menu's file picker (ChatComposerMenu.vue).
    pickFile(file: File) {
      const rejection = validateChatAttachment(file);
      if (rejection) {
        toast({ variant: "destructive", ...describeChatAttachmentRejection(rejection) });
        return;
      }
      this.pendingAttachment = file;
    },
    onPaste(event: ClipboardEvent) {
      if (!this.attachmentEnabled || this.isWebsiteRestricted) return;
      const file = Array.from(event.clipboardData?.files ?? [])[0];
      if (!file) return;
      // A file on the clipboard means an image/video paste, not text -- some
      // browsers also put a filename on the text/plain slot alongside it.
      event.preventDefault();
      this.pickFile(file);
    },
    onDragOver(event: DragEvent) {
      if (!this.attachmentEnabled || this.isWebsiteRestricted) return;
      if (!event.dataTransfer?.types?.includes("Files")) return;
      this.isDraggingOver = true;
    },
    onDragLeave(event: DragEvent) {
      // dragleave also fires when the pointer moves over a child element
      // within the form, which would otherwise make the overlay flicker.
      const next = event.relatedTarget as Node | null;
      if (next && (event.currentTarget as Node).contains(next)) return;
      this.isDraggingOver = false;
    },
    onDrop(event: DragEvent) {
      this.isDraggingOver = false;
      if (!this.attachmentEnabled || this.isWebsiteRestricted) return;
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      this.pickFile(file);
    },
    // Sent immediately on pick, as its own message -- doesn't touch
    // whatever text is currently being typed, same as clicking a GIF in
    // Messenger/Discord's picker.
    sendGif(gifUrl: string) {
      if (this.isWebsiteRestricted) return;
      this.$emit("sendMessage", { message: "", gifUrl });
    },
    async sendMessage() {
      if (this.isWebsiteRestricted || !this.isReadyToSend) {
        return;
      }
      const { message } = this.form.values;
      const normalizedMessage = (message || "").trim();
      if (!normalizedMessage && !this.pendingAttachment) return;
      // Refused (text kept) rather than truncated; the API enforces the
      // same limit.
      if (isChatMessageTooLong(normalizedMessage)) {
        showChatMessageTooLong();
        return;
      }

      // Only players whose "@name" is still in the final text; the API
      // re-validates who may actually be tagged in this room.
      const mentions = this.mentionEnabled
        ? Object.entries(this.mentionPicks)
            .filter(([, name]) => normalizedMessage.includes(`@${name}`))
            .map(([steamId]) => steamId)
        : [];

      this.$emit("sendMessage", {
        message: normalizedMessage,
        attachment: this.uploadedAttachment ?? undefined,
        mentions: mentions.length ? mentions : undefined,
      });
      this.mentionPicks = {};
      this.closeMention();
      this.pendingAttachment = null;
      this.uploadedAttachment = null;
      this.uploadFailed = false;
      this.form.resetForm();
      this.flashSending();
      // Collapse the textarea back to its one-row default -- resetForm
      // clears the value but leaves the inline height style autoResize
      // set, which would otherwise leave a tall empty box.
      const el = (this.$refs.inputRef as any)?.$el as
        | HTMLTextAreaElement
        | undefined;
      if (el) el.style.height = "auto";
    },
  },
};
</script>
