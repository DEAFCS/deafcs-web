<script setup lang="ts">
// Small <img> wrapper for spots that only have a bare avatar_url string
// to work with (not a full player object PlayerDisplay can take), e.g.
// chat's participants list -- resolves the *current* avatar live instead
// of trusting a possibly-stale snapshot. See useLivePlayerAvatar.
import { computed } from "vue";
import { useLivePlayerAvatar } from "~/composables/useLivePlayerAvatar";

const props = defineProps<{
  steamId?: string | null;
  fallbackUrl?: string | null;
  alt?: string;
  imgClass?: string;
}>();

const liveUrl = useLivePlayerAvatar(
  () => props.steamId,
  () => props.fallbackUrl,
);
const src = computed(() => liveUrl.value);
</script>

<template>
  <img v-if="src" :src="src" :alt="alt || ''" :class="imgClass" />
</template>
