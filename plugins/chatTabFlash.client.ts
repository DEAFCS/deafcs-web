// Keeps the browser-tab flash (useTabFlash.ts) in sync with the real
// total unread chat count, rather than an independent counter that
// could drift from -- or get reset out of step with -- what's actually
// unread. Runs for the whole app lifetime, not per-component, since
// unread messages can arrive on any page.
import { watch } from "vue";
import { useChatTabs } from "~/composables/useChatTabs";
import { useTabFlashSettings } from "~/composables/useTabFlashSettings";
import { setChatFlashCount } from "~/composables/useTabFlash";

export default defineNuxtPlugin(() => {
  const { unreadCounts } = useChatTabs();
  const { isChatFlashEnabled } = useTabFlashSettings();

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
});
