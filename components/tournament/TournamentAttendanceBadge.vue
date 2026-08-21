<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle2, Clock } from "lucide-vue-next";

// Public attendance status for one participant -- a registered team or a
// Solo Random signup. Shared so a team row, your own team, and an individual
// player all read identically: green means confirmed, orange means still
// expected. Compact by design; this replaces the long amber
// "YOUR TEAM IS CHECKED IN" banner, which looked like an action control for
// something that had already happened.
//
// `variant` only changes the wording, never the colour: a checked-in
// waitlisted player is still green (they have done everything asked of them),
// with the waitlist itself communicated by the section they sit in.
const props = withDefaults(
  defineProps<{
    checkedIn: boolean;
    variant?: "default" | "waitlisted";
  }>(),
  { variant: "default" },
);

const labelKey = computed(() =>
  props.checkedIn
    ? "tournament.attendance.status.checked_in"
    : "tournament.attendance.status.pending",
);

// The waitlist itself is communicated by the section a row sits in; the
// hover text spells out the combination so "checked in" and "waitlisted"
// never read as contradictory.
const titleKey = computed(() => {
  if (!props.checkedIn) {
    return "tournament.attendance.status.pending_hint";
  }
  return props.variant === "waitlisted"
    ? "tournament.attendance.status.checked_in_waitlisted_hint"
    : "tournament.attendance.status.checked_in_hint";
});
</script>

<template>
  <span
    :title="$t(titleKey)"
    :class="[
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-[0.5rem] py-[0.2rem] font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em]',
      checkedIn
        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
        : 'border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.1)] text-[hsl(var(--tac-amber))]',
    ]"
  >
    <CheckCircle2 v-if="checkedIn" class="h-3 w-3" />
    <Clock v-else class="h-3 w-3" />
    {{ $t(labelKey) }}
  </span>
</template>
