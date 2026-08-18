// Web Push subscribe/unsubscribe against api-deafcs's
// PushNotificationsController (src/notifications/push/). Deliberately
// kept separate from stores/NotificationStore.ts, which only ever
// deals with the in-app/foreground `Notification` API — this composable
// is the one place that touches the service worker's PushManager, and
// permission is only ever requested from a direct user gesture (a
// click handler calling `subscribeToPush()`), never automatically,
// because iOS silently and permanently ignores a permission prompt
// that wasn't triggered by one.

function pushApiUrl(path: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/notifications/push${path}`;
}

// PushManager wants the VAPID public key as a raw Uint8Array, not the
// base64url string the backend hands out.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getPushPermissionState(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

// Wraps a promise that can hang forever instead of ever rejecting --
// Notification.requestPermission() has been observed to do exactly
// that on some Android setups (missing/broken Google Play Services,
// which the underlying permission flow depends on): no system dialog,
// no error, the toggle just sits there "busy" indefinitely with no
// feedback. Racing it against a timeout turns that into a real,
// visible failure instead of a silent hang.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// Must be called synchronously from a real click/tap handler — see
// the file-level comment above.
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await withTimeout(
    Notification.requestPermission(),
    15_000,
    "Timed out waiting for the notification permission prompt. This can happen on devices with broken or missing Google Play Services.",
  );
  if (permission !== "granted") return false;

  // Reported bug: permission already "granted" (no prompt shown, which is
  // correct — the browser never re-prompts once granted), but tapping
  // Enable did visibly nothing on a Samsung Galaxy S24 Ultra -- still
  // true after adding a timeout around just pushManager.subscribe()
  // below, which meant the hang was actually further upstream. Rather
  // than chase each individual await one at a time, everything from here
  // to a saved subscription is wrapped in ONE timeout, so no future gap
  // in this chain can silently hang again: navigator.serviceWorker.ready
  // in particular waits on a service worker actually reaching "active"
  // state and has no built-in bound, and getSubscription()/the plain
  // $fetch calls are equally capable of hanging on a device with a
  // stuck or unreachable push service (OEM background/battery
  // restrictions are a known cause on Samsung specifically).
  return withTimeout(
    (async () => {
      const { publicKey } = await $fetch<{ publicKey: string | null }>(
        pushApiUrl("/vapid-public-key"),
      );
      if (!publicKey) return false;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      await $fetch(pushApiUrl("/subscribe"), {
        method: "POST",
        credentials: "include",
        body: { subscription: subscription.toJSON() },
      });

      return true;
    })(),
    20_000,
    "Timed out registering for push notifications with this device's push service. This can happen when the OS's background/battery restrictions are blocking it, or the app needs to be fully closed and reopened.",
  );
}

export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;

  await $fetch(pushApiUrl("/subscribe"), {
    method: "DELETE",
    credentials: "include",
    body: { endpoint: subscription.endpoint },
  }).catch(() => {});

  await subscription.unsubscribe();
}

// --- Per-category preferences ---
// Categories are a fixed, backend-defined set (see api-deafcs's
// notification-categories.ts) -- the frontend only renders whatever list
// comes back, it doesn't hardcode the category keys itself.

export async function fetchPushCategories(): Promise<string[]> {
  const { categories } = await $fetch<{ categories: string[] }>(
    pushApiUrl("/categories"),
  );
  return categories;
}

export async function fetchPushPreferences(): Promise<Record<string, boolean>> {
  const { preferences } = await $fetch<{ preferences: Record<string, boolean> }>(
    pushApiUrl("/preferences"),
    { credentials: "include" },
  );
  return preferences;
}

export async function setPushPreference(
  category: string,
  enabled: boolean,
): Promise<void> {
  await $fetch(pushApiUrl("/preferences"), {
    method: "POST",
    credentials: "include",
    body: { category, enabled },
  });
}
