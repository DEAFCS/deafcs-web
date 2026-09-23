<script setup lang="ts">
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import BreadCrumbs from "~/components/BreadCrumbs.vue";
import SystemStatus from "./SystemStatus.vue";
import MatchLobbies from "./MatchLobbies.vue";
import DraftRoomNav from "./DraftRoomNav.vue";
import { useSidebar } from "~/components/ui/sidebar/utils";
import SpotlightPlayerSearch from "~/components/SpotlightPlayerSearch.vue";
import { MessageSquare } from "lucide-vue-next";
import { useHubState } from "@/composables/useHubState";
import { useChatTabs } from "~/composables/useChatTabs";
import AnimatedStat from "~/components/AnimatedStat.vue";

const { isMobile } = useSidebar();
const { openLastOrDefaultHub } = useHubState();
const { unreadCounts } = useChatTabs();
const totalUnreadMessages = computed(() =>
  Object.values(unreadCounts.value).reduce((sum, n) => sum + (n || 0), 0),
);
const chatBadgeLabel = computed(() =>
  totalUnreadMessages.value > 100 ? "100+" : String(totalUnreadMessages.value),
);
</script>

<template>
  <header
    class="flex h-[60px] shrink-0 items-center gap-2 transition-[width] ease-linear bg-background sticky top-0 z-50"
  >
    <div class="flex items-center justify-between w-full">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <SidebarTrigger class="shrink-0" />
        <Separator orientation="vertical" class="h-4 shrink-0" />
        <bread-crumbs></bread-crumbs>
      </div>

      <div class="flex items-center gap-4 shrink-0">
        <SpotlightPlayerSearch v-if="me" />

        <DraftRoomNav v-if="!isMobile"></DraftRoomNav>

        <MatchLobbies v-if="!isMobile"></MatchLobbies>

        <SystemStatus></SystemStatus>

        <Button
          variant="ghost"
          size="icon"
          class="h-7 w-7 md:hidden relative"
          @click="openLastOrDefaultHub()"
        >
          <span class="relative inline-flex">
            <MessageSquare class="h-4 w-4" />
            <span
              v-if="totalUnreadMessages > 0"
              class="absolute -top-1.5 -right-2 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[0.55rem] font-bold leading-none text-white shadow-sm ring-1 ring-background"
            >
              <AnimatedStat :value="chatBadgeLabel" />
            </span>
          </span>
          <span class="sr-only">{{
            $t("ui.tooltips.toggle_right_sidebar")
          }}</span>
        </Button>
      </div>
    </div>
  </header>
</template>

<script lang="ts">
export default {
  computed: {
    me() {
      return useAuthStore().me;
    },
  },
};
</script>
