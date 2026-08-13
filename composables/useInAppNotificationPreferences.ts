// Per-type opt-out for the desktop in-app alert bell -- deliberately
// separate from usePushNotifications.ts's category preferences (mobile
// push groups ~30 types into ~9 coarse categories; this only exposes a
// small, hand-picked set of individual types for the bell specifically,
// see api-deafcs's in-app-notification-types.ts for the full list).

export type InAppNotificationTypeConfig = {
  type: string;
  defaultEnabled: boolean;
  adminOnly: boolean;
};

function inAppApiUrl(path: string): string {
  const apiDomain = useRuntimeConfig().public.apiDomain;
  return `https://${apiDomain}/notifications/in-app${path}`;
}

export async function fetchInAppNotificationTypes(): Promise<
  InAppNotificationTypeConfig[]
> {
  const { types } = await $fetch<{ types: InAppNotificationTypeConfig[] }>(
    inAppApiUrl("/types"),
  );
  return types;
}

export async function fetchInAppNotificationPreferences(): Promise<
  Record<string, boolean>
> {
  const { preferences } = await $fetch<{ preferences: Record<string, boolean> }>(
    inAppApiUrl("/preferences"),
    { credentials: "include" },
  );
  return preferences;
}

export async function setInAppNotificationPreference(
  type: string,
  enabled: boolean,
): Promise<void> {
  await $fetch(inAppApiUrl("/preferences"), {
    method: "POST",
    credentials: "include",
    body: { type, enabled },
  });
}
