<script setup lang="ts">
import { Check, ChevronsUpDown, Languages } from "lucide-vue-next";
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
import { useI18n } from "vue-i18n";
import { toast } from "@/components/ui/toast";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TwitchIcon from "~/components/icons/TwitchIcon.vue";
const { locale, locales, setLocale } = useI18n();

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

      <!-- Native input: bind vee-validate's `field` (value/onInput), not
           `componentField` (modelValue, for components), so the loaded and
           the normalized saved channel actually show in the box. -->
      <FormField v-slot="{ field }" name="twitch_channel">
        <FormItem>
          <FormLabel>{{ $t("pages.settings.account.twitch.label") }}</FormLabel>
          <FormControl>
            <div
              class="flex h-10 w-full items-center overflow-hidden rounded-md border border-input bg-background text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
            >
              <span
                class="flex h-full shrink-0 items-center gap-1.5 border-r border-input bg-muted/40 px-3 text-muted-foreground"
                aria-hidden="true"
              >
                <TwitchIcon class="size-3.5 fill-current" />
                twitch.tv/
              </span>
              <input
                v-bind="field"
                type="text"
                inputmode="url"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
                data-testid="settings-twitch-channel"
                class="h-full min-w-0 flex-1 bg-transparent px-3 outline-none placeholder:text-muted-foreground"
                :placeholder="$t('pages.settings.account.twitch.placeholder')"
                :aria-label="$t('pages.settings.account.twitch.label')"
              />
            </div>
          </FormControl>
          <FormDescription>
            {{ $t("pages.settings.account.twitch.help") }}
          </FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>

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
import { normalizeTwitchChannel } from "~/utilities/twitchChannel";
import { fetchMyTwitchChannel, saveMyTwitchChannel } from "~/composables/useTwitchApi";

export default {
  data() {
    return {
      open: false,
      countries: getAllCountries(),
      isLanguagePopoverOpen: false,
      submitting: false,
      baseline: null as string | null,
      isDirty: false,
      // The saved Twitch channel (normalized login), read from the API;
      // undefined until loaded so a slow load never clears the field.
      savedTwitchChannel: undefined as string | null | undefined,
      form: useForm({
        validationSchema: toTypedSchema(
          z.object({
            name: z.string().min(1),
            country: z.string().min(1),
            language: z.string().optional(),
            // Optional; checked here for a quick hint, normalized and
            // validated again by the API when saved.
            twitch_channel: z
              .string()
              .optional()
              .nullable()
              .refine((value) => normalizeTwitchChannel(value).ok, {
                message: this.$t("pages.settings.account.twitch.invalid"),
              }),
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
  async mounted() {
    const channel = await fetchMyTwitchChannel();
    this.savedTwitchChannel = channel;
    if (!this.isDirty) {
      this.form.setFieldValue("twitch_channel", channel ?? "");
      this.takeSnapshot();
    }
  },
  methods: {
    populateForm() {
      this.form.setValues({
        steam_id: this.me.steam_id,
        name: this.me.name,
        country: this.me.country,
        twitch_channel: this.savedTwitchChannel ?? "",
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

        // Twitch is saved through the API (it only ever updates the
        // signed-in player's own channel), and only when it changed.
        const twitch = normalizeTwitchChannel(this.form.values.twitch_channel);
        if (twitch.ok && twitch.channel !== (this.savedTwitchChannel ?? null)) {
          const saved = await saveMyTwitchChannel(twitch.channel);
          if (!saved.ok) {
            toast({
              variant: "destructive",
              title: this.$t("pages.settings.account.twitch.save_failed"),
            });
            return;
          }
          this.savedTwitchChannel = saved.channel;
          this.form.setFieldValue("twitch_channel", saved.channel ?? "");
        }

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
