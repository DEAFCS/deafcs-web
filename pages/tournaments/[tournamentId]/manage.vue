<script setup lang="ts">
import TournamentDetail from "~/components/tournament/TournamentDetail.vue";

// The section is a view of this console, not a new page. Without this the
// NuxtPage key changes on every ?section= switch and the whole console
// remounts. Same approach as 5Stack WEB 25dbf95d (persistQueryKeys on the
// tournament page); MIT Copyright (c) 2025 5Stack.gg.
definePageMeta({ persistQueryKeys: ["section"] });
</script>

<template>
  <TournamentDetail manage-mode />
</template>
