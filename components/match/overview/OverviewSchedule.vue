<script lang="ts" setup>
import { Button } from "~/components/ui/button";
import ScheduleMatch from "~/components/match/ScheduleMatch.vue";
import { CalendarClock, Check, X } from "lucide-vue-next";
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-4"
    data-testid="overview-schedule"
    :data-state="match.scheduled_at ? 'committed' : 'unset'"
  >
    <!-- The committed start (matches.scheduled_at), in the viewer's own
         timezone like the rest of the site. -->
    <div
      class="flex flex-col items-center gap-1.5 rounded-xl border border-[hsl(var(--tac-amber)/0.35)] bg-[hsl(var(--tac-amber)/0.06)] px-4 py-5 text-center"
    >
      <span
        class="font-mono text-[0.62rem] font-bold uppercase tracking-[0.22em] text-[hsl(var(--tac-amber))]"
      >
        {{ $t("match.lifecycle.schedule_kicker") }}
      </span>
      <template v-if="match.scheduled_at">
        <time
          :datetime="match.scheduled_at"
          class="font-sans text-2xl font-bold uppercase tracking-[0.06em]"
          data-testid="schedule-time"
        >
          {{ formatTime(match.scheduled_at) }}
        </time>
        <span class="font-mono text-sm text-muted-foreground" data-testid="schedule-starts-in">
          {{
            startsIn
              ? $t("match.lifecycle.starts_in", { time: startsIn })
              : $t("match.lifecycle.starting_soon")
          }}
        </span>
      </template>
      <span v-else class="text-sm text-muted-foreground" data-testid="schedule-unset">
        {{ $t("match.lifecycle.schedule_unset") }}
      </span>
    </div>

    <!-- A new time proposed on the tournament/league bracket. Accepting it
         moves scheduled_at on the server; until then the time above stands. -->
    <div
      v-if="pending.length"
      class="flex flex-col gap-2"
      data-testid="schedule-proposals"
    >
      <div
        v-for="proposal in pending"
        :key="proposal.id"
        class="rounded-lg border border-border/70 bg-card/40 px-3 py-2.5"
        :data-testid="`schedule-proposal-${proposal.id}`"
      >
        <div class="flex items-center gap-1.5 text-sm font-medium">
          <CalendarClock class="h-3.5 w-3.5 shrink-0 text-[hsl(var(--tac-amber))]" />
          {{ $t("match.lifecycle.new_time_proposed", { time: formatTime(proposal.proposed_time) }) }}
        </div>
        <div class="mt-1 text-xs text-muted-foreground">
          {{ $t("league.schedule.proposed_by") }}
          {{ proposal.proposed_by?.name ?? "?" }}
          <span v-if="proposal.message" class="italic">· “{{ proposal.message }}”</span>
        </div>
        <div v-if="respondable(proposal)" class="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            class="tac-amber-cta h-7 gap-1"
            :loading="responding === proposal.id"
            data-testid="schedule-accept"
            @click="respond(proposal.id, 'Accepted')"
          >
            <Check class="h-3.5 w-3.5" />
            {{ $t("league.schedule.accept") }}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            class="h-7 gap-1 text-muted-foreground"
            :disabled="!!responding"
            data-testid="schedule-decline"
            @click="respond(proposal.id, 'Declined')"
          >
            <X class="h-3.5 w-3.5" />
            {{ $t("league.schedule.decline") }}
          </Button>
        </div>
        <p v-else class="mt-2 text-xs text-muted-foreground" data-testid="schedule-awaiting">
          {{ $t("league.schedule.awaiting_opponent") }}
        </p>
      </div>
    </div>

    <!-- The organizer's existing schedule controls (can_schedule), unchanged. -->
    <div
      v-if="match.can_schedule"
      class="rounded-xl border border-border/70 bg-background/60 p-4"
      data-testid="schedule-organizer"
    >
      <ScheduleMatch :match="match" />
    </div>
  </section>
</template>

