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

// Deliberately not attempting to deep-link by type/entity_id here —
// that mapping lives in the app's Vue Router and would need to be
// duplicated in plain JS with no shared source of truth. Focusing (or
// opening) the app is the safe, always-correct fallback; the in-app
// notification list still exists for the specific link.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow("/");
      }
    })(),
  );
});
