<script setup lang="ts">
import { computed } from "vue";
import FixedPartyCall from "~/components/calls/FixedPartyCall.vue";
import { verificationCallAdapter } from "~/components/calls/fixedPartyCallAdapters";

// The admin's separate call window, opened via window.open() by the camera
// icon on a verification application (pages/verification-applications/[id].vue,
// with ?ringing=1) so the admin can keep using DEAFCS in the main window
// while waiting. The applicant no longer comes here: accepting the
// "Admin is calling..." overlay opens the same call inline on the page
// they are already on (GlobalVerificationCallNotifier.vue).
definePageMeta({ layout: false });

const route = useRoute();
const applicationId = computed(() => String(route.params.applicationId));
const adapter = computed(() => verificationCallAdapter(applicationId.value));
</script>

<template>
  <FixedPartyCall
    :key="applicationId"
    :adapter="adapter"
    :title="$t('pages.verification_applications.call.title', 'Verification call')"
    :ringing="route.query.ringing === '1'"
    :ringing-text="
      $t('pages.verification_applications.call.waiting', 'Waiting for the applicant…')
    "
    :declined-title="$t('pages.verification_applications.call.declined_title', 'Call declined')"
    :no-answer-title="$t('pages.verification_applications.call.no_answer_title', 'No answer')"
    :declined-text="
      $t(
        'pages.verification_applications.call.declined',
        'The applicant declined the call.',
      )
    "
    :no-answer-text="
      $t(
        'pages.verification_applications.call.no_answer',
        'The applicant did not answer.',
      )
    "
  />
</template>
