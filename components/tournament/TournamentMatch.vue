<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import { computed, ref, watch } from "vue";
import { useBracketView } from "~/composables/useBracketView";
import gql from "graphql-tag";
import {
  MoreVertical,
  RotateCcw,
  Calendar as CalendarIcon,
} from "lucide-vue-next";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import MatchLineupScoreDisplay from "~/components/match/MatchLineupScoreDisplay.vue";
import MatchMapDots from "~/components/match/MatchMapDots.vue";
import TimeAgo from "~/components/TimeAgo.vue";
import BracketNegotiation from "~/components/tournament/BracketNegotiation.vue";
import { negotiableBracket } from "~/utilities/bracketNegotiation";
import { isOrphanedBracket } from "~/utilities/tournamentOrphanBracket";
import TournamentMatchResetFlow from "~/components/tournament/TournamentMatchResetFlow.vue";
import {
  e_match_status_enum,
  e_player_roles_enum,
  e_tournament_stage_types_enum,
} from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import type { Bracket } from "~/types/tournament";

type FeedingBracket = NonNullable<Bracket["feeding_brackets"]>[number];

const props = defineProps<{
  round: number;
  brackets: Bracket[];
  stage: {
    type?: string;
    max_teams?: number;
    groups?: number;
    default_best_of?: number;
    decider_best_of?: number;
    settings?: {
      round_best_of?: Record<string, number>;
    };
    options?: {
      best_of?: number;
    };
    // Per-round scheduling windows (only leagues create them today).
    windows?: Array<{ round: number; opens_at?: string | null; closes_at?: string | null }>;
  };
  tournament?: {
    // "negotiated": teams agree each bracket's time (BracketNegotiation).
    scheduling_mode?: string;
    league_season_division?: { id?: string } | null;
    is_organizer?: boolean;
    status?: string;
    // Whether later rounds start themselves once their feeders resolve.
    // Only used to decide how a bracket's projected ETA is presented -- see
    // showWaitingForTeams below.
    auto_start?: boolean;
    options?: {
      best_of?: number;
    };
  };
}>();

const emit = defineEmits<{
  (e: "schedule-bracket", bracket: Bracket): void;
}>();

// How a not-yet-materialized bracket presents its timing.
//
// tournament_brackets carries two different timestamps and they mean opposite
// things:
//
//   scheduled_at  - a REAL schedule someone committed to: an organizer setting
//                   a date/time via the schedule dialog, a league fixture, or
//                   an accepted negotiated time. Always shown, always a
//                   countdown.
//   scheduled_eta - a PROJECTION. calculate_tournament_bracket_start_times
//                   wipes and recomputes it across the whole tournament every
//                   time anything moves, and only while the tournament is
//                   Live. Nobody agreed to it.
//
// Rendering the projection as "Scheduled for / in 1 hour" read as a promise:
// with auto start on, a later-round match actually begins as soon as both
// feeders resolve, which can be immediately. Players could reasonably see an
// hour on the card and walk away. What the card is really expressing there is
// a dependency, not a time, so it says so instead.
//
// Deliberately narrow. The projection is only replaced when it exists AND auto
// start is on AND the participants are still unknown, so a bracket that simply
// has no timing information stays blank exactly as before -- this does not
// stamp "Waiting for teams" across every empty future card.
const hasRealSchedule = (bracket: Bracket) => !!bracket.scheduled_at;

const hasProjectedEta = (bracket: Bracket) =>
  !bracket.match && !bracket.scheduled_at && !!bracket.scheduled_eta;

const participantsKnown = (bracket: Bracket) =>
  !!bracket.team_1 && !!bracket.team_2;

const showWaitingForTeams = (bracket: Bracket) =>
  hasProjectedEta(bracket) &&
  !!props.tournament?.auto_start &&
  !participantsKnown(bracket);

// Auto start off means nothing will start this match on its own -- the
// organizer schedules it -- so the projection keeps its existing presentation
// and the manual scheduling UX is unchanged.
//
// With auto start on and both participants known, nothing is shown: the match
// materializes within the minute and its real status takes over the card.
const showProjectedEta = (bracket: Bracket) =>
  hasProjectedEta(bracket) && !props.tournament?.auto_start;

