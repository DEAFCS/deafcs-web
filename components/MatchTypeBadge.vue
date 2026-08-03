<script setup lang="ts">
import { computed } from "vue";
import {
  MATCH_TYPE_RGB,
  matchTypeColorStyle,
} from "~/utilities/matchTypeColors";

type MatchTypeBadgeSize = "default" | "compact";

const props = withDefaults(
  defineProps<{
    type?: string | null;
    size?: MatchTypeBadgeSize;
  }>(),
  {
    type: null,
    size: "default",
  },
);

const hasKnownColor = computed(() =>
  Boolean(
    props.type &&
      Object.prototype.hasOwnProperty.call(MATCH_TYPE_RGB, props.type),
  ),
);

const badgeClasses = computed(() =>
  props.size === "compact"
    ? "inline-flex min-w-0 items-center rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-bold uppercase tracking-[0.14em] leading-none"
    : "inline-flex min-w-0 items-center rounded-md border px-2.5 py-1 font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] leading-none",
);
</script>

<template>
  <span
    v-if="type"
    :class="[
      badgeClasses,
      hasKnownColor
        ? 'border-[rgb(var(--mode-rgb)/0.45)] bg-[rgb(var(--mode-rgb)/0.09)] text-[rgb(var(--mode-rgb))]'
        : 'border-border/70 bg-muted/35 text-foreground',
    ]"
    :style="hasKnownColor ? matchTypeColorStyle(type) : undefined"
  >
    {{ type }}
  </span>
</template>
