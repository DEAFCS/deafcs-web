<script lang="ts" setup>
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import ProposeTimeDialog from "~/components/league/ProposeTimeDialog.vue";
import { CalendarClock, Check, X } from "lucide-vue-next";
</script>

<template>
  <!-- Inside a clickable bracket card: nothing here may open the match or
       the organizer's schedule dialog. -->
  <div class="flex flex-col items-center gap-1 text-xs" data-testid="bracket-negotiation" @click.stop>
    <span v-if="pending.length" class="font-medium text-[hsl(var(--tac-amber))]" data-testid="bracket-negotiation-state">
      {{ $t("tournament.negotiation.proposed", { time: formatTime(pending[0].proposed_time) }) }}
    </span>
    <span v-else-if="!bracket.scheduled_at" class="text-muted-foreground" data-testid="bracket-negotiation-state">
      {{ $t("tournament.negotiation.no_time") }}
    </span>
    <Button
      size="sm"
      variant="outline"
      class="h-6 gap-1 px-2 text-[0.65rem]"
      data-testid="bracket-negotiation-open"
      @click.stop="open = true"
    >
      <CalendarClock class="h-3 w-3" />
      {{ $t("tournament.negotiation.open") }}
    </Button>

    <Dialog :open="open" @update:open="open = $event">
      <DialogContent class="sm:max-w-lg" data-testid="bracket-negotiation-dialog" @click.stop>
        <DialogHeader>
          <DialogTitle>{{ $t("tournament.negotiation.title") }}</DialogTitle>
          <DialogDescription>{{ matchup }}</DialogDescription>
        </DialogHeader>

        <!-- The committed time, if any (bracket.scheduled_at, set by an
             accepted proposal or the organizer). Never the projected ETA. -->
        <div class="rounded-md border border-border bg-muted/20 px-3 py-2.5 text-sm" data-testid="bracket-negotiation-agreed">
          <template v-if="bracket.scheduled_at">
            {{ $t("tournament.negotiation.agreed", { time: formatTime(bracket.scheduled_at) }) }}
          </template>
          <span v-else class="text-muted-foreground">{{ $t("tournament.negotiation.no_time") }}</span>
        </div>

        <div
          v-for="proposal in pending"
          :key="proposal.id"
          class="rounded-md border border-[hsl(var(--tac-amber)/0.3)] bg-[hsl(var(--tac-amber)/0.05)] px-3 py-2.5"
          :data-testid="`bracket-proposal-${proposal.id}`"
        >
          <div class="flex items-center gap-1.5 text-sm font-medium">
            <CalendarClock class="h-3.5 w-3.5 text-[hsl(var(--tac-amber))]" />
            {{ formatTime(proposal.proposed_time) }}
          </div>
          <div class="mt-1 text-xs text-muted-foreground">
            {{ $t("league.schedule.proposed_by") }} {{ proposal.proposed_by?.name ?? "?" }}
            <span v-if="proposal.message" class="italic">· “{{ proposal.message }}”</span>
          </div>
          <div v-if="respondable(proposal)" class="mt-2.5 flex flex-wrap gap-1.5">
            <Button size="sm" class="tac-amber-cta h-7 gap-1" :loading="busy" data-testid="bracket-accept" @click="respond(proposal.id, 'Accepted')">
              <Check class="h-3.5 w-3.5" />
              {{ $t("league.schedule.accept") }}
            </Button>
            <Button size="sm" variant="outline" class="h-7 gap-1" :disabled="busy" data-testid="bracket-counter" @click="startCounter(proposal.id)">
              <CalendarClock class="h-3.5 w-3.5" />
              {{ $t("league.schedule.counter") }}
            </Button>
            <Button size="sm" variant="ghost" class="h-7 gap-1 text-muted-foreground" :disabled="busy" data-testid="bracket-decline" @click="respond(proposal.id, 'Declined')">
              <X class="h-3.5 w-3.5" />
              {{ $t("league.schedule.decline") }}
            </Button>
          </div>
          <p v-else class="mt-2 text-xs text-muted-foreground" data-testid="bracket-awaiting">
            {{ $t("league.schedule.awaiting_opponent") }}
          </p>
        </div>

        <ul v-if="history.length" class="space-y-1" data-testid="bracket-negotiation-history">
          <li v-for="past in history" :key="past.id" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span class="font-mono line-through">{{ formatTime(past.proposed_time) }}</span>
            <span>{{ past.proposed_by?.name ?? "?" }}</span>
            <span class="font-mono uppercase tracking-[0.12em]">· {{ $t(`league.schedule.status.${past.status}`) }}</span>
          </li>
        </ul>

        <div class="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            v-if="canPropose"
            size="sm"
            :variant="pending.length ? 'outline' : 'default'"
            :class="pending.length ? '' : 'tac-amber-cta'"
            class="gap-1.5"
            data-testid="bracket-propose"
            @click="startPropose"
          >
            <CalendarClock class="h-3.5 w-3.5" />
            {{ pending.length ? $t("league.schedule.propose_new") : $t("league.schedule.propose") }}
          </Button>
          <p v-else class="text-xs text-muted-foreground" data-testid="bracket-negotiation-readonly">
            {{ $t("tournament.negotiation.teams_only") }}
          </p>
        </div>
      </DialogContent>
    </Dialog>

    <ProposeTimeDialog
      v-if="showPropose"
      :open="showPropose"
      :week-opens-at="proposalRange.opensAt"
      :week-closes-at="proposalRange.closesAt"
      :initial-date="proposalRange.opensAt"
      :matchup="matchup"
      @update:open="(value) => { showPropose = value; if (!value) counterProposalId = null; }"
      @submit="onProposeSubmit"
    />
  </div>