const { t } = useI18n();
const nuxtApp = useNuxtApp();
const authStore = useAuthStore();

const canManageBracketReset = computed(
  () =>
    !!props.tournament?.is_organizer ||
    authStore.isRoleAbove(e_player_roles_enum.administrator),
);

const resetFlow = ref<InstanceType<typeof TournamentMatchResetFlow> | null>(null);
const resetLoading = computed(() => !!resetFlow.value?.loading);
const openResetFlow = (bracket: Bracket) => {
  if (bracket.match?.id) resetFlow.value?.open(bracket.match as any);
};

const getTeamsPerGroup = (stage: any): number => {
  return Math.ceil((stage.max_teams || 0) / Math.max(stage.groups || 1, 1));
};

const getTotalRounds = (stage: any): number => {
  return Math.ceil(Math.log2(Math.max(getTeamsPerGroup(stage), 2)));
};

const isThirdPlaceMatch = (bracket: Bracket): boolean => {
  const stage = props.stage;
  if (stage?.type !== e_tournament_stage_types_enum.SingleElimination)
    return false;
  if (bracket.match_number !== 2) return false;
  return props.round === getTotalRounds(stage);
};

const hasProblemStatus = (bracket: Bracket): boolean => {
  const status = bracket.match?.status as e_match_status_enum | undefined;
  if (!status) return false;
  return [
    e_match_status_enum.Canceled,
    e_match_status_enum.Forfeit,
    e_match_status_enum.Surrendered,
    e_match_status_enum.WaitingForServer,
  ].includes(status);
};

const isActiveMatch = (bracket: Bracket): boolean => {
  const status = bracket.match?.status as e_match_status_enum | undefined;
  if (!status) return false;
  return [e_match_status_enum.Veto, e_match_status_enum.Live].includes(status);
};

const isWaitingForCheckIn = (bracket: Bracket): boolean => {
  const status = bracket.match?.status as e_match_status_enum | undefined;
  if (!status) return false;
  return status === e_match_status_enum.WaitingForCheckIn;
};

const getBestOf = (
  bracket: Bracket,
  stage: any,
  tournament: any,
): number | null => {
  // Try to get best_of from bracket options first (organizer override)
  if (bracket.options?.best_of) {
    return bracket.options.best_of;
  }
  // Try to get best_of from match options (already resolved at scheduling time)
  if (bracket.match?.options?.best_of) {
    return bracket.match.options.best_of;
  }
  // SE 3rd place match uses decider_best_of (separate field, not in round_best_of)
  if (
    stage?.type === e_tournament_stage_types_enum.SingleElimination &&
    stage?.decider_best_of &&
    bracket.match_number === 2
  ) {
    if (props.round === getTotalRounds(stage)) {
      return stage.decider_best_of;
    }
  }
  // If no match yet, try to compute from per-round settings
  if (stage?.settings?.round_best_of) {
    const roundBestOf = stage.settings.round_best_of;
    let key: string;
    if (stage.type === e_tournament_stage_types_enum.Swiss) {
      key = getSwissMatchType(bracket);
    } else if (
      stage.type === e_tournament_stage_types_enum.DoubleElimination &&
      bracket.path === "WB"
    ) {
      // DE Grand Final uses "GF" key (round > wb_rounds)
      const wbRounds = getTotalRounds(stage);
      key = props.round > wbRounds ? "GF" : `WB:${props.round}`;
    } else {
      key = bracket.path ? `${bracket.path}:${props.round}` : "";
    }
    if (key && roundBestOf[key] !== undefined) {
      return roundBestOf[key];
    }
  }
  // Fall back to stage default_best_of
  if (stage?.default_best_of) {
    return stage.default_best_of;
  }
  // Fall back to stage options best_of
  if (stage?.options?.best_of) {
    return stage.options.best_of;
  }
  // Fall back to tournament options (if available)
  if (tournament?.options?.best_of) {
    return tournament.options.best_of;
  }
  return null;
};

