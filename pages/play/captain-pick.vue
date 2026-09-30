<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "lucide-vue-next";
import CaptainPickScreen from "~/components/matchmaking/captain-pick/CaptainPickScreen.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import { useMatchmakingStore } from "~/stores/MatchmakingStore";
import { useAuthStore } from "~/stores/AuthStore";
import socket from "~/web-sockets/Socket";
import { useCaptainPickPlayers } from "~/composables/useCaptainPickPlayers";
import {
  getCaptainPickDraft,
  localCaptainPickDeadline,
} from "~/utilities/captainPickDraft";
import {
  captainPickChatHubContext,
  useChatHubContext,
} from "~/composables/useChatHubContext";

/**
 * Stable home of a committed 5v5 Captain Pick draft. Everything shown comes
 * from the matchmaking state the server pushes (and re-sends on reconnect),
 * so F5, a second tab or a dropped connection land on the same draft, the
 * same turn and the same deadline.
 */

const { t } = useI18n();
useHead({ title: () => t("matchmaking.captain_pick.title") });

// How long to wait for the server to restore state after a fresh load
// before deciding there is no draft to show.
const RESTORE_GRACE_MS = 8000;

const router = useRouter();
const matchmaking = useMatchmakingStore();
const auth = useAuthStore();

const draft = computed(() =>
  getCaptainPickDraft(matchmaking.joinedMatchmakingQueues?.confirmation),
);

// Flags, CS2/FACEIT ratings and profile data, as Draft Games shows them.
const { players } = useCaptainPickPlayers(draft);

// Chat Hub: opens when the draft is entered. The private team room appears
// the moment the draft state from the server puts the player on a side,
// and goes away with this page, so the Team Chat of the match takes over.
useChatHubContext(() =>
  captainPickChatHubContext(draft.value, auth.me?.steam_id ?? null, t),
);

const hadDraft = ref(false);
const waitingForState = ref(true);
const receivedAt = ref(Date.now());
const now = ref(Date.now());
const pendingPickIndex = ref<number | null>(null);

let restoreTimer: ReturnType<typeof setTimeout> | undefined;
let clock: ReturnType<typeof setInterval> | undefined;

const localDeadline = computed(() =>
  draft.value ? localCaptainPickDeadline(draft.value, receivedAt.value) : null,
);

const timeUp = computed(
  () =>
    !!localDeadline.value &&
    draft.value?.phase === "Drafting" &&
    now.value >= new Date(localDeadline.value).getTime(),
);

const leave = (path: string) => {
  void router.replace(path);
};

watch(
  draft,
  (next) => {
    // Every server update (a pick, a timeout, a resync after a refused
    // pick) is the truth; any pick still "sending" is settled by it.
    pendingPickIndex.value = null;
    receivedAt.value = Date.now();

    if (next) {
      hadDraft.value = true;
      waitingForState.value = false;

      // The draft became an ordinary Competitive match: same destination
      // Standard matchmaking uses, with its normal map veto.
      if (next.phase === "MatchCreated" && next.matchId) {
        leave(`/matches/${next.matchId}`);
      }
      return;
    }

    // It was here and is gone: the draft ended (for example the match
    // could not be created; the server's message is shown as a toast).
    if (hadDraft.value) {
      leave("/play");
    }
  },
  { immediate: true },
);

const pick = (steamId: string) => {
  const current = draft.value;
  if (
    !current ||
    current.pickIndex === null ||
    pendingPickIndex.value !== null
  ) {
    return;
  }
  pendingPickIndex.value = current.pickIndex;
  socket.event("matchmaking:captain-pick", {
    confirmationId: current.draftId,
    steamId,
    // Always sent: a captain can have two picks in a row, and a late or
    // repeated click must never become the next one.
    pickIndex: current.pickIndex,
  });
};

onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 250);

  if (!draft.value) {
    restoreTimer = setTimeout(() => {
      waitingForState.value = false;
      if (!draft.value) {
        leave("/play");
      }
    }, RESTORE_GRACE_MS);
  }
});

onBeforeUnmount(() => {
  if (restoreTimer) clearTimeout(restoreTimer);
  if (clock) clearInterval(clock);
});
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>{{ $t("matchmaking.captain_pick.title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <div class="mt-4">
    <CaptainPickScreen
      v-if="draft"
      :draft="draft"
      :self-steam-id="auth.me?.steam_id ?? null"
      :local-deadline="localDeadline"
      :time-up="timeUp"
      :pending="pendingPickIndex !== null"
      :players="players"
      @pick="pick"
    />
    <div
      v-else
      class="flex items-center gap-2 text-sm text-muted-foreground"
      data-testid="captain-pick-loading"
    >
      <Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" />
      {{
        waitingForState
          ? $t("matchmaking.captain_pick.loading")
          : $t("matchmaking.captain_pick.not_found")
      }}
    </div>
  </div>
</template>
