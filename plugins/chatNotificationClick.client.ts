// Handles the frontend half of "clicking a chat push notification opens
// that exact conversation". The service worker (public/sw-push.js)
// can't do the routing itself -- it has no access to Vue Router / the
// chat tab state -- so it either postMessages an already-open app
// (case 1 below) or, when it had to open a fresh window, encodes the
// target in a ?openChat= query param (case 2).
import { useChatNotificationNavigation } from "~/composables/useChatNotificationNavigation";

function parseOpenChat(value: string): { type: string; entityId: string } | null {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex === -1) return null;
  return { type: value.slice(0, separatorIndex), entityId: value };
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook("app:mounted", () => {
    nuxtApp.runWithContext(() => {
      const { openChatFromNotification } = useChatNotificationNavigation();

      // Case 1: app was already open in this tab -- the service worker
      // postMessaged the focused client directly.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("message", (event) => {
          const data = event.data;
          if (data?.kind !== "chat-notification-click") return;
          openChatFromNotification(data.type, data.entity_id);
        });
      }

      // Case 2: app wasn't running -- the service worker opened a fresh
      // window with the target encoded in the URL instead, since
      // postMessage to a not-yet-loaded page is a race.
      const url = new URL(window.location.href);
      const openChat = url.searchParams.get("openChat");
      if (openChat) {
        const parsed = parseOpenChat(openChat);
        url.searchParams.delete("openChat");
        window.history.replaceState({}, "", url.toString());
        if (parsed) {
          openChatFromNotification(parsed.type, parsed.entityId);
        }
      }
    });
  });
});
