<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import TimeAgo from "~/components/TimeAgo.vue";
import TimezoneFlag from "~/components/TimezoneFlag.vue";

definePageMeta({
  middleware: "admin",
});

const { t } = useI18n();

useHead({
  title: () => t("pages.verification_applications.detail_title"),
});
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>{{ $t("pages.verification_applications.detail_title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div v-if="loading" class="flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>

    <div v-else-if="!application" class="text-sm text-muted-foreground py-12 text-center">
      {{ $t("pages.verification_applications.not_found") }}
    </div>

    <div v-else class="mx-auto max-w-2xl flex flex-col gap-6">
      <Card class="p-6">
        <div class="flex items-center justify-between gap-4 mb-4">
          <PlayerDisplay :player="application.player" :show-elo="false" linkable />
          <div class="flex items-center gap-2">
            <Badge :variant="statusVariant">
              {{ $t(`pages.verify.status.${application.status}`) }}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-destructive"
              :title="$t('pages.verification_applications.delete')"
              @click="deleteDialogOpen = true"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>

        <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted-foreground">{{ $t("pages.verify.form.is_deaf") }}</dt>
          <dd>{{ $t(`pages.verify.form.is_deaf_options.${application.is_deaf}`) }}</dd>

          <dt class="text-muted-foreground">{{ $t("pages.verify.form.country") }}</dt>
          <dd class="flex items-center gap-2">
            <TimezoneFlag :country="application.country" />
            {{ countries[application.country]?.name ?? application.country }}
          </dd>

          <dt class="text-muted-foreground">{{ $t("pages.verify.form.found_via") }}</dt>
          <dd>{{ foundViaLabel(application.found_via) }}</dd>

          <dt class="text-muted-foreground">{{ $t("pages.verify.form.knows_deaf_player") }}</dt>
          <dd>
            <template v-if="application.knows_deaf_player">
              {{ $t("common.yes") }}
              <a
                v-if="application.deaf_player_steam_url"
                :href="application.deaf_player_steam_url"
                target="_blank"
                class="text-[hsl(var(--tac-amber))] hover:underline ml-1"
              >{{ application.deaf_player_steam_url }}</a>
            </template>
            <template v-else>{{ $t("common.no") }}</template>
          </dd>

          <template v-if="application.additional_info">
            <dt class="text-muted-foreground">{{ $t("pages.verify.form.additional_info") }}</dt>
            <dd class="whitespace-pre-wrap">{{ application.additional_info }}</dd>
          </template>

          <dt class="text-muted-foreground">{{ $t("pages.verification_applications.columns.submitted") }}</dt>
          <dd><TimeAgo :date="application.created_at" /></dd>
        </dl>

        <div class="flex gap-2 mt-6" v-if="application.status === 'pending'">
          <Button variant="tactical" :loading="approving" @click="approve">
            {{ $t("pages.verification_applications.approve") }}
          </Button>
          <Button variant="destructive" :loading="rejecting" @click="rejectDialogOpen = true">
            {{ $t("pages.verification_applications.reject") }}
          </Button>
        </div>
      </Card>

      <Card class="p-6">
        <h3 class="font-mono text-sm tracking-[0.2em] uppercase text-muted-foreground mb-4">
          {{ $t("pages.verification_applications.thread") }}
        </h3>

        <div class="flex flex-col gap-3 mb-4" v-if="application.messages?.length">
          <div
            v-for="message in application.messages"
            :key="message.id"
            class="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 p-3"
            :class="{ 'mr-8': !message.is_admin, 'ml-8': message.is_admin }"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-medium text-foreground">
                {{ message.is_admin ? $t("pages.verify.status.admin") : application.player.name }}
              </span>
              <TimeAgo :date="message.created_at" class="text-xs text-muted-foreground" />
            </div>
            <p class="text-sm text-foreground/90 whitespace-pre-wrap">{{ message.message }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-muted-foreground mb-4">
          {{ $t("pages.verification_applications.no_messages") }}
        </p>

        <form @submit.prevent="sendReply" class="flex flex-col gap-2">
          <Textarea
            v-model="reply"
            :placeholder="$t('pages.verify.status.reply_placeholder')"
            rows="3"
          />
          <Button type="submit" :loading="sending" :disabled="!reply.trim()" class="self-end">
            {{ $t("pages.verify.status.send_reply") }}
          </Button>
        </form>
      </Card>
    </div>

    <Dialog v-model:open="rejectDialogOpen">
      <DialogContent>
        <DialogTitle>{{ $t("pages.verification_applications.reject") }}</DialogTitle>
        <Textarea
          v-model="rejectReason"
          :placeholder="$t('pages.verification_applications.reject_reason_placeholder')"
          rows="3"
        />
        <div class="flex justify-end gap-2 mt-2">
          <Button variant="outline" @click="rejectDialogOpen = false">
            {{ $t("common.cancel") }}
          </Button>
          <Button variant="destructive" :loading="rejecting" @click="reject">
            {{ $t("pages.verification_applications.reject") }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteDialogOpen">
      <DialogContent>
        <DialogTitle>{{ $t("pages.verification_applications.delete_confirm_title") }}</DialogTitle>
        <p class="text-sm text-muted-foreground">
          {{ $t("pages.verification_applications.delete_confirm_description") }}
        </p>
        <div class="flex justify-end gap-2 mt-2">
          <Button variant="outline" @click="deleteDialogOpen = false">
            {{ $t("common.cancel") }}
          </Button>
          <Button variant="destructive" :loading="deleting" @click="deleteApplication">
            {{ $t("pages.verification_applications.delete") }}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </PageTransition>
</template>

<script lang="ts">
import { getAllCountries } from "countries-and-timezones";
import { Trash2 } from "lucide-vue-next";
import { generateMutation } from "~/graphql/graphqlGen";
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";

// Raw GraphQL text, not the Zeus object-selector builder -- see
// ALL_APPLICATIONS_QUERY in verification-applications/index.vue for why
// (order_by needs schema info Zeus doesn't have for this pre-codegen
// table).
const APPLICATION_DETAIL_QUERY = gql`
  query VerificationApplicationDetail($id: uuid!) {
    verification_applications_by_pk(id: $id) {
      id
      status
      is_deaf
      country
      found_via
      knows_deaf_player
      deaf_player_steam_url
      additional_info
      created_at
      player {
        steam_id
        name
        avatar_url
        custom_avatar_url
        country
      }
      messages(order_by: { created_at: asc }) {
        id
        is_admin
        message
        created_at
      }
    }
  }
`;

export default {
  data() {
    return {
      loading: true,
      approving: false,
      rejecting: false,
      deleting: false,
      sending: false,
      rejectDialogOpen: false,
      deleteDialogOpen: false,
      rejectReason: "",
      reply: "",
      application: null as any,
      countries: getAllCountries(),
    };
  },
  async mounted() {
    await this.fetchApplication();
  },
  computed: {
    statusVariant() {
      if (this.application?.status === "approved") return "default";
      if (this.application?.status === "rejected") return "destructive";
      return "secondary";
    },
  },
  methods: {
    // found_via stores the option key (e.g. "discord") for every choice
    // except "other", which stores the applicant's own free text instead --
    // show the translated label when it's a known key, the raw value
    // otherwise (older rows, before this became a dropdown, are free text).
    foundViaLabel(value: string): string {
      const known = ["google", "discord", "reddit", "youtube", "twitch", "tiktok", "instagram_facebook", "friend", "steam"];
      if (known.includes(value)) {
        return this.$t(`pages.verify.form.found_via_options.${value}`);
      }
      return value;
    },
    async fetchApplication() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          query: APPLICATION_DETAIL_QUERY,
          variables: { id: this.$route.params.id },
          fetchPolicy: "network-only",
        });
        this.application = data?.verification_applications_by_pk ?? null;
      } finally {
        this.loading = false;
      }
    },
    async approve() {
      if (this.approving) return;
      this.approving = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              approveVerificationApplication: [
                { application_id: this.$route.params.id },
                { success: true },
              ],
            } as any,
          ),
        });
        toast({ title: this.$t("pages.verification_applications.approved") });
        await this.fetchApplication();
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: (error as Error).message,
        });
      } finally {
        this.approving = false;
      }
    },
    async reject() {
      if (this.rejecting) return;
      this.rejecting = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              rejectVerificationApplication: [
                {
                  application_id: this.$route.params.id,
                  reason: this.rejectReason.trim() || null,
                },
                { success: true },
              ],
            } as any,
          ),
        });
        this.rejectDialogOpen = false;
        this.rejectReason = "";
        toast({ title: this.$t("pages.verification_applications.rejected") });
        await this.fetchApplication();
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: (error as Error).message,
        });
      } finally {
        this.rejecting = false;
      }
    },
    async deleteApplication() {
      if (this.deleting) return;
      this.deleting = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              delete_verification_applications_by_pk: [
                { id: this.$route.params.id },
                { id: true },
              ],
            } as any,
          ),
        });
        this.deleteDialogOpen = false;
        toast({ title: this.$t("pages.verification_applications.deleted") });
        await this.$router.push({ name: "verification-applications" });
      } catch (error) {
        toast({
          variant: "destructive",
          title: this.$t("common.error"),
          description: (error as Error).message,
        });
      } finally {
        this.deleting = false;
      }
    },
    async sendReply() {
      if (!this.reply.trim() || this.sending) return;
      this.sending = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              insert_verification_application_messages_one: [
                {
                  object: {
                    application_id: this.$route.params.id,
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
