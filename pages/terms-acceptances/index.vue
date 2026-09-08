<script setup lang="ts">
import { useI18n } from "vue-i18n";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import TimeAgo from "~/components/TimeAgo.vue";
import Empty from "~/components/ui/empty/Empty.vue";
import EmptyTitle from "~/components/ui/empty/EmptyTitle.vue";
import EmptyDescription from "~/components/ui/empty/EmptyDescription.vue";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search, X } from "lucide-vue-next";
import { useApplicationSettingsStore } from "~/stores/ApplicationSettings";

definePageMeta({
  middleware: "admin",
});

const { t } = useI18n();

useHead({ title: () => t("pages.terms_acceptances.title") });
</script>

<template>
  <PageTransition>
    <TacticalPageHeader>
      <template #title>{{ $t("pages.terms_acceptances.title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <InputGroup class="h-8 min-w-[12rem] flex-1 bg-card/60 sm:max-w-xs">
        <InputGroupAddon class="pl-2.5">
          <Search class="h-3.5 w-3.5" />
        </InputGroupAddon>
        <InputGroupInput
          id="terms-acceptances-search"
          :model-value="search"
          @update:model-value="(value) => onSearchChange(value as string)"
          :placeholder="$t('pages.terms_acceptances.search_placeholder')"
          class="h-full text-sm"
        />
        <InputGroupAddon align="inline-end" class="pr-2">
          <button
            v-if="search"
            type="button"
            class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            @click="onSearchChange('')"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </InputGroupAddon>
      </InputGroup>

      <Button
        v-for="tab in statusTabs"
        :key="tab"
        :variant="statusFilter === tab ? 'default' : 'outline'"
        size="sm"
        @click="onStatusFilterChange(tab)"
      >
        {{ $t(`pages.terms_acceptances.status.${tab}`) }}
      </Button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <Spinner class="h-6 w-6" />
    </div>

    <Empty
      v-else-if="error"
      class="min-h-52 border border-dashed border-destructive/50"
      role="alert"
    >
      <EmptyTitle>{{ $t("pages.terms_acceptances.error_title") }}</EmptyTitle>
      <EmptyDescription>{{
        $t("pages.terms_acceptances.error_description")
      }}</EmptyDescription>
      <button
        type="button"
        class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        @click="fetchPlayers"
      >
        {{ $t("pages.terms_acceptances.retry") }}
      </button>
    </Empty>

    <div
      v-else-if="!players.length"
      class="text-sm text-muted-foreground py-12 text-center"
    >
      {{ $t("pages.terms_acceptances.empty") }}
    </div>

    <Table v-else>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t("pages.terms_acceptances.columns.player") }}</TableHead>
          <TableHead>{{ $t("pages.terms_acceptances.columns.steam_id") }}</TableHead>
          <TableHead>{{ $t("pages.terms_acceptances.columns.status") }}</TableHead>
          <TableHead>{{ $t("pages.terms_acceptances.columns.version") }}</TableHead>
          <TableHead>{{ $t("pages.terms_acceptances.columns.accepted_at") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="player in players" :key="player.steam_id">
          <TableCell>
            <PlayerDisplay :player="player" :show-elo="false" :linkable="true" />
          </TableCell>
          <TableCell class="font-mono text-xs text-muted-foreground">
            {{ player.steam_id }}
          </TableCell>
          <TableCell>
            <Badge :variant="player.has_accepted_current_terms ? 'default' : 'secondary'">
              {{
                $t(
                  player.has_accepted_current_terms
                    ? "pages.terms_acceptances.status.accepted"
                    : "pages.terms_acceptances.status.not_accepted",
                )
              }}
            </Badge>
          </TableCell>
          <TableCell>
            <span v-if="player.has_accepted_current_terms">{{ currentTermsVersion }}</span>
            <span v-else class="text-muted-foreground">&mdash;</span>
          </TableCell>
          <TableCell>
            <TimeAgo
              v-if="player.has_accepted_current_terms && acceptedAtBySteamId[player.steam_id]"
              :date="acceptedAtBySteamId[player.steam_id]"
            />
            <span v-else class="text-muted-foreground">&mdash;</span>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>

    <div
      v-if="!loading && !error && players.length"
      class="mt-4 flex items-center justify-between"
    >
      <Button
        variant="outline"
        size="sm"
        :disabled="page === 1 || loading"
        @click="page = page - 1"
      >
        {{ $t("common.previous") }}
      </Button>
      <span class="text-xs text-muted-foreground tabular-nums">{{ page }}</span>
      <Button
        variant="outline"
        size="sm"
        :disabled="!hasNextPage || loading"
        @click="page = page + 1"
      >
        {{ $t("common.next") }}
      </Button>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import gql from "graphql-tag";
import { generateQuery } from "~/graphql/graphqlGen";
import debounce from "~/utilities/debounce";

const STATUS_TABS = ["all", "accepted", "not_accepted"] as const;

// Raw GraphQL text, not the Zeus object-selector builder -- player_terms_acceptances
// is a brand-new table that predates the last `yarn codegen` run against Hasura
// (same situation as ALL_APPLICATIONS_QUERY in verification-applications/index.vue),
// so Zeus can't type this table's where-clause yet.
const TERMS_ACCEPTANCES_QUERY = gql`
  query TermsAcceptancesForPlayers($steamIds: [bigint!], $version: String!) {
    player_terms_acceptances(
      where: {
        player_steam_id: { _in: $steamIds }
        terms_version: { _eq: $version }
      }
    ) {
      player_steam_id
      accepted_at
    }
  }
`;

export default {
  data() {
    return {
      loading: true,
      error: null as Error | null,
      players: [] as any[],
      acceptedAtBySteamId: {} as Record<string, string>,
      hasNextPage: false,
      page: 1,
      perPage: 25,
      search: "",
      statusFilter: "all" as (typeof STATUS_TABS)[number],
      statusTabs: STATUS_TABS,
      searchToken: 0,
      queueSearch: debounce(() => this.fetchPlayers(), 250),
    };
  },
  computed: {
    currentTermsVersion(): string | null {
      return useApplicationSettingsStore().currentTermsVersion;
    },
  },
  watch: {
    page() {
      this.fetchPlayers();
    },
    // Fires once the canonical current Terms version arrives from the
    // settings subscription (immediately, if it was already cached in
    // localStorage from a prior visit) -- and again on any later change, so
    // an admin bumping the Terms version while this page is open doesn't
    // leave it showing a stale snapshot. Until then, fetchPlayers() below
    // refuses to run, so the page stays in its initial loading state rather
    // than rendering acceptance data resolved against an unknown version.
    currentTermsVersion: {
      immediate: true,
      handler(version: string | null) {
        if (version) {
          this.fetchPlayers();
        }
      },
    },
  },
  methods: {
    onSearchChange(value: string) {
      this.search = value;
      this.page = 1;
      this.queueSearch();
    },
    onStatusFilterChange(tab: (typeof STATUS_TABS)[number]) {
      this.statusFilter = tab;
      this.page = 1;
      this.fetchPlayers();
    },
    buildWhere() {
      // "Registered players" -- excludes Steam accounts the panel only knows
      // about via another player's friend list or an imported match, which
      // never signed in and so were never subject to the Terms gate at all.
      const and: any[] = [{ last_sign_in_at: { _is_null: false } }];

      const query = this.search.trim();
      if (query) {
        const or: any[] = [{ name: { _ilike: `%${query}%` } }];
        if (/^\d+$/.test(query)) {
          or.push({ steam_id: { _eq: query } });
        }
        and.push({ _or: or });
      }

      if (this.statusFilter === "accepted") {
        and.push({ has_accepted_current_terms: { _eq: true } });
      } else if (this.statusFilter === "not_accepted") {
        and.push({ has_accepted_current_terms: { _eq: false } });
      }

      return { _and: and };
    },
    async fetchPlayers() {
      // Guards every caller (the version watcher, page changes, search,
      // status filter) -- never run the acceptance query against an
      // unresolved version. The page simply stays in its initial loading
      // state until the version watcher re-invokes this once it arrives.
      if (!this.currentTermsVersion) {
        return;
      }
      const token = ++this.searchToken;
      this.loading = true;
      this.error = null;
      try {
        const where = this.buildWhere();
        // No players_aggregate here: `administrator` is only ever an
        // inherited role (see hasura/metadata/inherited_roles.yaml), and
        // Hasura does not expose _aggregate root fields for inherited
        // roles even though the `players` list field itself works fine --
        // confirmed against a real Hasura instance, reproducing the exact
        // production error ("field 'players_aggregate' not found in type:
        // 'query_root'"). Fetching one extra row instead of a total count
        // avoids needing a new admin permission just for pagination.
        const { data } = await (this.$apollo as any).query({
          query: generateQuery({
            players: [
              {
                where,
                order_by: [{ name: "asc" }],
                limit: this.perPage + 1,
                offset: (this.page - 1) * this.perPage,
              },
              {
                steam_id: true,
                name: true,
                avatar_url: true,
                custom_avatar_url: true,
                country: true,
                has_accepted_current_terms: true,
              },
            ],
          } as any),
          fetchPolicy: "network-only",
        });

        if (token !== this.searchToken) {
          return;
        }

        const rows = data?.players ?? [];
        this.hasNextPage = rows.length > this.perPage;
        this.players = rows.slice(0, this.perPage);
        await this.fetchAcceptances(token);
      } catch (caught) {
        if (token === this.searchToken) {
          this.error =
            caught instanceof Error ? caught : new Error(String(caught));
          this.players = [];
          this.hasNextPage = false;
        }
      } finally {
        if (token === this.searchToken) {
          this.loading = false;
        }
      }
    },
    async fetchAcceptances(token: number) {
      const version = this.currentTermsVersion;
      const steamIds = this.players
        .filter((player) => player.has_accepted_current_terms)
        .map((player) => player.steam_id);

      if (!version || steamIds.length === 0) {
        if (token === this.searchToken) {
          this.acceptedAtBySteamId = {};
        }
        return;
      }

      try {
        const { data } = await (this.$apollo as any).query({
          query: TERMS_ACCEPTANCES_QUERY,
          variables: { steamIds, version },
          fetchPolicy: "network-only",
        });

        if (token !== this.searchToken) {
          return;
        }

        const map: Record<string, string> = {};
        for (const row of data?.player_terms_acceptances ?? []) {
          map[row.player_steam_id] = row.accepted_at;
        }
        this.acceptedAtBySteamId = map;
      } catch (caught) {
        // The player list itself already loaded successfully -- a failure
        // here only means Accepted At falls back to "-" for this page, not
        // a full page error.
        if (token === this.searchToken) {
          this.acceptedAtBySteamId = {};
        }
      }
    },
  },
};
</script>
