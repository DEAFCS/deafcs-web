<script setup lang="ts">
import { useRightSidebar } from "@/composables/useRightSidebar";
import { useSidebar } from "@/components/ui/sidebar/utils";
import { watch } from "vue";
import { useRoute } from "vue-router";

const { rightSidebarOpen, setRightSidebarOpen } = useRightSidebar();
const { isMobile, setOpenMobile, openMobile } = useSidebar();
const route = useRoute();

// On mobile, close the right hub whenever the page changes so clicking a
// notification link doesn't leave it open over the new page.
watch(
  () => route.fullPath,
  () => {
    if (isMobile.value && rightSidebarOpen.value) {
      setRightSidebarOpen(false);
    }
  },
);

// Sync rightSidebarOpen with the provider's openMobile on mobile.
// DEAFCS: a pin is a desktop state (see useRightSidebar). On a phone a tap
// opens the hub and it stays until closed, and a pin left over from a
// desktop session never holds the sheet over the page after a reload.
watch(
  rightSidebarOpen,
  (newValue) => {
    if (isMobile.value) {
      setOpenMobile(newValue);
    }
  },
  { immediate: true },
);

// Also sync in reverse: when mobile sidebar closes, update rightSidebarOpen.
watch(openMobile, (newValue) => {
  if (!isMobile.value) return;

  if (rightSidebarOpen.value !== newValue) {
    setRightSidebarOpen(newValue);
  }
});
</script>

<template>
  <!-- This component only syncs state, no rendering needed -->
</template>
