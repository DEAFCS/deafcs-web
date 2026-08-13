<script setup lang="ts">
import { Bell, BellOff } from "lucide-vue-next";
import { Switch } from "@/components/ui/switch";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { toast } from "@/components/ui/toast";
import { useI18n } from "vue-i18n";
import {
  isPushSupported,
  getPushPermissionState,
  getExistingPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  fetchPushCategories,
  fetchPushPreferences,
  setPushPreference,
} from "~/composables/usePushNotifications";
import {
  fetchInAppNotificationTypes,
  fetchInAppNotificationPreferences,
  setInAppNotificationPreference,
  type InAppNotificationTypeConfig,
} from "~/composables/useInAppNotificationPreferences";
import { e_player_roles_enum } from "~/generated/zeus";
import { useNotificationStore } from "~/stores/NotificationStore";

const { t } = useI18n();

// Web Push subscribe/preferences -- account-wide device state. See
// usePushNotifications for why permission is only ever requested from
// this toggle's own click, never on mount.
const pushSupported = ref(true);
// Web Push is technically desktop-capable too (Chrome/Firefox/Edge all
// support it), but this project only wants the toggle offered on
// phones -- surfacing it on desktop just confused people into flipping
// it on and reporting it as broken. UA-sniffed rather than a viewport
// width check so resizing a desktop browser window narrow doesn't
// suddenly reveal it.
const isMobileOS = ref(false);
const pushDenied = ref(false);
const pushEnabled = ref(false);
const pushBusy = ref(false);
const pushCategories = ref<string[]>([]);
const pushPreferences = ref<Record<string, boolean>>({});
const preferenceBusy = ref<Record<string, boolean>>({});

async function loadPushPreferences() {
  const [categories, preferences] = await Promise.all([
    fetchPushCategories(),
    fetchPushPreferences(),
  ]);
  pushCategories.value = categories;
  pushPreferences.value = preferences;
}

const handleCategoryToggle = async (category: string, enabled: boolean) => {
  if (preferenceBusy.value[category]) return;
  preferenceBusy.value = { ...preferenceBusy.value, [category]: true };
  const previous = pushPreferences.value[category];
  pushPreferences.value = { ...pushPreferences.value, [category]: enabled };
  try {
    await setPushPreference(category, enabled);
  } catch {
    pushPreferences.value = { ...pushPreferences.value, [category]: previous };
    toast({
      variant: "destructive",
      title: t("common.error"),
      description: t("pages.settings.notifications.push.enable_failed"),
    });
  } finally {
    preferenceBusy.value = { ...preferenceBusy.value, [category]: false };
  }
};

const handlePushToggle = async (enabled: boolean) => {
  if (pushBusy.value) return;
  pushBusy.value = true;
  try {
    if (enabled) {
      const ok = await subscribeToPush();
      pushDenied.value = (await getPushPermissionState()) === "denied";
      pushEnabled.value = ok;
      if (ok) {
        toast({ title: t("pages.settings.notifications.push.enabled_toast") });
        await loadPushPreferences().catch(() => {});
      } else {
        toast({
          variant: "destructive",
          title: t("common.error"),
          description: pushDenied.value
            ? t("pages.settings.notifications.push.denied")
            : t("pages.settings.notifications.push.enable_failed"),
        });
      }
    } else {
      await unsubscribeFromPush();
      pushEnabled.value = false;
      toast({ title: t("pages.settings.notifications.push.disabled_toast") });
    }
  } finally {
    pushBusy.value = false;
  }
};

// In-app alert bell -- per-type opt-out for a small, hand-picked set of
// notification types (see api-deafcs's in-app-notification-types.ts).
const inAppTypes = ref<InAppNotificationTypeConfig[]>([]);
const inAppPreferencesLocal = ref<Record<string, boolean>>({});
const inAppBusy = ref<Record<string, boolean>>({});
const isModerator = computed(() =>
  useAuthStore().isRoleAbove(e_player_roles_enum.moderator),
);
const visibleInAppTypes = computed(() =>
  inAppTypes.value.filter((t) => !t.adminOnly),
);
const visibleInAppAdminTypes = computed(() =>
  isModerator.value ? inAppTypes.value.filter((t) => t.adminOnly) : [],
);

async function loadInAppPreferences() {
  const [types, preferences] = await Promise.all([
    fetchInAppNotificationTypes(),
    fetchInAppNotificationPreferences(),
  ]);
  inAppTypes.value = types;
  inAppPreferencesLocal.value = preferences;
}

