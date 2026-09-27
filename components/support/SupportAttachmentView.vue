<script setup lang="ts">
const props = defineProps<{
  url: string | null | undefined;
  contentType: string | null | undefined;
  removedAt: string | null | undefined;
}>();

const apiDomain = useRuntimeConfig().public.apiDomain as string;

const mediaSrc = computed(() => {
  if (!props.url) return null;
  return `https://${apiDomain}/support-requests/attachment?key=${encodeURIComponent(props.url)}`;
});

const isImage = computed(() => (props.contentType || "").startsWith("image/"));
const isVideo = computed(() => (props.contentType || "").startsWith("video/"));
</script>

<template>
  <p
    v-if="removedAt"
    class="mt-2 text-xs italic text-muted-foreground"
  >
    {{ $t("pages.support.attachment_removed", "Attachment removed after 7 days.") }}
  </p>
  <div v-else-if="mediaSrc" class="mt-2">
    <a
      v-if="isImage"
      :href="mediaSrc"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        :src="mediaSrc"
        class="max-h-64 max-w-full rounded-md border border-border/60 object-contain"
        alt=""
      />
    </a>
    <video
      v-else-if="isVideo"
      :src="mediaSrc"
      controls
      preload="metadata"
      class="max-h-64 max-w-full rounded-md border border-border/60"
    ></video>
  </div>
</template>
