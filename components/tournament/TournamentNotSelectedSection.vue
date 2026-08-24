<script setup lang="ts">
import { computed } from "vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";
import { isFinalizedSitOut } from "~/utilities/tournamentAttendance";

// Public "Not selected" list, rendered directly under the generated Solo
// Random team grid once teams exist.
//
// Live testing found this was the one outcome the site never explained: with 9
// checked-in players and room for 4 full Wingman teams, the 9th could only
// work out what had happened by noticing they were absent from the teams, and
// nobody else could see who had sat out at all.
//
// Deliberately public rather than a private notice for the affected player:
// who is participating (and who is not) is already public tournament
// information -- every signup row is guest-selectable -- and the whole point
// is that the result is legible to everyone looking at the bracket, not only
// to the person it happened to.
//
// Carries no action controls. By the time this renders the pool is final, so
// there is nothing left to check in, remove, or leave.
const props = defineProps<{
  tournament: Record<string, any>;
}>();

const signups = computed(() => props.tournament?.individual_signups ?? []);

// Finalized and unassigned. isFinalizedSitOut requires generated teams to
// exist, so this is empty before the cutoff resolves -- and Removed / no-show
// players are excluded by it, since they are not in the Waitlisted state.
const notSelected = computed(() =>
  signups.value.filter((signup: any) =>
    isFinalizedSitOut(signup, signups.value),
  ),
);

const matchType = computed(() => props.tournament?.options?.type ?? null);
</script>

<template>
  <section v-if="notSelected.length" class="mt-6">
    <div :class="[tacticalSectionLabelClasses, 'mb-[0.85rem]']">
      <span :class="tacticalSectionTickClasses"></span>
      {{ $t("tournament.page.not_selected_section") }}
      <span
        class="rounded-full border border-border bg-muted/40 px-[0.45rem] py-[0.05rem] text-[0.62rem] tracking-[0.08em] text-muted-foreground"
      >
        {{ notSelected.length }}
      </span>
    </div>

    <p class="mb-3 max-w-[70ch] text-xs text-muted-foreground">
      {{ $t("tournament.attendance.not_selected.description") }}
    </p>

    <ul class="space-y-2">
      <li
        v-for="signup in notSelected"
        :key="signup.id"
        class="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/20 px-3 py-2.5"
      >
        <!-- Same identity block the Solo Random players list uses: avatar,
             real country flag, profile link and the tournament's own mode
             ELO all come from PlayerDisplay. -->
        <PlayerDisplay
          :player="signup.player"
          :linkable="true"
          :match-type="matchType"
          truncate-name
          class="min-w-0 flex-1"
        />
        <!-- Neutral grey: this is an outcome, not an attendance state, and
             must not read as pending, checked-in, or a no-show. -->
        <span
          class="inline-flex shrink-0 items-center whitespace-nowrap rounded border border-border bg-muted/40 px-[0.5rem] py-[0.2rem] font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"
        >
          {{ $t("tournament.attendance.not_selected.status") }}
        </span>
      </li>
    </ul>
  </section>
</template>
