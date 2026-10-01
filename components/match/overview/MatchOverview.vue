<script lang="ts" setup>
import DraftTeamPanel from "~/components/draft-games/DraftTeamPanel.vue";
import CaptainPickProgress from "~/components/match/CaptainPickProgress.vue";
import MatchRegionVeto from "~/components/match/MatchRegionVeto.vue";
import OverviewActionBar from "~/components/match/overview/OverviewActionBar.vue";
import OverviewVeto from "~/components/match/overview/OverviewVeto.vue";
import OverviewPreMatch from "~/components/match/overview/OverviewPreMatch.vue";
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-4"
    data-testid="match-overview"
    :data-stage="stage"
  >
    <OverviewActionBar
      :title="bar.title"
      :hint="bar.hint"
      :meta="bar.meta"
      :deadline="bar.deadline"
      :total="bar.total"
      :accent="bar.accent"
      :mine="bar.mine"
      :clock-label="bar.clockLabel"
      :steps="bar.steps"
      :strip-label="bar.stripLabel"
    />

    <!-- Wide screens: Team 1 | stage | Team 2. Narrower: the stage first,
         the teams side by side below it (stacked on phones). -->
    <div
      class="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2 min-[1400px]:grid-cols-[minmax(260px,1fr)_minmax(0,1.35fr)_minmax(260px,1fr)]"
    >
      <div
        class="order-1 min-w-0 sm:col-span-2 min-[1400px]:order-2 min-[1400px]:col-span-1"
        data-testid="overview-middle"
      >
        <CaptainPickProgress
          v-if="stage === 'captain-pick'"
          :progress="captainPickProgress"
          :participant="participant"
        />
        <MatchRegionVeto v-else-if="regionVetoPending" :match="match" />
        <OverviewVeto
          v-else-if="stage === 'veto'"
          :match="match"
          :picks="picks"
          :accent="bar.accent"
        />
        <OverviewPreMatch v-else :match="match" :picks="picks" />
      </div>

      <div
        v-for="team in teams"
        :key="team.lineup"
        class="min-w-0 transition-transform duration-300"
        :class="[
          team.lineup === 1 ? 'order-2 min-[1400px]:order-1' : 'order-3',
          team.active ? 'min-[1400px]:scale-[1.02]' : '',
        ]"
      >
        <DraftTeamPanel
          :title="team.title"
          :players="team.players"
          :per-team="team.perTeam"
          :captain-steam-id="team.captainSteamId"
          :accent="team.lineup === 1 ? 'amber' : 'blue'"
          :active="team.active"
          :match-type="eloType"
          :elo-type="eloType"
          profile-in-new-tab
          :data-testid="`overview-team-${team.lineup}`"
        />
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import type { PropType } from "vue";
import { $, order_by } from "~/generated/zeus";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import {
  captainPickLineupMembers,
  captainPickParticipant,
  captainPickTimeline,
  localCaptainPickDeadline,
  type CaptainPickDraftState,
} from "~/utilities/captainPickDraft";
import {
  lineupCaptainSteamId,
  lineupMembers,
  scoreboardHandoffAt,
  scoreboardHandoffRemainingMs,
  SCOREBOARD_HANDOFF_MS,
  vetoSteps,
  type OverviewStage,
  type OverviewStripStep,
} from "~/utilities/matchLifecycle";
import type { CaptainPickProgress as Progress } from "~/composables/useCaptainPickProgress";
import mapLabel from "~/utilities/mapLabel";

const AMBER = "var(--tac-amber)";
const BLUE = "200 90% 62%";
const NEUTRAL = "0 0% 92%";

/**
 * The match page's pre-game Overview tab: the action bar, Team 1 and Team 2
 * stay put while only the middle changes from Captain Pick to veto to the
 * final maps. A view of existing state only: the public Captain Pick feed,
 * the match subscription and its veto picks.
 */
