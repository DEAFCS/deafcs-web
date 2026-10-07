<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, ExternalLink, Play } from "lucide-vue-next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Skeleton } from "~/components/ui/skeleton";
import { HeightGlide } from "~/components/ui/transitions";
import LineupOverview from "~/components/match/LineupOverview.vue";
import LineupUtility from "~/components/match/LineupUtility.vue";
import LineupTradeStats from "~/components/match/LineupTradeStats.vue";
import LineupAimStats from "~/components/match/LineupAimStats.vue";
import StackedTable from "~/components/common/StackedTable.vue";
import EloChangeBadge from "~/components/EloChangeBadge.vue";
import PlayerPremierRank from "~/components/PlayerPremierRank.vue";
import PlayerSkillGroupRank from "~/components/PlayerSkillGroupRank.vue";
import { provideFocusRow } from "~/composables/useCurrentUserRow";
import mapLabel from "~/utilities/mapLabel";
import { matchSeriesLabel } from "~/utilities/matchSeriesLabel";
import { tournamentMatchScores } from "~/utilities/tournamentMatchRow";

// Inline match breakdown on the player profile: the match strip (map or
// series, score, this player's rank move) above the match page's own lineup
// tables with BOTH teams, this player's row pinned. Everything here renders
// from the one query PlayerMatchRow runs on expand.
const props = defineProps<{
  // Simple match fields, overlaid with the detailed lineups + elo_changes once
  // they load.
  match: any;
  focusSteamId: string | null;
  // A team's view: this lineup leads the table and no single row is pinned.
  focusLineupId?: string | null;
  loading: boolean;
  activeTab: string;
  selectedMapId: string | null;
  // DEAFCS keeps its existing ELO movement and imported Valve rank display.
  eloChange?: any | null;
  rankInfo?: { rankType: number; rank: number; change: number } | null;
  typeLabel: string;
  sourceLabel: string;
  contextLabel?: string;
  clipsCount: number;
  // Narrow layout: this player's line as a list, the lobby on request.
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:active-tab", value: string): void;
  (e: "update:selected-map-id", value: string | null): void;
  (e: "open-clips"): void;
}>();

const { t } = useI18n();

provideFocusRow(toRef(props, "focusSteamId"));

const tabs = computed(() => [
  {
    value: "overview",
    label: t("match.tabs.overview"),
    component: LineupOverview,
    props: { showStats: true },
  },
  {
    value: "utility",
    label: t("match.tabs.utility"),
    component: LineupUtility,
    props: {},
  },
  {
    value: "trades",
    label: t("match.tabs.trade_stats"),
    component: LineupTradeStats,
    props: {},
  },
  {
    value: "aim",
    label: t("match.tabs.aim_stats"),
    component: LineupAimStats,
    props: {},
  },
]);

function hasFocus(lineup: any): boolean {
  const sid = props.focusSteamId;
  return (lineup?.lineup_players ?? []).some(
    (lp: any) => String(lp?.steam_id ?? lp?.player?.steam_id ?? "") === sid,
  );
}

// The focus player's side first, so their team leads the table.
const focusIsLineup2 = computed(() =>
  props.focusLineupId
    ? props.match?.lineup_2_id === props.focusLineupId
    : !hasFocus(props.match?.lineup_1) && hasFocus(props.match?.lineup_2),
);
const mineRaw = computed(() =>
  focusIsLineup2.value ? props.match?.lineup_2 : props.match?.lineup_1,
);
const theirsRaw = computed(() =>
  focusIsLineup2.value ? props.match?.lineup_1 : props.match?.lineup_2,
);

// Skeleton rows per team, from the lineups the row already carries.
const skeletonTeams = computed(() =>
  [mineRaw.value, theirsRaw.value].map(
    (lineup) => lineup?.lineup_players?.length || 5,
  ),
);

// Opened before the data: the tables fade in when they land. Opened with data:
// they rise in with the rest of the panel.
const fadeContent = props.loading;

