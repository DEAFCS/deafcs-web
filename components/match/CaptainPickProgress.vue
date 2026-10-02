<script setup lang="ts">
import { computed } from "vue";
import { UserRound } from "lucide-vue-next";
import DraftPlayerCard from "~/components/draft-games/DraftPlayerCard.vue";
import DraftLog from "~/components/draft-games/DraftLog.vue";
import { captainPickPlayer, captainPickLogEntries, type CaptainPickDraftState } from "~/utilities/captainPickDraft";
import { captainPickHistory } from "~/utilities/matchLifecycle";
import type { CaptainPickProgress } from "~/composables/useCaptainPickProgress";

// One pool for all viewers. Only the authoritative participant action gate
// enables picking; the profile action always stays separate from the card.
// progress is null between the final pick and the match moving to veto.
const props = defineProps<{
  progress: CaptainPickProgress | null;
  players?: Record<string, any>;
  participantDraft?: CaptainPickDraftState | null;
  canPick?: boolean;
}>();
const emit = defineEmits<{ (event: "pick", steamId: string): void }>();
const pick = (event: MouseEvent | KeyboardEvent, steamId: string) => {
  if (event.target !== event.currentTarget && (event.target as Element)?.closest("a[href], button")) return;
  if (props.canPick) emit("pick", steamId);
};

const pool = computed(() =>
  (props.progress?.available ?? []).map((steamId) => ({
    steam_id: steamId,
    player: captainPickPlayer(props.progress!, steamId, props.players),
  })),
);

const history = computed(() =>
  props.participantDraft ? captainPickLogEntries(props.participantDraft, props.players)
    : props.progress ? captainPickHistory(props.progress) : [],
);
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-4"
    data-testid="captain-pick-spectator"
  >
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
        <div
          v-for="member in pool"
          :key="member.steam_id"
          class="rounded-lg"
          :class="canPick ? 'cursor-pointer ring-1 ring-[hsl(var(--tac-amber)/0.4)] hover:ring-[hsl(var(--tac-amber))]' : ''"
          :role="canPick ? 'button' : undefined"
          :tabindex="canPick ? 0 : undefined"
          :aria-label="canPick ? `${$t('draft_games.room.draft')} ${member.player.name}` : undefined"
          :data-testid="`captain-pick-player-${member.steam_id}`"
          @click="pick($event, member.steam_id)"
          @keydown.enter.self.prevent="pick($event, member.steam_id)"
          @keydown.space.self.prevent="pick($event, member.steam_id)"
        >
          <DraftPlayerCard
            :member="member" accent="neutral" match-type="Competitive"
            elo-type="Competitive" :linkable="!canPick" show-role
          >
            <template v-if="canPick" #action>
              <NuxtLink
                :to="{ name: 'players-id', params: { id: member.player.steam_id } }"
                class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                :aria-label="`${$t('common.view')} ${member.player.name}`"
                :data-testid="`captain-pick-profile-${member.steam_id}`"
                @click.stop
              >
                <UserRound class="h-3.5 w-3.5" />
              </NuxtLink>
            </template>
          </DraftPlayerCard>
        </div>
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
      <DraftLog :picks="history" show-auto-pick-label />
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
