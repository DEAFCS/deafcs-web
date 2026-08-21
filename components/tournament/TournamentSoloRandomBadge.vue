<script setup lang="ts">
import { computed } from "vue";
import { matchTypeColorStyle } from "~/utilities/matchTypeColors";

// SOLO RANDOM is a tournament-type marker, so it takes the mode colour
// (--mode-rgb) and the squared shape the rest of the type badges use, exactly
// like the detail-page hero.
//
// The listing card previously hand-rolled its own version as an amber rounded
// pill, which read as a status/action chip -- the same visual language as
// REGISTRATION and CHECK-IN -- rather than as what the tournament is. Sharing
// one component keeps the two surfaces from drifting apart again, and leaves
// amber free to mean status.
//
// The size variants mirror MatchTypeBadge's own size prop so each surface
// keeps its existing scale next to its neighbours.
const props = withDefaults(
  defineProps<{
    matchType?: string | null;
    size?: "detail" | "card";
  }>(),
  { matchType: null, size: "detail" },
);

const sizeClasses = computed(() =>
  props.size === "card"
    ? "px-2 py-0.5 text-[0.58rem] tracking-[0.14em]"
    : "px-[0.55rem] py-[0.2rem] text-[0.65rem] tracking-[0.18em]",
);
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded border font-mono font-bold uppercase border-[rgb(var(--mode-rgb)_/_0.4)] bg-[rgb(var(--mode-rgb)_/_0.12)] text-[rgb(var(--mode-rgb))]',
      sizeClasses,
    ]"
    :style="matchTypeColorStyle(matchType)"
  >
    {{ $t("tournament.feature_card.solo_random") }}
  </span>
</template>
