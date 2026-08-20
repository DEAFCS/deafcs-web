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
          <TableHead></TableHead>
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
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7 text-muted-foreground hover:text-destructive"
              :title="$t('pages.verification_applications.delete')"
              @click.stop="deleteTarget = application"
            >
              <Trash2 class="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <Dialog :open="!!deleteTarget" @update:open="(open) => !open && (deleteTarget = null)">
      <DialogContent>
        <DialogTitle>{{ $t("pages.verification_applications.delete_confirm_title") }}</DialogTitle>
        <p class="text-sm text-muted-foreground">
          {{ $t("pages.verification_applications.delete_confirm_description") }}
        </p>
        <div class="flex justify-end gap-2 mt-2">
          <Button variant="outline" @click="deleteTarget = null">
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
import gql from "graphql-tag";
import { generateMutation } from "~/graphql/graphqlGen";
import { toast } from "@/components/ui/toast";

const TABS = ["pending", "approved", "rejected"] as const;

// Raw GraphQL text, not the Zeus object-selector builder -- generated/zeus
// predates this table (needs a live Hasura codegen run), so Zeus can't
// resolve order_by's field type and always quotes it as a string, which
// Hasura rejects ("expected an enum value for type order_by, but found a
// string"). See MY_APPLICATION_QUERY in pages/verify.vue for the same fix.
const ALL_APPLICATIONS_QUERY = gql`
  query AllVerificationApplications {
    verification_applications(order_by: { created_at: desc }) {
      id
      status
      country
      created_at
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
  data() {
    return {
      loading: true,
      deleting: false,
      statusFilter: "pending" as (typeof TABS)[number],
      allApplications: [] as any[],
      deleteTarget: null as { id: string } | null,
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
          query: ALL_APPLICATIONS_QUERY,
          fetchPolicy: "network-only",
        });
        this.allApplications = data?.verification_applications ?? [];
      } finally {
        this.loading = false;
      }
    },
    async deleteApplication() {
      if (this.deleting || !this.deleteTarget) return;
      this.deleting = true;
      try {
        await (this.$apollo as any).mutate({
          mutation: generateMutation(
            {
              delete_verification_applications_by_pk: [
                { id: this.deleteTarget.id },
                { id: true },
              ],
            } as any,
          ),
        });
        this.allApplications = this.allApplications.filter(
          (application) => application.id !== this.deleteTarget?.id,
        );
        toast({ title: this.$t("pages.verification_applications.deleted") });
        this.deleteTarget = null;
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
  },
};
</script>
