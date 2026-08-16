<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { BellRing, X } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import {
  isPushSupported,
  getPushPermissionState,
  getExistingPushSubscription,
} from "~/composables/usePushNotifications";

// One-time, mobile-only nudge toward Settings -> Notifications -> Push,
// shown the first time a logged-in player loads the site on a phone.
// Deliberately NOT the real browser permission prompt itself (see
// usePushNotifications' own comment on why that's only ever triggered
// from a direct click on the settings page) -- this is just a
// low-stakes in-app banner pointing at that toggle. Dismissed either
// way (X or "Go to settings") and never shown again on this device,
// tracked via localStorage since this is inherently a per-device thing
// (a player might have already enabled push on their phone but never
// touched their tablet).
const STORAGE_KEY = "deafcs:notification-prompt-dismissed";

const visible = ref(false);

function dismiss() {
  visible.value = false;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable (private mode, etc.) -- worst case the
    // prompt reappears next visit, not worth failing over.
  }
}

function goToSettings() {
  dismiss();
  navigateTo("/settings/notification-preferences");
}

async function maybeShow() {
  if (typeof window === "undefined") return;
  if (!/android|iphone|ipad|ipod/i.test(navigator.userAgent)) return;
  try {
    if (localStorage.getItem(STORAGE_KEY)) return;
  } catch {
    return;
  }
  if (!isPushSupported()) return;

  const permission = await getPushPermissionState();
  if (permission === "denied" || permission === "unsupported") return;

  const existing = await getExistingPushSubscription();
  if (existing) return; // already subscribed, nothing to nudge toward

  // Small delay so it doesn't compete with the page's own first paint.
  setTimeout(() => {
    visible.value = true;
  }, 1500);
}

const me = computed(() => useAuthStore().me);
watch(
  me,
  (value) => {
    if (value) maybeShow();
  },
  { immediate: true },
);
</script>

<template>
  <Transition name="notif-prompt">
    <div
      v-if="visible"
      class="fixed z-[100] bottom-4 left-1/2 -translate-x-1/2 w-[min(92vw,380px)] rounded-lg border border-[hsl(var(--tac-amber))]/50 bg-zinc-900/95 backdrop-blur px-4 py-3 flex items-start gap-3 shadow-2xl"
    >
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tac-amber))]/15"
      >
        <BellRing class="h-4.5 w-4.5 text-[hsl(var(--tac-amber))]" />
      </div>
      <div class="min-w-0 flex-1 space-y-2">
        <div class="text-sm font-semibold">
          {{ $t("notifications.enable_prompt.title", "Don't miss anything") }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{
            $t(
              "notifications.enable_prompt.description",
              "Turn on notifications so you don't miss tournament reminders, messages, and more.",
            )
          }}
        </div>
        <Button size="sm" class="mt-1" @click="goToSettings">
          {{ $t("notifications.enable_prompt.go_to_settings", "Go to settings") }}
        </Button>
      </div>
      <button
        type="button"
        class="shrink-0 text-muted-foreground hover:text-foreground"
        :aria-label="$t('common.dismiss', 'Dismiss')"
        @click="dismiss"
      >
        <X class="h-4 w-4" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.notif-prompt-enter-active,
.notif-prompt-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.notif-prompt-enter-from,
.notif-prompt-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
