<script setup lang="ts">
import { Check, ChevronsUpDown, Languages, Bell, BellOff } from "lucide-vue-next";
import PlayerChangeName from "~/components/PlayerChangeName.vue";
import SettingsSaveBar from "~/components/settings/SettingsSaveBar.vue";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "vue-i18n";
import { toast } from "@/components/ui/toast";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
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
const { locale, locales, setLocale, t } = useI18n();

// Web Push subscribe/preferences -- lives here (not on the sound-focused
// Settings -> Notifications page) since it's account-wide device state,
// not an in-app preference. See usePushNotifications for why permission
// is only ever requested from this toggle's own click, never on mount.
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

const availableLocales = computed(() => {
  return locales.value.filter((i) => i.code !== locale.value);
});

const currentLocale = computed(() => {
  return locales.value.find((i) => i.code === locale.value);
});

const handleLocaleChange = (
  newLocale:
    | "en"
    | "sv"
    | "ua"
    | "ko"
    | "ja"
    | "de"
    | "fr"
    | "it"
    | "es"
    | "da"
    | "pl"
    | "ru"
    | "lv"
    | "pt-BR"
    | "zh",
) => {
  setLocale(newLocale);
};
</script>

<template>
  <PageTransition :delay="0">
    <form @submit.prevent="updateMe" class="grid gap-6">
      <div class="space-y-2">
        <label
          class="font-mono text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground"
        >
          {{ $t("pages.settings.account.name") }}
        </label>
        <PlayerChangeName :player="me" />
      </div>

      <div class="space-y-2">
        <label
          class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {{ $t("pages.settings.language.select") }}
        </label>
        <Popover v-model:open="isLanguagePopoverOpen">
          <PopoverTrigger as-child>
            <Button
              variant="outline"
              role="combobox"
              class="w-full justify-between"
            >
              <div class="flex items-center gap-2">
                <Languages class="size-4" />
                <span>
                  {{ currentLocale?.flag }}
                </span>
                <span>
                  {{ currentLocale?.name }}
                </span>
              </div>
              <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent class="w-full p-0">
            <Command>
              <CommandInput
                :placeholder="$t('pages.settings.language.search')"
              />
              <CommandList>
                <CommandGroup>
                  <CommandItem
                    v-for="loc in availableLocales"
                    :key="loc.code"
                    :value="loc.code"
                    @select="
                      () => {
                        form.setFieldValue('language', loc.code);
                        handleLocaleChange(loc.code);
                        isLanguagePopoverOpen = false;
                      }
                    "
                  >
                    <div class="flex items-center gap-2">
                      <span>{{ loc.flag }}</span>
                      <span>{{ loc.name }}</span>
                    </div>
                    <Check
                      :class="[
                        'ml-auto h-4 w-4 flex-shrink-0',
                        locale === loc.code ? 'opacity-100' : 'opacity-0',
                      ]"
                    />
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <FormField v-slot="{ componentField }" name="country">
        <FormItem>
          <FormLabel>{{ $t("pages.settings.account.country") }}</FormLabel>

          <Popover v-model:open="open">
            <PopoverTrigger as-child>
              <Button
                role="combobox"
                variant="outline"
                class="w-full justify-between"
              >
                <div class="flex items-center gap-2">
                  <TimezoneFlag
                    v-if="form.values.country"
                    :country="form.values.country"
                  />
                  {{
                    form.values.country
                      ? countries[form.values.country]?.name
                      : $t("pages.settings.account.select_country")
                  }}
                </div>
                <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-full p-0">
              <Command class="w-[300px]">
                <CommandInput
                  :placeholder="$t('pages.settings.account.search_country')"
                />
                <CommandEmpty>{{
                  $t("pages.settings.account.no_country_found")
                }}</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    <CommandItem
                      v-for="country in Object.values(countries)"
                      :key="country.id"
                      :value="country.name"
                      @select="
                        () => {
                          form.setFieldValue('country', country.id);
                          open = false;
                        }
                      "
                    >
                      <div class="flex items-center gap-2 w-full">
                        <TimezoneFlag :country="country.id" />
                        <span class="truncate">{{ country.name }}</span>
                      </div>
                      <Check
                        :class="[
                          'ml-auto h-4 w-4 flex-shrink-0',
                          form.values.country === country.id
                            ? 'opacity-100'
                            : 'opacity-0',
                        ]"
                      />
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <FormMessage />
        </FormItem>
      </FormField>

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

      <div class="pb-24"></div>

      <SettingsSaveBar
        :dirty="isDirty"
        :submitting="submitting"
        @save="updateMe"
        @discard="discardChanges"
      />
    </form>
  </PageTransition>
</template>

<script lang="ts">
import { toTypedSchema } from "~/utilities/vee-validate-zod";
import { useForm } from "vee-validate";
import * as z from "zod";
import { getAllCountries } from "countries-and-timezones";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";

export default {
  data() {
    return {
      open: false,
      countries: getAllCountries(),
      isLanguagePopoverOpen: false,
      submitting: false,
      baseline: null as string | null,
      isDirty: false,
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            name: z.string().min(1),
            country: z.string().min(1),
            language: z.string().optional(),
          }),
        ),
      }),
    };
  },
  watch: {
    me: {
      immediate: true,
      handler() {
        // `me` comes from the auth store and can refresh; don't clobber edits.
        if (this.baseline === null || !this.isDirty) {
          this.populateForm();
        }
      },
    },
    ["form.values"]: {
      deep: true,
      handler() {
        this.isDirty =
          this.baseline !== null &&
          JSON.stringify(this.form.values) !== this.baseline;
      },
    },
  },
  methods: {
    populateForm() {
      this.form.setValues({
        steam_id: this.me.steam_id,
        name: this.me.name,
        country: this.me.country,
      });
      this.takeSnapshot();
    },
    takeSnapshot() {
      this.$nextTick(() => {
        this.baseline = JSON.stringify(this.form.values);
        this.isDirty = false;
      });
    },
    discardChanges() {
      this.populateForm();
    },
    async updateMe() {
      if (this.submitting) {
        return;
      }

      const { valid } = await this.form.validate();

      if (!valid) {
        return;
      }

      this.submitting = true;
      try {
        await this.$apollo.mutate({
          mutation: generateMutation({
            update_players_by_pk: [
              {
                pk_columns: {
                  steam_id: this.me.steam_id,
                },
                _set: {
                  country: this.form.values.country,
                  language: this.form.values.language,
                },
              },
              {
                __typename: true,
              },
            ],
          }),
        });

        toast({
          title: this.$t("pages.settings.account.update_success"),
        });

        this.takeSnapshot();
      } finally {
        this.submitting = false;
      }
    },
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
  },
};
</script>
