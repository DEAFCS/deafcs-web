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

// The tier-fallback icon is derived from the artwork box rather than kept in
// a parallel class table. The old table drifted between 0.67 (`lg`) and 0.78
// (`hero`) of the box, so the same trophy sat with visibly different margins
// depending only on the size it was asked for, and `xs` -- the size the
// tournament card's runner-up rows use -- was among the tightest.
//
// 5/7 is the ratio `sm` and `md` already used and which reads correctly, so
// those two are unchanged; `xs`, `hero` and `lg` move onto it. Rounding to an
// even number keeps the icon on whole pixels inside the (always even) box, so
// it stays crisp and centres without a half-pixel offset.
const FALLBACK_ICON_RATIO = 5 / 7;
const fallbackIconPixels = computed(
  () => Math.round((pixelSizes[props.size] * FALLBACK_ICON_RATIO) / 2) * 2,
);

// Lucide's trophy is symmetric in its 24-unit viewBox (ink spans y=1..23), so
// the icon already centres inside its box. The nudge is for what sits *around*
// the box: at `xs` the icon is used in dense last-in-container rows -- the
// tournament compact card's 3rd-place row is the clearest case, where the row
// is the final child of a fixed-height `overflow-hidden` card. There the ink's
// centre-line lands ~0.5px inside the clip edge, and because the ~1.8px stroke
// is centred on that line its lower half gets shaved off, which reads as a
// trophy with its base cut away.
//
// One pixel up puts the whole stroke inside the boundary. It stays well within
// the 32px box (6px above the ink, 4px below), so nothing overflows and the
// row height is untouched. Deliberately `xs`-only: the larger sizes are hero
// and profile displays with room to spare, and shifting those would be a
// visible misalignment for no gain.
const fallbackIconTransform = computed(() =>
  props.size === "xs" ? "translateY(-1px)" : undefined,
);

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
      :style="{
        color: artwork.tierColor,
        width: `${fallbackIconPixels}px`,
        height: `${fallbackIconPixels}px`,
        transform: fallbackIconTransform,
      }"
      :role="decorative ? undefined : 'img'"
      :aria-label="decorative ? undefined : artwork.altText"
    />
  </div>
</template>
