<script setup lang="ts">
import { ImageUp } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { toast } from "@/components/ui/toast";

const MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

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

  // Diagnostic: confirms whether the browser's file picker actually
  // handed back a File at all, and what it reports for a picked file --
  // shown directly in the UI (not just the console) since a phone often
  // has no easy way to open devtools. Investigating a report that a large
  // video picked via iOS's "Photo Library" option fails, while the exact
  // same video picked via "Choose File" (Files app) works.
  console.log("[chat attachment] file input changed", file);
  toast({
    title: file ? "File picked" : "No file",
    description: file
      ? `${file.name} -- ${(file.size / (1024 * 1024)).toFixed(1)} MB, ${file.type || "unknown type"}`
      : "The file picker returned nothing.",
    duration: 60000,
  });

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
      description: "Attachments are limited to 200 MB.",
    });
    return;
  }
  emit("update:modelValue", file);
}
</script>

<template>
  <div>
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
      <ImageUp class="h-4 w-4" />
      <span class="sr-only">{{ $t("chat.attach_file", "Attach image or video") }}</span>
    </Button>
  </div>
</template>
