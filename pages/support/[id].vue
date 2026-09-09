<script setup lang="ts">
import { ArrowLeft, Lock, RotateCcw, XCircle } from "lucide-vue-next";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import TimeAgo from "~/components/TimeAgo.vue";
import { Textarea } from "~/components/ui/textarea";

useHead({ title: "Support Request" });
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>Support Request</template>
      <template #actions>
        <Button as-child variant="outline"
          ><NuxtLink :to="isAdmin ? '/support-requests' : '/support'"
            ><ArrowLeft />Back</NuxtLink
          ></Button
        >
      </template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div v-if="loading" class="flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>
    <Card
      v-else-if="!request"
      class="p-6 text-center text-sm text-muted-foreground"
      >Request not found, or you do not have permission to view it.</Card
    >
    <div v-else class="mx-auto flex max-w-4xl flex-col gap-6">
      <Card class="p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p
              class="text-xs font-bold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))]"
            >
              {{ categoryLabel(request.category) }}
            </p>
            <h1 class="mt-1 text-xl font-semibold">{{ request.subject }}</h1>
          </div>
          <Badge
            :variant="request.status === 'closed' ? 'secondary' : 'default'"
            >{{ request.status === "closed" ? "Closed" : "Open" }}</Badge
          >
        </div>
        <div
          v-if="isAdmin"
          class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5"
        >
          <PlayerDisplay :player="request.player" :show-elo="false" linkable />
          <Button
            v-if="request.status === 'open'"
            variant="outline"
            :loading="changingStatus"
            @click="changeStatus('closed')"
            ><XCircle />Close Request</Button
          >
          <Button
            v-else
            variant="outline"
            :loading="changingStatus"
            @click="changeStatus('open')"
            ><RotateCcw />Reopen Request</Button
          >
        </div>
        <dl class="mt-5 grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt class="text-muted-foreground">Submitted</dt>
          <dd><TimeAgo :date="request.created_at" /></dd>
          <template v-if="request.category === 'player_report'">
            <dt class="text-muted-foreground">Privacy</dt>
            <dd class="flex items-center gap-2">
              <Lock class="h-4 w-4" />Visible only to the reporting player and
              administrators
            </dd>
            <dt class="text-muted-foreground">Reported SteamID</dt>
            <dd>{{ request.reported_player_steam_id || "-" }}</dd>
            <dt class="text-muted-foreground">Steam profile</dt>
            <dd>
              <a
                v-if="request.reported_player_profile_url"
                :href="request.reported_player_profile_url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[hsl(var(--tac-amber))] hover:underline"
                >{{ request.reported_player_profile_url }}</a
              ><template v-else>-</template>
            </dd>
            <dt class="text-muted-foreground">Related match</dt>
            <dd>{{ request.related_match_reference || "-" }}</dd>
            <dt class="text-muted-foreground">Reason</dt>
            <dd>{{ request.report_reason }}</dd>
            <dt class="text-muted-foreground">Details</dt>
            <dd class="whitespace-pre-wrap">{{ request.report_details }}</dd>
            <dt class="text-muted-foreground">Evidence</dt>
            <dd class="whitespace-pre-wrap">
              {{ request.report_evidence || "-" }}
            </dd>
          </template>
          <template v-if="request.category === 'organizer_application'">
            <dt class="text-muted-foreground">Motivation</dt>
            <dd class="whitespace-pre-wrap">
              {{ request.organizer_motivation }}
            </dd>
            <dt class="text-muted-foreground">Previous experience</dt>
            <dd class="whitespace-pre-wrap">
              {{ request.organizer_experience || "-" }}
            </dd>
            <dt class="text-muted-foreground">Languages</dt>
            <dd>{{ request.organizer_languages || "-" }}</dd>
            <dt class="text-muted-foreground">Additional information</dt>
            <dd class="whitespace-pre-wrap">
              {{ request.organizer_additional_info || "-" }}
            </dd>
          </template>
        </dl>
      </Card>

      <Card class="p-6">
        <h2
          class="font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground"
        >
          Conversation
        </h2>
        <div class="mt-4 flex flex-col gap-3">
          <div class="mr-8 rounded-lg border border-border/60 bg-card/40 p-3">
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="text-xs font-medium">{{
                isAdmin ? request.player.name : "You"
              }}</span
              ><TimeAgo
                :date="request.created_at"
                class="text-xs text-muted-foreground"
              />
            </div>
            <p class="whitespace-pre-wrap text-sm text-foreground/90">
              {{ request.initial_message }}
            </p>
          </div>
          <div
            v-for="message in request.messages"
            :key="message.id"
            class="rounded-lg border border-border/60 bg-card/40 p-3"
            :class="message.is_admin ? 'ml-8' : 'mr-8'"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <span class="text-xs font-medium">{{
                message.is_admin
                  ? "DEAFCS Admin"
                  : isAdmin
                    ? request.player.name
                    : "You"
              }}</span
              ><TimeAgo
                :date="message.created_at"
                class="text-xs text-muted-foreground"
              />
            </div>
            <p class="whitespace-pre-wrap text-sm text-foreground/90">
              {{ message.message }}
            </p>
          </div>
        </div>
        <form
          v-if="request.status === 'open'"
          class="mt-5 flex flex-col gap-2"
          @submit.prevent="sendReply"
        >
          <Textarea
            v-model="reply"
            rows="4"
            maxlength="5000"
            placeholder="Write a reply"
          />
          <Button
            type="submit"
            class="self-end"
            :loading="sending"
            :disabled="!reply.trim()"
            >Send Reply</Button
          >
        </form>
        <p
          v-else
          class="mt-5 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          This request is closed. An administrator can reopen it if more
          discussion is needed.
        </p>
      </Card>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import gql from "graphql-tag";