const getSwissMatchType = (bracket: Bracket): string => {
  const group = bracket.group ?? 0;
  const wins = Math.floor(group / 100);
  const losses = group % 100;
  const winsNeeded = 3;
  if (wins === winsNeeded - 1) return "advancement";
  if (losses === winsNeeded - 1) return "elimination";
  return "regular";
};

const getTeamName = (team: Bracket["team_1"]): string => {
  return team?.team?.name || team?.name || "";
};

const router = useRouter();

const handleClick = (event: MouseEvent, bracket: Bracket) => {
  if (bracket.match) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(`/matches/${bracket.match.id}`, "_blank");
      return;
    }
    router.push({
      name: "matches-id",
      params: { id: bracket.match.id },
    });
    return;
  }
  // No match yet — open schedule dialog if organizer
  if (props.tournament?.is_organizer) {
    emit("schedule-bracket", bracket);
  }
};

/**
 * Get the feeding bracket for a given team slot (1 or 2).
 * Sorts feeds to match the DB slot assignment order from
 * assign_team_to_bracket_slot: loser drops first, then winner
 * feeds, then by round and match_number within each group.
 */
const getSortedFeeds = (bracket: Bracket): FeedingBracket[] => {
  const feeds = bracket.feeding_brackets || [];
  if (feeds.length === 0) return [];
  return [...feeds].sort((a, b) => {
    const aLoser = a.loser_parent_bracket_id === bracket.id ? 0 : 1;
    const bLoser = b.loser_parent_bracket_id === bracket.id ? 0 : 1;
    if (aLoser !== bLoser) return aLoser - bLoser;
    if ((a.round ?? 0) !== (b.round ?? 0))
      return (a.round ?? 0) - (b.round ?? 0);
    return (a.match_number ?? 0) - (b.match_number ?? 0);
  });
};

const getFeedForSlot = (
  bracket: Bracket,
  slot: 1 | 2,
): FeedingBracket | undefined => {
  const sorted = getSortedFeeds(bracket);
  return sorted[slot - 1];
};

const formatRoundRef = (
  round: number,
  match_number?: number,
  path?: string,
) => {
  const pathPrefix = path === "WB" ? "wb_" : path === "LB" ? "lb_" : "";
  return match_number
    ? t(`tournament.match.${pathPrefix}round_match_ref`, {
        round,
        match: match_number,
      })
    : t(`tournament.match.${pathPrefix}round_ref`, { round });
};

/** Same pattern as formatDestinationText: "Winner → …" / "Loser → …" + full round ref. */
const formatFeedingText = (bracket: Bracket, feeding?: FeedingBracket) => {
  if (!feeding) return "";
  const isLoserDrop = feeding.loser_parent_bracket_id === bracket.id;
  const prefix = isLoserDrop
    ? t("tournament.match.loser_arrow")
    : t("tournament.match.winner_arrow");
  const roundRef = formatRoundRef(
    feeding.round,
    feeding.match_number,
    feeding.path,
  );
  return `${prefix} ${roundRef}`.trim();
};

const formatDestinationText = (
  type: "winner" | "loser",
  dest?: { round: number; match_number?: number; path?: string },
  path?: string,
) => {
  if (!dest) return "";
  const prefix =
    type === "winner"
      ? t("tournament.match.winner_arrow")
      : t("tournament.match.loser_arrow");
  const roundMatch = formatRoundRef(dest.round, dest.match_number, path);
  return `${prefix} ${roundMatch}`;
};

const isLbFeedingToWb = (bracket: Bracket) => {
  return bracket.path === "LB" && bracket.parent_bracket?.path === "WB";
};

/**
 * Bracket viewers render one group at a time; SVG lines only connect matches in
 * the same DOM. When source and target differ by group (e.g. WB → LB), show a
 * hint instead of duplicating what a line already conveys.
 */
const isSameViewerGroup = (
  a: number | undefined,
  b: number | undefined,
): boolean => a === b;

/**
 * Show feed-in text only when the feeder is not in the same viewer as this
 * match (no drawn connector), or the graph edge is missing from feed metadata.
 * Swiss layout does not draw connector lines, so always show when a feed exists.
 */