const handleInAppToggle = async (type: string, enabled: boolean) => {
  if (inAppBusy.value[type]) return;
  inAppBusy.value = { ...inAppBusy.value, [type]: true };
  const previous = inAppPreferencesLocal.value[type];
  inAppPreferencesLocal.value = { ...inAppPreferencesLocal.value, [type]: enabled };
  try {
    await setInAppNotificationPreference(type, enabled);
    // Keep the bell itself (NotificationStore) in sync immediately,
    // rather than waiting for its own next load/reload.
    await useNotificationStore().refreshInAppPreferences();
  } catch {
    inAppPreferencesLocal.value = { ...inAppPreferencesLocal.value, [type]: previous };
    toast({
      variant: "destructive",
      title: t("common.error"),
      description: t("pages.settings.notifications.in_app.enable_failed"),
    });
  } finally {
    inAppBusy.value = { ...inAppBusy.value, [type]: false };
  }
};

onMounted(async () => {
  isMobileOS.value = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  pushSupported.value = isPushSupported();
  if (pushSupported.value) {
    pushDenied.value = (await getPushPermissionState()) === "denied";
    pushEnabled.value = Boolean(await getExistingPushSubscription());
    if (pushEnabled.value) {
      await loadPushPreferences().catch(() => {});
    }
  }
  await loadInAppPreferences().catch(() => {});
});
</script>

<template>
  <PageTransition :delay="0">
    <div class="space-y-6">
      <p class="max-w-prose text-sm text-muted-foreground">
        {{ $t("pages.settings.notification_preferences.description") }}
      </p>

      <!-- Push notifications -- phones only, see isMobileOS above -->
      <div v-if="isMobileOS" class="space-y-2">
        <label
          class="font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ $t("pages.settings.notifications.push.title") }}
        </label>

        <div
          class="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 p-4"
        >
          <div class="flex items-start gap-3">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--tac-amber))]/10 ring-1 ring-inset ring-[hsl(var(--tac-amber))]/20"
            >
              <component
                :is="pushEnabled ? Bell : BellOff"
                class="h-5 w-5 text-[hsl(var(--tac-amber))]"
              />
            </div>
            <div class="space-y-0.5">
              <h4 class="font-medium">
                {{ $t("pages.settings.notifications.push.enable") }}
              </h4>
              <p class="text-sm text-muted-foreground">
                {{
                  !pushSupported
                    ? $t("pages.settings.notifications.push.unsupported")
                    : pushDenied
                      ? $t("pages.settings.notifications.push.denied")
                      : $t("pages.settings.notifications.push.description")
                }}
              </p>
            </div>
          </div>
          <Switch
            :model-value="pushEnabled"
            :disabled="!pushSupported || pushDenied || pushBusy"
            @update:model-value="handlePushToggle"
          />
        </div>

        <div v-if="pushEnabled && pushCategories.length" class="space-y-2 pt-2">
          <p
            class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
          >
            {{ $t("pages.settings.notifications.push.categories_title") }}
          </p>
          <div class="space-y-2">
            <div
              v-for="category in pushCategories"
              :key="category"
              class="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 p-3"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium">
                  {{
                    $t(`pages.settings.notifications.push.categories.${category}.title`)
                  }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{
                    $t(
                      `pages.settings.notifications.push.categories.${category}.description`,
                    )
                  }}
                </div>
              </div>
              <Switch
                :model-value="pushPreferences[category] !== false"
                :disabled="preferenceBusy[category]"
                @update:model-value="(value: boolean) => handleCategoryToggle(category, value)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="space-y-2">
        <label
          class="font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ $t("pages.settings.notifications.in_app.title") }}
        </label>

        <div class="space-y-2 pt-1">
          <div
            v-for="type in visibleInAppTypes"
            :key="type.type"
            class="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 p-3"
          >
            <div class="min-w-0">
              <div class="text-sm font-medium">
                {{ $t(`pages.settings.notifications.in_app.types.${type.type}.title`) }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{
                  $t(`pages.settings.notifications.in_app.types.${type.type}.description`)
                }}
              </div>
            </div>
            <Switch
              :model-value="inAppPreferencesLocal[type.type] ?? type.defaultEnabled"
              :disabled="inAppBusy[type.type]"
              @update:model-value="(value: boolean) => handleInAppToggle(type.type, value)"
            />
          </div>
        </div>

        <template v-if="visibleInAppAdminTypes.length">
          <p
            class="pt-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
          >
            {{ $t("pages.settings.notifications.in_app.admin_title") }}
          </p>
          <div class="space-y-2">
            <div
              v-for="type in visibleInAppAdminTypes"
              :key="type.type"
              class="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 p-3"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium">
                  {{ $t(`pages.settings.notifications.in_app.types.${type.type}.title`) }}
                </div>
                <div class="text-xs text-muted-foreground">
                  {{
                    $t(`pages.settings.notifications.in_app.types.${type.type}.description`)
                  }}
                </div>
              </div>
              <Switch
                :model-value="inAppPreferencesLocal[type.type] ?? type.defaultEnabled"
                :disabled="inAppBusy[type.type]"
                @update:model-value="(value: boolean) => handleInAppToggle(type.type, value)"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </PageTransition>
</template>
