<!--
  Mirrors the fixed components/hub/ChatPanel.vue: v-show moved onto a real
  DOM wrapper div around each room instead of onto the multi-root
  component itself.
-->
<script setup lang="ts">
import { ref } from "vue";
import MultiRootRoom from "./MultiRootRoom.vue";

defineProps<{ tabs: { id: string }[] }>();
const activeId = ref<string | null>(null);
const mutedRoom = ref<string | null>(null);
defineExpose({ activeId, mutedRoom });
</script>

<template>
  <div class="chat-panel">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      v-show="tab.id === activeId"
      class="room-wrapper"
    >
      <MultiRootRoom :room-id="tab.id" :muted="mutedRoom === tab.id" />
    </div>
  </div>
</template>
