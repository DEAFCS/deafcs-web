<script setup lang="ts">
import { Card, CardContent } from "~/components/ui/card";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import AssignCoachToLineup from "~/components/match/AssignCoachToLineup.vue";
import ScheduleMatch from "~/components/match/ScheduleMatch.vue";
import CheckIntoMatch from "~/components/match/CheckIntoMatch.vue";
import QuickMatchConnect from "~/components/match/QuickMatchConnect.vue";
import { e_match_status_enum } from "~/generated/zeus";
import {
  buildLineupAvatarOverride,
  matchAllowsRosterImage,
} from "~/utilities/teamRosterOverride";
</script>

<template>
  <div v-if="hasContent" class="flex flex-col gap-4">
    <!-- Action Panel — Check In / Schedule -->
    <div
      v-if="match.can_schedule || showCheckInSection"
      class="rounded-xl border border-white/10 bg-background/80 backdrop-blur-sm p-4 flex flex-col gap-3"
    >
      <ScheduleMatch :match="match" v-if="match.can_schedule" />
      <CheckIntoMatch :match="match" v-if="showCheckInSection" />
    </div>

    <!-- Time to connect — live countdown before the match auto-cancels
         (Auto Cancel Duration), shown big/bold (Faceit-style). Only
         while match.cancels_at is actually a connect deadline (pre-live:
         WaitingForCheckIn/Scheduled/PickingPlayers/WaitingForServer) --
         excluded once Live, where cancels_at instead holds the much
         longer "hung live match" safety-net deadline (~3h out, see
         tbu_match_maps.sql's Knife/Live branch), which isn't a
         connect deadline at all and was confusing shown here. Same
         exclusion list as the small header "Auto Canceling" badge
         (pages/matches/[id]/index.vue's showAutoCancel). -->
    <div
      v-if="showConnectCountdown"
      class="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-background/80 backdrop-blur-sm p-4"
    >
      <span
        class="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {{ $t("match.time_to_connect") }}
      </span>
      <span
        class="font-mono text-3xl font-bold leading-none tabular-nums text-destructive"
      >
        {{ formattedAutoCancelCountdown }}
      </span>
    </div>

    <!-- Stats-ready countdown — shown once the match has actually ended
         (mirrors the game-server's own "Stats will be available in ~2
         minutes" chat message, see AnnounceSeriesProgress). -->
    <div
      v-if="showStatsCountdown"
      class="flex flex-col items-center gap-1 rounded-xl border border-white/10 bg-background/80 backdrop-blur-sm p-4"
    >
      <span
        class="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
      >
        {{ $t("match.stats_ready_in") }}
      </span>
      <span
        class="font-mono text-3xl font-bold leading-none tabular-nums text-primary"
      >
        {{ formattedStatsCountdown }}
      </span>
    </div>

    <!-- Server Connect — standalone -->
    <QuickMatchConnect
      :match="match"
      :hide-booting="hideBooting"
      v-if="showQuickConnectSection"
    />

    <!-- Coaches -->
    <Card v-if="match.options.coaches">
      <CardContent class="flex flex-col gap-4 p-6">
        <h3 class="font-semibold text-lg">{{ $t("common.coaches") }}</h3>
        <ul class="flex flex-col gap-6">
          <li
            v-for="lineup in [match.lineup_1, match.lineup_2]"
            :key="lineup.name"
            class="flex flex-col gap-2"
          >
            <div class="text-muted-foreground">{{ lineup.name }}</div>
            <PlayerDisplay
              v-if="lineup.coach"
              :player="lineup.coach"
              :avatar-override="
                buildLineupAvatarOverride(lineup)(lineup.coach.steam_id)
              "
              :allow-roster-image="allowRosterImage"
            />
            <AssignCoachToLineup
              v-if="lineup.can_update_lineup"
              :lineup="lineup"
              :exclude="excludePlayers"
            />
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>

<script lang="ts">
export default {
  props: {
    match: {
      type: Object,
      required: true,
    },
    // In the draft room the booting state is shown by the maps/"Match Starting"
    // panel, so suppress QuickMatchConnect's duplicate booting spinner there.
    hideBooting: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      autoCancelRemainingSeconds: 0,
      autoCancelInterval: undefined as ReturnType<typeof setInterval> | undefined,
      statsRemainingSeconds: 0,
      statsInterval: undefined as ReturnType<typeof setInterval> | undefined,
    };
  },
  unmounted() {
    if (this.autoCancelInterval) {
      clearInterval(this.autoCancelInterval);
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
  },
  watch: {
    "match.cancels_at": {
      immediate: true,
      handler(cancelsAt) {
        if (this.autoCancelInterval) {
          clearInterval(this.autoCancelInterval);
          this.autoCancelInterval = undefined;
        }
        if (!cancelsAt) {
          this.autoCancelRemainingSeconds = 0;
          return;
        }
        this.updateAutoCancelCountdown();
        this.autoCancelInterval = setInterval(this.updateAutoCancelCountdown, 1000);
      },
    },
    "match.ended_at": {
      immediate: true,
      handler() {
        this.setupStatsCountdown();
      },
    },
    "match.status": {
      handler() {
        this.setupStatsCountdown();
      },
    },
  },
  methods: {
    updateAutoCancelCountdown() {
      const cancelsAt = this.match?.cancels_at;
      if (!cancelsAt) {
        this.autoCancelRemainingSeconds = 0;
        return;
      }
      const diff = Math.floor(
        (new Date(cancelsAt).getTime() - Date.now()) / 1000,
      );
      this.autoCancelRemainingSeconds = Math.max(0, diff);
    },
    setupStatsCountdown() {
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = undefined;
      }
      if (!this.isMatchOver || !this.match?.ended_at) {
        this.statsRemainingSeconds = 0;
        return;
      }
      this.updateStatsCountdown();
      this.statsInterval = setInterval(this.updateStatsCountdown, 1000);
    },
    updateStatsCountdown() {
      if (!this.isMatchOver || !this.match?.ended_at) {
        this.statsRemainingSeconds = 0;
        return;
      }
      // Mirrors the ~2min window the game-server announces in chat
      // (AnnounceSeriesProgress) once a map decides the match.
      const statsReadyAt =
        new Date(this.match.ended_at).getTime() + 2 * 60 * 1000;
      const diff = Math.floor((statsReadyAt - Date.now()) / 1000);
      this.statsRemainingSeconds = Math.max(0, diff);
    },
  },
  computed: {
    // MM/Draft matches must stay avatar-only; only a real tournament match
    // may fall through to a roster image.
    allowRosterImage() {
      return matchAllowsRosterImage(this.match);
    },
    formattedAutoCancelCountdown() {
      const total = Math.max(0, this.autoCancelRemainingSeconds);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
      const ss = String(s).padStart(2, "0");
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },
    // matches.status has no separate "Warmup" value -- it flips straight
    // from WaitingForServer to Live the moment a server is assigned/booted,
    // and STAYS Live for the rest of the map (through Knife and actual live
    // rounds) and the rest of the series. So match.status === Live does NOT
    // mean "already playing" -- it can just as easily mean "server's up,
    // still waiting for everyone to connect during warmup". Warmup is only
    // tracked at the per-map level (match_maps.status), which is what
    // actually determines whether cancels_at is a genuine connect deadline
    // (Warmup) or the unrelated "hung live match" safety net (Knife/Live/
    // Overtime, see tbu_match_maps.sql) -- so once matches.status is Live,
    // fall through to checking the current map's own status instead.
    currentMatchMap() {
      return this.match?.match_maps?.find((m: any) => m.is_current_map);
    },
    showConnectCountdown() {
      if (
        !this.match?.cancels_at ||
        this.match.status === e_match_status_enum.Veto ||
        this.match.status === e_match_status_enum.Canceled
      ) {
        return false;
      }

      if (this.match.status !== e_match_status_enum.Live) {
        return true;
      }

      return this.currentMatchMap?.status === "Warmup";
    },
    // A finished/decided match -- Canceled is deliberately excluded, no
    // stats get generated for a match that never actually played out.
    isMatchOver() {
      return [
        e_match_status_enum.Finished,
        e_match_status_enum.Forfeit,
        e_match_status_enum.Surrendered,
        e_match_status_enum.Tie,
      ].includes(this.match?.status);
    },
    showStatsCountdown() {
      return this.isMatchOver && this.statsRemainingSeconds > 0;
    },
    formattedStatsCountdown() {
      const total = Math.max(0, this.statsRemainingSeconds);
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${String(s).padStart(2, "0")}`;
    },
    me() {
      return useAuthStore().me;
    },
    players() {
      if (!this.match) {
        return [];
      }

      const players = [];

      players.push(...this.match.lineup_1.lineup_players);
      players.push(...this.match.lineup_2.lineup_players);

      return players;
    },
    isInMatch() {
      return this.players.find((player) => {
        return player.steam_id === this.me?.steam_id;
      });
    },
    showCheckInSection() {
      return !!this.isInMatch && this.match.can_check_in;
    },
    showQuickConnectSection() {
      return this.match.status === e_match_status_enum.Live && !!this.me;
    },
    showAnyActionSection() {
      return (
        this.match.can_schedule ||
        this.showCheckInSection ||
        this.showQuickConnectSection ||
        this.showConnectCountdown ||
        this.showStatsCountdown
      );
    },
    hasContent() {
      return this.showAnyActionSection || this.match.options.coaches;
    },
    excludePlayers() {
      const players = [];

      players.push(...this.match.lineup_1.lineup_players);
      players.push(...this.match.lineup_2.lineup_players);

      if (this.match.lineup_1.coach) {
        players.push(this.match.lineup_1.coach);
      }

      if (this.match.lineup_2.coach) {
        players.push(this.match.lineup_2.coach);
      }

      return players;
    },
  },
};
</script>
