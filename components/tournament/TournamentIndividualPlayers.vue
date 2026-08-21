<script setup lang="ts">
import { UserX } from "lucide-vue-next";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import PlayerSearch from "~/components/PlayerSearch.vue";
import TournamentAttendanceBadge from "~/components/tournament/TournamentAttendanceBadge.vue";
</script>

<template>
  <div class="min-w-0 space-y-6">
    <p v-if="closesAtNote" class="text-xs text-muted-foreground">
      {{ closesAtNote }}
    </p>
    <section>
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3
          class="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{
            $t("tournament.players.registered", {
              count: registeredPlayers.length,
            })
          }}
        </h3>
        <!-- Organizer/admin only. Adds an existing DEAFCS player through the
             normal sign-up pipeline (capacity, waitlist, created_at priority
             and late auto-check-in all come from the backend), so there is no
             organizer-only fast lane. Reuses the same PlayerSearch the
             tournament roster uses, including its min_role filtering. -->
        <PlayerSearch
          v-if="canAddPlayers"
          :label="$t('tournament.players.add_player')"
          :exclude="signedUpSteamIds"
          :registeredOnly="true"
          :match-type="tournament?.options?.type"
          :min-role="tournament?.min_role"
          @selected="addPlayer"
        />
      </div>
      <div
        v-if="registeredPlayers.length === 0"
        class="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground"
      >
        {{ $t("tournament.players.none_yet") }}
      </div>
      <ul v-else class="space-y-2">
        <li
          v-for="signup in registeredPlayers"
          :key="signup.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
        >
          <PlayerDisplay :player="signup.player" class="min-w-0 flex-1" />
          <TournamentAttendanceBadge
            v-if="showAttendanceStatus"
            :checked-in="!!signup.checked_in_at"
          />
        </li>
      </ul>
    </section>

    <section v-if="waitlistedPlayers.length">
      <h3
        class="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
      >
        {{
          $t("tournament.players.waitlist", { count: waitlistedPlayers.length })
        }}
      </h3>
      <ul class="space-y-2">
        <li
          v-for="signup in waitlistedPlayers"
          :key="signup.id"
          class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/20 px-3 py-2.5"
        >
          <PlayerDisplay :player="signup.player" class="min-w-0 flex-1" />
          <!-- Waitlisted and checked in are two separate facts: the section
               already says "waitlist", so the badge stays green for a player
               who has done what was asked and only changes its wording. -->
          <TournamentAttendanceBadge
            v-if="showAttendanceStatus"
            :checked-in="!!signup.checked_in_at"
            variant="waitlisted"
          />
        </li>
      </ul>
    </section>

    <section v-if="removedPlayers.length">
      <h3
        class="mb-3 flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
      >
        <UserX class="h-3.5 w-3.5" />
        {{ $t("tournament.players.removed", { count: removedPlayers.length }) }}
      </h3>
      <ul class="space-y-2">
        <li
          v-for="signup in removedPlayers"
          :key="signup.id"
          class="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 opacity-70"
        >
          <PlayerDisplay :player="signup.player" class="min-w-0 flex-1" />
        </li>
      </ul>
    </section>
  </div>
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";
import {
  attendanceWindow,
  formatClockTime,
  showAttendanceStatuses,
} from "~/utilities/tournamentAttendance";

export default {
  props: {
    tournament: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      addingPlayer: false,
    };
  },
  computed: {
    signups() {
      return this.tournament?.individual_signups ?? [];
    },
    registeredPlayers() {
      return this.signups.filter((s: any) => s.status === "Registered");
    },
    waitlistedPlayers() {
      return this.signups.filter((s: any) => s.status === "Waitlisted");
    },
    removedPlayers() {
      return this.signups.filter((s: any) => s.status === "Removed");
    },
    // Only meaningful while registration/check-in are still ahead of us --
    // once closed, teams have already been generated.
    closesAtNote() {
      if (this.tournament.status !== "RegistrationOpen") {
        return null;
      }
      const window = attendanceWindow(this.tournament as any);
      if (!window) {
        return null;
      }
      return this.$t("tournament.attendance.closes_note", {
        time: formatClockTime(window.closesAt),
      });
    },
    // Public: the individual sign-up list is already visible to everyone, so
    // its attendance state is too. Same shared lifecycle as team tournaments.
    showAttendanceStatus() {
      return showAttendanceStatuses(this.tournament as any);
    },
    // The backend refuses anything else (RegistrationOpen +
    // individual_registration_enabled + organizer), so the control simply
    // matches those conditions rather than inventing its own.
    canAddPlayers() {
      return (
        !!this.tournament?.is_organizer &&
        this.tournament?.status === "RegistrationOpen"
      );
    },
    // Already-signed-up players (in any state, including Removed) are
    // filtered out of the picker rather than offered and then rejected.
    signedUpSteamIds() {
      return this.signups.map((s: any) => String(s.player_steam_id));
    },
  },
  methods: {
    async addPlayer(player: { steam_id: string }) {
      if (this.addingPlayer || !player?.steam_id) return;
      this.addingPlayer = true;
      try {
        const { data } = await this.$apollo.mutate({
          mutation: generateMutation({
            addTournamentIndividualPlayer: [
              {
                tournament_id: this.tournament.id,
                player_steam_id: String(player.steam_id),
              },
              { success: true, status: true, checked_in: true },
            ],
          }),
        });
        const status = data?.addTournamentIndividualPlayer?.status;
        toast({
          title:
            status === "Waitlisted"
              ? this.$t("tournament.players.add_player_waitlisted")
              : this.$t("tournament.players.add_player_added"),
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("tournament.players.add_player_failed"),
          description: (error as Error).message,
        });
      } finally {
        this.addingPlayer = false;
      }
    },
  },
};
</script>
