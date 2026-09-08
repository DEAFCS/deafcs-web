<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import RequirementBadge from "~/components/RequirementBadge.vue";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import { Checkbox } from "~/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Card, CardContent } from "~/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "~/components/ui/input-group";
import SteamIcon from "~/components/icons/SteamIcon.vue";
import { Info, Instagram, Facebook } from "lucide-vue-next";

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
    <div v-if="loading" class="mx-auto max-w-2xl flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>

    <!-- Just submitted, or an application is already pending/approved --
         a short confirmation only. The status/reply thread lives on its
         own page (pages/verify/status.vue), reached from the bell
         notification once it's reviewed/replied to -- not landed on
         straight after submitting. -->
    <div v-else-if="justSubmitted || (existingApplication && existingApplication.status !== 'rejected')" class="mx-auto max-w-2xl">
      <Card class="p-6">
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
    </div>

    <!-- No application, or the last one was rejected: show the form. -->
    <div v-else class="mx-auto max-w-4xl flex flex-col gap-6">
      <p class="text-sm text-muted-foreground">
        {{ $t("pages.verify.intro") }}
      </p>

      <Alert>
        <Info class="h-4 w-4" />
        <AlertTitle>{{ $t("pages.verify.webcam_notice.title") }}</AlertTitle>
        <AlertDescription class="flex flex-col gap-1">
          <span>{{ $t("pages.verify.webcam_notice.body_1") }}</span>
          <span>{{ $t("pages.verify.webcam_notice.body_2") }}</span>
        </AlertDescription>
      </Alert>

      <form @submit.prevent="submit" class="flex flex-col gap-6">
        <div class="grid gap-6 lg:grid-cols-2">
          <!-- About You -->
          <div class="flex flex-col gap-3">
            <span :class="tacticalSectionLabelClasses">
              <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
              {{ $t("pages.verify.form.sections.about_you") }}
            </span>
            <Card class="bg-card/20">
              <CardContent class="flex flex-col gap-6 p-4 sm:p-6">
                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <label class="text-sm font-medium">{{ $t("pages.verify.form.is_deaf") }}</label>
                    <RequirementBadge required />
                  </div>
                  <RadioGroup
                    v-model="form.is_deaf"
                    class="flex flex-wrap gap-2"
                    :aria-label="$t('pages.verify.form.is_deaf')"
                  >
                    <RadioGroupItem
                      v-for="option in deafOptions"
                      :key="option"
                      :value="option"
                      :class="compactRadioPillClass"
                    >
                      {{ $t(`pages.verify.form.is_deaf_options.${option}`) }}
                    </RadioGroupItem>
                  </RadioGroup>
                </div>

                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <label class="text-sm font-medium">{{ $t("pages.verify.form.country") }}</label>
                    <RequirementBadge required />
                  </div>
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
                  <div class="flex items-center gap-2">
                    <label class="text-sm font-medium">{{ $t("pages.verify.form.found_via") }}</label>
                    <RequirementBadge :required="false" />
                  </div>
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
              </CardContent>
            </Card>
          </div>

          <!-- Community + Social Profiles -->
          <div class="flex flex-col gap-3">
            <span :class="tacticalSectionLabelClasses">
              <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
              {{ $t("pages.verify.form.sections.community") }}
            </span>
            <Card class="bg-card/20">
              <CardContent class="flex flex-col gap-6 p-4 sm:p-6">
                <div class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <label class="text-sm font-medium">{{ $t("pages.verify.form.knows_deaf_player") }}</label>
                    <RequirementBadge :required="false" />
                  </div>
                  <RadioGroup
                    v-model="knowsDeafPlayerValue"
                    class="flex flex-wrap gap-2"
                    :aria-label="$t('pages.verify.form.knows_deaf_player')"
                  >
                    <RadioGroupItem value="yes" :class="compactRadioPillClass">
                      {{ $t("common.yes") }}
                    </RadioGroupItem>
                    <RadioGroupItem value="no" :class="compactRadioPillClass">
                      {{ $t("common.no") }}
                    </RadioGroupItem>
                  </RadioGroup>

                  <div v-if="form.knows_deaf_player" class="flex flex-col gap-3 mt-2">
                    <div class="flex items-center gap-2">
                      <label class="text-sm font-medium">{{ $t("pages.verify.form.who_do_you_know") }}</label>
                      <RequirementBadge :required="false" />
                    </div>

                    <div class="flex flex-col gap-1.5">
                      <label for="deaf-player-nickname" class="text-xs text-muted-foreground">
                        {{ $t("pages.verify.form.deaf_player_nickname") }}
                      </label>
                      <Input
                        id="deaf-player-nickname"
                        v-model="form.deaf_player_nickname"
                        :maxlength="200"
                        :aria-label="$t('pages.verify.form.deaf_player_nickname')"
                      />
                    </div>

                    <div class="flex flex-col gap-1.5">
                      <label for="deaf-player-steam-url" class="text-xs text-muted-foreground">
                        {{ $t("pages.verify.form.deaf_player_steam_url") }}
                      </label>
                      <InputGroup>
                        <InputGroupAddon :title="$t('pages.verify.form.deaf_player_steam_url')">
                          <SteamIcon class="h-4 w-4 fill-current" />
                        </InputGroupAddon>
                        <InputGroupInput
                          id="deaf-player-steam-url"
                          v-model="form.deaf_player_steam_url"
                          placeholder="https://steamcommunity.com/..."
                          :aria-label="$t('pages.verify.form.deaf_player_steam_url')"
                        />
                      </InputGroup>
                    </div>
                  </div>
                </div>

                <div class="flex flex-col gap-3 border-t border-border/50 pt-4">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium">{{ $t("pages.verify.form.sections.social_profiles") }}</span>
                    <RequirementBadge :required="false" />
                  </div>
                  <p class="text-xs text-muted-foreground">
                    {{ $t("pages.verify.form.social_profiles_note") }}
                  </p>
                  <InputGroup>
                    <InputGroupAddon :title="$t('pages.verify.form.social_instagram_url')">
                      <Instagram class="h-4 w-4" />
                    </InputGroupAddon>
                    <InputGroupInput
                      v-model="form.social_instagram_url"
                      placeholder="https://instagram.com/..."
                      :aria-label="$t('pages.verify.form.social_instagram_url')"
                    />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon :title="$t('pages.verify.form.social_facebook_url')">
                      <Facebook class="h-4 w-4" />
                    </InputGroupAddon>
                    <InputGroupInput
                      v-model="form.social_facebook_url"
                      placeholder="https://facebook.com/..."
                      :aria-label="$t('pages.verify.form.social_facebook_url')"
                    />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon :title="$t('pages.verify.form.social_vk_url')">
                      <span class="text-[10px] font-bold leading-none tracking-wide" aria-hidden="true">VK</span>
                    </InputGroupAddon>
                    <InputGroupInput
                      v-model="form.social_vk_url"
                      placeholder="https://vk.com/..."
                      :aria-label="$t('pages.verify.form.social_vk_url')"
                    />
                  </InputGroup>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Additional Information -->
        <Card class="bg-card/20">
          <CardContent class="flex flex-col gap-2 p-4 sm:p-6">
            <div class="flex items-center gap-2">
              <label class="text-sm font-medium">{{ $t("pages.verify.form.additional_info") }}</label>
              <RequirementBadge :required="false" />
            </div>
            <Textarea
              v-model="form.additional_info"
              :placeholder="$t('pages.verify.form.additional_info_placeholder')"
              :maxlength="1000"
              rows="3"
            />
          </CardContent>
        </Card>

        <!-- Account Declaration -->
        <Card class="bg-card/20">
          <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ $t("pages.verify.form.account_declaration_title") }}</span>
              <RequirementBadge required />
            </div>
            <label class="flex items-start gap-2 text-sm">
              <Checkbox v-model="form.account_declaration_accepted" class="mt-0.5" />
              <span>{{ $t("pages.verify.form.account_declaration_label") }}</span>
            </label>
          </CardContent>
        </Card>

        <Button type="submit" variant="tactical" :loading="submitting" class="w-full">
          {{ $t("pages.verify.form.submit") }}
        </Button>
      </form>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import { ChevronsUpDown, Check } from "lucide-vue-next";
