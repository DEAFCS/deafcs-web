<!-- Shared vertical participant panel for chat surfaces (match-page
     ChatLobby, its global/Teleport variant, and the Right Hub ChatPanel) --
     one row per participant, avatar + full nickname, scrollable once tall,
     each row linking to the player's profile when a steam_id is present. -->
<script setup lang="ts">
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";

defineProps<{
  participants: Array<{
    steam_id?: string | null;
    name: string;
    avatar_url?: string | null;
  }>;
}>();
</script>

<template>
  <div
    class="rounded-md border bg-popover text-popover-foreground shadow-md p-3 text-xs max-h-52 overflow-y-auto"
  >
    <div v-if="!participants.length" class="text-muted-foreground text-[11px]">
      {{ $t("chat.no_participants", "No one else is in this chat yet.") }}
    </div>
    <ul v-else class="space-y-1.5">
      <li v-for="user in participants" :key="user.steam_id ?? user.name">
        <NuxtLink
          v-if="user.steam_id"
          :to="`/players/${user.steam_id}`"
          class="flex min-w-0 items-center gap-2 transition-colors hover:text-[hsl(var(--tac-amber))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] motion-reduce:transition-none"
        >
          <LiveAvatarImg
            :steam-id="user.steam_id"
            :fallback-url="user.avatar_url"
            img-class="h-5 w-5 rounded-full shrink-0"
          />
          <span class="min-w-0 truncate text-[11px]">{{ user.name }}</span>
        </NuxtLink>
        <div v-else class="flex min-w-0 items-center gap-2">
          <LiveAvatarImg
            :fallback-url="user.avatar_url"
            img-class="h-5 w-5 rounded-full shrink-0"
          />
          <span class="min-w-0 truncate text-[11px]">{{ user.name }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
