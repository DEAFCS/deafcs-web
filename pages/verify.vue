<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";
import TimeAgo from "~/components/TimeAgo.vue";

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

      <!-- Already have an application: show status + thread instead of the form. -->
      <Card v-else-if="application" class="p-6">
        <div class="flex items-center justify-between gap-4 mb-4">
          <h3 class="font-mono text-sm tracking-[0.2em] uppercase text-muted-foreground">
            {{ $t("pages.verify.status.title") }}
          </h3>
          <Badge :variant="statusVariant">
            {{ $t(`pages.verify.status.${application.status}`) }}
          </Badge>
        </div>

        <p class="text-sm text-muted-foreground mb-6">
          {{ $t(`pages.verify.status.${application.status}_description`) }}
        </p>

        <div class="flex flex-col gap-3 mb-6" v-if="application.messages?.length">
          <div
            v-for="message in application.messages"
            :key="message.id"
            class="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 p-3"
            :class="{ 'ml-8': !message.is_admin, 'mr-8': message.is_admin }"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-foreground">
                {{ message.is_admin ? $t("pages.verify.status.admin") : $t("pages.verify.status.you") }}
              </span>
              <TimeAgo :date="message.created_at" class="text-xs text-muted-foreground" />
            </div>
            <p class="text-sm text-foreground/90 whitespace-pre-wrap">{{ message.message }}</p>
          </div>
        </div>

        <form
          v-if="application.status === 'pending'"
          @submit.prevent="sendReply"
          class="flex flex-col gap-2"
        >
          <Textarea
            v-model="reply"
            :placeholder="$t('pages.verify.status.reply_placeholder')"
            rows="3"
          />
          <Button type="submit" :loading="sending" :disabled="!reply.trim()" class="self-end">
            {{ $t("pages.verify.status.send_reply") }}
          </Button>
        </form>

        <Button
          v-if="application.status === 'rejected'"
          variant="outline"
          class="mt-4"
          @click="startOver"
        >
          {{ $t("pages.verify.status.apply_again") }}
        </Button>
      </Card>

      <!-- No application yet: show the form. -->
      <Card v-else class="p-6">
        <p class="text-sm text-muted-foreground mb-6">
          {{ $t("pages.verify.intro") }}
        </p>

        <form @submit.prevent="submit" class="flex flex-col gap-6">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">{{ $t("pages.verify.form.is_deaf") }}</label>
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
            <label class="text-sm font-medium">{{ $t("pages.verify.form.country") }}</label>
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
            <label class="text-sm font-medium">{{ $t("pages.verify.form.found_via") }}</label>
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
            <label class="text-sm font-medium">{{ $t("pages.verify.form.knows_deaf_player") }}</label>
            <RadioGroup :model-value="form.knows_deaf_player ? 'yes' : 'no'" class="grid gap-2">
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
            <Input
              v-if="form.knows_deaf_player"
              v-model="form.deaf_player_steam_url"
              :placeholder="$t('pages.verify.form.deaf_player_steam_url')"
              class="mt-2"
            />
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

          <Button
            type="submit"
            variant="tactical"
            :loading="submitting"
            :disabled="!canSubmit"
          >
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

const MY_APPLICATION_QUERY = gql`
  query MyVerificationApplication($steamId: bigint!) {
    verification_applications(
      where: { player_steam_id: { _eq: $steamId } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      status
      messages(order_by: { created_at: asc }) {
        id
        is_admin
        message
        created_at
      }
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
      sending: false,
      countryOpen: false,
      countries: getAllCountries(),
      application: null as any,
      reply: "",
      deafOptions: DEAF_OPTIONS,
      foundViaOptions: FOUND_VIA_OPTIONS,
      form: {
        is_deaf: "yes" as string,
        country: "" as string,
        found_via: "" as string,
        found_via_other: "" as string,
        knows_deaf_player: false,
        deaf_player_steam_url: "" as string,
        additional_info: "" as string,
      },
    };
  },
  async mounted() {
    await this.fetchApplication();
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
    canSubmit() {
      if (!this.form.is_deaf || !this.form.country || !this.form.found_via) {
        return false;
      }
      if (this.form.found_via === "other" && !this.form.found_via_other.trim()) {
        return false;
      }
      return true;
    },
    statusVariant() {
      if (this.application?.status === "approved") return "default";
      if (this.application?.status === "rejected") return "destructive";
      return "secondary";
    },
  },
  methods: {
    async fetchApplication() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          // generated/zeus predates this table (needs a live Hasura codegen
          // run), so Zeus's object-selector builder has no schema info for
          // it -- it can't tell an order_by value is meant to be a bare
          // enum, and always quotes strings, sending "desc" instead of desc
          // (Hasura then rejects it: "expected an enum value for type
          // order_by, but found a string"). Raw GraphQL text sidesteps that
          // entirely since nothing needs to resolve the field's type.
          query: MY_APPLICATION_QUERY,
          variables: { steamId: this.me?.steam_id },
          fetchPolicy: "network-only",
        });
        this.application = data?.verification_applications?.[0] ?? null;
      } finally {
        this.loading = false;
      }
    },
    startOver() {
      this.application = null;
    },
    async submit() {
      if (!this.canSubmit || this.submitting) return;
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
        toast({ title: this.$t("pages.verify.form.submitted") });
        await this.fetchApplication();
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
    async sendReply() {
      if (!this.reply.trim() || this.sending || !this.application) return;
      this.sending = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              insert_verification_application_messages_one: [
                {
                  object: {
                    application_id: this.application.id,
                    message: this.reply.trim(),
                  },
                },
                { id: true },
              ],
            } as any,
          ),
        });
        this.reply = "";
        await this.fetchApplication();
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: (error as Error).message,
        });
      } finally {
        this.sending = false;
      }
    },
  },
};
</script>
