<script setup lang="ts">
// Custom icon (not in lucide) -- a rounded-square "GIF" badge, matching
// the reference image exactly. Drawn at lucide's own 24x24/stroke-2
// conventions so it sits naturally next to other lucide icons.
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text
      x="12"
      y="13.2"
      text-anchor="middle"
      dominant-baseline="middle"
      fill="currentColor"
      stroke="none"
      font-size="8.5"
      font-weight="700"
      font-family="Arial, Helvetica, sans-serif"
    >GIF</text>
  </svg>
</template>
