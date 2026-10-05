<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight } from "lucide-vue-next";
import TimeAgo from "~/components/TimeAgo.vue";
import { tournamentProgress } from "~/utilities/tournamentProgress";

// Overview progress strip: where the tournament is (stage, round, matches
// decided, live now, next start) with links to the Bracket and Matches tabs.
const props = defineProps<{
  tournament: any;
  showMatchesLink?: boolean;
}>();

const emit = defineEmits<{ (e: "open-tab", tab: "bracket" | "matches"): void }>();

const progress = computed(() => tournamentProgress(props.tournament?.stages));
const percent = computed(() =>
  progress.value?.total
    ? Math.round((progress.value.decided / progress.value.total) * 100)
    : 0,
);
</script>

<template>
  <div
    v-if="progress"
    class="grid gap-3 rounded-lg border border-border bg-card/50 px-4 py-3"
    data-testid="tournament-progress"
  >
    <dl class="m-0 flex flex-wrap items-end gap-x-6 gap-y-2 text-sm">
      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.progress.stage") }}
        </dt>
        <dd class="m-0 font-semibold" data-testid="tournament-progress-stage">
          <template v-if="progress.stageCount > 1">
            {{
              $t("tournament.page.progress.stage_of", {
                number: progress.stageNumber,
                count: progress.stageCount,
              })
            }}
            ·
          </template>
          {{ progress.stageLabel }}
        </dd>
      </div>

      <div v-if="progress.round && !progress.complete" class="grid gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.progress.round") }}
        </dt>
        <dd class="m-0 font-semibold tabular-nums" data-testid="tournament-progress-round">
          {{
            progress.rounds
              ? $t("tournament.page.progress.round_of", {
                  number: progress.round,
                  count: progress.rounds,
                })
              : progress.round
          }}
        </dd>
      </div>

      <div class="grid gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.progress.matches") }}
        </dt>
        <dd class="m-0 font-semibold tabular-nums" data-testid="tournament-progress-matches">
          {{
            $t("tournament.page.progress.decided", {
              decided: progress.decided,
              total: progress.total,
            })
          }}
        </dd>
      </div>

      <div v-if="progress.live" class="grid gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.progress.now") }}
        </dt>
        <dd
          class="m-0 inline-flex items-center gap-1.5 font-semibold text-destructive"
          data-testid="tournament-progress-live"
        >
          <span class="size-2 rounded-full bg-destructive animate-pulse" aria-hidden="true"></span>
          {{ $t("tournament.page.progress.live", { count: progress.live }) }}
        </dd>
      </div>

      <div v-if="progress.nextAt && !progress.complete" class="grid gap-0.5">
        <dt class="text-xs text-muted-foreground">
          {{ $t("tournament.page.progress.next") }}
        </dt>
        <dd class="m-0 font-semibold">
          <TimeAgo :date="progress.nextAt" hide-icon />
        </dd>
      </div>

      <div class="ml-auto flex flex-wrap gap-3">
        <button
          type="button"
          class="inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))] transition-opacity hover:opacity-80"
          data-testid="tournament-progress-bracket-link"
          @click="emit('open-tab', 'bracket')"
        >
          {{ $t("tournament.page.bracket_tab") }}
          <ArrowRight class="h-3 w-3" />
        </button>
        <button
          v-if="showMatchesLink"
          type="button"
          class="inline-flex items-center gap-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))] transition-opacity hover:opacity-80"
          data-testid="tournament-progress-matches-link"
          @click="emit('open-tab', 'matches')"
        >
          {{ $t("tournament.page.matches_tab") }}
          <ArrowRight class="h-3 w-3" />
        </button>
      </div>
    </dl>

    <div class="h-1 overflow-hidden rounded-full bg-muted/50" aria-hidden="true">
      <div
        class="h-full rounded-full bg-[hsl(var(--tac-amber))] transition-[width]"
        :style="{ width: `${percent}%` }"
      ></div>
    </div>
  </div>
</template>
