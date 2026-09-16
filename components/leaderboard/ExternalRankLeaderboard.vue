<script setup lang="ts">
import gql from "graphql-tag";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useApolloClient } from "@vue/apollo-composable";
import { ArrowDown, ArrowUpDown } from "lucide-vue-next";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import PlayerFaceitRank from "~/components/PlayerFaceitRank.vue";
import PlayerPremierRank from "~/components/PlayerPremierRank.vue";
import Pagination from "~/components/Pagination.vue";
import Empty from "~/components/ui/empty/Empty.vue";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useAuthStore } from "~/stores/AuthStore";

type SortColumn = "faceit" | "premier";

type ExternalRankEntry = {
  player_steam_id: string;
  player_name: string;
  player_avatar_url: string | null;
  player_custom_avatar_url: string | null;
  player_country: string | null;
  faceit_elo: number | null;
  faceit_skill_level: number | null;
  faceit_nickname: string | null;
  faceit_url: string | null;
  faceit_last_match_at: string | null;
  premier_rank: number | null;
  premier_last_match_at: string | null;
};

const EXTERNAL_RANKS_QUERY = gql`
  query ExternalRankLeaderboard(
    $limit: Int!
    $offset: Int!
    $order_by: [external_rank_leaderboard_order_by!]!
  ) {
    external_rank_leaderboard(
      limit: $limit
      offset: $offset
      order_by: $order_by
    ) {
      player_steam_id
      player_name
      player_avatar_url
      player_custom_avatar_url
      player_country
      faceit_elo
      faceit_skill_level
      faceit_nickname
      faceit_url
      faceit_last_match_at
      premier_rank
      premier_last_match_at
    }
    external_rank_leaderboard_aggregate {
      aggregate {
        count
      }
    }
  }
`;

const { client: apolloClient } = useApolloClient();
const auth = useAuthStore();
const route = useRoute();
const { t } = useI18n();
const entries = ref<ExternalRankEntry[]>([]);
const total = ref(0);
const page = ref(1);
const perPage = usePerPage("external-rank-leaderboard");
const sortBy = ref<SortColumn>("faceit");
const loading = ref(true);
let fetchGeneration = 0;

const offset = computed(() => (page.value - 1) * perPage.value);
const loggedInSteamId = computed(() => auth.me?.steam_id ?? null);
const highlightedSteamId = computed(() => {
  const raw = route.query.player;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && value.length > 0 ? value : null;
});

const orderBy = computed(() =>
  sortBy.value === "premier"
    ? [
        { premier_rank: "desc_nulls_last" },
        { faceit_elo: "desc_nulls_last" },
        { player_steam_id: "asc" },
      ]
    : [
        { faceit_elo: "desc_nulls_last" },
        { premier_rank: "desc_nulls_last" },
        { player_steam_id: "asc" },
      ],
);

async function fetchEntries() {
  const generation = ++fetchGeneration;
  loading.value = true;
  try {
    const { data } = await apolloClient.query({
      query: EXTERNAL_RANKS_QUERY,
      variables: {
        limit: perPage.value,
        offset: offset.value,
        order_by: orderBy.value,
      },
      fetchPolicy: "network-only",
    });
    if (generation !== fetchGeneration) return;

    entries.value = ((data as any)?.external_rank_leaderboard ?? []).map(
      (row: any): ExternalRankEntry => ({
        ...row,
        player_steam_id: String(row.player_steam_id),
        faceit_elo: row.faceit_elo == null ? null : Number(row.faceit_elo),
        faceit_skill_level:
          row.faceit_skill_level == null
            ? null
            : Number(row.faceit_skill_level),
        premier_rank:
          row.premier_rank == null ? null : Number(row.premier_rank),
      }),
    );
    total.value =
      Number(
        (data as any)?.external_rank_leaderboard_aggregate?.aggregate?.count,
      ) || 0;
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("Error fetching external rank leaderboard:", error);
    entries.value = [];
    total.value = 0;
  } finally {
    if (generation === fetchGeneration) {
      loading.value = false;
    }
  }
}

function selectSort(column: SortColumn) {
  sortBy.value = column;
  page.value = 1;
  void fetchEntries();
}

function onPageChange(nextPage: number) {
  page.value = nextPage;
  void fetchEntries();
}