const shouldShowFeedInHint = (
  bracket: Bracket,
  feeding: FeedingBracket | undefined,
): boolean => {
  if (!feeding) return false;
  if (props.stage.type === e_tournament_stage_types_enum.Swiss) {
    return true;
  }
  const hasGraphEdge =
    feeding.parent_bracket_id === bracket.id ||
    feeding.loser_parent_bracket_id === bracket.id;
  if (!hasGraphEdge) return true;
  return !isSameViewerGroup(feeding.group, bracket.group);
};

/**
 * Map sorted feeds to top/bottom rows. Top = same-view / incoming line; bottom
 * = cross-view amber hint when only one feed needs that hint. If two feeds and
 * exactly one needs a cross-view label, put the same-view feed on top and the
 * hint on the bottom.
 */
const getFeedForDisplayRow = (
  bracket: Bracket,
  row: 1 | 2,
): FeedingBracket | undefined => {
  const sorted = getSortedFeeds(bracket);
  if (sorted.length === 0) return undefined;

  const needsHint = (f: FeedingBracket) => shouldShowFeedInHint(bracket, f);
  const hintFeeds = sorted.filter(needsHint);
  const noHintFeeds = sorted.filter((f) => !needsHint(f));

  if (
    sorted.length === 2 &&
    hintFeeds.length === 1 &&
    noHintFeeds.length === 1
  ) {
    return row === 1 ? noHintFeeds[0] : hintFeeds[0];
  }

  if (sorted.length === 1) {
    if (needsHint(sorted[0])) {
      return row === 2 ? sorted[0] : undefined;
    }
    return row === 1 ? sorted[0] : undefined;
  }

  return sorted[row - 1];
};

const getWbFeedForDisplayRow = (
  bracket: Bracket,
  row: 1 | 2,
): FeedingBracket | undefined => {
  const feed = getFeedForDisplayRow(bracket, row);
  if (feed && feed.path === "WB") return feed;
  return undefined;
};

const shouldShowCrossBracketDestination = (
  bracket: Bracket,
  dest?: { id?: string; group?: number },
): boolean => {
  if (!dest?.id) return false;
  return !isSameViewerGroup(dest.group, bracket.group);
};

// "Follow team" (adapted from 5Stack): the card carries both team ids so the
// bracket viewer can draw the followed team's path, and rings itself.
const { followTeamId } = useBracketView();
const bracketTeamIds = (bracket: any) =>
  [bracket.team_1?.id, bracket.team_2?.id].filter(Boolean).join(" ");
const isFollowed = (bracket: any) =>
  !!followTeamId.value &&
  (bracket.team_1?.id === followTeamId.value ||
    bracket.team_2?.id === followTeamId.value);

// Card helpers adapted from 5Stack WEB 25dbf95d (TournamentMatch.vue); MIT
// Copyright (c) 2025 5Stack.gg.
const getRoundMatchLabel = (bracket: Bracket): string => {
  const isDoubleElimination =
    props.stage.type === e_tournament_stage_types_enum.DoubleElimination;
  return t("tournament.match.round_match", {
    round: props.round,
    match: bracket.match_number,
    prefix:
      bracket.path === "LB"
        ? "LB"
        : bracket.path === "WB" && isDoubleElimination
          ? "WB"
          : "",
  }).trim();
};

const SLOTS = [1, 2] as const;

const slotTeam = (bracket: Bracket, slot: 1 | 2) =>
  slot === 1 ? bracket.team_1 : bracket.team_2;

const slotSeed = (bracket: Bracket, slot: 1 | 2) =>
  slot === 1 ? bracket.team_1_seed : bracket.team_2_seed;

const slotLineup = (bracket: Bracket, slot: 1 | 2) =>
  slot === 1 ? bracket.match?.lineup_1 : bracket.match?.lineup_2;

const isForfeit = (bracket: Bracket) =>
  bracket.match?.status === e_match_status_enum.Forfeit;

const matchWinnerId = (bracket: Bracket): string | null =>
  (bracket.match as { winning_lineup_id?: string | null } | undefined)
    ?.winning_lineup_id ?? null;

