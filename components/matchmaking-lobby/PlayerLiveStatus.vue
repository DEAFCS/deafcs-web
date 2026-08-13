<script lang="ts" setup>
import { useFriendStatus } from "~/composables/useFriendStatus";
import FriendMatchPreview from "~/components/matchmaking-lobby/FriendMatchPreview.vue";

const props = withDefaults(
  defineProps<{
    player: any;
    online?: boolean;
    showOffline?: boolean;
  }>(),
  { online: false, showOffline: false },
);

const { currentMatch } = useFriendStatus(
  () => props.player,
  () => props.online,
);
</script>

<template>
  <FriendMatchPreview v-if="currentMatch" :match="currentMatch" class="w-full" />
</template>
