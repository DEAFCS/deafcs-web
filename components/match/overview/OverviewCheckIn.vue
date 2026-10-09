<script lang="ts" setup>
import CheckIntoMatch from "~/components/match/CheckIntoMatch.vue";
import MatchStartingLineup from "~/components/match/MatchStartingLineup.vue";
</script>

<template>
  <section class="flex min-w-0 flex-col gap-4" data-testid="overview-check-in" :data-mode="summary.mode">

    <!-- Every player checks in: the team cards beside this panel already
         show each player's readiness, so nothing is repeated here. -->
    <ul
      v-if="summary.mode !== 'Players'"
      class="flex flex-col gap-2"
      data-testid="check-in-teams"
    >
      <li
        v-for="team in summary.teams"
        :key="team.team"
        class="check-in-team flex items-center justify-between gap-3 rounded-xl border px-4 py-3"
        :class="[team.ready ? 'is-ready' : '', team.team === 1 ? 'team-1' : 'team-2']"
        :data-testid="`check-in-team-${team.team}`"
        :data-ready="team.ready ? 'true' : 'false'"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate font-sans text-sm font-bold uppercase tracking-[0.14em]">
            {{ teamName(team.team) }}
          </span>
        </div>
        <div class="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
          <MatchStartingLineup
            v-if="inlineTeamControls && !team.ready && summary.mode !== 'Players'"
            :match="match"
            :team="team.team"
            :check-in-label="checkInLabel"
            data-testid="overview-starting-lineup"
          />
          <span class="check-in-badge shrink-0 rounded px-2 py-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em]">
            {{ team.ready ? $t("match.lifecycle.ready") : $t("match.lifecycle.waiting_check_in") }}
          </span>
        </div>
      </li>
    </ul>

    <!-- The real check-in action, unchanged: it only appears for the viewer
         can_check_in allows (Players: any player; Captains: a captain;
         Admin: an administrator in the lineup). -->
    <template v-if="inlineTeamControls && summary.mode === 'Players'">
      <MatchStartingLineup
        v-for="team in summary.teams"
        :key="team.team"
        :match="match"
        :team="team.team"
        part="check-in"
        :check-in-label="checkInLabel"
        data-testid="overview-team-check-in"
      />
    </template>
    <CheckIntoMatch
      v-else-if="!inlineTeamControls"
      :match="match"
      :label="summary.mode === 'Captains' ? $t('match.lifecycle.check_in_team') : null"
    />

    <p
      v-if="summary.mode === 'Admin'"
      class="text-center text-sm text-muted-foreground"
      data-testid="check-in-admin"
    >
      {{ $t("match.lifecycle.admin_check_in") }}
    </p>
    <p
      v-else-if="expired"
      class="text-center text-sm text-muted-foreground"
      data-testid="check-in-expired"
    >
      {{ $t("match.lifecycle.check_in_over") }}
    </p>
    <p
      v-if="match.can_start"
      class="text-center text-xs text-muted-foreground"
      data-testid="check-in-organizer"
    >
      {{ $t("match.lifecycle.organizer_can_start") }}
    </p>
  </section>
</template>

<script lang="ts">
import { checkInSummary } from "~/utilities/matchLifecycle";

/**
 * Match check-in in the match's own model (check_in_setting). Readiness is
 * the server's lineup is_ready; the action is CheckIntoMatch as before.
 */
export default {
  components: { MatchStartingLineup },
  props: {
    match: {
      type: Object,
      required: true,
    },
  },
  methods: {
    teamName(team: 1 | 2) {
      return (
        this.match[`lineup_${team}`]?.name || this.$t(`match.lineup.lineup_${team}`)
      );
    },
    teamPlayers(team: 1 | 2) {
      return this.match[`lineup_${team}`]?.lineup_players ?? [];
    },
  },
  computed: {
    summary() {
      return checkInSummary(this.match);
    },
    // A tournament match's Check-in Time passed with nobody ready: the
    // server cleared cancels_at and paged an organizer (CancelExpiredMatches).
    // Other matches may simply have no check-in deadline at all.
    // A tournament match keeps Edit Lineup and the team check-in in each
    // team own row; other matches keep the one check-in button below.
    checkInLabel() {
      return this.summary.mode === "Captains"
        ? this.$t("match.lifecycle.check_in_team")
        : null;
    },
    inlineTeamControls() {
      return !!this.match.is_tournament_match;
    },
    expired() {
      return !!this.match.is_tournament_match && !this.match.cancels_at;
    },
  },
};
</script>

<style scoped>
.check-in-team {
  --tone: var(--tac-amber);
  border-color: hsl(var(--border));
  background: hsl(var(--card) / 0.4);
}
.check-in-team.team-2 {
  --tone: 200 90% 62%;
}
.check-in-team.is-ready {
  border-color: hsl(var(--tone) / 0.6);
  background: hsl(var(--tone) / 0.08);
}
.check-in-badge {
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 0.6);
}
.check-in-team.is-ready .check-in-badge {
  color: hsl(var(--tone));
  background: hsl(var(--tone) / 0.15);
}
.check-mark {
  border: 1px solid hsl(var(--border));
  color: hsl(var(--tone));
}
.check-mark.is-checked {
  border-color: hsl(var(--tone) / 0.6);
  background: hsl(var(--tone) / 0.18);
}
</style>
