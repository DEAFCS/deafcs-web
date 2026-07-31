<script setup lang="ts">
import TimeAgo from "~/components/TimeAgo.vue";
import { useRightSidebar } from "~/composables/useRightSidebar";

const { rightSidebarOpen } = useRightSidebar();

const matchTypeColors: Record<string, string> = {
  Competitive: "249 158 47",
  Wingman: "217 70 239",
  Duel: "34 211 238",
};

const matchTypeColorStyle = (type: string): Record<string, string> => ({
  "--mode-rgb": matchTypeColors[type] ?? matchTypeColors.Competitive,
});
</script>

<template>
  <ClientOnly>
    <div
      v-if="shouldShow"
      class="pointer-events-none fixed bottom-4 left-2 right-2 z-[55] flex justify-end transition-[right] duration-200 ease-linear md:left-auto md:w-[280px]"
      :class="rightSidebarOpen ? 'md:right-[30.75rem]' : 'md:right-[4.75rem]'"
    >
      <NuxtLink
        to="/play"
        :style="matchTypeColorStyle(details.type)"
        class="pointer-events-auto flex w-full items-center gap-3 rounded-lg border border-[rgb(var(--mode-rgb)/0.35)] px-3.5 py-2.5 [backdrop-filter:blur(10px)] [background:linear-gradient(135deg,hsl(var(--card)/0.92)_0%,hsl(var(--card)/0.8)_100%)] transition-colors hover:border-[rgb(var(--mode-rgb)/0.6)]"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--mode-rgb))] animate-soft-pulse"
        ></span>
        <div class="flex min-w-0 flex-1 flex-col leading-tight">
          <span
            class="truncate font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[rgb(var(--mode-rgb))]"
          >
            {{ details.type }}
          </span>
          <span
            class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground/80"
          >
            {{ $t("matchmaking.searching") }}
          </span>
        </div>
        <div
          v-if="details.joinedAt"
          class="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground"
        >
          <TimeAgo
            :date="Math.min(Date.now(), new Date(details.joinedAt).getTime())"
            :seconds="true"
            :hide-icon="true"
          />
        </div>
      </NuxtLink>
    </div>
  </ClientOnly>
</template>

<script lang="ts">
import { useMatchmakingStore } from "~/stores/MatchmakingStore";

export default {
  computed: {
    details() {
      return useMatchmakingStore().joinedMatchmakingQueues?.details;
    },
    confirmation() {
      return useMatchmakingStore().joinedMatchmakingQueues?.confirmation;
    },
    // The full search UI already shows this on /play — no need to float a
    // second copy over itself. It also steps aside once a match is found,
    // since MatchmakingConfirm's full-screen modal takes over at that point.
    shouldShow(): boolean {
      return (
        !!this.details && !this.confirmation && this.$route?.path !== "/play"
      );
    },
  },
};
</script>
