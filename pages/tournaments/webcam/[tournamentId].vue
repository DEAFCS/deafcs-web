<script setup lang="ts">
import { computed } from "vue";
import WebcamCallRoom from "~/components/webcam/WebcamCallRoom.vue";
import { createTournamentWebcamRoom } from "~/composables/useWebcamRoomApi";

// Opened via window.open() from the tournament chat's webcam button in
// ChatPanel.vue. Opt-in support room: opening it never rings or notifies
// anyone. Access, the 5-person cap and kicks are enforced by the API
// (TournamentCallService).
definePageMeta({ layout: false });

const route = useRoute();
const room = computed(() =>
  createTournamentWebcamRoom(String(route.params.tournamentId)),
);
</script>

<template>
  <WebcamCallRoom
    :key="room.roomId"
    :room="room"
    :title="$t('tournament.webcam.title', 'Tournament webcam')"
  />
</template>
