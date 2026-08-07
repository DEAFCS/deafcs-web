<script lang="ts" setup>
import { ref, watch, computed, onBeforeUnmount } from "vue";
import gql from "graphql-tag";
import { useApolloClient } from "@vue/apollo-composable";
import { matchTypeColorStyle } from "~/utilities/matchTypeColors";

const props = defineProps<{
  playerSteamId: string;
  matchType?: "Competitive" | "Wingman" | "Duel";
  // The active ELO season's UUID, resolved by the parent from the same
  // `activeSeason` source the profile page and the leaderboard page both
  // already use (players/[id].vue's own `activeSeason` computed / the
  // leaderboard's identical one). Passing this keeps the rank/percentile
  // shown here scoped to the same season the leaderboard would compute
  // them against -- omit/null when seasons are disabled or no season is
  // currently active, matching how the leaderboard's own season_id goes
  // null in that case too.
  seasonId?: string | null;
}>();

const { client: apolloClient } = useApolloClient();

const RANK_QUERY = gql`
  query PlayerLeaderboardRank(
    $category: String!
    $window_days: Int!
    $match_type: String
    $exclude_tournaments: Boolean!
    $elo_view: String!
    $season_id: uuid
    $player_steam_id: String!
  ) {
    get_player_leaderboard_rank(
      args: {
        _category: $category
        _window_days: $window_days
        _match_type: $match_type
        _exclude_tournaments: $exclude_tournaments
        _elo_view: $elo_view
        _season_id: $season_id
        _player_steam_id: $player_steam_id
      }
    ) {
      rank
      total
    }
  }
`;

const rank = ref<number | null>(null);
const total = ref<number | null>(null);
let fetchGen = 0;

async function fetchRank() {
  const gen = ++fetchGen;
  rank.value = null;
  total.value = null;

  if (!props.playerSteamId) return;

  try {
    const res = await apolloClient.query({
      query: RANK_QUERY,
      variables: {
        category: "elo",
        window_days: 0,
        match_type: props.matchType ?? "Competitive",
        exclude_tournaments: false,
        elo_view: "current",
        // _source is intentionally not sent -- the backend already
        // defaults it to 'overall', matching the leaderboard's own
        // default behavior with no explicit Source filter applied.
        season_id: props.seasonId ?? null,
        player_steam_id: props.playerSteamId,
      },
      fetchPolicy: "cache-first",
    });
    if (gen !== fetchGen) return;

    const row = (res.data as any)?.get_player_leaderboard_rank?.[0];
    if (!row) return;
    rank.value = row.rank;
    total.value = row.total;
  } catch (err) {
    console.error(
      `[PlayerLeaderboardRank] failed to fetch rank for ${props.playerSteamId}`,
      err,
    );
  }
}

watch(
  () => [props.playerSteamId, props.matchType, props.seasonId],
  () => {
    fetchRank();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  fetchGen++;
});

const percentile = computed(() => {
  if (!rank.value || !total.value) return null;
  return Math.max(1, Math.ceil((rank.value / total.value) * 100));
});

const rankLabel = computed(() =>
  rank.value !== null ? `#${rank.value.toLocaleString()}` : null,
);

const triggerClasses = [
  "group/rank inline-flex h-[26px] items-center gap-1.5 rounded border px-[0.6rem]",
  "border-[rgb(var(--mode-rgb)/0.35)] bg-[rgb(var(--mode-rgb)/0.06)]",
  "font-mono text-[0.62rem] font-bold uppercase tabular-nums tracking-[0.1em]",
  "transition-[transform,border-color,background-color,box-shadow] duration-150",
  "hover:-translate-y-px hover:border-[rgb(var(--mode-rgb)/0.8)] hover:bg-[rgb(var(--mode-rgb)/0.11)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--mode-rgb)/0.5)]",
].join(" ");

const sepClasses = "h-3 w-px bg-border/70";

const rankValueClasses =
  "text-[rgb(var(--mode-rgb))] [text-shadow:0_0_10px_rgb(var(--mode-rgb)/0.3)]";

const percentileClasses =
  "text-[rgb(var(--mode-rgb)/0.85)]";
</script>

<template>
  <NuxtLink
    v-if="playerSteamId"
    :to="{
      path: '/leaderboard',
      query: {
        tab: 'elo',
        period: '0',
        type: matchType ?? 'Competitive',
        player: playerSteamId,
      },
    }"
    :class="triggerClasses"
    :style="matchTypeColorStyle(matchType ?? 'Competitive')"
    :aria-label="`${$t('pages.players.detail.global_rank')} ${rankLabel}`"
    :title="$t('pages.players.detail.global_rank')"
    @click.stop
  >
    <span v-if="rankLabel" :class="rankValueClasses">{{ rankLabel }}</span>
    <span v-if="percentile" :class="sepClasses" aria-hidden="true"></span>
    <span v-if="percentile" :class="percentileClasses">
      {{ $t("pages.players.detail.top_percent", { percent: percentile }) }}
    </span>
    <span v-if="!rankLabel" class="text-muted-foreground">Unranked</span>
  </NuxtLink>
</template>
