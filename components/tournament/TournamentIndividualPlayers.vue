<script setup lang="ts">
import { UserX } from "lucide-vue-next";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import PlayerSearch from "~/components/PlayerSearch.vue";
import TournamentAttendanceBadge from "~/components/tournament/TournamentAttendanceBadge.vue";
import TournamentIndividualPlayerActions from "~/components/tournament/TournamentIndividualPlayerActions.vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
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
          <!-- linkable + match-type turn this into the same identity block
               used everywhere else: profile link, real country flag, and the
               tournament's own mode ELO. -->
          <PlayerDisplay
            :player="signup.player"
            :linkable="true"
            :match-type="tournament?.options?.type"
            truncate-name
            class="min-w-0 flex-1"
          />
          <div class="flex shrink-0 items-center gap-2">
            <TournamentAttendanceBadge
              v-if="showAttendanceStatus"
              :checked-in="!!signup.checked_in_at"
            />
            <TournamentIndividualPlayerActions
              :signup="signup"
              :can-check-in="canCheckIn(signup)"
              :can-remove="canRemove(signup)"
              :is-self="isSelf(signup)"
              :busy="busyId === signup.id"
              @check-in="checkInPlayer(signup)"
              @remove="promptRemove(signup)"
            />
          </div>
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
          <PlayerDisplay
            :player="signup.player"
            :linkable="true"
            :match-type="tournament?.options?.type"
            truncate-name
            class="min-w-0 flex-1"
          />
          <div class="flex shrink-0 items-center gap-2">
            <!-- Waitlisted and checked in are two separate facts: the section
                 already says "waitlist", so the badge stays green for a player
                 who has done what was asked and only changes its wording. -->
            <TournamentAttendanceBadge
              v-if="showAttendanceStatus"
              :checked-in="!!signup.checked_in_at"
              variant="waitlisted"
            />
            <TournamentIndividualPlayerActions
              :signup="signup"
              :can-check-in="canCheckIn(signup)"
              :can-remove="canRemove(signup)"
              :is-self="isSelf(signup)"
              :busy="busyId === signup.id"
              @check-in="checkInPlayer(signup)"
              @remove="promptRemove(signup)"
            />
          </div>
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
          <PlayerDisplay
            :player="signup.player"
            :linkable="true"
            :match-type="tournament?.options?.type"
            truncate-name
            class="min-w-0 flex-1"
          />
        </li>
      </ul>
    </section>

    <AlertDialog :open="!!pendingRemoval">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{
              pendingRemovalIsSelf
                ? $t("tournament.players.confirm_leave")
                : $t("tournament.players.confirm_remove_player")
            }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{
              pendingRemovalIsSelf
                ? $t("tournament.players.leave_description")
                : $t("tournament.players.remove_player_description", {
                    name: pendingRemoval?.player?.name ?? "",
                  })
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel @click="pendingRemoval = null">
            {{ $t("common.cancel") }}
          </AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmRemove"
          >
            {{
              pendingRemovalIsSelf
                ? $t("tournament.team.leave_tournament")
                : $t("tournament.players.remove_player")
            }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";
import {
  attendanceWindow,
  attendanceCheckInOpen,
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
      busyId: null as string | null,
      pendingRemoval: null as any,
    };
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
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
    isOrganizer() {
      return !!this.tournament?.is_organizer;
    },
    // The registration/check-in cutoff is exactly the RegistrationOpen ->
    // RegistrationClosed transition, so participant edits track the status --
    // the same guard removeTournamentIndividualPlayer enforces server-side.
    participantsEditable() {
      return this.tournament?.status === "RegistrationOpen";
    },
    checkInWindowOpen() {
      return attendanceCheckInOpen(this.tournament as any);
    },
    canAddPlayers() {
      return this.isOrganizer && this.participantsEditable;
    },
    // Already-signed-up players (in any state, including Removed) are
    // filtered out of the picker rather than offered and then rejected.
    signedUpSteamIds() {
      return this.signups.map((s: any) => String(s.player_steam_id));
    },
    pendingRemovalIsSelf() {
      return this.pendingRemoval ? this.isSelf(this.pendingRemoval) : false;
    },
  },
  methods: {
    isSelf(signup: any) {
      const steamId = String(this.me?.steam_id ?? "");
      return !!steamId && String(signup.player_steam_id) === steamId;
    },
    // Organizer acting for someone else, or the player themselves. Both need
    // the window genuinely open -- an organizer gets no cutoff bypass.
    canCheckIn(signup: any) {
      if (signup.checked_in_at) return false;
      if (!this.checkInWindowOpen) return false;
      return this.isOrganizer || this.isSelf(signup);
    },
    canRemove(signup: any) {
      if (!this.participantsEditable) return false;
      if (signup.status === "Assigned" || signup.status === "Removed") {
        return false;
      }
      return this.isOrganizer || this.isSelf(signup);
    },
    async checkInPlayer(signup: any) {
      if (this.busyId) return;
      this.busyId = signup.id;
      try {
        // Checking yourself in goes through the player's own action; only an
        // organizer acting on somebody else needs the elevated one.
        const mutation = this.isSelf(signup)
          ? generateMutation({
              checkIntoTournament: [
                { tournament_id: this.tournament.id },
                { success: true },
              ],
            })
          : generateMutation({
              checkInTournamentIndividualPlayer: [
                {
                  tournament_id: this.tournament.id,
                  player_steam_id: String(signup.player_steam_id),
                },
                { success: true, status: true, already_checked_in: true },
              ],
            });
        await this.$apollo.mutate({ mutation });
        toast({ title: this.$t("tournament.players.check_in_player_success") });
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("tournament.players.check_in_player_failed"),
          description: (error as Error).message,
        });
      } finally {
        this.busyId = null;
      }
    },
    promptRemove(signup: any) {
      this.pendingRemoval = signup;
    },
    async confirmRemove() {
      const signup = this.pendingRemoval;
      this.pendingRemoval = null;
      if (!signup || this.busyId) return;
      const wasSelf = this.isSelf(signup);
      this.busyId = signup.id;
      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            removeTournamentIndividualPlayer: [
              {
                tournament_id: this.tournament.id,
                player_steam_id: String(signup.player_steam_id),
              },
              { success: true, was_self: true },
            ],
          }),
        });
        toast({
          title: wasSelf
            ? this.$t("tournament.players.leave_success")
            : this.$t("tournament.players.remove_player_success"),
        });
      } catch (error) {
        toast({
          variant: "destructive",
          title: wasSelf
            ? this.$t("tournament.players.leave_failed")
            : this.$t("tournament.players.remove_player_failed"),
          description: (error as Error).message,
        });
      } finally {
        this.busyId = null;
      }
    },
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
