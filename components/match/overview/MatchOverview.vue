<script lang="ts" setup>
import DraftTeamPanel from "~/components/draft-games/DraftTeamPanel.vue";
import CaptainPickProgress from "~/components/match/CaptainPickProgress.vue";
import MatchRegionVeto from "~/components/match/MatchRegionVeto.vue";
import OverviewActionBar from "~/components/match/overview/OverviewActionBar.vue";
import OverviewVeto from "~/components/match/overview/OverviewVeto.vue";
import OverviewPreMatch from "~/components/match/overview/OverviewPreMatch.vue";
import OverviewCheckIn from "~/components/match/overview/OverviewCheckIn.vue";
import OverviewRegion from "~/components/match/overview/OverviewRegion.vue";
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
      :region="regionLabel ? $t('match.lifecycle.region_is', { region: regionLabel }) : null"
      :deadline="bar.deadline"
      :total="bar.total"
      :accent="bar.accent"
      :mine="bar.mine"
      :clock-label="bar.clockLabel"
      :steps="bar.steps"
      :strip-label="bar.stripLabel"
      :countdown="bar.countdown"
      :countdown-label="bar.countdownLabel"
    />

    <!-- Wide screens: Team 1 | stage | Team 2. Narrower: the stage first,
         the teams side by side below it (stacked on phones). -->
    <div
      class="grid min-w-0 grid-cols-1 items-start gap-4 sm:grid-cols-2 min-[1400px]:grid-cols-[minmax(260px,1fr)_minmax(0,1.35fr)_minmax(260px,1fr)]"
    >
      <div
        class="order-1 min-w-0 w-full max-w-2xl justify-self-center sm:col-span-2 min-[1400px]:order-2 min-[1400px]:col-span-1"
        data-testid="overview-middle"
      >
        <OverviewCheckIn v-if="stage === 'check-in'" :match="match" />
        <CaptainPickProgress
          v-else-if="stage === 'captain-pick'"
          :progress="captainPickProgress"
          :participant="participant"
        />
        <OverviewRegion
          v-else-if="regionPending"
          :match="match"
          :picks="regionPicks"
        />
        <template v-else-if="stage === 'veto'">
          <!-- Without a region veto, an organizer may still set the server
               region by hand; MatchRegionVeto shows only that form then. -->
          <MatchRegionVeto
            v-if="!match.options?.region_veto"
            :match="match"
            class="mb-4"
          />
          <OverviewVeto :match="match" :picks="picks" :accent="bar.accent" />
        </template>
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
          :check-in-by-steam-id="team.checkIns"
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
  checkInSummary,
  lineupCaptainSteamId,
  lineupMembers,
  regionSteps,
  regionVetoPending,
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
      match_region_veto_picks: {
        skip() {
          return this.stage !== "veto" && this.stage !== "pre-match";
        },
        variables() {
          return { matchId: this.match.id };
        },
        query: typedGql("subscription")({
          match_region_veto_picks: [
            {
              where: { match_id: { _eq: $("matchId", "uuid!") } },
              order_by: [{ created_at: order_by.asc }],
            },
            { id: true, type: true, region: true, match_lineup_id: true },
          ],
        }),
        result({ data }: { data: any }) {
          this.regionPicks = data?.match_region_veto_picks ?? [];
        },
      },
      match_map_veto_picks: {
        skip() {
          return this.stage !== "veto" && this.stage !== "pre-match";
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
      regionPicks: [] as any[],
      draftReceivedAt: Date.now(),
      progressReceivedAt: Date.now(),
      vetoClockTotal: 30,
    };
  },
  watch: {
    participantDraft() {
      this.draftReceivedAt = Date.now();
    },
    // Every public snapshot (a reconnect's fresh one included) re-anchors the
    // clock correction to the moment it arrived.
    captainPickProgress() {
      this.progressReceivedAt = Date.now();
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
    regionPending() {
      return this.stage === "veto" && regionVetoPending(this.match);
    },
    regionLabel() {
      return this.match.e_region?.description || this.match.region || null;
    },
    vetoTeam(): 1 | 2 | null {
      const key = this.regionPending ? "is_picking_region_veto" : "is_picking_map_veto";
      if (this.match.lineup_1?.[key]) return 1;
      if (this.match.lineup_2?.[key]) return 2;
      return null;
    },
    checkIn() {
      return this.stage === "check-in" ? checkInSummary(this.match) : null;
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
            checkIns: null,
          };
        }
        const row = this.match[`lineup_${lineup}`];
        // Per-player check-in marks only where each player checks in;
        // with captain check-in one captain readies the whole team.
        const checkIns =
          this.checkIn?.mode === "Players"
            ? Object.fromEntries(
                (row?.lineup_players ?? []).map((p: any) => [
                  String(p.steam_id),
                  !!p.checked_in,
                ]),
              )
            : null;
        return {
          lineup,
          title: this.lineupName(lineup),
          players: lineupMembers(row),
          captainSteamId: lineupCaptainSteamId(row),
          perTeam: this.match.min_players_per_lineup || 5,
          active: this.stage === "veto" && this.vetoTeam === lineup,
          checkIns,
        };
      });
    },
    steps(): OverviewStripStep[] {
      if (this.stage === "check-in") return [];
      if (this.regionPending) {
        return regionSteps(this.match, this.regionPicks).map((step) => ({
          label:
            step.type === "Decider"
              ? this.$t("match.lifecycle.step_region")
              : `${this.$t("match.lifecycle.step_ban")} T${step.team ?? "?"}`,
          tone: step.type === "Decider" ? "decider" : "ban",
          state: step.state,
        }));
      }
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
      // One server timer, two feeds: the ten use their own draft, everyone
      // else the public one. Both are corrected by the server's clock
      // (serverNow vs arrival), so a slow or wrong device clock doesn't
      // shift the countdown and opening mid-turn shows what's left.
      const own =
        this.participantDraft &&
        this.participantDraft.phase === "Drafting" &&
        picking
          ? localCaptainPickDeadline(this.participantDraft, this.draftReceivedAt)
          : null;
      const shared =
        !own && picking && progress?.deadline && progress.serverNow
          ? localCaptainPickDeadline(
              { deadline: progress.deadline, serverNow: progress.serverNow },
              this.progressReceivedAt,
            )
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
        deadline: own ?? shared,
        total:
          (own ? this.participantDraft?.timerSeconds : progress?.timerSeconds) ?? 30,
        accent: picking === 2 ? BLUE : AMBER,
        mine:
          !!picking &&
          String(this.participantDraft?.pickingCaptainSteamId ?? "") ===
            String(useAuthStore().me?.steam_id ?? "-"),
        clockLabel: null,
        stripLabel: this.$t("draft_games.room.pick_order"),
      };
    },
    checkInBar() {
      const summary = this.checkIn!;
      const timed = summary.mode !== "Admin" && !!this.match.cancels_at;
      return {
        title: this.$t("match.lifecycle.check_in_title"),
        hint:
          summary.mode === "Admin"
            ? this.$t("match.lifecycle.admin_check_in")
            : this.$t(
                summary.mode === "Captains"
                  ? "match.lifecycle.teams_ready"
                  : "match.lifecycle.players_ready",
                { ready: summary.ready, required: summary.required },
              ),
        meta: null,
        deadline: null,
        total: 30,
        accent: AMBER,
        mine: !!this.match.can_check_in,
        clockLabel: null,
        stripLabel: null,
        // cancels_at is the Check-in Time deadline the server enforces.
        countdown: timed ? this.match.cancels_at : null,
        countdownLabel: timed ? this.$t("match.lifecycle.check_in_closes") : null,
      };
    },
    regionBar() {
      const team = this.vetoTeam;
      const name = team ? this.lineupName(team) : "";
      const mine = !!(
        this.match.lineup_1?.can_pick_region_veto ||
        this.match.lineup_2?.can_pick_region_veto
      );
      const left = (this.match.options?.regions ?? []).length - this.regionPicks.length;
      return {
        title: team
          ? this.$t("match.lifecycle.region_ban", { team: name })
          : this.$t("match.lifecycle.choosing_region"),
        hint: team
          ? mine
            ? this.$t("match.lifecycle.your_region_ban")
            : this.$t("match.lifecycle.wait_region_ban", { team: name })
          : null,
        meta: this.$t("match.lifecycle.regions_left", { count: Math.max(left, 0) }),
        deadline: this.match.map_veto_pick_expires_at ?? null,
        total: this.vetoClockTotal,
        accent: team === 2 ? BLUE : AMBER,
        mine,
        clockLabel: null,
        stripLabel: this.$t("match.lifecycle.region_veto"),
      };
    },
    vetoBar() {
      const team = this.vetoTeam;
      const name = team ? this.lineupName(team) : "";
      const type = this.match.map_veto_type;
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
        meta:
          kind === "side" && sideMap
            ? mapLabel(sideMap)
            : null,
        deadline: kind ? this.match.map_veto_pick_expires_at ?? null : null,
        total: this.vetoClockTotal,
        accent: team === 2 ? BLUE : AMBER,
        mine,
        clockLabel: null,
        stripLabel: this.$t("common.map_veto"),
      };
    },
    preMatchBar() {
      const waiting = this.match.status === "WaitingForServer";
      return {
        title: waiting
          ? this.$t("match.lifecycle.preparing_server")
          : this.$t("match.lifecycle.match_live"),
        hint: waiting
          ? this.$t("match.lifecycle.waiting_for_server")
          : null,
        meta: this.regionLabel
          ? this.$t("match.lifecycle.region_is", { region: this.regionLabel })
          : null,
        deadline: null,
        total: 30,
        accent: NEUTRAL,
        mine: false,
        clockLabel: "SEC",
        stripLabel: this.picks.length ? this.$t("common.map_veto") : null,
      };
    },
    bar() {
      const base =
        this.stage === "check-in"
          ? this.checkInBar
          : this.stage === "captain-pick"
            ? this.captainPickBar
            : this.regionPending
              ? this.regionBar
              : this.stage === "veto"
                ? this.vetoBar
                : this.preMatchBar;
      return { countdown: null, countdownLabel: null, ...base, steps: this.steps };
    },
  },
};
</script>
