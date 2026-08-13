<script setup lang="ts">
import { useSound } from "~/composables/useSound";
import { Switch } from "@/components/ui/switch";
import {
  Volume2,
  VolumeX,
  Play,
  MessageSquare,
  Swords,
  Keyboard,
  Timer,
} from "lucide-vue-next";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { toast } from "@/components/ui/toast";
import { useI18n } from "vue-i18n";
import {
  fetchInAppNotificationTypes,
  fetchInAppNotificationPreferences,
  setInAppNotificationPreference,
  type InAppNotificationTypeConfig,
} from "~/composables/useInAppNotificationPreferences";
import { e_player_roles_enum } from "~/generated/zeus";
import { useNotificationStore } from "~/stores/NotificationStore";

const { t } = useI18n();

const {
  isEnabled,
  volume,
  updateSettings,
  playNotificationSound,
  playMatchFoundSound,
  playTickSound,
  playCountdownSound,
} = useSound();

const handleSoundToggle = (enabled: boolean) => {
  updateSettings(enabled);
};

const handleVolumeChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  updateSettings(isEnabled.value, parseFloat(target.value));
};

const lastVolume = ref(volume.value || 0.7);
const toggleMute = () => {
  if (volume.value === 0) {
    updateSettings(isEnabled.value, lastVolume.value || 0.7);
  } else {
    lastVolume.value = volume.value;
    updateSettings(isEnabled.value, 0);
  }
};

const isAdmin = computed(() => useAuthStore().isAdmin);

const sounds = computed(() => {
  const list = [
    { key: "chat", icon: MessageSquare, play: playNotificationSound },
    { key: "match_found", icon: Swords, play: playMatchFoundSound },
  ];

  if (isAdmin.value) {
    list.push({ key: "tick", icon: Keyboard, play: playTickSound });
    list.push({ key: "countdown", icon: Timer, play: playCountdownSound });
  }

  return list;
});

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

onMounted(() => {
  loadInAppPreferences().catch(() => {});
});
</script>

<template>
  <PageTransition :delay="0">
    <div class="space-y-6">
      <p class="max-w-prose text-sm text-muted-foreground">
        {{ $t("pages.settings.notifications.description") }}
      </p>

      <!-- Master toggle -->
      <div
        class="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-card/40 p-4"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--tac-amber))]/10 ring-1 ring-inset ring-[hsl(var(--tac-amber))]/20"
          >
            <component
              :is="isEnabled ? Volume2 : VolumeX"
              class="h-5 w-5 text-[hsl(var(--tac-amber))]"
            />
          </div>
          <div class="space-y-0.5">
            <h4 class="font-medium">
              {{ $t("pages.settings.notifications.enabled.title") }}
            </h4>
            <p class="text-sm text-muted-foreground">
              {{ $t("pages.settings.notifications.enabled.description") }}
            </p>
          </div>
        </div>
        <Switch
          :model-value="isEnabled"
          @update:model-value="handleSoundToggle"
        />
      </div>

      <template v-if="isEnabled">
        <!-- Volume -->
        <div class="rounded-lg border border-border/60 bg-card/40 p-4">
          <div class="mb-3 flex items-center justify-between">
            <label class="text-sm font-medium">
              {{ $t("pages.settings.notifications.volume.title") }}
            </label>
            <span class="font-mono text-xs tabular-nums text-muted-foreground">
              {{ Math.round(volume * 100) }}%
            </span>
          </div>
          <div class="flex items-center gap-3">
            <button
              type="button"
              class="text-muted-foreground transition-colors hover:text-foreground"
              @click="toggleMute"
            >
              <VolumeX v-if="volume === 0" class="h-4 w-4" />
              <Volume2 v-else class="h-4 w-4" />
            </button>
            <input
              type="range"
              :value="volume"
              :max="1"
              :min="0"
              :step="0.05"
              class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[hsl(var(--tac-amber))]"
              @input="handleVolumeChange"
            />
          </div>
        </div>

        <!-- Preview -->
        <div class="space-y-2">
          <p
            class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70"
          >
            {{ $t("pages.settings.notifications.preview") }}
          </p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              v-for="sound in sounds"
              :key="sound.key"
              type="button"
              class="group flex flex-col items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3 text-left transition-colors hover:border-[hsl(var(--tac-amber))]/40 hover:bg-card/60"
              @click="sound.play()"
            >
              <div class="flex w-full items-center justify-between">
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-md bg-[hsl(var(--tac-amber))]/10 ring-1 ring-inset ring-[hsl(var(--tac-amber))]/20"
                >
                  <component
                    :is="sound.icon"
                    class="h-4 w-4 text-[hsl(var(--tac-amber))]"
                  />
                </div>
                <Play
                  class="h-4 w-4 text-muted-foreground transition-colors group-hover:text-[hsl(var(--tac-amber))]"
                />
              </div>
              <div class="min-w-0">
                <div class="truncate text-sm font-medium">
                  {{
                    $t(`pages.settings.notifications.sounds.${sound.key}.title`)
                  }}
                </div>
                <div class="truncate text-xs text-muted-foreground">
                  {{
                    $t(
                      `pages.settings.notifications.sounds.${sound.key}.description`,
                    )
                  }}
                </div>
              </div>
            </button>
          </div>
        </div>
      </template>

      <!-- In-app alert bell -->
      <div class="space-y-2 pt-2">
        <label
          class="font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ $t("pages.settings.notifications.in_app.title") }}
        </label>
        <p class="text-sm text-muted-foreground">
          {{ $t("pages.settings.notifications.in_app.description") }}
        </p>

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