function onPerPageChange(value: number) {
  perPage.value = value;
  page.value = 1;
  void fetchEntries();
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

onMounted(() => {
  void fetchEntries();
});
</script>

<template>
  <PageTransition :delay="300" class="mt-6">
    <div>
      <div class="relative p-4">
        <div v-if="loading" class="space-y-4">
          <div v-for="i in perPage" :key="i" class="flex items-center gap-4">
            <Skeleton class="h-6 w-8" />
            <Skeleton class="h-10 w-10 rounded" />
            <Skeleton class="h-6 flex-1" />
            <Skeleton class="h-8 w-28" />
            <Skeleton class="h-8 w-28" />
          </div>
        </div>

        <Empty v-else-if="entries.length === 0">
          <p class="text-muted-foreground">
            {{ t("pages.leaderboard.no_results") }}
          </p>
        </Empty>

        <Table v-else class="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead class="w-16">
                {{ t("pages.leaderboard.columns.rank") }}
              </TableHead>
              <TableHead>{{ t("common.player") }}</TableHead>
              <TableHead class="min-w-[170px] text-right">
                <button
                  type="button"
                  class="ml-auto inline-flex items-center gap-1 select-none hover:text-foreground"
                  :class="{
                    'text-[hsl(var(--tac-amber))]': sortBy === 'faceit',
                  }"
                  :aria-sort="sortBy === 'faceit' ? 'descending' : 'none'"
                  @click="selectSort('faceit')"
                >
                  {{ t("pages.leaderboard.col.faceit_elo") }}
                  <ArrowDown v-if="sortBy === 'faceit'" class="h-3.5 w-3.5" />
                  <ArrowUpDown v-else class="h-3.5 w-3.5" />
                </button>
              </TableHead>
              <TableHead class="min-w-[170px] text-right">
                <button
                  type="button"
                  class="ml-auto inline-flex items-center gap-1 select-none hover:text-foreground"
                  :class="{
                    'text-[hsl(var(--tac-amber))]': sortBy === 'premier',
                  }"
                  :aria-sort="sortBy === 'premier' ? 'descending' : 'none'"
                  @click="selectSort('premier')"
                >
                  {{ t("pages.leaderboard.col.premier_rating") }}
                  <ArrowDown v-if="sortBy === 'premier'" class="h-3.5 w-3.5" />
                  <ArrowUpDown v-else class="h-3.5 w-3.5" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow
              v-for="(entry, index) in entries"
              :key="entry.player_steam_id"
              :class="[
                entry.player_steam_id === highlightedSteamId
                  ? 'leaderboard-row--highlight'
                  : '',
                entry.player_steam_id === loggedInSteamId &&
                entry.player_steam_id !== highlightedSteamId
                  ? 'leaderboard-row--me'
                  : '',
              ]"
            >
              <TableCell>
                <div class="flex items-center justify-center">
                  <span
                    :class="{
                      'font-bold text-yellow-400': offset + index + 1 === 1,
                      'font-bold text-gray-300': offset + index + 1 === 2,
                      'font-bold text-amber-600': offset + index + 1 === 3,
                      'text-muted-foreground': offset + index + 1 > 3,
                    }"
                  >
                    {{ offset + index + 1 }}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <PlayerDisplay
                  :player="{
                    steam_id: entry.player_steam_id,
                    name: entry.player_name,
                    custom_avatar_url: entry.player_custom_avatar_url,
                    avatar_url: entry.player_avatar_url,
                    country: entry.player_country,
                  }"
                  :show-elo="false"
                  :show-online="false"
                  :show-role="false"
                  :linkable="true"
                  size="xs"
                />
              </TableCell>
              <TableCell class="text-right">
                <div class="flex flex-col items-end gap-1">
                  <PlayerFaceitRank
                    v-if="entry.faceit_elo != null"
                    :faceit-skill-level="entry.faceit_skill_level"
                    :faceit-elo="entry.faceit_elo"
                    :faceit-url="entry.faceit_url"
                    :faceit-nickname="entry.faceit_nickname"
                  />
                  <span v-else class="font-mono font-semibold">-</span>
                  <span class="text-xs text-muted-foreground">
                    {{ formatDate(entry.faceit_last_match_at) }}
                  </span>
                </div>
              </TableCell>
              <TableCell class="text-right">
                <div class="flex flex-col items-end gap-1">
                  <PlayerPremierRank
                    v-if="entry.premier_rank != null"
                    :premier-rank="entry.premier_rank"
                  />
                  <span v-else class="font-mono font-semibold">-</span>
                  <span class="text-xs text-muted-foreground">
                    {{ formatDate(entry.premier_last_match_at) }}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <Pagination
        v-if="total > 0"
        :page="page"
        :per-page="perPage"
        :total="total"
        :show-per-page-selector="true"
        @page="onPageChange"
        @update:perPage="onPerPageChange"
      />
    </div>
  </PageTransition>
</template>

<style scoped>
:deep(.leaderboard-row--highlight) {
  background: hsl(var(--tac-amber) / 0.12);
}

:deep(.leaderboard-row--me) {
  background: hsl(var(--primary) / 0.06);
}
</style>