const slotOutcome = (bracket: Bracket, slot: 1 | 2): "won" | "lost" | null => {
  const winner = matchWinnerId(bracket);
  const lineup = slotLineup(bracket, slot);
  if (!winner || !lineup) return null;
  return lineup.id === winner ? "won" : "lost";
};

const statusLabel = (bracket: Bracket) =>
  bracket.match?.status
    ? t(`tournament.notifications.status.${bracket.match.status}`)
    : "";

const isEmptyBracket = (bracket: Bracket) =>
  !bracket.match && !bracket.team_1 && !bracket.team_2;

// Dark, flat and low-contrast: charcoal fill, border only for state. A
// following view keeps 5Stack's dimming of cards off the followed path; the
// DEAFCS amber ring (template) marks the cards on it.
const cardClasses = (bracket: Bracket) => {
  const following = followTeamId.value;
  const onPath = isFollowed(bracket);
  return [
    isEmptyBracket(bracket)
      ? "border-dashed border-muted-foreground/25 bg-[hsl(240_6%_6.5%)]"
      : "bg-[hsl(240_6%_8%)]",
    onPath
      ? "border-[hsl(var(--tac-amber))]"
      : isActiveMatch(bracket)
        ? "border-emerald-500/70 shadow-[0_0_0_1px_rgb(16_185_129/0.25)]"
        : isWaitingForCheckIn(bracket)
          ? "border-amber-500/60"
          : hasProblemStatus(bracket) && !isForfeit(bracket)
            ? "border-red-500/60"
            : isEmptyBracket(bracket)
              ? ""
              : "border-border [@media(hover:hover)]:hover:border-foreground/35",
    following && !onPath && "opacity-30",
  ];
};

// Where this match sends its teams, shown only until it is decided and only
// for edges no connector line draws (another bracket section).
const footerLines = (bracket: Bracket) => {
  const lines: { text: string; class: string }[] = [];
  if (isThirdPlaceMatch(bracket)) {
    lines.push({
      text: t("tournament.match.third_place_decider"),
      class: "text-emerald-400",
    });
  }
  if (
    props.stage.type !== e_tournament_stage_types_enum.DoubleElimination ||
    bracket.bye ||
    matchWinnerId(bracket)
  ) {
    return lines;
  }
  if (
    isLbFeedingToWb(bracket) &&
    shouldShowCrossBracketDestination(bracket, bracket.parent_bracket)
  ) {
    lines.push({
      text: formatDestinationText(
        "winner",
        bracket.parent_bracket,
        bracket.parent_bracket?.path,
      ),
      class: "text-emerald-400/90",
    });
  }
  if (
    bracket.loser_bracket &&
    shouldShowCrossBracketDestination(bracket, bracket.loser_bracket)
  ) {
    lines.push({
      text: formatDestinationText(
        "loser",
        bracket.loser_bracket,
        bracket.loser_bracket.path,
      ),
      class: "text-red-300/80",
    });
  }
  return lines;
};

const hasFooter = (bracket: Bracket) =>
  (hasRealSchedule(bracket) && !bracket.match) ||
  showWaitingForTeams(bracket) ||
  showProjectedEta(bracket) ||
  negotiableBracket(props.tournament, bracket as any) ||
  footerLines(bracket).length > 0;
</script>

