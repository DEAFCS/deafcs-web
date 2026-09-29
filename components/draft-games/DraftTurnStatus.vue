<script setup lang="ts">
import DraftClock from "~/components/draft-games/DraftClock.vue";

/**
 * The "on the clock" block of a draft: the pick timer, who is picking, and
 * the pick-order strip. Shared by Draft Games and matchmaking Captain Pick so
 * both drafts look the same; each caller decides the turn and the order.
 * Renders as a fragment so it slots into the caller's own column layout.
 */
withDefaults(
  defineProps<{
    deadline?: string | null;
    total?: number;
    // Accent of the side on the clock (Team 1 amber, Team 2 blue).
    accent: string;
    // The viewer is the one picking: pulse the clock, highlight the banner.
    isMine?: boolean;
    timeline?: Array<{
      lineup: number;
      state: "done" | "current" | "upcoming";
    }>;
  }>(),
  {
    deadline: null,
    total: 30,
    isMine: false,
    timeline: () => [],
  },
);
</script>

<template>
  <DraftClock
    :deadline="deadline ?? undefined"
    :total="total"
    :accent="accent"
    :pulse="isMine"
  >
    <slot name="clock">{{ $t("draft_games.room.on_the_clock") }}</slot>
  </DraftClock>
  <div
    class="status-banner text-center font-sans text-sm font-bold uppercase tracking-[0.18em]"
    :class="isMine ? 'is-mine' : ''"
    :style="{ '--accent': accent }"
    data-testid="draft-turn-status"
  >
    <slot name="status"></slot>
  </div>

  <div v-if="timeline.length" class="pick-order-strip">
    <span class="pick-order-label">
      {{ $t("draft_games.room.pick_order") }}
    </span>
    <div class="pick-order-track">
      <span
        v-for="(slot, index) in timeline"
        :key="index"
        class="pick-order-chip"
        :class="[
          `is-${slot.state}`,
          slot.lineup === 1 ? 'is-alpha' : 'is-bravo',
        ]"
        data-testid="draft-pick-order-chip"
      >
        {{ slot.lineup === 1 ? "T1" : "T2" }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.status-banner {
  color: hsl(var(--muted-foreground));
}
.pick-order-strip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.pick-order-label {
  font-family: var(--font-mono, monospace);
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  color: hsl(var(--muted-foreground));
}
.pick-order-track {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}
.pick-order-chip {
  --chip: var(--tac-amber);
  min-width: 1.9rem;
  padding: 0.15rem 0.4rem;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--chip) / 0.5);
  font-family: var(--font-mono, monospace);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-align: center;
  color: hsl(var(--chip));
  background: hsl(var(--chip) / 0.08);
  transition: all 0.15s ease;
}
.pick-order-chip.is-bravo {
  --chip: 200 90% 62%;
}
.pick-order-chip.is-done {
  opacity: 0.4;
}
.pick-order-chip.is-current {
  background: hsl(var(--chip) / 0.22);
  box-shadow: 0 0 12px hsl(var(--chip) / 0.5);
  transform: scale(1.08);
}
.status-banner.is-mine {
  color: hsl(var(--accent));
  text-shadow: 0 0 16px hsl(var(--accent) / 0.5);
  animation: banner-flash 1.2s ease-in-out infinite;
}
@keyframes banner-flash {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
@media (prefers-reduced-motion: reduce) {
  .status-banner.is-mine {
    animation: none;
  }
}
</style>
