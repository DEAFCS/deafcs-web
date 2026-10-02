<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight } from "lucide-vue-next";
import DraftPlayerCard from "~/components/draft-games/DraftPlayerCard.vue";
import DraftLog from "~/components/draft-games/DraftLog.vue";
import { captainPickPlayer } from "~/utilities/captainPickDraft";
import { captainPickHistory } from "~/utilities/matchLifecycle";
import type { CaptainPickProgress } from "~/composables/useCaptainPickProgress";

// Middle of the match Overview while a Captain Pick draft runs: who is still
// available and what has been picked. Read only for everyone: the ten
// players pick on /play/captain-pick, which participants get a link to.
// progress is null between the final pick and the match moving to veto.
const props = defineProps<{
  progress: CaptainPickProgress | null;
  players?: Record<string, any>;
  participant?: boolean;
}>();

const pool = computed(() =>
  (props.progress?.available ?? []).map((steamId) => ({
    steam_id: steamId,
    player: captainPickPlayer(props.progress!, steamId, props.players),
  })),
);

const history = computed(() =>
  props.progress ? captainPickHistory(props.progress) : [],
);
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-4"
    data-testid="captain-pick-spectator"
  >
    <NuxtLink
      v-if="participant"
      to="/play/captain-pick"
      class="inline-flex items-center justify-center gap-2 self-center rounded-md border border-[hsl(var(--tac-amber)/0.5)] bg-[hsl(var(--tac-amber)/0.1)] px-4 py-2 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--tac-amber))] transition-colors hover:bg-[hsl(var(--tac-amber)/0.18)]"
      data-testid="open-captain-pick"
    >
      {{ $t("matchmaking.captain_pick.open") }}
      <ArrowRight class="h-3.5 w-3.5" />
    </NuxtLink>

    <div
      v-if="progress && pool.length"
      class="rounded-xl border border-border bg-card/40 p-4 [backdrop-filter:blur(8px)]"
      data-testid="spectator-available"
    >
      <div class="mb-3 flex items-center gap-2">
        <span class="section-tick"></span>
        <h3
          class="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
        >
          {{ $t("draft_games.room.pool") }}
          <span class="ml-1 text-foreground/70">({{ pool.length }})</span>
        </h3>
      </div>
      <TransitionGroup
        name="pool"
        tag="div"
        class="grid min-w-0 gap-2 sm:grid-cols-2"
      >
        <DraftPlayerCard
          v-for="member in pool"
          :key="member.steam_id"
          :member="member"
          accent="neutral"
          match-type="Competitive"
          elo-type="Competitive"
          linkable
          show-role
        />
      </TransitionGroup>
    </div>

    <p
      v-else
      class="rounded-xl border border-border bg-card/40 p-4 text-center text-sm text-muted-foreground"
      data-testid="spectator-finalizing"
    >
      {{ $t("matchmaking.captain_pick.creating_match") }}
    </p>

    <div
      v-if="progress"
      class="rounded-xl border border-border bg-card/40 p-4"
      data-testid="spectator-history"
    >
      <DraftLog :picks="history" />
    </div>
  </section>
</template>

<style scoped>
.section-tick {
  display: inline-block;
  height: 2px;
  width: 10px;
  background: hsl(var(--tac-amber));
}
.pool-move,
.pool-enter-active,
.pool-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.pool-enter-from,
.pool-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
@media (prefers-reduced-motion: reduce) {
  .pool-move,
  .pool-enter-active,
  .pool-leave-active {
    transition: none;
  }
}
</style>
