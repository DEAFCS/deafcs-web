<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Trophy } from "lucide-vue-next";
import AwardBadge from "./AwardBadge.vue";
import {
  resolveAwardArtwork,
  type AwardArtworkDefinition,
  type AwardArtworkSize,
} from "~/utilities/awardArtwork";

const props = withDefaults(
  defineProps<{
    award: AwardArtworkDefinition;
    size?: AwardArtworkSize;
    interactive?: boolean;
    decorative?: boolean;
  }>(),
  {
    size: "md",
    interactive: false,
    decorative: false,
  },
);

const apiDomain = computed(() => useRuntimeConfig().public.apiDomain as string);
const failedImage = ref<string | null>(null);
const artwork = computed(() =>
  resolveAwardArtwork(props.award, apiDomain.value, {
    ignoreImage: failedImage.value === props.award.image_url,
  }),
);

const pixelSizes: Record<AwardArtworkSize, number> = {
  xs: 32,
  sm: 56,
  md: 112,
  hero: 144,
  lg: 192,
};

const fallbackIconClasses: Record<AwardArtworkSize, string> = {
  xs: "h-6 w-6",
  sm: "h-10 w-10",
  md: "h-20 w-20",
  hero: "h-28 w-28",
  lg: "h-32 w-32",
};

watch(
  () => props.award.image_url,
  () => {
    failedImage.value = null;
  },
);

function markImageUnavailable() {
  failedImage.value = props.award.image_url || "missing";
}
</script>

<template>
  <div
    class="relative inline-flex shrink-0 items-center justify-center"
    :style="{
      width: `${pixelSizes[size]}px`,
      height: `${pixelSizes[size]}px`,
    }"
    :data-award-artwork="artwork.kind"
    :aria-hidden="decorative || undefined"
  >
    <img
      v-if="artwork.kind === 'custom-image' && artwork.imageUrl"
      :src="artwork.imageUrl"
      :alt="decorative ? '' : artwork.altText"
      class="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
      loading="lazy"
      @error="markImageUnavailable"
    />
    <AwardBadge
      v-else-if="artwork.kind === 'built-in' || artwork.kind === 'silhouette'"
      :tournament-id="artwork.seed"
      :placement="artwork.placement!"
      :custom-name="award.name"
      :silhouette-override="artwork.silhouette"
      :size="size"
      :interactive="interactive"
      :alt-text="artwork.altText"
      :aria-hidden="decorative || undefined"
    />
    <Trophy
      v-else
      :class="fallbackIconClasses[size]"
      :style="{ color: artwork.tierColor }"
      :role="decorative ? undefined : 'img'"
      :aria-label="decorative ? undefined : artwork.altText"
    />
  </div>
</template>
