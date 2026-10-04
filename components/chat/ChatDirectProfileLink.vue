<script setup lang="ts">
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";
import {
  isMobileChatHubLayout,
  useRightSidebar,
} from "~/composables/useRightSidebar";

// Chat Hub header title for a private (direct) message room: the other
// player's avatar + name, linked to their profile. Uses the same
// internal named-route NuxtLink as PlayerDisplay.vue and the Captain
// Pick / Match Overview profile controls, so it is plain same-context
// client-side navigation: no new-tab target, no popup window and no
// absolute URL that could trigger an "open in app" handoff. Website
// stays website, the app stays inside the app.
//
// On the mobile layout the open Chat Hub covers the page, so it is closed
// first (the Hub's own close, which also unpins it) and the NuxtLink then
// navigates as usual. On desktop the Hub stays as it is.
defineProps<{
  steamId: string;
  name: string;
  subtitle?: string;
  avatarUrl?: string;
}>();

const { setRightSidebarOpen } = useRightSidebar();

function closeHubOnMobile() {
  if (isMobileChatHubLayout()) setRightSidebarOpen(false);
}
</script>

<template>
  <NuxtLink
    :to="{ name: 'players-id', params: { id: steamId } }"
    class="group/dm-profile -m-1 flex min-w-0 items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    :aria-label="`View ${name}'s profile`"
    data-testid="chat-direct-profile-link"
    @click="closeHubOnMobile"
  >
    <span
      class="flex-shrink-0 w-7 h-7 rounded-md overflow-hidden ring-1 ring-inset ring-zinc-700 bg-zinc-900/80 group-hover/dm-profile:ring-zinc-500"
    >
      <LiveAvatarImg
        :steam-id="steamId"
        :fallback-url="avatarUrl"
        img-class="w-full h-full object-cover"
      />
    </span>
    <span class="min-w-0">
      <span
        class="block text-xs font-semibold text-foreground truncate group-hover/dm-profile:underline"
      >
        {{ name }}
      </span>
      <span class="block text-[10px] text-muted-foreground truncate">
        {{ subtitle }}
      </span>
    </span>
  </NuxtLink>
</template>