<template>
  <!-- Card adapted from 5Stack WEB 25dbf95d (TournamentMatch.vue); MIT
       Copyright (c) 2025 5Stack.gg. Flat charcoal card: a slim header strip
       (match number, Bo, live/status/maps), one row per team slot (seed chip,
       name or feeder, score column), and a footer for what no connector line
       shows. DEAFCS keeps its follow ring, schedule/ETA wording and
       negotiation panel. -->
  <template v-for="bracket in props.brackets" :key="bracket.id">
    <div
      v-if="
        !bracket.bye ||
        bracket.team_1 ||
        bracket.team_2 ||
        bracket.feeding_brackets?.length
      "
      :id="`bracket-${bracket.id}`"
      class="tournament-match relative flex w-[13.5rem] cursor-pointer flex-col overflow-hidden rounded-md border transition-[border-color,opacity,box-shadow] duration-150"
      :class="[
        cardClasses(bracket),
        {
          'ring-2 ring-[hsl(var(--tac-amber))] ring-offset-2 ring-offset-background':
          isFollowed(bracket),
        },
      ]"
      :data-bracket-id="bracket.id"
      :data-teams="bracketTeamIds(bracket)"
      :data-following="isFollowed(bracket) ? 'true' : undefined"
      :data-round="props.round"
      @click="handleClick($event, bracket)"
    >
      <div
        class="flex h-[1.375rem] items-center justify-between gap-2 bg-muted/35 pl-2 pr-1 text-[0.66rem] font-semibold text-muted-foreground"
      >
        <span
          class="min-w-0 truncate"
          :title="bracket.bye ? undefined : getRoundMatchLabel(bracket)"
        >
          {{
            bracket.bye
              ? $t("tournament.match.bye_round")
              : $t("tournament.bracket.match_short", {
                  match: bracket.match_number,
                })
          }}
          <span
            v-if="!bracket.bye && getBestOf(bracket, stage, tournament)"
            class="ml-1 font-medium text-muted-foreground/70"
          >
            Bo{{ getBestOf(bracket, stage, tournament) }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-1.5">
          <span
            v-if="isActiveMatch(bracket)"
            class="inline-flex items-center gap-1 font-bold uppercase tracking-[0.08em] text-emerald-400"
          >
            <span class="relative flex h-1.5 w-1.5">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none"
              ></span>
              <span
                class="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"
              ></span>
            </span>
            {{ $t("common.live") }}
          </span>
          <span v-else-if="isWaitingForCheckIn(bracket)" class="text-amber-400">
            {{ statusLabel(bracket) }}
          </span>
          <span
            v-else-if="hasProblemStatus(bracket) && !isForfeit(bracket)"
            class="text-red-400"
          >
            {{ statusLabel(bracket) }}
          </span>
          <MatchMapDots v-else-if="bracket.match" :match="bracket.match" />
          <DropdownMenu v-if="canManageBracketReset && isOrphanedBracket(bracket)">
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="relative h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground after:absolute after:-inset-1.5"
                :disabled="recreateLoading"
                data-testid="bracket-orphan-actions"
                @click.stop
              >
                <span class="sr-only">{{
                  $t("tournament.open_match_actions")
                }}</span>
                <MoreVertical aria-hidden="true" class="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-52">
              <DropdownMenuItem
                class="text-red-300 focus:bg-red-950/50 focus:text-red-200"
                data-testid="bracket-recreate-match"
                @click.stop="recreateMatch(bracket)"
              >
                <RotateCcw />
                {{ $t("tournament.match.recreate_match") }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu
            v-if="canManageBracketReset && bracket.match && !bracket.bye"
          >
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="relative h-5 w-5 rounded-sm text-muted-foreground hover:text-foreground after:absolute after:-inset-1.5"
                :disabled="resetLoading"
                @click.stop
              >
                <span class="sr-only">{{
                  $t("tournament.open_match_actions")
                }}</span>
                <MoreVertical aria-hidden="true" class="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-52">
              <DropdownMenuItem
                class="text-red-300 focus:bg-red-950/50 focus:text-red-200"
                @click.stop="openResetFlow(bracket)"
              >
                <RotateCcw />
                {{ $t("tournament.match.reset_winner") }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>

      <!-- One row per slot. data-feed tags the row the feeding match's team
           will land in, so connector lines meet the slot, not the card. -->
      <div
        v-for="slot in SLOTS"
        :key="slot"
        class="flex h-7 min-w-0 items-center gap-1.5 pl-2 text-[0.8rem] font-semibold"
        :class="[
          slot === 2 && 'border-t border-border/60',
          followTeamId &&
            slotTeam(bracket, slot)?.id === followTeamId &&
            'bg-[hsl(var(--tac-amber)/0.1)]',
        ]"
        :data-slot="slot"
        :data-feed="getFeedForSlot(bracket, slot)?.id"
      >
        <span
          v-if="slotSeed(bracket, slot)"
          class="inline-grid h-4 min-w-[1.125rem] shrink-0 place-items-center rounded-[3px] bg-muted/70 px-1 text-[0.625rem] font-semibold tabular-nums text-muted-foreground"
        >
          {{ slotSeed(bracket, slot) }}
        </span>
        <span
          v-if="slotTeam(bracket, slot)"
          class="min-w-0 flex-1 truncate"
          :class="
            slotOutcome(bracket, slot) === 'lost' && 'text-muted-foreground'
          "
          :title="getTeamName(slotTeam(bracket, slot))"
        >
          {{ getTeamName(slotTeam(bracket, slot)) }}
        </span>
        <span
          v-else
          class="min-w-0 flex-1 truncate text-[0.7rem] font-medium text-muted-foreground"
        >
          {{
            bracket.bye
              ? ""
              : formatFeedingText(bracket, getFeedForSlot(bracket, slot)) ||
                $t("common.tbd")
          }}
        </span>
        <span
          v-if="bracket.match && slotLineup(bracket, slot)"
          class="grid w-8 shrink-0 place-items-center self-stretch bg-muted/35 text-[0.8rem] font-extrabold tabular-nums"
        >
          <span
            v-if="isForfeit(bracket) && slotOutcome(bracket, slot)"
            :class="
              slotOutcome(bracket, slot) === 'won'
                ? 'text-green-400'
                : 'text-red-400'
            "
          >
            {{
              slotOutcome(bracket, slot) === "won"
                ? $t("tournament.bracket.walkover_win")
                : $t("tournament.bracket.forfeit_short")
            }}
          </span>
          <MatchLineupScoreDisplay
            v-else
            :match="bracket.match"
            :lineup="slotLineup(bracket, slot)"
            :halves="false"
          />
        </span>
      </div>

      <!-- Footer: schedule (DEAFCS wording), negotiation, and where this match
           sends its teams when no connector line in this view shows it. -->
      <div
        v-if="hasFooter(bracket)"
        class="grid gap-1 border-t border-border/60 px-2 py-1.5 text-[0.66rem] text-muted-foreground"
      >
        <!-- A real committed schedule: organizer-set, league, or negotiated.
             Unchanged. -->
        <span
          v-if="hasRealSchedule(bracket) && !bracket.match"
          class="flex items-center gap-1"
        >
          <CalendarIcon class="h-3 w-3 shrink-0" />
          <span>{{ $t("common.scheduled") }}</span>
          <span class="text-green-400 font-medium">
            <TimeAgo :date="bracket.scheduled_at"></TimeAgo>
          </span>
        </span>
        <!-- Auto start will begin this the moment its feeders resolve, so the
             projected ETA would be a misleading promise. States the dependency
             instead, with no countdown, and deliberately not in the green a
             real schedule uses. -->
        <span
          v-else-if="showWaitingForTeams(bracket)"
          class="flex items-center gap-1"
        >
          <span class="text-blue-400 font-medium">
            {{ $t("tournament.match.waiting_for_teams") }}
          </span>
        </span>
        <!-- Auto start off: the organizer drives scheduling, so the projection
             keeps its existing presentation. -->
        <span
          v-else-if="showProjectedEta(bracket)"
          class="flex items-center gap-1"
        >
          <span>{{ $t("tournament.match.scheduled_for") }}</span>
          <span class="text-blue-400 font-medium">
            <TimeAgo :date="bracket.scheduled_eta"></TimeAgo>
          </span>
        </span>

        <!-- Negotiated tournament (not a league): the teams agree the time
             here, before and after the match exists. -->
        <BracketNegotiation
          v-if="negotiableBracket(props.tournament, bracket as any)"
          :bracket="bracket"
          :stage="props.stage"
        />

        <span
          v-for="line in footerLines(bracket)"
          :key="line.text"
          class="truncate"
          :class="line.class"
          :title="line.text"
        >
          {{ line.text }}
        </span>
      </div>
    </div>
  </template>

  <TournamentMatchResetFlow ref="resetFlow" />
</template>
