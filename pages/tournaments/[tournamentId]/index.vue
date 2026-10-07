<script lang="ts" setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import TournamentDetail from "~/components/tournament/TournamentDetail.vue";

// The public page and the Manage console are ONE page component: /manage is a
// second route to this same file (nuxt.config.ts pages:extend), so
// Public <-> Manage, and Manage section switches, never remount the tournament
// (no refetch, no reload flash). This follows current 5Stack, where Manage is
// a view of the tournament page rather than a separate page. app.vue gives both
// routes one page key; persistQueryKeys keeps ?section= out of it.
definePageMeta({ persistQueryKeys: ["section"] });

const route = useRoute();
const manageMode = computed(() => /\/manage\/?$/.test(route.path));
</script>

<template>
  <TournamentDetail :manage-mode="manageMode" />
</template>
