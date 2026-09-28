<script setup lang="ts">
import { CornerDownLeft, Film, RotateCw, X } from "lucide-vue-next";
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
    class="border-t bg-background p-3 flex-shrink-0"
    @submit.prevent="sendMessage"
  >
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
    <FormField v-slot="{ componentField }" name="message">
      <FormItem>
        <FormControl>
          <div class="flex gap-2">
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
              @keydown="handleKeydown($event, sendMessage)"
              @input="autoResize"
            />
            <ChatAttachmentInput
              v-if="attachmentEnabled && !isWebsiteRestricted"
              v-model="pendingAttachment"
            />
            <Button
              type="submit"
              size="sm"
              :loading="sending || uploadProgress !== null"
              :min-loading-ms="0"
              :disabled="isWebsiteRestricted || !isReadyToSend"
              class="transition-all duration-200 hover:scale-105"
            >
              <CornerDownLeft class="size-3.5" />
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
  >
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
    <FormField v-slot="{ componentField }" name="message">
      <FormItem>
        <FormControl>
          <div class="flex items-center gap-2 p-2">
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
              @keydown="handleKeydown($event, sendMessage)"
              @input="autoResize"
            />
            <ChatAttachmentInput
              v-if="attachmentEnabled && !isWebsiteRestricted"
              v-model="pendingAttachment"
            />
            <Button
              type="submit"
              size="sm"
              :loading="sending || uploadProgress !== null"
              :min-loading-ms="0"
              :disabled="isWebsiteRestricted || !isReadyToSend"
              class="shrink-0 gap-1.5"
            >
              <CornerDownLeft class="size-3.5" />
            </Button>
          </div>
        </FormControl>
      </FormItem>
    </FormField>
  </form>
</template>

<script lang="ts">
import { FormControl, FormField, FormItem } from "~/components/ui/form";
import ChatAttachmentInput from "~/components/chat/ChatAttachmentInput.vue";
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

export default {
  components: { ChatAttachmentInput },
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
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
    }
    if (this.pendingAttachmentPreviewUrl) {
      URL.revokeObjectURL(this.pendingAttachmentPreviewUrl);
    }
  },
  computed: {
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
        });
      } finally {
        if (this.pendingAttachment === file) this.uploadProgress = null;
      }
    },
    retryUpload() {
      if (this.pendingAttachment) this.startUpload(this.pendingAttachment);
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

      this.$emit("sendMessage", {
        message: normalizedMessage,
        attachment: this.uploadedAttachment ?? undefined,
      });
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
