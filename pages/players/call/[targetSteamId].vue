<script setup lang="ts">
import { computed } from "vue";
import FixedPartyCall from "~/components/calls/FixedPartyCall.vue";
import { adminCallAdapter } from "~/components/calls/fixedPartyCallAdapters";

// The admin's separate call window, opened via window.open() by the camera
// icon on a player profile (pages/players/[id].vue, with ?ringing=1) so the
// admin can keep using DEAFCS in the main window while waiting. The called
// player no longer comes here: accepting the "Admin is calling..." overlay
// opens the same call inline on the page they are already on
// (GlobalAdminCallNotifier.vue).
definePageMeta({ layout: false });

const route = useRoute();
const targetSteamId = computed(() => String(route.params.targetSteamId));
const adapter = computed(() => adminCallAdapter(targetSteamId.value));
</script>

<template>
  <FixedPartyCall
    :key="targetSteamId"
    :adapter="adapter"
    :title="$t('pages.players.call.title', 'Admin call')"
    :ringing="route.query.ringing === '1'"
    :ringing-text="$t('pages.players.call.waiting', 'Waiting for the player…')"
    :declined-title="$t('pages.players.call.declined_title', 'Call declined')"
    :no-answer-title="$t('pages.players.call.no_answer_title', 'No answer')"
    :declined-text="$t('pages.players.call.declined', 'The player declined the call.')"
    :no-answer-text="$t('pages.players.call.no_answer', 'The player did not answer.')"
  />
</template>
