// Loaded into the generated Workbox service worker via
// nuxt.config.ts's `pwa.workbox.importScripts`. Handles the two events
// that only ever fire on the service-worker thread, never in a normal
// page context — which is exactly why closed/backgrounded-app
// notifications are possible at all (see the PWA notifications
// settings page for the subscribe side of this).
/* eslint-disable no-undef */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "DEAFCS", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "DEAFCS";
  const options = {
    body: data.body || "",
    icon: "/favicon/192.png?v=deafcs-1",
    badge: "/favicon/64.png?v=deafcs-1",
    data: { type: data.type, entity_id: data.entity_id },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Deep-linking to the exact chat a notification came from can't be done
// here directly -- the type/entity_id -> tab mapping lives in the app's
// Vue state (open tabs, chat tab id conventions, player lookups for DMs)
// and would need to be duplicated in plain JS with no shared source of
// truth. Instead: if the app is already open, postMessage it the
// type/entity_id and let it do the routing (see
// plugins/chatNotificationClick.client.ts). If we have to open a fresh
// window, postMessage would race the page load, so the target is encoded
// in a ?openChat= query param that same plugin reads on mount instead.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const { type, entity_id: entityId } = notificationData;

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          if (type && entityId) {
            client.postMessage({
              kind: "chat-notification-click",
              type,
              entity_id: entityId,
            });
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        const target =
          type && entityId
            ? `/?openChat=${encodeURIComponent(entityId)}`
            : "/";
        return self.clients.openWindow(target);
      }
    })(),
  );
});
