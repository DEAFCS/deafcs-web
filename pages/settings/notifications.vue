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
  Bell,
  BellOff,
} from "lucide-vue-next";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { toast } from "@/components/ui/toast";
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

const { t } = useI18n();

const pushSupported = ref(true);
const pushDenied = ref(false);
const pushEnabled = ref(false);
const pushBusy = ref(false);
const pushCategories = ref<string[]>([]);
const pushPreferences = ref<Record<string, boolean>>({});
const preferenceBusy = ref<Record<string, boolean>>({});

async function loadPreferences() {
  const [categories, preferences] = await Promise.all([
    fetchPushCategories(),
    fetchPushPreferences(),
  ]);
  pushCategories.value = categories;
  pushPreferences.value = preferences;
}

onMounted(async () => {
  pushSupported.value = isPushSupported();
  if (!pushSupported.value) return;
  pushDenied.value = (await getPushPermissionState()) === "denied";
  pushEnabled.value = Boolean(await getExistingPushSubscription());
  if (pushEnabled.value) {
    await loadPreferences().catch(() => {});
  }
});

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
        await loadPreferences().catch(() => {});
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
</script>

<template>
  <PageTransition :delay="0">
    <div class="space-y-6">
      <p class="max-w-prose text-sm text-muted-foreground">
        {{ $t("pages.settings.notifications.description") }}
      </p>

      <!-- Push notifications -->
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

      <!-- Push categories -->
      <div v-if="pushEnabled && pushCategories.length" class="space-y-2">
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
    </div>
  </PageTransition>
</template>
