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

// Must be called synchronously from a real click/tap handler — see
// the file-level comment above.
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

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
