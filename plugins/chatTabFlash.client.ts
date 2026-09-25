// Keeps the browser-tab flash (useTabFlash.ts) in sync with the real
// unread totals for chat and the alert bell, rather than an
// independent counter that could drift from -- or get reset out of
// step with -- what's actually unread. Runs for the whole app
// lifetime, not per-component, since either can change on any page.
import { watch } from "vue";
import { useChatTabs } from "~/composables/useChatTabs";
import { useNotificationStore } from "~/stores/NotificationStore";
import { useTabFlashSettings } from "~/composables/useTabFlashSettings";
import { setChatFlashCount, setAlertFlashCount } from "~/composables/useTabFlash";

export default defineNuxtPlugin(() => {
  const { unreadCounts } = useChatTabs();
  const { isChatFlashEnabled, isAlertFlashEnabled } = useTabFlashSettings();

  watch(
    [unreadCounts, isChatFlashEnabled],
    ([counts, enabled]) => {
      if (!enabled) {
        setChatFlashCount(0);
        return;
      }
      const total = Object.values(counts).reduce(
        (sum, n) => sum + (n || 0),
        0,
      );
      setChatFlashCount(total);
    },
    { deep: true, immediate: true },
  );

  watch(
    [() => useNotificationStore().unreadNotificationCount, isAlertFlashEnabled],
    ([count, enabled]) => {
      setAlertFlashCount(enabled ? count : 0);
    },
    { immediate: true },
  );
});
