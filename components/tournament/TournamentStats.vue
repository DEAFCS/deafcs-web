<script lang="ts" setup>
import gql from "graphql-tag";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import StatLabel from "~/components/common/StatLabel.vue";
import { ChevronRight, ArrowUpDown } from "lucide-vue-next";
import { kdColor, hltvColor } from "~/utils/statTiers";
</script>

<template>
  <div class="space-y-4">
    <div
      v-if="!loading && rows.length === 0"
      class="rounded-md border border-dashed border-border p-10 text-center text-muted-foreground"
    >
      {{ $t("tournament.stats_section.no_data") }}
    </div>

    <div v-else class="overflow-hidden rounded-md border border-border bg-card/40">
      <div class="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-12 text-center">#</TableHead>
              <TableHead>{{ $t("common.player") }}</TableHead>
              <TableHead>{{ $t("team.table.team") }}</TableHead>
              <TableHead
                class="cursor-pointer text-center select-none"
                @click="setSort('rating')"
              >
                <span class="inline-flex items-center justify-center gap-1">
                  <StatLabel stat="rating" label="Rating" header />
                  <ArrowUpDown
                    class="h-3 w-3"
                    :class="sortKey === 'rating' ? 'opacity-100' : 'opacity-30'"
                  />
                </span>
              </TableHead>
              <TableHead class="text-center">K-D</TableHead>
              <TableHead
                class="cursor-pointer text-center select-none"
                @click="setSort('kdr')"
              >
                <span class="inline-flex items-center justify-center gap-1">
                  <StatLabel stat="kd" label="K/D" header />
                  <ArrowUpDown
                    class="h-3 w-3"
                    :class="sortKey === 'kdr' ? 'opacity-100' : 'opacity-30'"
                  />
                </span>
              </TableHead>
              <TableHead
                class="cursor-pointer text-center select-none"
                @click="setSort('adr')"
              >
                <span class="inline-flex items-center justify-center gap-1">
                  <StatLabel stat="adr" label="ADR" header />
                  <ArrowUpDown
                    class="h-3 w-3"
                    :class="sortKey === 'adr' ? 'opacity-100' : 'opacity-30'"
                  />
                </span>
              </TableHead>
              <TableHead class="text-center">
                <StatLabel stat="hs" label="HS%" header />
              </TableHead>
              <TableHead class="text-center">
                {{ $t("tournament.results_table.matches") }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="(row, index) in sortedRows" :key="row.player_steam_id">
              <TableRow
                class="cursor-pointer transition-colors hover:bg-muted/30"
                :class="{ 'bg-muted/20': isExpanded(row.player_steam_id) }"
                @click="toggleExpanded(row.player_steam_id)"
              >
                <TableCell class="text-center">
                  <div class="flex items-center justify-center gap-1">
                    <ChevronRight
                      class="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150"
                      :class="{ 'rotate-90': isExpanded(row.player_steam_id) }"
                    />
                    <span class="font-mono text-sm font-bold tabular-nums">
                      {{ index + 1 }}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <PlayerDisplay
                    :player="{
                      steam_id: row.player_steam_id,
                      name: row.player_name,
                      avatar_url: row.player_avatar_url,
                      custom_avatar_url: row.player_custom_avatar_url,
                      country: row.player_country,
                    }"
                    size="xs"
                    :show-flag="true"
                    :show-role="false"
                    :show-elo="false"
                    :linkable="true"
                  />
                </TableCell>
                <TableCell>
                  <NuxtLink
                    v-if="row.team_id"
                    :to="`/teams/${row.team_id}`"
                    class="font-medium hover:text-[hsl(var(--tac-amber))] transition-colors"
                    @click.stop
                  >
                    {{ row.team_name }}
                  </NuxtLink>
                  <span v-else class="font-medium">{{ row.team_name || "—" }}</span>
                </TableCell>
                <TableCell
                  class="text-center font-mono tabular-nums font-bold"
                  :style="{ color: hltvColor(row.rating) }"
                >
                  {{ row.rating.toFixed(2) }}
                </TableCell>
                <TableCell class="text-center font-mono tabular-nums">
                  {{ row.kills - row.deaths > 0 ? "+" : "" }}{{ row.kills - row.deaths }}
                </TableCell>
                <TableCell
                  class="text-center font-mono tabular-nums font-bold"
                  :style="{ color: kdColor(row.kdr) }"
                >
                  {{ row.kdr.toFixed(2) }}
                </TableCell>
                <TableCell class="text-center font-mono tabular-nums">
                  {{ row.adr.toFixed(1) }}
                </TableCell>
                <TableCell class="text-center font-mono tabular-nums">
                  {{ row.headshot_percentage.toFixed(0) }}%
                </TableCell>
                <TableCell class="text-center font-mono tabular-nums text-muted-foreground">
                  {{ row.matches_played }}
                </TableCell>
              </TableRow>
              <TableRow v-if="isExpanded(row.player_steam_id)" class="hover:bg-transparent">
                <TableCell
                  colspan="9"
                  class="border-t border-border/40 bg-background/40 px-4 py-2"
                >
                  <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <span class="text-muted-foreground">
                      <StatLabel stat="k" label="K" />: {{ row.kills }}
                    </span>
                    <span class="text-muted-foreground">
                      <StatLabel stat="d" label="D" />: {{ row.deaths }}
                    </span>
                    <span class="text-muted-foreground">
                      <StatLabel stat="a" label="A" />: {{ row.assists }}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            </template>
          </TableBody>
        </Table>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