export default {
  props: {
    match: { type: Object, required: true },
    stage: { type: String as PropType<OverviewStage>, required: true },
    captainPickProgress: {
      type: Object as PropType<Progress | null>,
      default: null,
    },
    // The viewer's own draft (only the ten have it): the real pick deadline.
    participantDraft: {
      type: Object as PropType<CaptainPickDraftState | null>,
      default: null,
    },
    participant: { type: Boolean, default: false },
    // The page's lifecycle clock (bumped when the cooldown ends).
    now: { type: Number, default: () => Date.now() },
  },
  apollo: {
    $subscribe: {
      match_map_veto_picks: {
        skip() {
          return this.stage === "captain-pick";
        },
        variables() {
          return { matchId: this.match.id, order_by: order_by.asc };
        },
        query: typedGql("subscription")({
          match_map_veto_picks: [
            {
              where: { match_id: { _eq: $("matchId", "uuid!") } },
              order_by: [{}, { created_at: $("order_by", "order_by") }],
            },
            {
              id: true,
              type: true,
              side: true,
              match_lineup_id: true,
              map: { id: true, name: true, label: true, poster: true },
            },
          ],
        }),
        result({ data }: { data: any }) {
          this.picks = data?.match_map_veto_picks ?? [];
        },
      },
    },
  },
  data() {
    return {
      picks: [] as any[],
      draftReceivedAt: Date.now(),
      vetoClockTotal: 30,
    };
  },
  watch: {
    participantDraft() {
      this.draftReceivedAt = Date.now();
    },
    // The ring's full length is however long this turn had when first seen
    // (map_veto_pick_seconds is a server setting; 30 is its default).
    "match.map_veto_pick_expires_at": {
      immediate: true,
      handler(expiresAt: string | null) {
        const seconds = expiresAt
          ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
          : 0;
        this.vetoClockTotal = Math.max(30, seconds);
      },
    },
  },
  methods: {
    lineupName(team: 1 | 2) {
      return (
        this.match[`lineup_${team}`]?.name ||
        this.$t(`match.lineup.lineup_${team}`)
      );
    },
  },
  computed: {
    draft() {
      return this.stage === "captain-pick" ? this.captainPickProgress : null;
    },
    eloType() {
      return this.stage === "captain-pick"
        ? "Competitive"
        : (this.match.options?.type ?? null);
    },
    regionVetoPending() {
      return (
        this.stage === "veto" &&
        !!this.match.options?.region_veto &&
        !this.match.region
      );
    },
    vetoTeam(): 1 | 2 | null {
      if (this.match.lineup_1?.is_picking_map_veto) return 1;
      if (this.match.lineup_2?.is_picking_map_veto) return 2;
      return null;
    },
    teams() {
      return ([1, 2] as const).map((lineup) => {
        const progress = this.draft;
        if (progress) {
          const captain = progress.captains[lineup];
          return {
            lineup,
            title: this.$t("matchmaking.captain_pick.team_of", {
              name: captainPickParticipant(progress, captain)?.name ?? "",
            }),
            players: captainPickLineupMembers(progress, lineup),
            captainSteamId: captain ? String(captain) : null,
            perTeam: Math.max(1, Math.ceil(progress.participants.length / 2)),
            active: progress.pickingLineup === lineup,
          };
        }
        const row = this.match[`lineup_${lineup}`];
        return {
          lineup,
          title: this.lineupName(lineup),
          players: lineupMembers(row),
          captainSteamId: lineupCaptainSteamId(row),
          perTeam: this.match.min_players_per_lineup || 5,
          active: this.stage === "veto" && this.vetoTeam === lineup,
        };
      });
    },
    steps(): OverviewStripStep[] {
      if (this.stage === "captain-pick") {
        if (!this.draft) return [];
        return captainPickTimeline(this.draft).map((slot) => ({
          label: `T${slot.lineup}`,
          tone: slot.lineup === 1 ? "t1" : "t2",
          state: slot.state,
        }));
      }
      return vetoSteps(this.match, this.picks).map((step) => ({
        label:
          step.type === "Decider"
            ? this.$t("match.lifecycle.step_decider")
            : `${this.$t(`match.lifecycle.step_${step.choosingSide ? "side" : step.type.toLowerCase()}`)} T${step.team ?? "?"}`,
        tone:
          step.type === "Ban"
            ? "ban"
            : step.type === "Decider"
              ? "decider"
              : step.team === 2
                ? "t2"
                : "t1",
        state: step.state,
      }));
    },
    captainPickBar() {
      const progress = this.draft;
      const picking = progress?.pickingLineup ?? null;
      const name = picking
        ? (captainPickParticipant(progress!, progress!.captains[picking])?.name ?? "")
        : "";
      const own =
        this.participantDraft &&
        this.participantDraft.phase === "Drafting" &&
        picking
          ? localCaptainPickDeadline(this.participantDraft, this.draftReceivedAt)
          : null;
      const total = progress?.pickOrder.length ?? 0;
      return {
        title: picking
          ? this.$t("draft_games.room.captain_picking", { name })
          : this.$t("matchmaking.captain_pick.nav"),
        hint: picking
          ? this.$t("matchmaking.captain_pick.waiting_hint", { name })
          : this.$t("matchmaking.captain_pick.creating_match"),
        meta:
          progress && picking
            ? this.$t("matchmaking.captain_pick.pick_progress", {
                current: (progress.pickIndex ?? total - 1) + 1,
                total,
              })
            : null,
        deadline: own,
        total: this.participantDraft?.timerSeconds ?? 30,
        accent: picking === 2 ? BLUE : AMBER,
        mine:
          !!picking &&
          String(this.participantDraft?.pickingCaptainSteamId ?? "") ===
            String(useAuthStore().me?.steam_id ?? "-"),
        clockLabel: null,
        stripLabel: this.$t("draft_games.room.pick_order"),
      };
    },
    vetoBar() {
      const team = this.vetoTeam;
      const name = team ? this.lineupName(team) : "";
      const type = this.match.map_veto_type;
      if (this.regionVetoPending) {
        return {
          title: this.$t("match.lifecycle.choosing_region"),
          hint: null,
          meta: null,
          deadline: null,
          total: 30,
          accent: AMBER,
          mine: false,
          clockLabel: null,
          stripLabel: null,
        };
      }
      const mine = !!(
        this.match.lineup_1?.can_pick_map_veto ||
        this.match.lineup_2?.can_pick_map_veto
      );
      const kind =
        type === "Ban" ? "ban" : type === "Pick" ? "pick" : type === "Side" ? "side" : null;
      const pickNumber =
        this.picks.filter((pick: any) => pick.type === "Pick").length + 1;
      const sideMap = this.picks.at(-1)?.map;
      return {
        title: kind
          ? this.$t(`match.lifecycle.veto_${kind}`, { team: name, number: pickNumber })
          : this.$t("match.lifecycle.veto_starting"),
        hint: kind
          ? mine
            ? this.$t(`match.lifecycle.your_${kind}`)
            : this.$t(`match.lifecycle.wait_${kind}`, { team: name })
          : null,
        meta: kind === "side" && sideMap ? mapLabel(sideMap) : null,
        deadline: this.match.map_veto_pick_expires_at ?? null,
        total: this.vetoClockTotal,
        accent: team === 2 ? BLUE : AMBER,
        mine,
        clockLabel: null,
        stripLabel: this.$t("common.map_veto"),
      };
    },
    preMatchBar() {
      const handoffAt = scoreboardHandoffAt(this.match);
      const waiting = this.match.status === "WaitingForServer";
      const cooling =
        !waiting && scoreboardHandoffRemainingMs(this.match, this.now) > 0;
      return {
        title: waiting
          ? this.$t("match.lifecycle.preparing_server")
          : cooling
            ? this.$t("match.lifecycle.match_starting")
            : this.$t("match.lifecycle.match_live"),
        hint: waiting
          ? this.$t("match.lifecycle.waiting_for_server")
          : cooling
            ? this.$t("match.lifecycle.switching_in")
            : null,
        meta: null,
        deadline:
          cooling && handoffAt !== null
            ? new Date(
                Math.min(handoffAt, this.now + SCOREBOARD_HANDOFF_MS),
              ).toISOString()
            : null,
        total: SCOREBOARD_HANDOFF_MS / 1000,
        accent: NEUTRAL,
        mine: false,
        clockLabel: "SEC",
        stripLabel: this.picks.length ? this.$t("common.map_veto") : null,
      };
    },
    bar() {
      const base =
        this.stage === "captain-pick"
          ? this.captainPickBar
          : this.stage === "veto"
            ? this.vetoBar
            : this.preMatchBar;
      return { ...base, steps: this.steps };
    },
  },
};
</script>
