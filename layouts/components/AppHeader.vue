<script setup lang="ts">
import { formatBadgeCount } from "~/utilities/formatBadgeCount";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Separator } from "~/components/ui/separator";
import BreadCrumbs from "~/components/BreadCrumbs.vue";
import SystemStatus from "./SystemStatus.vue";
import MatchLobbies from "./MatchLobbies.vue";
import UtilityPracticeNav from "~/components/utility/UtilityPracticeNav.vue";
import DraftRoomNav from "./DraftRoomNav.vue";
import MobileBackButton from "./MobileBackButton.vue";
import { useSidebar } from "~/components/ui/sidebar/utils";
import SpotlightPlayerSearch from "~/components/SpotlightPlayerSearch.vue";
import { CheckCircle2, Crown, MessageSquare } from "lucide-vue-next";
import SteamIcon from "~/components/icons/SteamIcon.vue";
import { useMatchmakingStore } from "~/stores/MatchmakingStore";
import { useMatchReadyModal } from "~/composables/useMatchReadyModal";
import {
  getCaptainPickDraft,
  isCaptainPickInProgress,
  isMyCaptainPickTurn,
  pendingReadyCheck,
} from "~/utilities/captainPickDraft";
import { loginLinks } from "~/utilities/loginLinks";
import { useHubState } from "@/composables/useHubState";
import { useChatTabs } from "~/composables/useChatTabs";
import AnimatedStat from "~/components/AnimatedStat.vue";

const { isMobile } = useSidebar();
const route = useRoute();
const matchmakingStore = useMatchmakingStore();
const { openMatchReadyModal } = useMatchReadyModal();

// What the top bar used to carry for everyone, now that everyone has this
// header: the matchmaking check-in, the way back into a Captain Pick draft, and
// Sign in for visitors who are not logged in.
//
// Genuine matchmaking ready-check only. Active matches (Veto/Live/etc.) are
// already surfaced by the lineup pills in <MatchLobbies>. Past 10/10 a Captain
// Pick group is drafting, not checking in.
const pendingCheckIn = computed(() =>
  pendingReadyCheck(matchmakingStore.joinedMatchmakingQueues?.confirmation),
);
// A committed Captain Pick draft with no match yet: link back to it.
const activeCaptainPick = computed(() => {
  const draft = getCaptainPickDraft(
    matchmakingStore.joinedMatchmakingQueues?.confirmation,
  );
  return isCaptainPickInProgress(draft) ? draft : null;
});
const isMyCaptainPick = computed(() =>
  isMyCaptainPickTurn(activeCaptainPick.value, useAuthStore().me?.steam_id),
);
const loginButtonClasses =
  "group relative inline-flex items-center gap-[0.45rem] rounded-md border border-[hsl(var(--tac-amber)/0.55)] bg-[linear-gradient(180deg,hsl(var(--tac-amber)/0.14)_0%,hsl(var(--tac-amber)/0.06)_100%)] px-[0.8rem] py-[0.45rem] font-sans text-[0.68rem] font-bold uppercase tracking-[0.16em] text-topnav-foreground transition-[background-color,color,transform] duration-150 hover:bg-[linear-gradient(180deg,hsl(var(--tac-amber)/0.28)_0%,hsl(var(--tac-amber)/0.14)_100%)] active:translate-y-px sm:px-3 sm:py-[0.35rem] sm:text-[0.65rem] sm:tracking-[0.18em]";
const loginArrowClasses =
  "font-sans text-[hsl(var(--tac-amber))] transition-transform duration-150 group-hover:translate-x-[3px]";

function signIn() {
  window.location.href = `${loginLinks.steam}?redirect=${encodeURIComponent(window.location.toString())}`;
}
const { openLastOrDefaultHub } = useHubState();
const { unreadCounts } = useChatTabs();
const totalUnreadMessages = computed(() =>
  Object.values(unreadCounts.value).reduce((sum, n) => sum + (n || 0), 0),
);
const chatBadgeLabel = computed(() =>
  formatBadgeCount(totalUnreadMessages.value),
);
</script>

<template>
  <header
    class="flex h-[60px] shrink-0 items-center gap-2 transition-[width] ease-linear bg-background sticky top-0 z-50"
  >
    <div class="flex items-center justify-between w-full">
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <!-- DEAFCS: phone / installed-app Back for staff, who get this header
             instead of TopNav (see layouts/default.vue showLeftNav). -->
        <MobileBackButton v-if="isMobile" />
        <SidebarTrigger class="shrink-0" />
        <Separator orientation="vertical" class="h-4 shrink-0" />
        <bread-crumbs></bread-crumbs>
      </div>

      <div class="flex items-center gap-4 shrink-0">
        <SpotlightPlayerSearch v-if="me" />

        <template v-if="me">
          <button
            v-if="pendingCheckIn"
            type="button"
            class="relative inline-flex h-7 items-center gap-1.5 rounded-md border border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.08)] px-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-[hsl(var(--tac-amber))] transition-colors hover:bg-[hsl(var(--tac-amber)/0.15)]"
            :aria-label="$t('matchmaking.check_in')"
            @click="openMatchReadyModal()"
          >
            <span class="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--tac-amber))] opacity-75"
              ></span>
              <span
                class="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--tac-amber))]"
              ></span>
            </span>
            <CheckCircle2 class="h-3.5 w-3.5" />
            <span class="hidden sm:inline">{{
              $t("matchmaking.check_in")
            }}</span>
            <span v-if="pendingCheckIn" class="tabular-nums">
              {{ pendingCheckIn.confirmed }}/{{ pendingCheckIn.players }}
            </span>
          </button>
          <NuxtLink
            v-if="activeCaptainPick && route.path !== '/play/captain-pick'"
            to="/play/captain-pick"
            data-testid="captain-pick-nav"
            class="relative inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[0.7rem] uppercase tracking-[0.18em] transition-colors"
            :class="
              isMyCaptainPick
                ? 'border-[hsl(var(--tac-amber))] bg-[hsl(var(--tac-amber)/0.2)] text-[hsl(var(--tac-amber))]'
                : 'border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.08)] text-[hsl(var(--tac-amber))] hover:bg-[hsl(var(--tac-amber)/0.15)]'
            "
            :aria-label="
              isMyCaptainPick
                ? $t('matchmaking.captain_pick.your_pick_nav')
                : $t('matchmaking.captain_pick.nav')
            "
          >
            <span
              v-if="isMyCaptainPick"
              class="relative flex h-1.5 w-1.5"
              aria-hidden="true"
            >
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--tac-amber))] opacity-75 motion-reduce:animate-none"
              ></span>
              <span
                class="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--tac-amber))]"
              ></span>
            </span>
            <Crown class="h-3.5 w-3.5" />
            <span :class="isMyCaptainPick ? 'inline' : 'hidden sm:inline'">{{
              isMyCaptainPick
                ? $t("matchmaking.captain_pick.your_pick_nav")
                : $t("matchmaking.captain_pick.nav")
            }}</span>
          </NuxtLink>
        </template>

        <template v-else>
          <button
            @click="signIn"
            :class="loginButtonClasses"
            type="button"
            :aria-label="$t('layouts.top_nav.login')"
          >
            <SteamIcon class="h-3.5 w-3.5 fill-white" />
            <span class="hidden sm:inline">{{
              $t("layouts.top_nav.login")
            }}</span>
            <span :class="loginArrowClasses">→</span>
          </button>
        </template>


        <UtilityPracticeNav v-if="!isMobile" />

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
