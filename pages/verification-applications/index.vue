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
  title: () => t("pages.verification_applications.title"),
});
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>{{ $t("pages.verification_applications.title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div class="flex items-center gap-2 mb-4">
      <Button
        v-for="tab in tabs"
        :key="tab"
        :variant="statusFilter === tab ? 'default' : 'outline'"
        size="sm"
        @click="statusFilter = tab"
      >
        {{ $t(`pages.verify.status.${tab}`) }}
        <Badge size="sm" v-if="counts[tab]">{{ counts[tab] }}</Badge>
      </Button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>

    <div v-else-if="!applications.length" class="text-sm text-muted-foreground py-12 text-center">
      {{ $t("pages.verification_applications.empty") }}
    </div>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t("pages.verification_applications.columns.player") }}</TableHead>
          <TableHead>{{ $t("pages.verification_applications.columns.country") }}</TableHead>
          <TableHead>{{ $t("pages.verification_applications.columns.status") }}</TableHead>
          <TableHead>{{ $t("pages.verification_applications.columns.submitted") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="application in applications"
          :key="application.id"
          class="cursor-pointer"
          @click="$router.push({ name: 'verification-applications-id', params: { id: application.id } })"
        >
          <TableCell>
            <PlayerDisplay :player="application.player" :show-elo="false" />
          </TableCell>
          <TableCell class="flex items-center gap-2">
            <TimezoneFlag :country="application.country" />
            {{ countries[application.country]?.name ?? application.country }}
          </TableCell>
          <TableCell>
            <Badge :variant="statusVariant(application.status)">
              {{ $t(`pages.verify.status.${application.status}`) }}
            </Badge>
          </TableCell>
          <TableCell>
            <TimeAgo :date="application.created_at" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </PageTransition>
</template>

<script lang="ts">
import { getAllCountries } from "countries-and-timezones";
import { generateQuery } from "~/graphql/graphqlGen";
import { order_by } from "~/generated/zeus";

const TABS = ["pending", "approved", "rejected"] as const;

export default {
  data() {
    return {
      loading: true,
      statusFilter: "pending" as (typeof TABS)[number],
      allApplications: [] as any[],
      countries: getAllCountries(),
      tabs: TABS,
    };
  },
  async mounted() {
    await this.fetchApplications();
  },
  computed: {
    applications() {
      return this.allApplications.filter(
        (application) => application.status === this.statusFilter,
      );
    },
    counts() {
      const counts: Record<string, number> = {};
      for (const application of this.allApplications) {
        counts[application.status] = (counts[application.status] ?? 0) + 1;
      }
      return counts;
    },
  },
  methods: {
    statusVariant(status: string) {
      if (status === "approved") return "default";
      if (status === "rejected") return "destructive";
      return "secondary";
    },
    async fetchApplications() {
      this.loading = true;
      try {
        const { data } = await (this.$apollo as any).query({
          query: generateQuery(
            {
              verification_applications: [
                { order_by: [{ created_at: order_by.desc }] },
                {
                  id: true,
                  status: true,
                  country: true,
                  created_at: true,
                  player: { steam_id: true, name: true, avatar_url: true, custom_avatar_url: true, country: true },
                },
              ],
            } as any,
          ),
          fetchPolicy: "network-only",
        });
        this.allApplications = data?.verification_applications ?? [];
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
