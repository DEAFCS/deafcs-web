<script setup lang="ts">
import { computed } from "vue";
import WebcamCallRoom from "~/components/webcam/WebcamCallRoom.vue";
import { createLobbyWebcamRoom } from "~/composables/useWebcamRoomApi";

// Opened via window.open() from ChatPanel.vue's webcam button -- the
// popup window for the matchmaking-lobby call. The call UI itself lives
// in components/webcam/WebcamCallRoom.vue, shared with the tournament
// webcam support room.
definePageMeta({ layout: false });

const route = useRoute();
const room = computed(() => createLobbyWebcamRoom(String(route.params.lobbyId)));
</script>

<template>
  <WebcamCallRoom :key="room.roomId" :room="room" />
</template>
