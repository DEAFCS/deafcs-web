<!--
  Reproduces the ORIGINAL bug: v-show applied directly to the multi-root
  component, the exact pattern components/hub/ChatPanel.vue used before
  the fix (<ChatLobby v-show="tab.id === activeChatId" ... />).
-->
<script setup lang="ts">
import { ref } from "vue";
import MultiRootRoom from "./MultiRootRoom.vue";

defineProps<{ tabs: { id: string }[] }>();
const activeId = ref<string | null>(null);
defineExpose({ activeId });
</script>

<template>
  <div class="chat-panel">
    <MultiRootRoom
      v-for="tab in tabs"
      :key="tab.id"
      v-show="tab.id === activeId"
      :room-id="tab.id"
    />
  </div>
</template>
