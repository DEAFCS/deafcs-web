<script setup lang="ts">
import { Plus } from "lucide-vue-next";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";

useHead({ title: "My Support Requests" });
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>My Support Requests</template>
      <template #actions>
        <Button as-child variant="tactical"
          ><NuxtLink to="/support/new"><Plus />New Request</NuxtLink></Button
        >
      </template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div v-if="loading" class="flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>
    <Card v-else-if="!requests.length" class="p-6 text-center">
      <p class="text-sm text-muted-foreground">
        You have not submitted any support requests.
      </p>
      <Button as-child variant="outline" class="mt-4"
        ><NuxtLink to="/support/new"
          >Create your first request</NuxtLink
        ></Button
      >
    </Card>
    <div v-else class="grid gap-3">
      <NuxtLink
        v-for="request in requests"
        :key="request.id"
        :to="`/support/${request.id}`"
        class="rounded-lg border border-border/60 bg-card/30 p-4 transition-colors hover:border-[hsl(var(--tac-amber)/0.45)] hover:bg-card/50"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="font-semibold">{{ request.subject }}</p>
            <p class="mt-1 text-sm text-muted-foreground">
              {{ categoryLabel(request.category) }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <TimeAgo
              :date="request.updated_at"
              class="text-xs text-muted-foreground"
            />
            <Badge
              :variant="request.status === 'closed' ? 'secondary' : 'default'"
              >{{ request.status === "closed" ? "Closed" : "Open" }}</Badge
            >
          </div>
        </div>
      </NuxtLink>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import gql from "graphql-tag";

// Live copy of the player's own requests: status and reply timestamps update
// without a reload. The where clause plus the user select permission keep
// this to the caller's own requests.
const MY_REQUESTS = gql`
  subscription MySupportRequestsLive($steamId: bigint!) {
    support_requests(
      where: { player_steam_id: { _eq: $steamId } }
      order_by: { updated_at: desc }
    ) {
      id
      category
      subject
      status
      updated_at
    }
  }
`;

export default {
  apollo: {
    $subscribe: {
      mySupportRequestsLive: {
        query: MY_REQUESTS,
        variables(this: any) {
          return { steamId: useAuthStore().me?.steam_id };
        },
        skip() {
          return !useAuthStore().me?.steam_id;
        },
        result(this: any, { data }: { data: any }) {
          this.requests = data?.support_requests ?? [];
          this.loading = false;
        },
        error(this: any) {
          this.loading = false;
        },
      },
    },
  },
  data: () => ({ loading: true, requests: [] as any[] }),
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
  },
};
</script>
