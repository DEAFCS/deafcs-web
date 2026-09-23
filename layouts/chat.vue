<script setup lang="ts">
// Minimal layout for pop-out chat window: no nav, no sidebar, no header.
</script>

<template>
  <div class="h-screen w-screen flex flex-col overflow-hidden bg-background">
    <slot name="website-restriction-notice"></slot>
    <div class="flex-1 min-h-0 overflow-hidden">
      <slot />
    </div>
  </div>
</template>
