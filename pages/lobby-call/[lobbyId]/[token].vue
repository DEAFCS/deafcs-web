<script setup lang="ts">
import WebcamTokenJoin from "~/components/webcam/WebcamTokenJoin.vue";
import { createLobbyWebcamTokenRoom } from "~/composables/useWebcamRoomApi";

// Standalone, chrome-free, token-gated join page for the matchmaking-lobby
// call -- reached by scanning the QR code with a phone (no DEAFCS login
// needed, see middleware/auth.global.ts). The call UI lives in
// components/webcam/WebcamTokenJoin.vue, shared with the tournament
// webcam support room.
definePageMeta({ layout: false });

const route = useRoute();
const room = createLobbyWebcamTokenRoom();
</script>

<template>
  <WebcamTokenJoin :room="room" :token="String(route.params.token)" />
</template>
