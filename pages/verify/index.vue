<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";

const { t } = useI18n();

useHead({
  title: () => t("pages.verify.title"),
});
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>{{ $t("pages.verify.title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div class="mx-auto max-w-2xl">
      <div v-if="loading" class="flex justify-center py-12">
        <Spinner class="h-6 w-6" />
      </div>

      <!-- Just submitted, or an application is already pending/approved --
           a short confirmation only. The status/reply thread lives on its
           own page (pages/verify/status.vue), reached from the bell
           notification once it's reviewed/replied to -- not landed on
           straight after submitting. -->
      <Card v-else-if="justSubmitted || (existingApplication && existingApplication.status !== 'rejected')" class="p-6">
        <h3 class="font-mono text-sm tracking-[0.2em] uppercase text-muted-foreground mb-3">
          {{ $t("pages.verify.status.title") }}
        </h3>
        <p class="text-sm text-muted-foreground">
          {{ $t(`pages.verify.status.${existingApplication?.status ?? "pending"}_description`) }}
        </p>
        <NuxtLink
          v-if="existingApplication?.status === 'approved'"
          to="/verify/status"
          class="inline-block mt-4 text-sm text-[hsl(var(--tac-amber))] hover:underline"
        >
          {{ $t("pages.verify.status.view_status") }}
        </NuxtLink>
      </Card>

      <!-- No application, or the last one was rejected: show the form. -->
      <Card v-else class="p-6">
        <p class="text-sm text-muted-foreground mb-6">
          {{ $t("pages.verify.intro") }}
        </p>

        <form @submit.prevent="submit" class="flex flex-col gap-6">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">{{ $t("pages.verify.form.is_deaf") }}*</label>
            <RadioGroup v-model="form.is_deaf" class="grid gap-2">
              <div
                v-for="option in deafOptions"
                :key="option"
                class="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                @click="form.is_deaf = option"
              >
                <RadioGroupItem :id="`deaf-${option}`" :value="option" />
                <label :for="`deaf-${option}`" class="text-sm cursor-pointer">
                  {{ $t(`pages.verify.form.is_deaf_options.${option}`) }}
                </label>
              </div>
            </RadioGroup>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">{{ $t("pages.verify.form.country") }}*</label>
            <Popover v-model:open="countryOpen">
              <PopoverTrigger as-child>
                <Button role="combobox" variant="outline" class="justify-between">
                  <div class="flex items-center gap-2 min-w-0">
                    <TimezoneFlag v-if="form.country" :country="form.country" />
                    <span class="truncate">
                      {{ form.country ? countries[form.country]?.name : $t("pages.settings.account.select_country") }}
                    </span>
                  </div>
                  <ChevronsUpDown class="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput :placeholder="$t('pages.settings.account.search_country')" />
                  <CommandEmpty>{{ $t("pages.settings.account.no_country_found") }}</CommandEmpty>
                  <CommandList>
                    <CommandGroup>
                      <CommandItem
                        v-for="country in countryList"
                        :key="country.id"
                        :value="country.name"
                        @select="() => { form.country = country.id; countryOpen = false; }"
                      >
                        <div class="flex items-center gap-2 w-full min-w-0">
                          <TimezoneFlag :country="country.id" />
                          <span class="truncate">{{ country.name }}</span>
                        </div>
                        <Check
                          :class="['ml-auto h-4 w-4 shrink-0', form.country === country.id ? 'opacity-100' : 'opacity-0']"
                        />
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">{{ $t("pages.verify.form.found_via") }}*</label>
            <Select v-model="form.found_via">
              <SelectTrigger>
                <SelectValue :placeholder="$t('pages.verify.form.found_via_placeholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="option in foundViaOptions" :key="option" :value="option">
                  {{ $t(`pages.verify.form.found_via_options.${option}`) }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              v-if="form.found_via === 'other'"
              v-model="form.found_via_other"
              :maxlength="300"
              :placeholder="$t('pages.verify.form.found_via_other_placeholder')"
              class="mt-2"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">{{ $t("pages.verify.form.knows_deaf_player") }}*</label>
            <RadioGroup v-model="knowsDeafPlayerValue" class="grid gap-2">
              <div
                class="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                @click="form.knows_deaf_player = true"
              >
                <RadioGroupItem id="knows-yes" value="yes" />
                <label for="knows-yes" class="text-sm cursor-pointer">{{ $t("common.yes") }}</label>
              </div>
              <div
                class="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                @click="form.knows_deaf_player = false"
              >
                <RadioGroupItem id="knows-no" value="no" />
                <label for="knows-no" class="text-sm cursor-pointer">{{ $t("common.no") }}</label>
              </div>
            </RadioGroup>
            <div v-if="form.knows_deaf_player" class="flex flex-col gap-2 mt-2">
              <label class="text-sm font-medium">{{ $t("pages.verify.form.deaf_player_steam_url") }}*</label>
              <Input v-model="form.deaf_player_steam_url" placeholder="https://steamcommunity.com/..." />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">{{ $t("pages.verify.form.additional_info") }}</label>
            <Textarea
              v-model="form.additional_info"
              :placeholder="$t('pages.verify.form.additional_info_placeholder')"
              :maxlength="1000"
              rows="3"
            />
          </div>

          <Button type="submit" variant="tactical" :loading="submitting">
            {{ $t("pages.verify.form.submit") }}
          </Button>
        </form>
      </Card>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import { ChevronsUpDown, Check } from "lucide-vue-next";
import { getAllCountries } from "countries-and-timezones";
import { generateMutation } from "~/graphql/graphqlGen";
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";

// Raw GraphQL text, not the Zeus object-selector builder -- generated/zeus
// predates this table (needs a live Hasura codegen run), so Zeus can't
// resolve order_by's field type and always quotes it as a string, which
// Hasura rejects ("expected an enum value for type order_by, but found a
// string").
const MY_APPLICATION_STATUS_QUERY = gql`
  query MyVerificationApplicationStatus($steamId: bigint!) {
    verification_applications(
      where: { player_steam_id: { _eq: $steamId } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      status
    }
  }
`;

const DEAF_OPTIONS = ["yes", "no", "hard_of_hearing"] as const;
const FOUND_VIA_OPTIONS = [
  "google",
  "discord",
  "reddit",
  "youtube",
  "twitch",
  "tiktok",
  "instagram_facebook",
  "friend",
  "steam",
  "other",
] as const;

export default {
  data() {
    return {
      loading: true,
      submitting: false,
      countryOpen: false,
      justSubmitted: false,
      countries: getAllCountries(),
      existingApplication: null as { id: string; status: string } | null,
      deafOptions: DEAF_OPTIONS,
      foundViaOptions: FOUND_VIA_OPTIONS,
      form: {
        // Nothing pre-selected -- these used to default to "yes"/false,
        // which rendered as an already-checked radio option despite the
        // applicant never having touched it (reported bug).
        is_deaf: "" as string,
        country: "" as string,
        found_via: "" as string,
        found_via_other: "" as string,
        knows_deaf_player: null as boolean | null,
        deaf_player_steam_url: "" as string,
        additional_info: "" as string,
      },
    };
  },
  async mounted() {
    await this.fetchStatus();
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
    countryList() {
      return Object.values(this.countries).sort((a: any, b: any) =>
        a.name.localeCompare(b.name),
      );
    },
    // A real get/set computed (v-model), not a one-way :model-value -- with
    // only :model-value, RadioGroupItem's own internal click/keyboard
    // handling (clicking exactly the circle, not the surrounding label/bar)
    // had no update:model-value listener to call, so it silently did
    // nothing. The wrapper divs' own @click still worked since that's a
    // separate, always-on listener -- reported bug: clicking the small
    // circle itself did nothing, only clicking the text/bar around it did.
    knowsDeafPlayerValue: {
      get(): string | undefined {
        if (this.form.knows_deaf_player === true) return "yes";
        if (this.form.knows_deaf_player === false) return "no";
        return undefined;
      },
      set(value: string) {
        this.form.knows_deaf_player = value === "yes";
      },
    },
  },
  methods: {
    async fetchStatus() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          query: MY_APPLICATION_STATUS_QUERY,
          variables: { steamId: this.me?.steam_id },
          fetchPolicy: "network-only",
        });
        this.existingApplication = data?.verification_applications?.[0] ?? null;
      } finally {
        this.loading = false;
      }
    },
    // Returns the list of missing-required-field message keys, empty if
    // the form is complete. Named, not just a boolean, so submit() can
    // surface exactly what's missing (reported: the submit button just
    // stayed disabled with no explanation).
    missingFields(): string[] {
      const missing: string[] = [];
      if (!this.form.is_deaf) missing.push("is_deaf");
      if (!this.form.country) missing.push("country");
      if (!this.form.found_via) missing.push("found_via");
      if (this.form.found_via === "other" && !this.form.found_via_other.trim()) {
        missing.push("found_via");
      }
      if (this.form.knows_deaf_player === null) missing.push("knows_deaf_player");
      if (
        this.form.knows_deaf_player === true &&
        !this.form.deaf_player_steam_url.trim()
      ) {
        missing.push("deaf_player_steam_url");
      }
      return missing;
    },
    async submit() {
      if (this.submitting) return;

      const missing = this.missingFields();
      if (missing.length > 0) {
        const fieldLabels = missing
          .map((field) => this.$t(`pages.verify.form.${field}`))
          .join(", ");
        toast({
          variant: "destructive",
          title: this.$t("pages.verify.form.missing_required_title"),
          description: this.$t("pages.verify.form.missing_required_description", {
            fields: fieldLabels,
          }),
        });
        return;
      }

      this.submitting = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              insert_verification_applications_one: [
                {
                  object: {
                    is_deaf: this.form.is_deaf,
                    country: this.form.country,
                    found_via:
                      this.form.found_via === "other"
                        ? this.form.found_via_other.trim()
                        : this.form.found_via,
                    knows_deaf_player: this.form.knows_deaf_player,
                    deaf_player_steam_url: this.form.knows_deaf_player
                      ? this.form.deaf_player_steam_url?.trim() || null
                      : null,
                    additional_info: this.form.additional_info?.trim() || null,
                  },
                },
                { id: true },
              ],
            } as any,
          ),
        });
        // Confirmation only -- not the status/reply thread. See the
        // comment on the top-level Card v-else-if above.
        this.justSubmitted = true;
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: (error as Error).message,
        });
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>