// A load that lands fast never shows a skeleton — it would only blink. The
// placeholder holds the tables' height invisibly, fades in only once the wait
// runs past SKELETON_DELAY_MS, and once seen stays SKELETON_MIN_MS so it reads
// as a state rather than a flash.
const SKELETON_DELAY_MS = 200;
const SKELETON_MIN_MS = 350;
const skeletonShown = ref(false);
const skeletonHeld = ref(false);
let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
let skeletonShownAt = 0;

watch(
  () => props.loading,
  (loading) => {
    if (skeletonTimer) clearTimeout(skeletonTimer);
    skeletonTimer = null;
    if (loading) {
      skeletonTimer = setTimeout(() => {
        skeletonShown.value = true;
        skeletonShownAt = Date.now();
      }, SKELETON_DELAY_MS);
      return;
    }
    if (!skeletonShown.value) return;
    skeletonHeld.value = true;
    skeletonTimer = setTimeout(
      () => {
        skeletonHeld.value = false;
        skeletonShown.value = false;
      },
      Math.max(0, SKELETON_MIN_MS - (Date.now() - skeletonShownAt)),
    );
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (skeletonTimer) clearTimeout(skeletonTimer);
});

const placeholder = computed(() => props.loading || skeletonHeld.value);

// Lineup tables read `match_stats ?? match_map_stats`, so a single map swaps
// the aggregate row out for that map's row (and its KAST rows).
function narrow(lineup: any) {
  if (!lineup) return null;
  const id = props.selectedMapId;
  return {
    ...lineup,
    lineup_players: (lineup.lineup_players ?? []).map((lp: any) => {
      if (!lp?.player) return lp;
      if (!id) {
        return { ...lp, player: { ...lp.player, match_map_stats: null } };
      }
      const mapRow = (lp.player.match_map_stats ?? []).find(
        (s: any) => s.match_map_id === id,
      );
      return {
        ...lp,
        player: {
          ...lp.player,
          match_stats: null,
          match_map_stats: mapRow ? [mapRow] : null,
          match_map_hltv: (lp.player.match_map_hltv ?? []).filter(
            (r: any) => r.match_map_id === id,
          ),
        },
      };
    }),
  };
}
const mine = computed(() => narrow(mineRaw.value));
const theirs = computed(() => narrow(theirsRaw.value));
// Just this player's row, for the compact list.
const focusLineup = computed(() => {
  const lineup = mine.value;
  const sid = props.focusSteamId;
  const member = (lineup?.lineup_players ?? []).find(
    (lp: any) => String(lp?.steam_id ?? lp?.player?.steam_id ?? "") === sid,
  );
  return member ? { ...lineup, lineup_players: [member] } : null;
});
const lobbySize = computed(
  () =>
    (mine.value?.lineup_players?.length ?? 0) +
    (theirs.value?.lineup_players?.length ?? 0),
);
const showLobby = ref(false);

const hasStats = computed(() =>
  [mine.value, theirs.value].some((lineup) =>
    (lineup?.lineup_players ?? []).some(
      (lp: any) =>
        (lp?.player?.match_stats ?? lp?.player?.match_map_stats ?? []).length > 0,
    ),
  ),
);

const maps = computed(() =>
  (props.match?.match_maps ?? []).map((mm: any) => {
    const l1 = mm.lineup_1_score ?? 0;
    const l2 = mm.lineup_2_score ?? 0;
    const played = Boolean(mm.winning_lineup_id) || l1 + l2 > 0;
    const mineScore = focusIsLineup2.value ? l2 : l1;
    const theirScore = focusIsLineup2.value ? l1 : l2;
    return {
      id: mm.id,
      label: mapLabel(mm.map),
      patch: mm.map?.patch ?? null,
      poster: mm.map?.poster ?? null,
      played,
      mine: mineScore,
      theirs: theirScore,
      won: played && mineScore > theirScore,
      lost: played && mineScore < theirScore,
    };
  }),
);
const isSeries = computed(() => Number(props.match?.options?.best_of ?? 1) > 1 || maps.value.length > 1);
const bestOf = computed(
  () => props.match?.options?.best_of ?? 1,
);
const focusMap = computed(
  () =>
    maps.value.find((m: any) => m.id === props.selectedMapId) ??
    maps.value[0] ??
    null,
);

