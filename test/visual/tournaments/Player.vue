<script setup lang="ts">defineProps<{ player: any }>();</script>
<template><span class="flex min-w-0 items-center gap-2"><span class="h-6 w-6 shrink-0 rounded bg-muted"></span><span class="truncate">{{ player?.name }}</span></span></template>
