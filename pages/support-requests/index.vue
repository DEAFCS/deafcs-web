<script setup lang="ts">
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import TimeAgo from "~/components/TimeAgo.vue";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

definePageMeta({ middleware: "admin" });
useHead({ title: "Support Requests" });
</script>

<template>
  <PageTransition
    ><TacticalPageHeader
      ><template #title>Support Requests</template></TacticalPageHeader
    ></PageTransition
  >
  <PageTransition :delay="50" class="mt-6">
    <div class="mb-5 grid gap-3 sm:grid-cols-2">
      <Select v-model="statusFilter"
        ><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger
        ><SelectContent
          ><SelectItem value="all">All statuses</SelectItem
          ><SelectItem value="open">Open</SelectItem
          ><SelectItem value="closed">Closed</SelectItem></SelectContent
        ></Select
      >
      <Select v-model="categoryFilter"
        ><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger
        ><SelectContent
          ><SelectItem value="all">All categories</SelectItem
          ><SelectItem
            v-for="category in categories"
            :key="category.value"
            :value="category.value"
            >{{ category.label }}</SelectItem
          ></SelectContent
        ></Select
      >
    </div>
    <div v-if="loading" class="flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>
    <Card
      v-else-if="!filteredRequests.length"
      class="p-6 text-center text-sm text-muted-foreground"
      >No support requests match these filters.</Card
    >
    <Table v-else>
      <TableHeader
        ><TableRow
          ><TableHead>Player</TableHead><TableHead>Category</TableHead
          ><TableHead>Subject</TableHead><TableHead>Status</TableHead
          ><TableHead>Updated</TableHead></TableRow
        ></TableHeader
      >
      <TableBody>
        <TableRow
          v-for="request in filteredRequests"
          :key="request.id"
          class="cursor-pointer"
          @click="$router.push(`/support/${request.id}`)"
        >
          <TableCell
            ><PlayerDisplay :player="request.player" :show-elo="false"
          /></TableCell>
          <TableCell>{{ categoryLabel(request.category) }}</TableCell>
          <TableCell class="font-medium">{{ request.subject }}</TableCell>
          <TableCell
            ><Badge
              :variant="request.status === 'closed' ? 'secondary' : 'default'"
              >{{ request.status === "closed" ? "Closed" : "Open" }}</Badge
            ></TableCell
          >
          <TableCell><TimeAgo :date="request.updated_at" /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </PageTransition>
</template>

<script lang="ts">
import gql from "graphql-tag";

const categories = [
  { value: "general_support", label: "General Support" },
  { value: "bug_report", label: "Bug Report" },
  { value: "player_report", label: "Report a Player" },
  { value: "feedback", label: "Feedback / Suggestion" },
  { value: "organizer_application", label: "Tournament Organizer Application" },
];
const ALL_REQUESTS = gql`
  query AllSupportRequests {
    support_requests(order_by: { updated_at: desc }) {
      id
      category
      subject
      status
      updated_at
      player {
        steam_id
        name
        avatar_url
        custom_avatar_url
        country
      }
    }
  }
`;

export default {
  data: () => ({
    loading: true,
    requests: [] as any[],
    statusFilter: "open",
    categoryFilter: "all",
    categories,
  }),
  computed: {
    filteredRequests() {
      return this.requests.filter(
        (request: any) =>
          (this.statusFilter === "all" ||
            request.status === this.statusFilter) &&
          (this.categoryFilter === "all" ||
            request.category === this.categoryFilter),
      );
    },
  },
  async mounted() {
    try {
      const { data } = await (this.$apollo as any).query({
        query: ALL_REQUESTS,
        fetchPolicy: "network-only",
      });
      this.requests = data?.support_requests ?? [];
    } finally {
      this.loading = false;
    }
  },
  methods: {
    categoryLabel(value: string) {
      return (
        categories.find((category) => category.value === value)?.label ?? value
      );
    },
  },
};
</script>
