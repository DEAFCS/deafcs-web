<script setup lang="ts">
import {
  isMobileChatHubLayout,
  useRightSidebar,
} from "~/composables/useRightSidebar";

// Chat Hub header title for a Team Chat room: the team's logo and name, both
// linking to the team's page. Same markup, classes and behavior as
// ChatDirectProfileLink (5Stack's hub header, upstream ba0628b2): an amber
// hover with underline on the name, a mouse-only avatar link so the team is one
// keyboard stop, the room's subtitle underneath, and no card or tooltip that
// could stay behind.
//
// The link goes by the team's id (the room's lobby id), never its name, so a
// renamed team still resolves. The logo is shown as uploaded: no frame, tile
// or crop around it.
//
// On the mobile layout the open Chat Hub covers the page, so it is closed first
// while preserving its saved pin; on desktop the Hub stays as it is. Nothing
// here closes, pins or selects a room.
defineProps<{
  teamId: string;
  name: string;
  subtitle?: string;
  avatarUrl?: string;
}>();

const emit = defineEmits<{ navigate: [] }>();

const { setRightSidebarOpen } = useRightSidebar();

function closeHubOnMobile() {
  emit("navigate");
  if (isMobileChatHubLayout()) setRightSidebarOpen(false);
}
</script>

<template>
  <div class="flex min-w-0 items-center gap-3" data-testid="chat-team-profile">
    <NuxtLink
      :to="{ name: 'teams-id', params: { id: teamId } }"
      tabindex="-1"
      aria-hidden="true"
      class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-[0.58rem] font-bold text-foreground/80 transition-shadow duration-150 hover:ring-2 hover:ring-[hsl(var(--tac-amber)/0.6)] motion-reduce:transition-none"
      :class="avatarUrl ? 'bg-transparent' : ''"
      data-testid="chat-team-profile-avatar"
      @click="closeHubOnMobile"
    >
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        alt=""
        draggable="false"
        class="h-full w-full select-none object-contain"
      />
      <template v-else>{{ name.trim().slice(0, 2).toUpperCase() }}</template>
    </NuxtLink>
    <div class="min-w-0">
      <div class="flex min-w-0 items-center gap-2">
        <NuxtLink
          :to="{ name: 'teams-id', params: { id: teamId } }"
          class="truncate rounded-sm text-xs font-semibold text-foreground underline-offset-2 transition-colors duration-150 hover:text-[hsl(var(--tac-amber))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] motion-reduce:transition-none"
          :aria-label="`View ${name} team page`"
          data-testid="chat-team-profile-link"
          @click="closeHubOnMobile"
        >
          {{ name }}
        </NuxtLink>
      </div>
      <div
        v-if="subtitle"
        class="flex items-center gap-2 truncate text-[10px] text-muted-foreground"
      >
        <span>{{ subtitle }}</span>
      </div>
    </div>
  </div>
</template>
