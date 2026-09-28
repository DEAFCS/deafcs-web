<script setup lang="ts">
import { Paperclip, X } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { toast } from "@/components/ui/toast";

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const props = defineProps<{
  modelValue: File | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", file: File | null): void;
}>();

const inputRef = ref<HTMLInputElement | null>(null);

function pick() {
  inputRef.value?.click();
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = "";
  if (!file) return;

  if (!ALLOWED_TYPES.includes(file.type)) {
    toast({
      variant: "destructive",
      title: "Unsupported file type",
      description: "Attach an image (PNG/JPEG/WEBP/GIF) or a video (MP4/WEBM/MOV).",
    });
    return;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    toast({
      variant: "destructive",
      title: "File too large",
      description: "Attachments are limited to 50 MB.",
    });
    return;
  }
  emit("update:modelValue", file);
}

function clear() {
  emit("update:modelValue", null);
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <input
      ref="inputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
      class="hidden"
      @change="onChange"
    />
    <Button
      type="button"
      variant="outline"
      size="icon"
      class="shrink-0"
      @click="pick"
    >
      <Paperclip class="h-4 w-4" />
      <span class="sr-only">{{ $t("chat.attach_file", "Attach image or video") }}</span>
    </Button>
    <span
      v-if="props.modelValue"
      :title="props.modelValue.name"
      class="inline-flex min-w-0 max-w-[6rem] items-center gap-1 rounded-md border border-border bg-card/40 px-1.5 py-1 text-[11px] text-muted-foreground"
    >
      <span class="min-w-0 truncate">{{ props.modelValue.name }}</span>
      <button
        type="button"
        class="shrink-0 hover:text-foreground"
        @click="clear"
      >
        <X class="h-3.5 w-3.5" />
      </button>
    </span>
  </div>
</template>
