<script setup lang="ts">
const route = useRoute();
await navigateTo({ path: `/tournaments/${route.params.tournamentId}/manage`, query: { section: "match-rules" } }, { replace: true });
</script>

<template><div /></template>
