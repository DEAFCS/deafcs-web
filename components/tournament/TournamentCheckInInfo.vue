<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { CalendarClock } from "lucide-vue-next";
import { attendanceWindow } from "~/utilities/tournamentAttendance";
import TournamentTime from "~/components/tournament/TournamentTime.vue";
import { localTimeZoneName } from "~/utilities/tournamentTime";

// Public explanation of the tournament's attendance rules, in real clock
// times rather than the organizer's raw "60 / 15" offsets. Normal and
// verified users should be able to answer "when do I have to check in, and
// what happens if I registered early?" from the tournament page itself.
//
// The organizer keeps editing the offsets in the Information form; this is
// the read-only, calculated view of the same two numbers, sourced from the
// shared attendanceWindow() helper so the card badge, the join form and this
// panel can never drift apart.
const props = defineProps<{
  tournament: Record<string, any>;
  isIndividualRegistration: boolean;
}>();
const { t } = useI18n();

// Only meaningful while attendance is still ahead of, or being resolved for,
// this tournament. Once it is Live the window has already been applied and
// the rules are history.
const RELEVANT_STATUSES = ["RegistrationOpen", "RegistrationClosed"];

const attendanceTimes = computed(() =>
  attendanceWindow(props.tournament as any),
);

const visible = computed(
  () =>
    !!attendanceTimes.value &&
    RELEVANT_STATUSES.includes(props.tournament?.status as string),
);

const localZone = localTimeZoneName();
const localNotice = computed(() =>
  t("common.time.local_notice", { timezone: localZone }),
);

const ruleClasses = "flex gap-2";
const bulletClasses = "mt-[0.5em] h-[2px] w-2 shrink-0 bg-muted-foreground/50";
</script>

<template>
  <div
    v-if="visible"
    class="rounded-lg border border-border/60 bg-card/40 px-4 py-3"
  >
    <div
      class="flex items-center gap-2 font-mono text-[0.62rem] font-bold uppercase tracking-[0.2em] text-muted-foreground"
    >
      <CalendarClock class="h-3.5 w-3.5 text-[hsl(var(--tac-amber))]" />
      {{ t("tournament.attendance.info.title") }}
    </div>
    <p class="mt-1 text-[0.68rem] text-muted-foreground">
      {{ localNotice }}
    </p>

    <dl
      class="mt-2.5 flex flex-wrap gap-x-8 gap-y-1.5 font-mono text-[0.78rem] tabular-nums"
    >
      <div class="flex items-baseline gap-2">
        <dt class="text-muted-foreground">
          {{ t("tournament.attendance.info.window_label") }}
        </dt>
        <dd class="font-bold text-[hsl(var(--tac-amber))]">
          <TournamentTime
            :value="attendanceTimes?.opensAt"
            display="time"
          />–<TournamentTime
            :value="attendanceTimes?.closesAt"
            display="time"
          />
        </dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="text-muted-foreground">
          {{ t("tournament.attendance.info.closes_label") }}
        </dt>
        <dd class="font-bold text-foreground">
          <TournamentTime :value="attendanceTimes?.closesAt" display="time" />
        </dd>
      </div>
    </dl>

    <!-- Spelled out per registration type rather than looped over a key
         list, so every string stays statically greppable for the translation
         tooling. -->
    <ul class="mt-2.5 grid gap-1 text-xs leading-relaxed text-muted-foreground">
      <template v-if="isIndividualRegistration">
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <span>{{
            t("tournament.attendance.info.individual.pre_registered")
          }}</span>
        </li>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <span>{{
            t("tournament.attendance.info.individual.late_registered")
          }}</span>
        </li>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <i18n-t keypath="tournament.attendance.info.closes_at" tag="span">
            <template #time>
              <TournamentTime
                :value="attendanceTimes?.closesAt"
                display="time"
              />
            </template>
          </i18n-t>
        </li>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <span>{{
            t("tournament.attendance.info.individual.teams_generated")
          }}</span>
        </li>
      </template>
      <template v-else>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <span>{{ t("tournament.attendance.info.team.pre_registered") }}</span>
        </li>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <span>{{ t("tournament.attendance.info.team.representative") }}</span>
        </li>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <span>{{
            t("tournament.attendance.info.team.late_registered")
          }}</span>
        </li>
        <li :class="ruleClasses">
          <span :class="bulletClasses"></span>
          <i18n-t keypath="tournament.attendance.info.closes_at" tag="span">
            <template #time>
              <TournamentTime
                :value="attendanceTimes?.closesAt"
                display="time"
              />
            </template>
          </i18n-t>
        </li>
      </template>
    </ul>
  </div>
</template>
