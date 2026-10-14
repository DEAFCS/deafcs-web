<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { seatLayout } from "~/components/play/matchmakingHero";

// A mode's format drawn as seats (5Stack's PlaySeats): your side on top with
// your party filled in, the other side below. A party too big for the mode
// spills past the end of the row as hollow red seats, which is the reason
// the mode is blocked.
//
// DEAFCS: the mode's own party limit decides the fit (Captain Pick solo, the
// Competitive cap), and the filled seats take the mode's color from the
// surrounding --mode-rgb.
const props = defineProps<{
  expected: number;
  // 0 for a guest: nothing is yours.
  party: number;
  limit?: number;
}>();

const { t } = useI18n();

const layout = computed(() =>
  seatLayout(props.expected, props.party, props.limit),
);

const label = computed(() => {
  const { perSide, mine, overflow, theirs } = layout.value;
  const format = t("pages.play.matchmaking.seats.format", { count: perSide });
  if (!props.party) return format;
  if (overflow) {
    return `${format}, ${t("pages.play.matchmaking.seats.overflow", { count: props.party })}`;
  }
  return `${format}, ${t("pages.play.matchmaking.seats.yours", mine + theirs)}`;
});

const seat =
  "size-3 shrink-0 rounded-full max-sm:size-[9px] bg-foreground/[0.13] shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.08)]";
const yours = "!bg-[rgb(var(--mode-rgb,245_158_11))] !shadow-none";
const over =
  "!bg-transparent !shadow-[inset_0_0_0_1.5px_hsl(var(--destructive))]";
</script>

<template>
  <span class="grid gap-1.5 max-sm:gap-1" role="img" :aria-label="label">
    <span class="flex items-center gap-[5px] max-sm:gap-1">
      <i
        v-for="index in layout.perSide"
        :key="`mine-${index}`"
        :class="[seat, index <= layout.mine && yours]"
      ></i>
      <template v-if="layout.overflow">
        <span
          class="mx-[3px] h-3 w-px bg-destructive/55 max-sm:mx-0.5 max-sm:h-[9px]"
        ></span>
        <i
          v-for="index in layout.overflow"
          :key="`over-${index}`"
          :class="[seat, over]"
        ></i>
      </template>
    </span>
    <span class="flex items-center gap-[5px] max-sm:gap-1">
      <i
        v-for="index in layout.perSide"
        :key="`theirs-${index}`"
        :class="[seat, index <= layout.theirs && yours]"
      ></i>
    </span>
  </span>
</template>
