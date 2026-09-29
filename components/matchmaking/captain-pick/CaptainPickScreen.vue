<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight, Info } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import AnimatedFilters from "~/components/common/AnimatedFilters.vue";
import DraftTeamPanel from "~/components/draft-games/DraftTeamPanel.vue";
import DraftPlayerCard from "~/components/draft-games/DraftPlayerCard.vue";
import DraftTurnStatus from "~/components/draft-games/DraftTurnStatus.vue";
import DraftLog from "~/components/draft-games/DraftLog.vue";
import CaptainPickChat from "~/components/matchmaking/captain-pick/CaptainPickChat.vue";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";
import { tacticalCtaButtonClasses } from "~/utilities/tacticalClasses";
import {
  captainPickLineupMembers,
  captainPickLogEntries,
  captainPickParticipant,
  captainPickPlayer,
  captainPickTimeline,
  isMyCaptainPickTurn,
  myCaptainPickLineup,
  type CaptainPickDraftState,
  type CaptainPickLineup,
} from "~/utilities/captainPickDraft";

/**
 * The committed 5v5 Captain Pick draft, laid out like a Draft Games room
 * (and built from the same Draft components). It is purely a view of the
 * server state: it never decides captains, turn order, timeouts or who
 * ends up where. It only emits "pick" for the captain whose turn it is,
 * and the next server update is what actually changes the rosters.
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
    // Public player records by steam id (see useCaptainPickPlayers).
    players?: Record<string, any>;
  }>(),
  {
    selfSteamId: null,
    localDeadline: null,
    timeUp: false,
    pending: false,
    players: () => ({}),
  },
);

const emit = defineEmits<{ (event: "pick", steamId: string): void }>();

const { t } = useI18n();
const appSettings = useApplicationSettingsStore();

const teamSize = 5;
const lineups = [1, 2] as const;

const isDrafting = computed(() => props.draft.phase === "Drafting");

const myTurn = computed(() =>
  isMyCaptainPickTurn(props.draft, props.selfSteamId),
);

const canPick = computed(() => myTurn.value && !props.pending && !props.timeUp);

const myLineup = computed(() =>
  myCaptainPickLineup(props.draft, props.selfSteamId),
);

const captainName = (lineup: CaptainPickLineup) =>
  captainPickParticipant(props.draft, props.draft.captains[lineup])?.name ?? "";

const pickingName = computed(() =>
  props.draft.pickingLineup ? captainName(props.draft.pickingLineup) : "",
);

// Same side colors as Draft Games: Team 1 amber, Team 2 blue.
const clockAccent = computed(() =>
  props.draft.pickingLineup === 2 ? "200 90% 62%" : "var(--tac-amber)",
);

const timeline = computed(() => captainPickTimeline(props.draft));

const totalPicks = computed(() => props.draft.pickOrder.length);
const currentPickNumber = computed(() =>
  props.draft.pickIndex === null ? totalPicks.value : props.draft.pickIndex + 1,
);

// The same DEAFCS / CS2 / FACEIT display switch Draft Games has. It only
// changes which rating the cards show, never who can be picked or how.
const eloSource = ref<"elo" | "cs2" | "faceit">("elo");
const rankSources = computed(() => {
  const sources = [{ key: "elo", label: t("player_match.source.internal") }];
  if (appSettings.linkedAccountsEnabled) {
    sources.push({ key: "cs2", label: "CS2" });
  }
  if (appSettings.faceitEnabled) {
    sources.push({ key: "faceit", label: "Faceit" });
  }
  return sources;
});
const rankMatchType = computed(() =>
  eloSource.value === "cs2"
    ? "Premier"
    : eloSource.value === "faceit"
      ? "Faceit"
      : "Competitive",
);

const members = computed(() => ({
  1: captainPickLineupMembers(props.draft, 1, props.players),
  2: captainPickLineupMembers(props.draft, 2, props.players),
}));

const pool = computed(() =>
  props.draft.available.map((steamId) => ({
    steam_id: steamId,
    player: captainPickPlayer(props.draft, steamId, props.players),
  })),
);

const logEntries = computed(() =>
  captainPickLogEntries(props.draft, props.players),
);

// Once the teams are locked, the one player nobody picked joined the team
// with room automatically; there is never an eighth pick.
const lastPlayer = computed(() => {
  if (isDrafting.value) {
    return null;
  }
  const picked = new Set(props.draft.picks.map((pick) => pick.steam_id));
  for (const lineup of [1, 2] as const) {
    const steamId = props.draft.lineups[lineup].find(
      (id) => id !== props.draft.captains[lineup] && !picked.has(id),
    );
    if (steamId) {
      return {
        lineup,
        name: captainPickParticipant(props.draft, steamId)?.name ?? "",
      };
    }
  }
  return null;
});

const pick = (steamId: string) => {
  if (canPick.value) {
    emit("pick", steamId);
  }
};

// A pool card picks its player, except when the click was on the player's
// profile link (opens in a new tab) or on the card's own Draft button.
const onCardClick = (event: MouseEvent, steamId: string) => {
  const target = event.target as Element | null;
  if (target?.closest("a, button")) {
    return;
  }
  pick(steamId);
};
</script>

<template>
  <div
    class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start"
    data-testid="captain-pick-screen"
  >
    <div class="flex min-w-0 flex-col gap-4">
      <!-- On the clock -->
      <div
        class="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/40 p-5 [backdrop-filter:blur(8px)]"
        aria-live="polite"
        data-testid="captain-pick-turn-card"
      >
        <template v-if="isDrafting">
          <DraftTurnStatus
            :deadline="localDeadline"
            :total="draft.timerSeconds ?? 30"
            :accent="clockAccent"
            :is-mine="myTurn"
            :timeline="timeline"
          >
            <template #status>
              <span v-if="myTurn" data-testid="captain-pick-your-turn">
                {{ $t("draft_games.room.your_pick") }}
              </span>
              <span v-else data-testid="captain-pick-turn">
                {{
                  $t("draft_games.room.captain_picking", { name: pickingName })
                }}
              </span>
            </template>
          </DraftTurnStatus>
          <p class="text-center text-xs text-muted-foreground">
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
            class="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground"
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
        <p
          v-else
          class="font-sans text-sm font-bold uppercase tracking-[0.18em]"
          data-testid="captain-pick-locked"
        >
          {{
            draft.phase === "MatchCreated"
              ? $t("matchmaking.captain_pick.match_ready")
              : $t("matchmaking.captain_pick.creating_match")
          }}
        </p>
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

      <div class="grid items-start gap-4 sm:grid-cols-2">
        <DraftTeamPanel
          v-for="lineup in lineups"
          :key="lineup"
          :title="
            $t('matchmaking.captain_pick.team_of', {
              name: captainName(lineup),
            })
          "
          :players="members[lineup]"
          :per-team="teamSize"
          :accent="lineup === 1 ? 'amber' : 'blue'"
          :active="isDrafting && draft.pickingLineup === lineup"
          :match-type="rankMatchType"
          elo-type="Competitive"
          profile-in-new-tab
          :data-testid="`captain-pick-team-${lineup}`"
        />
      </div>

      <div
        v-if="pool.length > 0"
        class="rounded-xl border border-border bg-card/40 p-5 [backdrop-filter:blur(8px)]"
        data-testid="captain-pick-pool"
      >
        <div class="mb-3 flex items-center gap-2">
          <span class="pool-tick"></span>
          <h3
            class="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
          >
            {{ $t("draft_games.room.pool") }}
            <span class="ml-1 text-foreground/70">({{ pool.length }})</span>
          </h3>
          <AnimatedFilters
            v-if="rankSources.length > 1"
            v-model="eloSource"
            :options="rankSources"
            square
            class="ml-auto"
            data-testid="captain-pick-rating-source"
          />
        </div>

        <TransitionGroup
          name="pool"
          tag="div"
          class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
        >
          <div
            v-for="member in pool"
            :key="member.steam_id"
            class="pool-pick rounded-lg"
            :class="canPick ? 'is-pickable' : ''"
            :data-testid="`captain-pick-player-${member.steam_id}`"
            @click="onCardClick($event, member.steam_id)"
          >
            <DraftPlayerCard
              :member="member"
              accent="neutral"
              :match-type="rankMatchType"
              elo-type="Competitive"
              profile-in-new-tab
            >
              <template #action>
                <Button
                  v-if="canPick"
                  variant="tactical"
                  type="button"
                  :class="[
                    tacticalCtaButtonClasses,
                    'h-7 gap-1 !px-3 !py-0 text-[0.7rem]',
                  ]"
                  :aria-label="`${$t('draft_games.room.draft')} ${member.player.name}`"
                  :data-testid="`captain-pick-draft-${member.steam_id}`"
                  @click.stop="pick(member.steam_id)"
                >
                  {{ $t("draft_games.room.draft") }}
                  <ArrowRight class="h-3 w-3" />
                </Button>
              </template>
            </DraftPlayerCard>
          </div>
        </TransitionGroup>
      </div>

      <div
        class="rounded-xl border border-border bg-card/40 p-4"
        data-testid="captain-pick-history"
      >
        <DraftLog :picks="logEntries" show-auto-pick-label />
        <p
          v-if="lastPlayer"
          class="mt-2 text-xs text-muted-foreground"
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
        </p>
      </div>
    </div>

    <!-- The same one chat on every screen size: the right sidebar from xl,
         below the Draft Log on phones and tablets (the draft comes first).
         Each room's ChatLobby is a fixed-height box that scrolls inside. -->
    <div
      class="flex flex-col xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]"
      data-testid="captain-pick-chat-section"
    >
      <CaptainPickChat :draft-id="draft.draftId" :my-lineup="myLineup" />
    </div>
  </div>
</template>

<style scoped>
.pool-tick {
  display: inline-block;
  height: 2px;
  width: 10px;
  background: hsl(var(--tac-amber));
}
.pool-pick.is-pickable {
  cursor: pointer;
}
.pool-pick.is-pickable :deep(.draft-player-card) {
  border-color: hsl(var(--tac-amber) / 0.45);
}
.pool-pick.is-pickable:hover :deep(.draft-player-card) {
  border-color: hsl(var(--tac-amber));
  background: hsl(var(--tac-amber) / 0.08);
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
.pool-leave-active {
  position: absolute;
}
@media (prefers-reduced-motion: reduce) {
  .pool-move,
  .pool-enter-active,
  .pool-leave-active {
    transition: none;
  }
}
</style>