import { getAllCountries } from "countries-and-timezones";
import { generateMutation } from "~/graphql/graphqlGen";
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

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

// Deaf-status enum values are unchanged (see e_verification_deaf_statuses) --
// only their displayed labels changed (Deaf / Hard of hearing / Neither or
// Other), so historical applications and the admin detail page's rendering
// stay correct without a data migration.
const DEAF_OPTIONS = ["yes", "hard_of_hearing", "no"] as const;
// "tiktok" removed from the selectable list only -- its i18n key
// (pages.verify.form.found_via_options.tiktok) stays in en.json since
// verification-applications/[id].vue's foundViaLabel() still needs it to
// render any historical application that used it correctly.
const FOUND_VIA_OPTIONS = [
  "google",
  "discord",
  "reddit",
  "youtube",
  "twitch",
  "instagram_facebook",
  "friend",
  "steam",
  "other",
] as const;

// Compact selectable-pill styling for the two RadioGroups above: same
// dimensions/typography as buttonVariants' size "sm", outline by default,
// switching to the tactical/amber look via data-[state=checked] -- reka-ui
// sets that attribute on the underlying real role="radio" button itself, so
// this is still a semantic radiogroup, just restyled away from the default
// circle+checkmark indicator. RadioGroupItem.vue only applies its fixed
// circle sizing (aspect-square/h-4/w-4/rounded-full) when NO custom slot
// content is passed, so a pill like this one sizes naturally to its own
// classes/text with nothing fixed left to fight -- no w-4/aspect-square
// leaking through and squashing the label (the production bug this fixed).
const compactRadioPillClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md h-8 px-3 text-xs font-medium text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground data-[state=checked]:border-transparent data-[state=checked]:bg-[hsl(var(--tac-amber))] data-[state=checked]:text-[hsl(var(--tac-amber-foreground))] data-[state=checked]:font-bold data-[state=checked]:uppercase data-[state=checked]:tracking-[0.18em] data-[state=checked]:shadow-[0_0_0_1px_hsl(var(--tac-amber)/0.4),0_6px_16px_-6px_hsl(var(--tac-amber)/0.5)] data-[state=checked]:hover:bg-[hsl(var(--tac-amber)/0.9)]";

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
      tacticalSectionLabelClasses,
      tacticalSectionTickClasses,
      compactRadioPillClass,
      form: {
        // Nothing pre-selected -- these used to default to "yes"/false,
        // which rendered as an already-checked radio option despite the
        // applicant never having touched it (reported bug).
        is_deaf: "" as string,
        country: "" as string,
        found_via: "" as string,
        found_via_other: "" as string,
        knows_deaf_player: null as boolean | null,
        deaf_player_nickname: "" as string,
        deaf_player_steam_url: "" as string,
        social_instagram_url: "" as string,
        social_facebook_url: "" as string,
        social_vk_url: "" as string,
        additional_info: "" as string,
        account_declaration_accepted: false,
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
    // RadioGroup's v-model is string-valued; bridges it to the boolean
    // (or unanswered/null) form field it actually represents. A real
    // get/set computed, not a one-way :model-value -- with only
    // :model-value, RadioGroupItem's own internal click/keyboard handling
    // has no update:model-value listener to call, so it silently does
    // nothing (same bug this exact pattern already fixed once before).
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
    // Returns the list of missing/invalid-field message keys, empty if the
    // form is complete. Named, not just a boolean, so submit() can surface
    // exactly what's wrong (reported: the submit button just stayed
    // disabled with no explanation, for the old required-field set).
    missingFields(): string[] {
      const missing: string[] = [];
      if (!this.form.is_deaf) missing.push("is_deaf");
      if (!this.form.country) missing.push("country");
      if (this.form.found_via === "other" && !this.form.found_via_other.trim()) {
        missing.push("found_via");
      }
      if (!this.form.account_declaration_accepted) {
        missing.push("account_declaration");
      }
      for (const [field, value] of [
        ["social_instagram_url", this.form.social_instagram_url],
        ["social_facebook_url", this.form.social_facebook_url],
        ["social_vk_url", this.form.social_vk_url],
        ["deaf_player_steam_url", this.form.deaf_player_steam_url],
      ] as const) {
        const trimmed = value.trim();
        if (trimmed && !isValidHttpUrl(trimmed)) {
          missing.push(field);
        }
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
                        : this.form.found_via || null,
                    knows_deaf_player: this.form.knows_deaf_player ?? false,
                    deaf_player_nickname: this.form.knows_deaf_player
                      ? this.form.deaf_player_nickname?.trim() || null
                      : null,
                    deaf_player_steam_url: this.form.knows_deaf_player
                      ? this.form.deaf_player_steam_url?.trim() || null
                      : null,
                    social_instagram_url: this.form.social_instagram_url?.trim() || null,
                    social_facebook_url: this.form.social_facebook_url?.trim() || null,
                    social_vk_url: this.form.social_vk_url?.trim() || null,
                    additional_info: this.form.additional_info?.trim() || null,
                    // The actual stored value is server-controlled, not
                    // this one: hasura/triggers/verification_applications.sql
                    // overwrites it with now() on every insert and rejects
                    // the insert outright if it arrives null. This is just
                    // the client's signal that the (required, UI-blocked)
                    // checkbox was checked.
                    account_declaration_accepted_at: new Date().toISOString(),
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
