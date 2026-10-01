<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import DraftClock from "~/components/draft-games/DraftClock.vue";
import type { OverviewStripStep } from "~/utilities/matchLifecycle";

/**
 * The strong "who is acting" bar above the Overview columns. One look for
 * every stage (Captain Pick, veto, pre-match): the Draft clock, the action,
 * a hint and the step strip that doubles as progress and history.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    hint?: string | null;
    meta?: string | null;
    region?: string | null;
    // Local deadline for the clock; no deadline, no clock.
    deadline?: string | null;
    total?: number;
    accent?: string;
    // The viewer is the one acting.
    mine?: boolean;
    clockLabel?: string | null;
    steps?: OverviewStripStep[];
    stripLabel?: string | null;
    // A longer deadline (e.g. check-in) shown as mm:ss instead of the ring.
    countdown?: string | null;
    countdownLabel?: string | null;
  }>(),
  {
    hint: null,
    meta: null,
    region: null,
    deadline: null,
    total: 30,
    accent: "var(--tac-amber)",
    mine: false,
    clockLabel: null,
    steps: () => [],
    stripLabel: null,
    countdown: null,
    countdownLabel: null,
  },
);

const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => tick && clearInterval(tick));

// Straight from the deadline every second, so a refresh resumes it.
const countdownText = computed(() => {
  if (!props.countdown) return null;
  const total = Math.max(
    0,
    Math.ceil((new Date(props.countdown).getTime() - now.value) / 1000),
  );
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
});
</script>

<template>
  <div class="action-bar grid grid-cols-1 items-center gap-4 rounded-xl border bg-card/40 p-4 [backdrop-filter:blur(8px)] sm:p-5 min-[1400px]:grid-cols-[minmax(260px,1fr)_minmax(0,1.35fr)_minmax(260px,1fr)]"
    :class="mine ? 'is-mine' : ''" :style="{ '--accent': accent }" aria-live="polite" data-testid="overview-action-bar">
    <div class="flex min-w-0 flex-col gap-1 text-left" data-testid="overview-banner-left">
      <div class="action-title break-words font-sans text-base font-bold uppercase tracking-[0.18em]" data-testid="overview-action-title">
        <slot name="title">{{ title }}</slot>
      </div>
      <p v-if="hint" class="text-sm text-muted-foreground" data-testid="overview-action-hint">{{ hint }}</p>
      <p v-if="meta && meta !== region" class="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground" data-testid="overview-action-meta">{{ meta }}</p>
      <slot />
      <div v-if="countdownText" class="flex items-center gap-2 text-sm" data-testid="overview-countdown">
        <span v-if="countdownLabel">{{ countdownLabel }}</span>
        <span class="font-mono font-bold tabular-nums">{{ countdownText }}</span>
      </div>
    </div>
    <div class="flex min-w-0 flex-col items-center gap-2 text-center" data-testid="overview-banner-middle">
      <p v-if="region" class="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground" data-testid="overview-banner-region">{{ region }}</p>
      <span v-if="steps.length && stripLabel" class="font-mono text-[0.6rem] font-bold uppercase tracking-[0.24em] text-muted-foreground">{{ stripLabel }}</span>
      <ol v-if="steps.length" class="flex flex-wrap justify-center gap-1.5" data-testid="overview-strip">
        <li v-for="(step, index) in steps" :key="index" class="strip-chip" :class="[`tone-${step.tone}`, `is-${step.state}`]"
          :data-tone="step.tone" :data-state="step.state" data-testid="overview-strip-step">{{ step.label }}</li>
      </ol>
    </div>
    <div v-if="deadline" class="justify-self-end" data-testid="overview-banner-right">
      <DraftClock :deadline="deadline" :total="total" :accent="accent" :pulse="mine" data-testid="overview-clock">{{ clockLabel ?? "SEC" }}</DraftClock>
    </div>
  </div>
</template>

<style scoped>
.action-bar {
  border-color: hsl(var(--accent) / 0.35);
  transition:
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}
.action-bar.is-mine {
  border-color: hsl(var(--accent) / 0.7);
  box-shadow: 0 0 24px hsl(var(--accent) / 0.18);
}
.action-title {
  color: hsl(var(--accent));
  text-shadow: 0 0 16px hsl(var(--accent) / 0.35);
}
.strip-chip {
  --chip: var(--tac-amber);
  min-width: 2.2rem;
  padding: 0.2rem 0.45rem;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--chip) / 0.5);
  background: hsl(var(--chip) / 0.12);
  color: hsl(var(--chip));
  font-family: var(--font-mono, monospace);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-align: center;
  white-space: nowrap;
  transition: all 0.2s ease;
}
.strip-chip.tone-t2 {
  --chip: 200 90% 62%;
}
.strip-chip.tone-ban {
  --chip: var(--destructive);
}
.strip-chip.tone-decider {
  --chip: 0 0% 92%;
}
/* Done steps stay filled (the strip is the history); upcoming ones dim. */
.strip-chip.is-done {
  background: hsl(var(--chip) / 0.3);
}
.strip-chip.is-upcoming {
  opacity: 0.35;
  background: transparent;
}
.strip-chip.is-current {
  background: hsl(var(--chip) / 0.28);
  box-shadow: 0 0 14px hsl(var(--chip) / 0.55);
  transform: scale(1.1);
}
@media (prefers-reduced-motion: reduce) {
  .strip-chip {
    transition: none;
  }
}
</style>
