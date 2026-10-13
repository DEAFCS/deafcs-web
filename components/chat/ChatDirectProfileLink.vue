<script setup lang="ts">
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";
import {
  isMobileChatHubLayout,
  useRightSidebar,
} from "~/composables/useRightSidebar";

// Chat Hub header title for a private (direct) message room: the other
// player's avatar and name, both linking to their profile.
//
// Markup and classes follow 5Stack's current hub header (components/hub/
// ChatPanel.vue, upstream ba0628b2): a round avatar link and a name link that
// turns amber with an underline on hover, with the room's subtitle underneath.
// The subtitle row can hold a button upstream, which a link can't contain, so
// the avatar is its own mouse-only link (out of the tab order and hidden from
// assistive tech) and the name is the one keyboard stop for the player. There
// is no card, background or tooltip, so nothing is left behind after the
// pointer moves on or the page navigates.
//
// Uses the same internal named-route NuxtLink as PlayerDisplay.vue and the
// Captain Pick / Match Overview profile controls, so it is plain same-context
// client-side navigation: no new-tab target, no popup window and no absolute
// URL that could trigger an "open in app" handoff. Website stays website, the
// app stays inside the app.
//
// On the mobile layout the open Chat Hub covers the page, so it is closed
// first while preserving its saved pin, and the NuxtLink then navigates as
// usual. On desktop the Hub stays as it is.
defineProps<{
  steamId: string;
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
  <div class="flex min-w-0 items-center gap-3" data-testid="chat-direct-profile">
    <NuxtLink
      :to="{ name: 'players-id', params: { id: steamId } }"
      tabindex="-1"
      aria-hidden="true"
      class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[0.58rem] font-bold text-foreground/80 transition-shadow duration-150 hover:ring-2 hover:ring-[hsl(var(--tac-amber)/0.6)] motion-reduce:transition-none"
      data-testid="chat-direct-profile-avatar"
      @click="closeHubOnMobile"
    >
      <LiveAvatarImg
        :steam-id="steamId"
        :fallback-url="avatarUrl"
        img-class="h-full w-full object-cover"
      />
    </NuxtLink>
    <div class="min-w-0">
      <div class="flex min-w-0 items-center gap-2">
        <NuxtLink
          :to="{ name: 'players-id', params: { id: steamId } }"
          class="truncate rounded-sm text-xs font-semibold text-foreground underline-offset-2 transition-colors duration-150 hover:text-[hsl(var(--tac-amber))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] motion-reduce:transition-none"
          :aria-label="`View ${name}'s profile`"
          data-testid="chat-direct-profile-link"
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