function selectMap(id: string | null) {
  emit("update:selected-map-id", id);
}

const durationLabel = computed(() => {
  const start = props.match?.started_at;
  const end = props.match?.ended_at;
  if (!start || !end) return null;
  const minutes = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "minute",
    unitDisplay: "short",
  }).format(minutes);
});

const metaLine = computed(() =>
  [props.typeLabel, matchSeriesLabel(bestOf.value), props.sourceLabel, props.contextLabel, durationLabel.value]
    .filter(Boolean)
    .join(" · "),
);

const teamNames = computed(() => ({
  mine: mineRaw.value?.team?.name || mineRaw.value?.name || t("pages.watch.ticker.tbd"),
  theirs: theirsRaw.value?.team?.name || theirsRaw.value?.name || t("pages.watch.ticker.tbd"),
}));

// Reuse DEAFCS's existing display-only score helper. No stored results change.
const score = computed(() => {
  const [first, second] = tournamentMatchScores(props.match);
  return focusIsLineup2.value
    ? { player: second, opponent: first }
    : { player: first, opponent: second };
});
const scoreClass = computed(() => {
  const { player, opponent } = score.value;
  if (!props.focusSteamId || player === null || opponent === null) return "text-foreground";
  if (player > opponent) return "text-[hsl(142_71%_60%)]";
  if (player < opponent) return "text-[hsl(0_84%_66%)]";
  return "text-foreground";
});
const hasElo = computed(() =>
  props.focusSteamId && props.eloChange &&
  Number.isFinite(Number(props.eloChange.elo_change)) &&
  Number(props.eloChange.elo_change) !== 0,
);

const triggerClasses =
  "relative z-[1] rounded-md px-3 py-1 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-150 hover:text-foreground data-[state=active]:text-[hsl(var(--tac-amber))]";

const mapChipBase =
  "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 font-mono text-[0.62rem] uppercase tracking-[0.1em] transition-colors";
const mapChipOn =
  "border-[hsl(var(--tac-amber)/0.55)] bg-[hsl(var(--tac-amber)/0.12)] text-[hsl(var(--tac-amber))]";
const mapChipOff =
  "border-border bg-muted/30 text-muted-foreground hover:text-foreground";

const actionClasses =
  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-muted/40 px-3 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-foreground/80 transition-colors hover:border-[hsl(var(--tac-amber)/0.55)] hover:bg-background hover:text-[hsl(var(--tac-amber))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.6)]";
</script>

