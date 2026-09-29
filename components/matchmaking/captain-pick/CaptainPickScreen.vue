<script setup lang="ts">
import { computed } from "vue";
import { Crown, Cpu, Info } from "lucide-vue-next";
import DraftTeamPanel from "~/components/draft-games/DraftTeamPanel.vue";
import DraftClock from "~/components/draft-games/DraftClock.vue";
import PlayerElo from "~/components/PlayerElo.vue";
import {
  captainPickLineupMembers,
  captainPickParticipant,
  isMyCaptainPickTurn,
  type CaptainPickDraftState,
  type CaptainPickLineup,
} from "~/utilities/captainPickDraft";

/**
 * The committed 5v5 Captain Pick draft. Purely a view of the server state:
 * it never decides captains, turn order, timeouts or who ends up where. It
 * only emits "pick" for the captain whose turn it is, and the next server
 * update is what actually changes the rosters.
 */
const props = withDefaults(
  defineProps<{
    draft: CaptainPickDraftState;
    selfSteamId?: string | null;
    // The server deadline on this device's clock (see localCaptainPickDeadline).
    localDeadline?: string | null;
    // Whether the server deadline has already passed on this device.
    timeUp?: boolean;
    // A pick was sent and the server hasn't answered yet.
    pending?: boolean;
  }>(),
  {
    selfSteamId: null,
    localDeadline: null,
    timeUp: false,
    pending: false,
  },
);

const emit = defineEmits<{ (event: "pick", steamId: string): void }>();

const lineups = [1, 2] as const;
const teamSize = 5;

const participant = (steamId: string) =>
  captainPickParticipant(props.draft, steamId);

const captainName = (lineup: CaptainPickLineup) =>
  participant(props.draft.captains[lineup])?.name ?? "";

const isDrafting = computed(() => props.draft.phase === "Drafting");

const myTurn = computed(() =>
  isMyCaptainPickTurn(props.draft, props.selfSteamId),
);

const canPick = computed(() => myTurn.value && !props.pending && !props.timeUp);

const pickingName = computed(() =>
  props.draft.pickingLineup ? captainName(props.draft.pickingLineup) : "",
);

const totalPicks = computed(() => props.draft.pickOrder.length);

const currentPickNumber = computed(() =>
  props.draft.pickIndex === null ? totalPicks.value : props.draft.pickIndex + 1,
);

const members = computed(() => ({
  1: captainPickLineupMembers(props.draft, 1),
  2: captainPickLineupMembers(props.draft, 2),
}));

const pool = computed(() =>
  props.draft.available
    .map((steamId) => participant(steamId))
    .filter((player): player is NonNullable<typeof player> => !!player),
);

const picks = computed(() =>
  props.draft.picks.map((pick) => ({
    ...pick,
    captainName: participant(pick.captain_steam_id)?.name ?? "",
    playerName: participant(pick.steam_id)?.name ?? "",
  })),
);

// Once the teams are locked, the one player nobody picked joined the team
// with room automatically; there is never an eighth pick.
const lastPlayer = computed(() => {
  if (isDrafting.value) {
    return null;
  }
  const picked = new Set(props.draft.picks.map((pick) => pick.steam_id));
  for (const lineup of lineups) {
    const steamId = props.draft.lineups[lineup].find(
      (id) => id !== props.draft.captains[lineup] && !picked.has(id),
    );
    if (steamId) {
      return { steamId, lineup, name: participant(steamId)?.name ?? "" };
    }
  }
  return null;
});

const accent = (lineup: CaptainPickLineup) => (lineup === 1 ? "amber" : "blue");

const pick = (steamId: string) => {
  if (canPick.value) {
    emit("pick", steamId);
  }
};
</script>