import { toast } from "@/components/ui/toast";

const REQUEST_DETAIL = gql`
  query SupportRequestDetail($id: uuid!) {
    support_requests_by_pk(id: $id) {
      id
      category
      subject
      initial_message
      status
      created_at
      updated_at
      closed_at
      reported_player_steam_id
      reported_player_profile_url
      related_match_reference
      report_reason
      report_details
      report_evidence
      organizer_motivation
      organizer_experience
      organizer_languages
      organizer_additional_info
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
const INSERT_REPLY = gql`
  mutation Reply($object: support_request_messages_insert_input!) {
    insert_support_request_messages_one(object: $object) {
      id
    }
  }
`;
const UPDATE_STATUS = gql`
  mutation UpdateSupportStatus(
    $id: uuid!
    $status: e_support_request_statuses_enum!
  ) {
    update_support_requests_by_pk(
      pk_columns: { id: $id }
      _set: { status: $status }
    ) {
      id
      status
      closed_at
    }
  }
`;

export default {
  data: () => ({
    loading: true,
    sending: false,
    changingStatus: false,
    request: null as any,
    reply: "",
  }),
  computed: {
    isAdmin() {
      return useAuthStore().isAdmin;
    },
  },
  mounted() {
    return this.fetchRequest();
  },
  methods: {
    categoryLabel(value: string) {
      return (
        (
          {
            general_support: "General Support",
            bug_report: "Bug Report",
            player_report: "Report a Player",
            feedback: "Feedback / Suggestion",
            organizer_application: "Tournament Organizer Application",
          } as Record<string, string>
        )[value] ?? value
      );
    },
    async fetchRequest() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          query: REQUEST_DETAIL,
          variables: { id: this.$route.params.id },
          fetchPolicy: "network-only",
        });
        this.request = data?.support_requests_by_pk ?? null;
      } finally {
        this.loading = false;
      }
    },
    async sendReply() {
      if (!this.reply.trim() || this.sending) return;
      this.sending = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: INSERT_REPLY,
          variables: {
            object: {
              request_id: this.$route.params.id,
              message: this.reply.trim(),
            },
          },
        });
        this.reply = "";
        await this.fetchRequest();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Could not send reply",
          description: (error as Error).message,
        });
      } finally {
        this.sending = false;
      }
    },
    async changeStatus(status: "open" | "closed") {
      if (this.changingStatus) return;
      this.changingStatus = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: UPDATE_STATUS,
          variables: { id: this.$route.params.id, status },
        });
        toast({
          title: status === "closed" ? "Request closed" : "Request reopened",
        });
        await this.fetchRequest();
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Could not update request",
          description: (error as Error).message,
        });
      } finally {
        this.changingStatus = false;
      }
    },
  },
};
</script>
