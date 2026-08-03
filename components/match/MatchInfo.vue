<script setup lang="ts">
import { Card, CardContent } from "~/components/ui/card";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import AssignCoachToLineup from "~/components/match/AssignCoachToLineup.vue";
import ScheduleMatch from "~/components/match/ScheduleMatch.vue";
import CheckIntoMatch from "~/components/match/CheckIntoMatch.vue";
import QuickMatchConnect from "~/components/match/QuickMatchConnect.vue";
import { e_match_status_enum } from "~/generated/zeus";
import { buildLineupAvatarOverride } from "~/utilities/teamRosterOverride";
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

    <!-- Time to connect — live countdown before the match auto-cancels,
         shown big/bold (Faceit-style) since the small header version was
         hard to read. -->
    <div
      v-if="showQuickConnectSection && match.cancels_at"
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
    };
  },
  unmounted() {
    if (this.autoCancelInterval) {
      clearInterval(this.autoCancelInterval);
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
  },
  computed: {
    formattedAutoCancelCountdown() {
      const total = Math.max(0, this.autoCancelRemainingSeconds);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
      const ss = String(s).padStart(2, "0");
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
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
        this.showQuickConnectSection
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
