<script setup lang="ts">
import { CheckCircle2, Clock, UserX } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
</script>

<template>
  <div class="grid gap-6 items-start lg:grid-cols-[minmax(0,1fr)_320px]">
    <div class="min-w-0 space-y-6">
      <p
        v-if="closesAtNote"
        class="text-xs text-muted-foreground"
      >
        {{ closesAtNote }}
      </p>
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
            {{ $t("tournament.players.registered", { count: registeredPlayers.length }) }}
          </h3>
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
            <span
              v-if="checkInEverOpened"
              class="shrink-0"
              :title="
                signup.checked_in_at
                  ? $t('tournament.players.checked_in')
                  : $t('tournament.players.not_checked_in')
              "
            >
              <CheckCircle2
                v-if="signup.checked_in_at"
                class="h-4 w-4 text-[hsl(var(--tac-amber))]"
              />
              <Clock v-else class="h-4 w-4 text-muted-foreground" />
            </span>
          </li>
        </ul>
      </section>

      <section v-if="waitlistedPlayers.length">
        <h3 class="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {{ $t("tournament.players.waitlist", { count: waitlistedPlayers.length }) }}
        </h3>
        <ul class="space-y-2">
          <li
            v-for="signup in waitlistedPlayers"
            :key="signup.id"
            class="flex items-center gap-3 rounded-lg border border-border/60 bg-card/20 px-3 py-2.5 opacity-70"
          >
            <PlayerDisplay :player="signup.player" class="min-w-0 flex-1" />
            <span
              v-if="checkInEverOpened"
              class="shrink-0"
              :title="
                signup.checked_in_at
                  ? $t('tournament.attendance.waitlisted_checked_in')
                  : $t('tournament.players.not_checked_in')
              "
            >
              <CheckCircle2
                v-if="signup.checked_in_at"
                class="h-4 w-4 text-[hsl(var(--tac-amber))]"
              />
              <Clock v-else class="h-4 w-4 text-muted-foreground" />
            </span>
          </li>
        </ul>
      </section>

      <section v-if="removedPlayers.length">
        <h3 class="mb-3 flex items-center gap-1.5 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
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

    <aside v-if="tournament.is_organizer" class="lg:sticky lg:top-6 space-y-3">
      <div class="rounded-lg border border-border/60 bg-card/40 p-4 space-y-3">
        <h4 class="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
          {{ $t("tournament.players.check_in.title") }}
        </h4>

        <template v-if="checkInActive">
          <p class="text-sm text-muted-foreground">
            {{ $t("tournament.players.check_in.in_progress") }}
          </p>
          <Button
            size="sm"
            variant="destructive"
            class="w-full"
            :disabled="stopping"
            @click="stopCheckIn"
          >
            {{ $t("tournament.players.check_in.stop") }}
          </Button>
        </template>
        <template v-else>
          <p class="text-xs text-muted-foreground">
            {{ $t("tournament.players.check_in.description") }}
          </p>
          <div class="flex items-center gap-2">
            <Input
              v-model.number="checkInMinutes"
              type="number"
              min="1"
              max="120"
              class="w-20"
            />
            <span class="text-xs text-muted-foreground">{{
              $t("tournament.players.check_in.minutes")
            }}</span>
          </div>
          <Button
            size="sm"
            class="w-full"
            :disabled="tournament.status !== 'RegistrationClosed' || starting"
            @click="startCheckIn"
          >
            {{ $t("tournament.players.check_in.start") }}
          </Button>
          <p
            v-if="tournament.status !== 'RegistrationClosed'"
            class="text-xs text-muted-foreground"
          >
            {{ $t("tournament.players.check_in.requires_closed_registration") }}
          </p>
        </template>
      </div>
    </aside>
  </div>
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";
import { attendanceWindow, formatClockTime } from "~/utilities/tournamentAttendance";

export default {
  props: {
    tournament: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      checkInMinutes: 5,
      starting: false,
      stopping: false,
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
    // Only meaningful while registration/check-in are still ahead of us --
    // once closed, teams have already been generated.
    closesAtNote() {
      if (this.tournament.status !== "RegistrationOpen") {
        return null;
      }
      const window = attendanceWindow(this.tournament);
      if (!window) {
        return null;
      }
      return this.$t("tournament.attendance.closes_note", {
        time: formatClockTime(window.closesAt),
      });
    },
    removedPlayers() {
      return this.signups.filter((s: any) => s.status === "Removed");
    },
    // Once a check-in window has ever been opened, every signup either has
    // a checked_in_at or doesn't -- show the status icon from then on
    // (rather than before any window has ever run, when the icon would
    // just be a confusing wall of "not checked in" for people who haven't
    // been asked to yet).
    checkInEverOpened() {
      return (
        !!this.tournament?.individual_check_in_ends_at ||
        this.signups.some((s: any) => s.checked_in_at || s.status === "Removed")
      );
    },
    checkInActive() {
      const endsAt = this.tournament?.individual_check_in_ends_at;
      return !!endsAt && new Date(endsAt) > new Date();
    },
  },
  methods: {
    async startCheckIn() {
      if (this.starting) return;
      this.starting = true;
      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            startTournamentIndividualCheckIn: [
              {
                tournament_id: this.tournament.id,
                duration_minutes: this.checkInMinutes,
              },
              { success: true },
            ],
          }),
        });
        toast({ title: this.$t("tournament.players.check_in.started") });
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("tournament.players.check_in.start_failed"),
          description: (error as Error).message,
        });
      } finally {
        this.starting = false;
      }
    },
    async stopCheckIn() {
      if (this.stopping) return;
      this.stopping = true;
      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            stopTournamentIndividualCheckIn: [
              { tournament_id: this.tournament.id },
              { success: true },
            ],
          }),
        });
        toast({ title: this.$t("tournament.players.check_in.stopped") });
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("tournament.players.check_in.stop_failed"),
          description: (error as Error).message,
        });
      } finally {
        this.stopping = false;
      }
    },
  },
};
</script>