<template>
  <div class="min-w-0 space-y-3" data-testid="player-match-scoreboard">
    <!-- MATCH STRIP — map (or series), score, and this player's rank move. -->
    <div
      class="sb-rise relative overflow-hidden rounded-lg border border-border bg-[hsl(240_8%_6%)]"
    >
      <img
        v-if="focusMap?.poster"
        :src="focusMap.poster"
        alt=""
        class="pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 object-cover opacity-20 [mask-image:linear-gradient(90deg,transparent,#000_55%)]"
      />
      <div
        class="relative grid items-center gap-x-6 gap-y-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
      >
        <div class="flex min-w-0 items-center gap-3">
          <img
            v-if="!isSeries && focusMap?.patch"
            :src="focusMap.patch"
            alt=""
            class="h-9 w-9 shrink-0"
          />
          <div class="min-w-0">
            <div class="truncate text-base font-bold tracking-[0.02em]">
              {{
                isSeries
                  ? matchSeriesLabel(bestOf)
                  : focusMap?.label || $t("common.na")
              }}
            </div>
            <div
              class="truncate font-mono text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground"
            >
              {{ metaLine }}
            </div>
          </div>
        </div>

        <div class="flex min-w-0 items-center justify-center gap-2 sm:gap-3.5">
          <span
            class="min-w-0 max-w-[10rem] truncate text-right text-sm font-semibold text-foreground/90"
            >{{ teamNames.mine }}</span
          >
          <span
            class="font-mono text-3xl font-extrabold leading-none tabular-nums"
            :class="scoreClass"
            >{{ score.player ?? "?" }}</span
          >
          <span class="font-mono text-xl text-muted-foreground/40">:</span>
          <span
            class="font-mono text-3xl font-extrabold leading-none tabular-nums text-muted-foreground"
            >{{ score.opponent ?? "?" }}</span
          >
          <span
            class="max-w-[10rem] truncate text-sm font-semibold text-foreground/90"
            >{{ teamNames.theirs }}</span
          >
        </div>

        <div v-if="focusSteamId && (hasElo || rankInfo)" class="flex items-center gap-2 lg:justify-end">
          <template v-if="hasElo">
            <span class="font-mono text-[0.58rem] text-muted-foreground">ELO</span>
            <EloChangeBadge :elo-change="eloChange" size="sm" />
          </template>
          <template v-else-if="rankInfo">
            <PlayerPremierRank v-if="rankInfo.rankType === 11" :premier-rank="rankInfo.rank" />
            <PlayerSkillGroupRank v-else :kind="rankInfo.rankType === 6 ? 'wingman' : 'competitive'" :rank="rankInfo.rank" />
            <span class="font-mono text-xs tabular-nums">{{ rankInfo.change > 0 ? "+" : "" }}{{ rankInfo.change }}</span>
          </template>
        </div>
      </div>

      <!-- SERIES — every map in the series doubles as the stat filter. -->
      <div
        v-if="isSeries"
        class="relative flex flex-wrap items-center gap-1.5 border-t border-border/60 bg-background/40 px-4 py-2.5"
      >
        <button
          type="button"
          :class="[
            mapChipBase,
            selectedMapId === null ? mapChipOn : mapChipOff,
          ]"
          @click.stop="selectMap(null)"
        >
          {{ $t("match.player_details_panel.all_maps") }}
        </button>
        <button
          v-for="m in maps"
          :key="m.id"
          type="button"
          :disabled="!m.played"
          :title="
            m.played ? m.label : $t('match.player_details_panel.map_not_played')
          "
          :class="[
            mapChipBase,
            !m.played
              ? 'cursor-not-allowed border-border/40 bg-muted/10 text-muted-foreground/40'
              : selectedMapId === m.id
                ? mapChipOn
                : mapChipOff,
          ]"
          @click.stop="selectMap(selectedMapId === m.id ? null : m.id)"
        >
          <img
            v-if="m.patch"
            :src="m.patch"
            alt=""
            class="h-4 w-4"
            :class="{ 'opacity-40 grayscale': !m.played }"
          />
          <span>{{ m.label }}</span>
          <span v-if="m.played" class="tabular-nums">
            <span
              :class="
                m.won
                  ? 'text-[hsl(142_71%_60%)]'
                  : m.lost
                    ? 'text-[hsl(0_84%_66%)]'
                    : ''
              "
              >{{ m.mine }}</span
            ><span class="opacity-50">:</span>{{ m.theirs }}
          </span>
          <span v-else>?</span>
        </button>
      </div>
    </div>

    <!-- Glides to whatever the body becomes (skeleton → tables, tab → tab)
         instead of jumping; the skeleton is shaped like both teams' table so
         a late arrival barely moves. -->
    <HeightGlide class="sb-rise sb-rise-2">
      <div
        v-if="placeholder"
        class="space-y-2 transition-opacity duration-200"
        :class="skeletonShown ? 'opacity-100' : 'opacity-0'"
        aria-busy="true"
      >
        <Skeleton class="h-7 w-72" />
        <div
          v-for="(rows, team) in skeletonTeams"
          :key="team"
          class="space-y-px overflow-hidden rounded-md"
        >
          <Skeleton class="h-12 w-full rounded-none opacity-60" />
          <Skeleton
            v-for="row in rows"
            :key="row"
            class="h-[66px] w-full rounded-none"
          />
        </div>
      </div>

      <div
        v-else-if="!hasStats"
        class="py-3 text-center text-xs text-muted-foreground"
        data-testid="scoreboard-no-stats"
      >
        {{ $t("match.player_details_panel.stats_unavailable") }}
      </div>

      <div v-else :class="fadeContent && 'sb-fade'">
        <Tabs
          :model-value="activeTab"
          @update:model-value="(v) => emit('update:active-tab', v as string)"
        >
          <TabsList
            class="inline-flex h-auto items-center gap-1 bg-transparent p-0"
          >
            <TabsTrigger
              v-for="tab in tabs"
              :key="tab.value"
              :value="tab.value"
              :class="triggerClasses"
            >
              {{ tab.label }}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            v-for="tab in tabs"
            :key="tab.value"
            :value="tab.value"
            class="tab-panel-in pt-2"
          >
            <template v-if="compact && focusLineup">
              <div class="overflow-hidden rounded-md border border-border bg-card">
                <StackedTable>
                  <component
                    :is="tab.component"
                    :match="match"
                    :lineup="focusLineup"
                    hide-member
                    v-bind="tab.props"
                  />
                </StackedTable>
              </div>
              <div v-if="showLobby" class="mt-3 overflow-x-auto">
                <component
                  :is="tab.component"
                  :match="match"
                  :lineup="mine"
                  :combine-with="theirs"
                  v-bind="tab.props"
                />
              </div>
            </template>
            <div v-else class="overflow-x-auto">
              <component
                :is="tab.component"
                :match="match"
                :lineup="mine"
                :combine-with="theirs"
                v-bind="tab.props"
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </HeightGlide>

    <div class="sb-rise sb-rise-3 flex flex-wrap gap-2">
      <button
        v-if="compact && focusLineup && hasStats && !placeholder"
        type="button"
        :class="[actionClasses, 'basis-full']"
        :aria-expanded="showLobby"
        @click.stop="showLobby = !showLobby"
      >
        <ChevronDown
          class="h-3.5 w-3.5 transition-transform [transition-duration:240ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
          :class="{ 'rotate-180': showLobby }"
        />
        {{
          showLobby
            ? $t("player_match.hide_lobby")
            : $t("player_match.show_lobby", { count: lobbySize })
        }}
      </button>
      <button
        v-if="clipsCount > 0"
        type="button"
        :class="actionClasses"
        @click.stop="emit('open-clips')"
      >
        <Play class="h-3 w-3 fill-current" />
        {{ $t("common.highlights") }} · {{ clipsCount }}
      </button>
      <NuxtLink :to="`/matches/${match.id}`" :class="actionClasses" @click.stop>
        <ExternalLink class="h-3.5 w-3.5" />
        {{ $t("match.open_match") }}
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* Opening: strip, tables and actions rise in on a short stagger. Opacity and
   transform only, so it stays smooth while the lobby table mounts. */
.sb-rise {
  animation: sb-rise 0.32s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.sb-rise-2 {
  animation-delay: 0.06s;
}
.sb-rise-3 {
  animation-delay: 0.12s;
}
@keyframes sb-rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
/* Tables that arrive after the skeleton just fade over its spot; the
   HeightGlide around them absorbs any height difference. */
.sb-fade {
  animation: sb-fade 0.18s ease-out both;
}
@keyframes sb-fade {
  from {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sb-rise,
  .sb-fade {
    animation: none;
  }
}
</style>