<script lang="ts">
import { toast } from "@/components/ui/toast";
import { e_player_roles_enum } from "~/generated/zeus";
import { MY_MANAGED_TEAMS_QUERY, RESPOND_PROPOSAL_MUTATION } from "~/graphql/leagues";
import { canRespondTo } from "~/utilities/leagueFixtures";
import { pendingScheduleProposals, startsInText } from "~/utilities/matchLifecycle";

/**
 * The Overview's schedule stage (status Scheduled): the committed start, any
 * proposal to move it, and the organizer's ScheduleMatch. Nothing here moves
 * the match on: the server opens check-in when the time comes.
 *
 * Negotiated scheduling (league / negotiated tournaments) works like this,
 * and this page does not change it:
 * - The first negotiation happens outside the match page: on the league
 *   schedule for leagues, on the bracket card (BracketNegotiation) for a
 *   normal negotiated tournament. No match exists yet: admin-mode brackets
 *   are not auto-scheduled, and accepting a proposal is what creates the
 *   match, as Scheduled with the agreed time (tau_league_scheduling_proposals).
 * - From then on this stage owns it, showing the real scheduled_at.
 * - Later reschedules reuse the same league_scheduling_proposals rows; an
 *   accepted one moves scheduled_at server-side. New times are proposed in
 *   those same places, where the scheduling window is known.
 */
export default {
  props: {
    match: { type: Object, required: true },
  },
  data() {
    return {
      now: Date.now(),
      tick: undefined as ReturnType<typeof setInterval> | undefined,
      managedTeamIds: [] as string[],
      responding: null as string | null,
    };
  },
  mounted() {
    this.tick = setInterval(() => (this.now = Date.now()), 15_000);
  },
  unmounted() {
    if (this.tick) clearInterval(this.tick);
  },
  watch: {
    // Who may answer a proposal: the same rule as the league schedule
    // (a manager of either team, never the proposer; administrators always).
    hasPending: {
      immediate: true,
      handler(pending: boolean) {
        if (pending) this.loadManagedTeams();
      },
    },
  },
  methods: {
    formatTime(value: string) {
      return new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    },
    async loadManagedTeams() {
      const steamId = useAuthStore().me?.steam_id;
      if (!steamId) return;
      try {
        const { data } = await this.$apollo.query({
          query: MY_MANAGED_TEAMS_QUERY,
          variables: { steamId },
          fetchPolicy: "network-only",
        });
        this.managedTeamIds = (data?.teams ?? []).map((team: any) => team.id);
      } catch {
        this.managedTeamIds = [];
      }
    },
    respondable(proposal: any) {
      const bracket = this.match.tournament_brackets?.[0];
      if (!bracket) return false;
      const me = useAuthStore().me?.steam_id;
      return canRespondTo(bracket, { ...proposal, proposed_by_steam_id: String(proposal.proposed_by_steam_id) }, {
        isAdmin: useAuthStore().isRoleAbove(e_player_roles_enum.administrator),
        mySteamId: me ? String(me) : null,
        mine: this.managesLineup,
      });
    },
    async respond(proposalId: string, status: "Accepted" | "Declined") {
      if (this.responding) return;
      this.responding = proposalId;
      try {
        await this.$apollo.mutate({
          mutation: RESPOND_PROPOSAL_MUTATION,
          variables: { proposalId, status },
        });
      } catch (error: any) {
        toast({ variant: "destructive", title: error?.message ?? String(error) });
      } finally {
        this.responding = null;
      }
    },
  },
  computed: {
    startsIn() {
      return startsInText(this.match.scheduled_at, this.now);
    },
    pending() {
      return pendingScheduleProposals(this.match);
    },
    hasPending() {
      return this.pending.length > 0;
    },
    managesLineup() {
      return [this.match.lineup_1?.team_id, this.match.lineup_2?.team_id].some(
        (teamId) => !!teamId && this.managedTeamIds.includes(teamId),
      );
    },
  },
};
</script>