// Tournament-wide player leaderboard (Stats tab). Deliberately a plain,
// un-paginated sortable table for V1 -- get_tournament_leaderboard is
// per-tournament, not global, so the row count is bounded by the roster
// size rather than the whole player base the way the global/event
// leaderboards are.
//
// get_tournament_leaderboard cannot be subscribed to (Hasura only supports
// live GraphQL subscriptions on tables/views, not arbitrary SQL functions,
// which is also why EventLeaderboard.vue -- the closest existing leaderboard
// -- is a one-shot query rather than a subscription). Polling is the
// simplest existing project pattern for "close enough to live" in that
// situation (see components/database/*Tab.vue's `pollInterval`), so this
// re-queries on an interval instead. That means a fresh match's stats can
// take up to POLL_INTERVAL_MS to appear rather than being instant.
const POLL_INTERVAL_MS = 20000;

const TOURNAMENT_LEADERBOARD_QUERY = gql`
  query GetTournamentLeaderboard($tournamentId: uuid!) {
    get_tournament_leaderboard(args: { _tournament_id: $tournamentId }) {
      player_steam_id
      player_name
      player_avatar_url
      player_custom_avatar_url
      player_country
      tournament_team_id
      team_id
      team_name
      rating
      adr
      kills
      deaths
      assists
      kdr
      headshot_percentage
      rounds_played
      matches_played
    }
  }
`;

// Kills isn't a standalone V1 column (only visible in the expand row), so
// it isn't a sort option -- a sort control on a column that doesn't show
// what it's sorting would be confusing. Rating/K-D-ratio/ADR are the three
// visible, sortable stat columns.
type SortKey = "rating" | "adr" | "kdr";

export default {
  props: {
    tournament: {
      type: Object,
      required: true,
    },
    // Mirrors StageStandings/TournamentResults' pattern: the parent decides
    // when this is worth querying at all (see TournamentDetail's statsTabVisible).
    active: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      rows: [] as any[],
      expandedPlayers: new Set<string>(),
      sortKey: "rating" as SortKey,
      sortDesc: true,
    };
  },
  apollo: {
    rows: {
      query: TOURNAMENT_LEADERBOARD_QUERY,
      variables(): { tournamentId: string } {
        return { tournamentId: (this as any).tournament?.id };
      },
      update: (data: any) => data?.get_tournament_leaderboard || [],
      skip(): boolean {
        const self = this as any;
        return !self.active || !self.tournament?.id;
      },
      pollInterval: POLL_INTERVAL_MS,
      // fetchPolicy left at the project default (cache-and-network handles
      // the initial paint from cache while poll ticks refresh in the
      // background) -- no reason to force network-only for a V1 poll.
    },
  },
  methods: {
    isExpanded(steamId: string) {
      return this.expandedPlayers.has(String(steamId));
    },
    toggleExpanded(steamId: string) {
      const key = String(steamId);
      const next = new Set(this.expandedPlayers);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      this.expandedPlayers = next;
    },
    setSort(key: SortKey) {
      if (this.sortKey === key) {
        this.sortDesc = !this.sortDesc;
      } else {
        this.sortKey = key;
        this.sortDesc = true;
      }
    },
  },
  computed: {
    loading(): boolean {
      return this.$apollo.queries.rows?.loading ?? false;
    },
    sortedRows(): any[] {
      const dir = this.sortDesc ? -1 : 1;
      const key = this.sortKey;
      return (this.rows as any[])
        .map((row) => ({
          ...row,
          rating: Number(row.rating ?? 0),
          adr: Number(row.adr ?? 0),
          kdr: Number(row.kdr ?? 0),
          kills: Number(row.kills ?? 0),
          deaths: Number(row.deaths ?? 0),
          assists: Number(row.assists ?? 0),
          headshot_percentage: Number(row.headshot_percentage ?? 0),
          matches_played: Number(row.matches_played ?? 0),
        }))
        .sort((a, b) => dir * (Number(a[key]) - Number(b[key])));
    },
  },
};
</script>