<template>
  <div
    class="captain-pick flex flex-col gap-4"
    data-testid="captain-pick-screen"
  >
    <!-- Always visible: whose turn, the timer and progress. -->
    <div
      class="sticky top-0 z-20 -mx-1 rounded-lg border bg-card/95 px-4 py-3 backdrop-blur"
      :class="
        myTurn && isDrafting
          ? 'border-[hsl(var(--tac-amber))] shadow-[0_0_24px_hsl(var(--tac-amber)/0.25)]'
          : 'border-border'
      "
    >
      <div class="flex items-center gap-4">
        <div class="min-w-0 flex-1" aria-live="polite">
          <template v-if="isDrafting">
            <p
              v-if="myTurn"
              class="font-sans text-xl font-bold uppercase tracking-[0.12em] text-[hsl(var(--tac-amber))]"
              data-testid="captain-pick-your-turn"
            >
              {{ $t("matchmaking.captain_pick.your_pick") }}
            </p>
            <p
              v-else
              class="truncate font-sans text-lg font-bold uppercase tracking-[0.1em]"
              data-testid="captain-pick-turn"
            >
              {{
                $t("matchmaking.captain_pick.picking", { name: pickingName })
              }}
            </p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              <template v-if="timeUp">
                {{ $t("matchmaking.captain_pick.time_up") }}
              </template>
              <template v-else-if="myTurn">
                {{ $t("matchmaking.captain_pick.your_pick_hint") }}
              </template>
              <template v-else>
                {{
                  $t("matchmaking.captain_pick.waiting_hint", {
                    name: pickingName,
                  })
                }}
              </template>
            </p>
            <p
              class="mt-1 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
              data-testid="captain-pick-progress"
            >
              {{
                $t("matchmaking.captain_pick.pick_progress", {
                  current: currentPickNumber,
                  total: totalPicks,
                })
              }}
            </p>
          </template>
          <template v-else>
            <p
              class="font-sans text-lg font-bold uppercase tracking-[0.1em]"
              data-testid="captain-pick-locked"
            >
              {{
                draft.phase === "MatchCreated"
                  ? $t("matchmaking.captain_pick.match_ready")
                  : $t("matchmaking.captain_pick.creating_match")
              }}
            </p>
          </template>
        </div>

        <DraftClock
          v-if="isDrafting"
          class="shrink-0 scale-75 sm:scale-90"
          :deadline="localDeadline ?? undefined"
          :total="draft.timerSeconds ?? 30"
          :pulse="myTurn"
          data-testid="captain-pick-clock"
        >
          {{ $t("matchmaking.captain_pick.seconds") }}
        </DraftClock>
      </div>
    </div>

    <p class="flex items-start gap-2 text-xs text-muted-foreground">
      <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {{
          draft.firstPickReason === "EqualEloCoinFlip"
            ? $t("matchmaking.captain_pick.first_pick_coin_flip")
            : $t("matchmaking.captain_pick.first_pick_lower_elo")
        }}
        {{ $t("matchmaking.captain_pick.committed_note") }}
      </span>
    </p>

    <!-- Phones: compact team summaries; full rosters one tap away. -->
    <div class="grid grid-cols-2 gap-2 lg:hidden">
      <details
        v-for="lineup in lineups"
        :key="lineup"
        class="team-summary rounded-lg border px-3 py-2"
        :class="[
          `accent-${accent(lineup)}`,
          isDrafting && draft.pickingLineup === lineup ? 'is-active' : '',
        ]"
        :data-testid="`captain-pick-team-summary-${lineup}`"
      >
        <summary class="flex cursor-pointer list-none flex-col gap-0.5">
          <span class="flex items-center gap-1 truncate text-sm font-semibold">
            <Crown class="h-3.5 w-3.5 shrink-0 team-accent" />
            <span class="truncate">
              {{
                $t("matchmaking.captain_pick.team_of", {
                  name: captainName(lineup),
                })
              }}
            </span>
          </span>
          <span class="font-mono text-xs tabular-nums text-muted-foreground">
            {{ draft.lineups[lineup].length }}/{{ teamSize }}
          </span>
        </summary>
        <ul class="mt-2 space-y-1 text-xs">
          <li
            v-for="member in members[lineup]"
            :key="member.steam_id"
            class="flex items-center justify-between gap-2"
          >
            <span class="truncate">
              <Crown
                v-if="member.steam_id === draft.captains[lineup]"
                class="mr-1 inline h-3 w-3 team-accent"
                :aria-label="$t('matchmaking.captain_pick.captain')"
              />{{ member.player.name }}
            </span>
            <span class="font-mono tabular-nums text-muted-foreground">
              {{ member.player.elo.competitive }}
            </span>
          </li>
        </ul>
      </details>
    </div>

    <div
      class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]"
    >
      <DraftTeamPanel
        class="hidden lg:flex"
        :title="
          $t('matchmaking.captain_pick.team_of', { name: captainName(1) })
        "
        :players="members[1]"
        :per-team="teamSize"
        accent="amber"
        :active="isDrafting && draft.pickingLineup === 1"
        match-type="Competitive"
        elo-type="Competitive"
        data-testid="captain-pick-team-1"
      />

      <section class="flex flex-col gap-2" data-testid="captain-pick-pool">
        <h3
          class="font-sans text-sm font-bold uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ $t("matchmaking.captain_pick.available") }}
          <span class="ml-1 font-mono tabular-nums">({{ pool.length }})</span>
        </h3>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            v-for="player in pool"
            :key="player.steam_id"
            type="button"
            class="pool-card flex min-h-[3.5rem] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors"
            :class="
              canPick
                ? 'is-pickable cursor-pointer'
                : 'cursor-default opacity-80'
            "
            :disabled="!canPick"
            :aria-label="
              canPick
                ? `${$t('matchmaking.captain_pick.pick')} ${player.name}`
                : player.name
            "
            :data-testid="`captain-pick-player-${player.steam_id}`"
            @click="pick(player.steam_id)"
          >
            <img
              v-if="player.avatar_url"
              :src="player.avatar_url"
              alt=""
              class="h-9 w-9 shrink-0 rounded-md object-cover"
            />
            <span
              v-else
              class="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-sm font-bold"
              aria-hidden="true"
            >
              {{ player.name.slice(0, 1).toUpperCase() }}
            </span>
            <span class="min-w-0 flex-1 truncate font-medium">
              {{ player.name }}
            </span>
            <PlayerElo
              :elo="{ competitive: player.elo }"
              :historical-elo="player.elo"
              type="Competitive"
              :interactive="false"
            />
            <span
              v-if="canPick"
              class="pick-tag hidden font-mono text-[0.6rem] font-bold uppercase tracking-[0.2em] sm:inline"
            >
              {{ $t("matchmaking.captain_pick.pick") }}
            </span>
          </button>
        </div>

        <div
          class="mt-2 rounded-lg border bg-card/40 p-3"
          data-testid="captain-pick-history"
        >
          <h4
            class="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            {{ $t("matchmaking.captain_pick.picks") }}
          </h4>
          <p v-if="picks.length === 0" class="text-xs text-muted-foreground">
            {{ $t("matchmaking.captain_pick.no_picks") }}
          </p>
          <ol v-else class="space-y-1 text-xs">
            <li
              v-for="entry in picks"
              :key="entry.pickIndex"
              class="flex flex-wrap items-center gap-x-2"
              :data-testid="`captain-pick-history-${entry.pickIndex}`"
            >
              <span class="font-mono tabular-nums text-muted-foreground">
                {{ entry.pickIndex + 1 }}.
              </span>
              <span>
                {{
                  $t("matchmaking.captain_pick.picked", {
                    captain: entry.captainName,
                    player: entry.playerName,
                  })
                }}
              </span>
              <span
                v-if="entry.auto"
                class="inline-flex items-center gap-1 rounded border px-1 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground"
                data-testid="captain-pick-auto"
              >
                <Cpu class="h-3 w-3" />
                {{ $t("matchmaking.captain_pick.auto_picked") }}
              </span>
            </li>
            <li
              v-if="lastPlayer"
              class="text-muted-foreground"
              data-testid="captain-pick-last-player"
            >
              {{
                $t("matchmaking.captain_pick.last_player", {
                  player: lastPlayer.name,
                  team: $t("matchmaking.captain_pick.team_of", {
                    name: captainName(lastPlayer.lineup),
                  }),
                })
              }}
            </li>
          </ol>
        </div>
      </section>

      <DraftTeamPanel
        class="hidden lg:flex"
        :title="
          $t('matchmaking.captain_pick.team_of', { name: captainName(2) })
        "
        :players="members[2]"
        :per-team="teamSize"
        accent="blue"
        :active="isDrafting && draft.pickingLineup === 2"
        match-type="Competitive"
        elo-type="Competitive"
        data-testid="captain-pick-team-2"
      />
    </div>
  </div>
</template>

<style scoped>
.accent-amber {
  --accent: var(--tac-amber);
}
.accent-blue {
  --accent: 200 90% 62%;
}
.team-summary {
  border-color: hsl(var(--accent) / 0.3);
  background: hsl(var(--accent) / 0.05);
}
.team-summary.is-active {
  border-color: hsl(var(--accent));
  box-shadow: 0 0 0 1px hsl(var(--accent) / 0.4);
}
.team-accent {
  color: hsl(var(--accent));
}
.pool-card {
  border-color: hsl(var(--border));
  background: hsl(var(--card) / 0.6);
}
.pool-card.is-pickable {
  border-color: hsl(var(--tac-amber) / 0.45);
}
.pool-card.is-pickable:hover,
.pool-card.is-pickable:focus-visible {
  border-color: hsl(var(--tac-amber));
  background: hsl(var(--tac-amber) / 0.1);
  outline: none;
}
.pick-tag {
  color: hsl(var(--tac-amber));
}
@media (prefers-reduced-motion: reduce) {
  .pool-card {
    transition: none;
  }
}
</style>
