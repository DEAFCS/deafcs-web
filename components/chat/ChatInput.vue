<script setup lang="ts">
import { CornerDownLeft } from "lucide-vue-next";
import { Textarea } from "~/components/ui/textarea";

// Enter sends (like every other input here); Shift+Enter inserts a
// real line break instead -- native <textarea> already does that on
// its own, so this only needs to intercept the plain-Enter case.
// Only used when `multiline` is set (Announcements, see ChatLobby.vue),
// so every other chat's single-line <Input> is untouched.
function handleMultilineKeydown(event: KeyboardEvent, submit: () => void) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

// Grows the textarea with its content (Steam-chat-style) instead of
// staying a fixed one-row box that scrolls internally once someone
// actually uses the multi-line room Shift+Enter now gives them.
// Capped so a very long announcement doesn't push the send button
// off-screen.
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
    <FormField v-slot="{ componentField }" name="message">
      <FormItem>
        <FormControl>
          <div class="flex gap-2">
            <Textarea
              v-if="multiline"
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
              @keydown="handleMultilineKeydown($event, sendMessage)"
              @input="autoResize"
            />
            <Input
              v-else
              ref="inputRef"
              :placeholder="
                isWebsiteRestricted
                  ? $t('account_restriction.short')
                  : placeholder || $t('chat.message_placeholder')
              "
              :disabled="isWebsiteRestricted"
              autocomplete="off"
              v-bind="componentField"
              class="flex-1 transition-all duration-200 focus:scale-[1.02]"
            />
            <ChatVideoComposer
              v-if="videoEnabled && !isWebsiteRestricted"
              v-model="videoDraft"
              :type="chatType"
              :room-id="roomId"
            />
            <Button
              type="submit"
              size="sm"
              :loading="sending"
              :min-loading-ms="0"
              :disabled="isWebsiteRestricted"
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
    <FormField v-slot="{ componentField }" name="message">
      <FormItem>
        <FormControl>
          <div class="flex items-center gap-2 p-2">
            <Textarea
              v-if="multiline"
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
              @keydown="handleMultilineKeydown($event, sendMessage)"
              @input="autoResize"
            />
            <Input
              v-else
              ref="inputRef"
              :placeholder="
                isWebsiteRestricted
                  ? $t('account_restriction.short')
                  : placeholder || $t('chat.message_placeholder')
              "
              :disabled="isWebsiteRestricted"
              autocomplete="off"
              v-bind="componentField"
              class="flex-1 resize-none border-0 shadow-none focus-visible:ring-0"
            />
            <ChatVideoComposer
              v-if="videoEnabled && !isWebsiteRestricted"
              v-model="videoDraft"
              :type="chatType"
              :room-id="roomId"
            />
            <Button
              type="submit"
              size="sm"
              :loading="sending"
              :min-loading-ms="0"
              :disabled="isWebsiteRestricted"
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
import ChatVideoComposer from "~/components/chat/ChatVideoComposer.vue";
import * as z from "zod";
import { useForm } from "vee-validate";
import { toTypedSchema } from "~/utilities/vee-validate-zod";

export default {
  components: { ChatVideoComposer },
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
    // Announcements-only (see ChatLobby.vue) -- every other chat type
    // keeps the single-line input, where Enter has always sent.
    multiline: {
      type: Boolean,
      default: false,
    },
    videoEnabled: { type: Boolean, default: false },
    chatType: { type: String, default: "global" },
    roomId: { type: String, default: "" },
  },
  emits: ["sendMessage"],
  data() {
    return {
      sending: false,
      videoDraft: null as {
        sessionId: string;
        media: {
          id: string;
          mimeType: string;
          durationMs: number;
          size: number;
        };
      } | null,
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            message: z.string(),
          }),
        ),
      }),
    };
  },
  beforeUnmount() {
    if (this.sendTimer) {
      clearTimeout(this.sendTimer);
    }
  },
  computed: {
    isWebsiteRestricted() {
      return useWebsiteRestrictionStore().isRestricted;
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
    sendMessage() {
      if (this.isWebsiteRestricted) {
        return;
      }
      const { message } = this.form.values;
      const normalizedMessage = (message || "").trim();
      if (!normalizedMessage && !this.videoDraft) {
        return;
      }
      this.$emit("sendMessage", {
        message: normalizedMessage,
        videoDraftId: this.videoDraft?.sessionId,
      });
      this.videoDraft = null;
      this.form.resetForm();
      this.flashSending();
      // Collapse the multiline textarea back to its one-row default --
      // resetForm clears the value but leaves the inline height style
      // autoResize set, which would otherwise leave a tall empty box.
      if (this.multiline) {
        const el = (this.$refs.inputRef as any)?.$el as
          | HTMLTextAreaElement
          | undefined;
        if (el) el.style.height = "auto";
      }
    },
  },
};
</script>
