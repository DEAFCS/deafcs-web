<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TimeAgo from "~/components/TimeAgo.vue";

const { t } = useI18n();

useHead({
  title: () => t("pages.verify.status.title"),
});
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>{{ $t("pages.verify.status.title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div class="mx-auto max-w-2xl">
      <div v-if="loading" class="flex justify-center py-12">
        <Spinner class="h-6 w-6" />
      </div>

      <Card v-else-if="!application" class="p-6">
        <p class="text-sm text-muted-foreground">
          {{ $t("pages.verify.status.not_found") }}
        </p>
        <NuxtLink to="/verify" class="inline-block mt-4 text-sm text-[hsl(var(--tac-amber))] hover:underline">
          {{ $t("pages.verify.status.go_apply") }}
        </NuxtLink>
      </Card>

      <Card v-else class="p-6">
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

        <NuxtLink
          v-if="application.status === 'rejected'"
          to="/verify"
          class="inline-block mt-4 text-sm text-[hsl(var(--tac-amber))] hover:underline"
        >
          {{ $t("pages.verify.status.apply_again") }}
        </NuxtLink>
      </Card>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import { generateMutation } from "~/graphql/graphqlGen";
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";

// Raw GraphQL text -- see pages/verify/index.vue's comment on
// MY_APPLICATION_STATUS_QUERY for why (order_by needs schema info Zeus
// doesn't have for this pre-codegen table).
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

export default {
  data() {
    return {
      loading: true,
      sending: false,
      application: null as any,
      reply: "",
    };
  },
  async mounted() {
    await this.fetchApplication();
  },
  computed: {
    me() {
      return useAuthStore().me;
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
          query: MY_APPLICATION_QUERY,
          variables: { steamId: this.me?.steam_id },
          fetchPolicy: "network-only",
        });
        this.application = data?.verification_applications?.[0] ?? null;
      } finally {
        this.loading = false;
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
