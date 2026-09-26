<script setup lang="ts">
import WebcamTokenJoin from "~/components/webcam/WebcamTokenJoin.vue";
import { createTournamentWebcamTokenRoom } from "~/composables/useWebcamRoomApi";

// Token-gated phone/QR join page for the tournament webcam support room.
// The token (minted by TournamentCallService after an access check) is
// re-validated by the API on every request.
definePageMeta({ layout: false });

const route = useRoute();
const room = createTournamentWebcamTokenRoom();
</script>

<template>
  <WebcamTokenJoin :room="room" :token="String(route.params.token)" />
</template>