</template>

<script lang="ts">
import { toast } from "@/components/ui/toast";
import { e_player_roles_enum } from "~/generated/zeus";
import {
  MY_MANAGED_TEAMS_QUERY,
  PROPOSE_TIME_MUTATION,
  RESPOND_PROPOSAL_MUTATION,
} from "~/graphql/leagues";
import { canRespondTo } from "~/utilities/leagueFixtures";
import {
  managesBracket,
  pastBracketProposals,
  pendingBracketProposals,
  proposalWindow,
} from "~/utilities/bracketNegotiation";

/**
 * A negotiated (non-league) tournament bracket's time: propose, accept,
 * counter or decline, with the league schedule's own mutations and rules.
 * Everyone can see the state; only the two teams' managers (and
 * administrators) can act, as the triggers enforce.
 */
export default {
  props: {
    bracket: { type: Object, required: true },
    stage: { type: Object, default: null },
  },
  data() {
    return {
      open: false,
      showPropose: false,
      counterProposalId: null as string | null,
      busy: false,
      managedTeamIds: [] as string[],
      loadedFor: null as string | null,
    };
  },
  watch: {
    open(isOpen: boolean) {
      if (isOpen) this.loadManagedTeams();
    },
  },
  methods: {
    formatTime(value: string) {
      return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    },
    async loadManagedTeams() {
      const steamId = useAuthStore().me?.steam_id;
      if (!steamId || this.loadedFor === String(steamId)) return;
      try {
        const { data } = await this.$apollo.query({
          query: MY_MANAGED_TEAMS_QUERY,
          variables: { steamId },
        });
        this.managedTeamIds = (data?.teams ?? []).map((team: any) => team.id);
        this.loadedFor = String(steamId);
      } catch {
        this.managedTeamIds = [];
      }
    },
    respondable(proposal: any) {
      const me = useAuthStore().me?.steam_id;
      return canRespondTo(this.bracket as any, { ...proposal, proposed_by_steam_id: String(proposal.proposed_by_steam_id) }, {
        isAdmin: this.isAdmin,
        mySteamId: me ? String(me) : null,
        mine: this.mine,
      });
    },
    startPropose() {
      this.counterProposalId = null;
      this.showPropose = true;
    },
    startCounter(proposalId: string) {
      this.counterProposalId = proposalId;
      this.showPropose = true;
    },
    async respond(proposalId: string, status: "Accepted" | "Declined") {
      if (this.busy) return;
      this.busy = true;
      try {
        await this.$apollo.mutate({ mutation: RESPOND_PROPOSAL_MUTATION, variables: { proposalId, status } });
      } catch (error: any) {
        toast({ variant: "destructive", title: error?.message ?? String(error) });
      } finally {
        this.busy = false;
      }
    },
    // Countering rejects the current proposal (kept as history), then
    // proposes, exactly like the league schedule.
    async onProposeSubmit(proposedTime: string, message: string) {
      this.busy = true;
      try {
        if (this.counterProposalId) {
          await this.$apollo.mutate({
            mutation: RESPOND_PROPOSAL_MUTATION,
            variables: { proposalId: this.counterProposalId, status: "Countered" },
          });
          this.counterProposalId = null;
        }
        await this.$apollo.mutate({
          mutation: PROPOSE_TIME_MUTATION,
          variables: { bracketId: this.bracket.id, proposedTime, message },
        });
      } catch (error: any) {
        toast({ variant: "destructive", title: error?.message ?? String(error) });
      } finally {
        this.busy = false;
      }
    },
  },
  computed: {
    pending() {
      return pendingBracketProposals(this.bracket);
    },
    history() {
      return pastBracketProposals(this.bracket);
    },
    isAdmin() {
      return useAuthStore().isRoleAbove(e_player_roles_enum.administrator);
    },
    mine() {
      return managesBracket(this.bracket, this.managedTeamIds);
    },
    canPropose() {
      return !!useAuthStore().me && (this.mine || this.isAdmin);
    },
    proposalRange() {
      return proposalWindow(this.stage, this.bracket, Date.now());
    },
    matchup() {
      const name = (team: any) => team?.team?.name || team?.name || "TBD";
      return `${name(this.bracket.team_1)} vs ${name(this.bracket.team_2)}`;
    },
  },
};
</script>
