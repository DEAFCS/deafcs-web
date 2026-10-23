<script setup lang="ts">
import TopoBackground from "@/layouts/components/TopoBackground.vue";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { computed, defineAsyncComponent, provide } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "~/stores/AuthStore";
import { useGtm } from "@/layouts/composables/useGtm";
import { useChatTabSetup } from "~/composables/useChatTabSetup";
import { useIncomingDirectMessages } from "~/composables/useIncomingDirectMessages";

const AppSidebar = defineAsyncComponent(
  () => import("@/components/AppSidebar.vue"),
);
const MainContent = defineAsyncComponent(
  () => import("@/layouts/components/MainContent.vue"),
);
const AppHeader = defineAsyncComponent(
  () => import("@/layouts/components/AppHeader.vue"),
);
const ApplicationSettingsShell = defineAsyncComponent(
  () => import("@/components/settings/ApplicationSettingsShell.vue"),
);
const ProfileSettingsShell = defineAsyncComponent(
  () => import("@/components/settings/ProfileSettingsShell.vue"),
);
const ClipDetailModal = defineAsyncComponent(
  () => import("~/components/clips/ClipDetailModal.vue"),
);
const ActionToasts = defineAsyncComponent(
  () => import("~/components/notification/ActionToasts.vue"),
);
const OrphanedUploadsDialog = defineAsyncComponent(
  () => import("~/components/settings/OrphanedUploadsDialog.vue"),
);
const GlobalLobbyCallNotifier = defineAsyncComponent(
  () => import("~/components/matchmaking-lobby/GlobalLobbyCallNotifier.vue"),
);
const GlobalVerificationCallNotifier = defineAsyncComponent(
  () => import("~/components/verification/GlobalVerificationCallNotifier.vue"),
);
const GlobalAdminCallNotifier = defineAsyncComponent(
  () => import("~/components/admin-calls/GlobalAdminCallNotifier.vue"),
);
const EnableNotificationsPrompt = defineAsyncComponent(
  () => import("~/components/notification/EnableNotificationsPrompt.vue"),
);
const TournamentCheckInOverlay = defineAsyncComponent(
  () => import("~/components/tournament/TournamentCheckInOverlay.vue"),
);
const TournamentTeamCheckInOverlay = defineAsyncComponent(
  () => import("~/components/tournament/TournamentTeamCheckInOverlay.vue"),
);
import { useClipModal } from "~/composables/useClipModal";

const { activeClipId } = useClipModal();

useGtm();
useChatTabSetup();
useIncomingDirectMessages();

const route = useRoute();
const authStore = useAuthStore();

// AppHeader loads MatchLobbies lazily, and the root Suspense holds the
// pre-loader until it arrives. Asking for it here, while AppHeader's own chunk
// is still on its way, keeps a signed-in boot from paying for the two one
// after the other.
if (authStore.me) {
  void import("~/layouts/components/MatchLobbies.vue");
}

// DEAFCS: everyone gets the left nav and the header beside it; the top bar is
// gone. (Staff used to be the only ones with it.) Kept as a flag because
// MainContent and others read it.
const showLeftNav = computed(() => true);

const containContent = computed(() => {
  if (route.name?.toString().startsWith("settings-application")) {
    return false;
  }

  switch (route.name) {
    case "apps-slug":
    case "news-manage-id":
    case "matches-id":
    // Upstream 5Stack: the utility board and the maps index need the full width.
    case "utility":
    case "utility-map":
    case "map-pools":
    case "game-server-nodes":
    case "system-metrics":
    case "system-logs":
    case "database":
    case "game-server-nodes-nodeId-files":
    case "dedicated-servers-serverId-files":
      return false;
    default:
      return true;
  }
});

const isApplicationSettings = computed(() =>
  route.path.startsWith("/settings/application"),
);
const isProfileSettings = computed(
  () => route.path.startsWith("/settings") && !isApplicationSettings.value,
);

// Provide values to MainContent
provide("showLeftNav", showLeftNav);
provide("containContent", containContent);
</script>

<template>
  <TopoBackground />

  <SidebarProvider class="relative z-10 !bg-transparent">
    <AppSidebar v-if="showLeftNav" />

    <SidebarInset
      class="flex flex-col overflow-y-auto overflow-x-hidden !bg-transparent"
      style="height: 100svh"
    >
      <AppHeader class="px-6" v-if="showLeftNav" />

      <MainContent class="flex-1">
        <slot name="website-restriction-notice"></slot>
        <ApplicationSettingsShell v-if="isApplicationSettings">
          <slot></slot>
        </ApplicationSettingsShell>
        <ProfileSettingsShell v-else-if="isProfileSettings">
          <slot></slot>
        </ProfileSettingsShell>
        <slot v-else></slot>
      </MainContent>
    </SidebarInset>
  </SidebarProvider>

  <div id="global-chat-container"></div>

  <ClipDetailModal :clip-id="activeClipId" />

  <OrphanedUploadsDialog />

  <GlobalLobbyCallNotifier />
  <GlobalVerificationCallNotifier />
  <GlobalAdminCallNotifier />

  <EnableNotificationsPrompt />

  <TournamentCheckInOverlay />

  <TournamentTeamCheckInOverlay />

  <ActionToasts v-if="authStore.me" />
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import { getCountryForTimezone } from "countries-and-timezones";

export default {
  watch: {
    detectedCountry: {
      immediate: true,
      async handler() {
        if (!this.me || this.me.country) {
          return;
        }

        await this.$apollo.mutate({
          mutation: generateMutation({
            update_players_by_pk: [
              {
                pk_columns: {
                  steam_id: this.me.steam_id,
                },
                _set: {
                  country: this.detectedCountry,
                },
              },
              {
                __typename: true,
              },
            ],
          }),
        });
      },
    },
  },

  computed: {
    me() {
      return useAuthStore().me;
    },
    detectedCountry() {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

      const country = getCountryForTimezone(timezone);

      if (country) {
        return country.id;
      }
    },
  },
};
</script>
