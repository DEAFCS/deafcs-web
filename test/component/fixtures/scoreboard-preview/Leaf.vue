<script setup lang="ts">
defineProps<{ player?: any; member?: any }>();
</script>
<template><span>{{ player?.name || member?.player?.name }}<slot /></span></template>
