<!-- Adapted from 5Stack WEB b4b83f23c8b1cb8851d421eee76498b766b5d899; MIT Copyright (c) 2025 5Stack.gg; see LICENSE. -->
<script setup lang="ts">
import { computed } from "vue";
import { attendanceWindow } from "~/utilities/tournamentAttendance";
import TournamentCheckInBefore from "~/components/tournament/TournamentCheckInBefore.vue";

// V1 timing and registration stay on the legacy attendance/action path.
// Only the public explanation is shared with the upstream v2 presentation.
const props = defineProps<{
  tournament: Record<string, any>;
  isIndividualRegistration: boolean;
  alreadyEntered?: boolean;
}>();
const emit = defineEmits<{ (e: "register"): void }>();
const attendanceTimes = computed(() => attendanceWindow(props.tournament));
const visible = computed(() => !!attendanceTimes.value &&
  ["RegistrationOpen", "RegistrationClosed"].includes(props.tournament?.status));
const canRegister = computed(() => !props.alreadyEntered &&
  props.tournament?.status === "RegistrationOpen" && props.tournament?.can_join === true);
</script>

<template>
  <section v-if="visible" class="relative mt-4 rounded-lg border border-border px-6 py-5 [background:linear-gradient(180deg,hsl(var(--card)_/_0.65)_0%,hsl(var(--card)_/_0.35)_100%)] [backdrop-filter:blur(6px)]">
    <TournamentCheckInBefore
      :opens-at="attendanceTimes?.opensAt"
      :closes-at="attendanceTimes?.closesAt"
      :can-register="canRegister"
      @register="emit('register')"
    />
  </section>
</template>