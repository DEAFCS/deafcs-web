<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "lucide-vue-next";
import { useMatchmakingStore } from "~/stores/MatchmakingStore";
import { captainPickPath, getCaptainPickDraft } from "~/utilities/captainPickDraft";

// Temporary landing point while reconnect restores the match shell.
// All roles use the real match page as soon as matchId exists.
const { t } = useI18n();
useHead({ title: () => t("matchmaking.captain_pick.title") });
const router = useRouter();
const matchmaking = useMatchmakingStore();
const draft = computed(() => getCaptainPickDraft(matchmaking.joinedMatchmakingQueues?.confirmation));
const waitingForState = ref(true);
let hadDraft = false;
let destination: string | null = null;
let restoreTimer: ReturnType<typeof setTimeout> | undefined;
const leave = (path: string) => {
  if (destination === path) return;
  destination = path;
  void router.replace(path);
};
watch(draft, (next) => {
  if (next) {
    hadDraft = true;
    if (next.matchId) leave(captainPickPath(next));
  } else if (hadDraft && !destination) {
    leave("/play");
  }
}, { immediate: true });
onMounted(() => {
  if (!draft.value) {
    restoreTimer = setTimeout(() => {
      waitingForState.value = false;
      if (!draft.value && !destination) leave("/play");
    }, 8000);
  }
});
onBeforeUnmount(() => { if (restoreTimer) clearTimeout(restoreTimer); });
</script>

<template>
  <div class="flex items-center gap-2 py-4 text-sm text-muted-foreground" data-testid="captain-pick-loading">
    <Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" />
    {{ waitingForState ? $t("matchmaking.captain_pick.loading") : $t("matchmaking.captain_pick.not_found") }}
  </div>
</template>