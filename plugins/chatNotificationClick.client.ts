// Handles the frontend half of "clicking a push notification opens the
// exact place it's about". The service worker (public/sw-push.js) can't do
// the routing itself -- it has no access to Vue Router / app state -- so it
// either postMessages an already-open app (case 1 below) or, when it had to
// open a fresh window, encodes the target in query params (case 2).
//
// Chat notifications route via entity_id's own embedded type (see
// useChatNotificationNavigation.ts, which intentionally ignores the
// notification's own `type` field). Everything else (currently: the
// verification-application workflow) has a plain-id entity_id with no
// embedded routing info, so it routes off the notification's `type` field
// instead -- see routeNonChatNotification below.
import { useChatNotificationNavigation } from "~/composables/useChatNotificationNavigation";

const ADMIN_FACING_VERIFICATION_TYPES = new Set([
  "VerificationApplicationSubmitted",
  "VerificationApplicationPlayerReply",
]);
const APPLICANT_FACING_VERIFICATION_TYPES = new Set([
  "VerificationApplicationAdminReply",
  "VerificationApplicationReviewed",
]);

// Returns true if it handled the click (caller should not also try chat
// routing), false if this notification type isn't one it knows about.
async function routeNonChatNotification(
  type: string | undefined | null,
  entityId: string | undefined | null,
): Promise<boolean> {
  if (!type) return false;

  if (ADMIN_FACING_VERIFICATION_TYPES.has(type) && entityId) {
    await navigateTo(`/verification-applications/${entityId}`);
    return true;
  }

  if (APPLICANT_FACING_VERIFICATION_TYPES.has(type)) {
    // /verify resolves to the current player's own (most recent)
    // application on its own -- no id needed in the URL.
    await navigateTo("/verify");
    return true;
  }

  return false;
}

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
          void (async () => {
            const handled = await routeNonChatNotification(
              data.type,
              data.entity_id,
            );
            if (!handled) {
              openChatFromNotification(data.type, data.entity_id);
            }
          })();
        });
      }

      // Case 2: app wasn't running -- the service worker opened a fresh
      // window with the target encoded in query params instead, since
      // postMessage to a not-yet-loaded page is a race.
      const url = new URL(window.location.href);
      const openChat = url.searchParams.get("openChat");
      const notificationType = url.searchParams.get("notificationType");
      if (openChat || notificationType) {
        url.searchParams.delete("openChat");
        url.searchParams.delete("notificationType");
        window.history.replaceState({}, "", url.toString());

        void (async () => {
          const handled = await routeNonChatNotification(
            notificationType,
            openChat,
          );
          if (handled || !openChat) return;

          const parsed = parseOpenChat(openChat);
          if (parsed) {
            openChatFromNotification(parsed.type, parsed.entityId);
          }
        })();
      }
    });
  });
});
