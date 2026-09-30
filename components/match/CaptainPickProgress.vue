<script setup lang="ts">
import { computed } from "vue";
import DraftTeamPanel from "~/components/draft-games/DraftTeamPanel.vue";
import DraftPlayerCard from "~/components/draft-games/DraftPlayerCard.vue";
import {
  captainPickLineupMembers,
  captainPickParticipant,
  captainPickPlayer,
} from "~/utilities/captainPickDraft";
import type { CaptainPickProgress } from "~/composables/useCaptainPickProgress";

const props = defineProps<{ progress: CaptainPickProgress }>();
const lineups = [1, 2] as const;
const members = computed(() => ({
  1: captainPickLineupMembers(props.progress, 1),
  2: captainPickLineupMembers(props.progress, 2),
}));
const captainName = (lineup: 1 | 2) =>
  captainPickParticipant(props.progress, props.progress.captains[lineup])
    ?.name ?? "";
</script>

<template>
  <section
    class="mx-auto w-full min-w-0 max-w-5xl space-y-4 rounded-xl border border-border bg-muted/30 p-4"
    data-testid="captain-pick-spectator"
  >
    <div class="text-center" aria-live="polite">
      <h2 class="text-lg font-semibold">
        {{ $t("matchmaking.captain_pick.title") }}
      </h2>
      <p class="break-words text-sm font-medium">
        {{ captainName(1) }} {{ $t("common.vs") }} {{ captainName(2) }}
      </p>
      <p
        v-if="progress.pickingLineup"
        data-testid="spectator-turn"
        class="text-sm"
      >
        {{
          $t("draft_games.room.captain_picking", {
            name: captainName(progress.pickingLineup),
          })
        }}
      </p>
      <p v-else class="text-sm">
        {{ $t("matchmaking.captain_pick.creating_match") }}
      </p>
      <p class="text-xs text-muted-foreground">
        {{
          $t("matchmaking.captain_pick.pick_progress", {
            current:
              progress.pickIndex === null
                ? progress.pickOrder.length
                : progress.pickIndex + 1,
            total: progress.pickOrder.length,
          })
        }}
      </p>
    </div>
    <div class="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <DraftTeamPanel
        v-for="lineup in lineups"
        :key="lineup"
        :title="
          $t('matchmaking.captain_pick.team_of', { name: captainName(lineup) })
        "
        :players="members[lineup]"
        :per-team="5"
        :accent="lineup === 1 ? 'amber' : 'blue'"
        :active="progress.pickingLineup === lineup"
        profile-in-new-tab
        :data-testid="`spectator-team-${lineup}`"
      />
    </div>
    <div data-testid="spectator-available">
      <h3 class="mb-2 text-sm font-semibold">
        {{ $t("draft_games.room.pool") }} ({{ progress.available.length }})
      </h3>
      <div class="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <DraftPlayerCard
          v-for="steamId in progress.available"
          :key="steamId"
          :member="{
            steam_id: steamId,
            player: captainPickPlayer(progress, steamId),
          }"
          profile-in-new-tab
        />
      </div>
    </div>
  </section>
</template>
