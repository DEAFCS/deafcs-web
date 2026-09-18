<!--
  Mirrors the real ChatLobby.vue's root template shape (see
  components/chat/ChatLobby.vue): a Teleport-or-div pair (v-if/v-else)
  plus a sibling node conditionally rendered alongside it -- the same
  three-root shape that made ChatLobby a Vue Fragment once SanctionPlayer
  was added, which is what broke v-show at the <ChatLobby> call site.
-->
<script setup lang="ts">
defineProps<{ roomId: string; muted?: boolean }>();
</script>

<template>
  <Teleport to="body" v-if="false"><div>unused teleport branch</div></Teleport>
  <div v-else class="room-root" :data-room="roomId">
    <div class="room-messages">messages for {{ roomId }}</div>
    <input class="room-composer" placeholder="Type a message..." />
  </div>
  <div v-if="muted" class="sanction-drawer" :data-room="roomId">mute drawer</div>
</template>
