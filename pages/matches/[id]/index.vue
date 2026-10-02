<script setup lang="ts">
import { computed, onUnmounted, provide, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useApolloClient } from "@vue/apollo-composable";
import gql from "graphql-tag";
import { useMatchClips } from "~/composables/useMatchClips";
import MatchOverview from "~/components/match/overview/MatchOverview.vue";
import { createCaptainPickProgress } from "~/composables/useCaptainPickProgress";
import MatchTabs from "~/components/match/MatchTabs.vue";
import AnimatedStat from "~/components/AnimatedStat.vue";
import MatchMaps from "~/components/match/MatchMaps.vue";
import MatchAdminBottomBar from "~/components/match/MatchAdminBottomBar.vue";
import MatchInfo from "~/components/match/MatchInfo.vue";
import MatchHighlightsReel from "~/components/match/MatchHighlightsReel.vue";
import MatchActions from "~/components/match/MatchActions.vue";
import CameraRequirementOverlay from "~/components/match/CameraRequirementOverlay.vue";
import MatchSourceBadge from "~/components/MatchSourceBadge.vue";
import MatchTypeBadge from "~/components/MatchTypeBadge.vue";
import { e_match_status_enum } from "~/generated/zeus";
import MatchPicksDisplay from "~/components/match/MatchPicksDisplay.vue";
import StreamEmbed from "~/components/StreamEmbed.vue";
import LiveStreamPlayer from "~/components/match/LiveStreamPlayer.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import TimeAgo from "~/components/TimeAgo.vue";
import { AlertTriangle } from "lucide-vue-next";
import { useMatchContext } from "~/composables/useMatchContext";
import {
  nextSelectedStatsMapId,
  statsEligibleMatchMaps,
} from "~/utilities/matchMapScope";

definePageMeta({
  pageTransition: { name: "page", mode: "out-in" },
});

// Reflect the match ("Team A vs Team B") in the browser tab / in-app title.
// The context is populated by the subscription in the Options block below.
const matchContext = useMatchContext();
useHead({
  title: () => matchContext.value?.displayText || undefined,
});

const selectedStatsMapId = ref<string | null>(null);

// One subscription shared by MatchTabs (Clips) + lineup row indicators.
const route = useRoute();
const routeMatchId = computed(() => String(route.params.id));

// Reserve scroll height when switching maps so a shorter map can't yank the
// page up. Tab switches are covered by ui/tabs itself.
const { capture: captureScrollFloor } = useScrollFloor();
watch(
  selectedStatsMapId,
  () => captureScrollFloor(),
);
const matchClipsState = useMatchClips(routeMatchId);
const hasMatchClips = computed(() => matchClipsState.clips.value.length > 0);
provide("matchClips", matchClipsState.clips);
provide("matchClipsLoading", matchClipsState.loading);
provide("matchClipsByTarget", matchClipsState.byTarget);

// Per-match Valve ranks for the lineup display — Premier CS Rating and
// per-map Competitive/Wingman skill groups, keyed by steam_id. Lives in its
// own lightweight subscription so PlayerDisplay can show each player's rank
// for this match via inject, without threading it through every layer.
const matchRanks = ref<
  Record<
    string,
    {
      rankType: number;
      rank: number;
      previousRank: number | null;
      change: number;
    }
  >
>({});
provide("matchRanks", matchRanks);

const { client: apolloClient } = useApolloClient();
const RANK_HISTORY_SUB = gql`
  subscription MatchRankHistory($matchId: uuid!) {
    player_premier_rank_history(where: { match_id: { _eq: $matchId } }) {
      steam_id
      rank
      rank_type
      previous_rank
    }
  }
`;
let rankSub: { unsubscribe: () => void } | null = null;
watch(
  routeMatchId,
  (id) => {
    rankSub?.unsubscribe();
    rankSub = null;
    matchRanks.value = {};
    if (!id) return;
    rankSub = apolloClient
      .subscribe({ query: RANK_HISTORY_SUB, variables: { matchId: id } })
      .subscribe({
        next: ({ data }: any) => {
          const map: Record<
            string,
            {
              rankType: number;
              rank: number;
              previousRank: number | null;
              change: number;
            }
          > = {};
          for (const r of data?.player_premier_rank_history ?? []) {
            const rank = Number(r.rank ?? 0);
            const prev =
              r.previous_rank == null ? null : Number(r.previous_rank);
            map[String(r.steam_id)] = {
              rankType: Number(r.rank_type),
              rank,
              previousRank: prev,
              change: prev == null ? 0 : rank - prev,
            };
          }
          matchRanks.value = map;
        },
      });
  },
  { immediate: true },
);
onUnmounted(() => rankSub?.unsubscribe());

const heroClasses =
  "relative min-w-0 max-w-full px-6 pt-5 pb-6 max-sm:p-4 border border-border [background:linear-gradient(180deg,hsl(var(--card)/0.2)_0%,hsl(var(--card)/0.04)_100%)] before:content-[''] before:absolute before:w-[14px] before:h-[14px] before:border-[hsl(var(--tac-amber))] before:border-solid before:top-2 before:left-2 before:border-t-2 before:border-l-2 after:content-[''] after:absolute after:w-[14px] after:h-[14px] after:border-[hsl(var(--tac-amber))] after:border-solid after:bottom-2 after:right-2 after:border-b-2 after:border-r-2";

const statusBaseClasses =
  "inline-flex items-center gap-2 px-[0.7rem] py-[0.3rem] font-mono text-[0.68rem] font-bold tracking-[0.2em] uppercase border rounded";

const statusTierClasses: Record<string, string> = {
  live: "bg-[hsl(var(--destructive)/0.15)] border-[hsl(var(--destructive)/0.6)] text-destructive",
  pending:
    "bg-[hsl(var(--tac-amber)/0.12)] border-[hsl(var(--tac-amber)/0.5)] text-[hsl(var(--tac-amber))]",
  veto: "bg-[hsl(var(--topnav-accent)/0.15)] border-[hsl(var(--topnav-accent)/0.5)] text-[hsl(var(--topnav-accent))]",
  finished:
    "bg-[hsl(var(--success)/0.15)] border-[hsl(var(--success)/0.5)] text-success",
  ended: "bg-[hsl(var(--muted)/0.4)] border-border text-muted-foreground",
  neutral: "bg-[hsl(var(--muted)/0.3)] border-border text-muted-foreground",
};

const teamClasses =
  "relative grid font-sans font-bold [font-stretch:80%] text-[clamp(1.5rem,3.5vw,2.75rem)] leading-[0.95] tracking-[0.02em] uppercase min-w-0 max-w-full break-words";

const teamMainClasses =
  "col-start-1 row-start-1 relative bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent";

const teamMainWinnerClasses =
  "from-[hsl(var(--tac-amber))] to-[hsl(var(--tac-amber))]";

const teamGhostClasses =
  "col-start-1 row-start-1 translate-x-1 translate-y-1 text-transparent [-webkit-text-stroke:1px_hsl(var(--tac-amber)/0.3)] pointer-events-none select-none";

const scoreClasses =
  "font-sans font-extrabold [font-stretch:80%] text-[clamp(2.5rem,5vw,4rem)] leading-none text-[hsl(var(--muted-foreground)/0.6)] [font-variant-numeric:tabular-nums] transition-colors duration-200 ease";

const vsBaseClasses =
  "font-mono text-[0.8rem] font-bold tracking-[0.3em] text-muted-foreground px-[0.6rem] py-[0.35rem] border border-border bg-[hsl(var(--card)/0.5)]";
</script>

<template>
  <div class="flex flex-col gap-4 md:gap-6 w-full max-w-[1600px] mx-auto">
    <CameraRequirementOverlay
      v-if="showCameraOverlay"
      :match-id="match.id"
      @update:ready="cameraReady = $event"
    />
    <template v-if="match">
    <PageTransition>
      <header :class="heroClasses">
        <div class="flex items-center gap-3 flex-wrap mb-5 max-sm:mb-[0.85rem]">
          <span
            :class="[
              statusBaseClasses,
              statusTierClasses[statusTier] || statusTierClasses.neutral,
            ]"
          >
            <span class="w-[6px] h-[6px] bg-current rounded-full"></span>
            {{ match.e_match_status?.description || match.status }}
          </span>
          <TimeAgo
            v-if="
              match.status === e_match_status_enum.Finished && match.ended_at
            "
            :date="match.ended_at"
            class="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-muted-foreground"
          />
          <span
            v-if="match.label"
            class="font-mono text-[0.7rem] tracking-[0.2em] uppercase text-muted-foreground"
          >
            {{ match.label }}
          </span>
          <NuxtLink
            v-if="tournamentContext"
            :to="`/tournaments/${tournamentContext.id}`"
            class="inline-flex items-center gap-[0.4rem] font-mono text-[0.72rem] tracking-[0.15em] uppercase text-muted-foreground [transition:color_140ms_ease] hover:text-[hsl(var(--tac-amber))] max-sm:w-full max-sm:ml-0"
          >
            <span class="text-[hsl(var(--tac-amber))] text-[0.65rem]">◢</span>
            {{ tournamentContext.name }}
          </NuxtLink>

          <div class="inline-flex items-center gap-2 ml-auto">
            <MatchTypeBadge
              :type="match.options?.type"
              size="detail"
              class="self-stretch"
            />
            <MatchSourceBadge
              v-if="match.source !== 'faceit'"
              :source="match.source"
            />
            <MatchActions :match="match" />
          </div>
        </div>

        <div
          class="flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6 items-stretch lg:items-center"
        >
          <div
            class="flex items-center gap-3 min-w-0 justify-center text-center lg:justify-start lg:text-left"
          >
            <component
              :is="lineup1TeamId ? 'NuxtLink' : 'div'"
              :to="lineup1TeamId ? `/teams/${lineup1TeamId}` : undefined"
              class="shrink-0 h-12 w-12 border border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.1)] flex items-center justify-center overflow-hidden"
              :class="
                lineup1TeamId && 'transition-opacity hover:opacity-80 cursor-pointer'
              "
            >
              <img
                v-if="lineup1AvatarSrc"
                :src="lineup1AvatarSrc"
                :alt="lineup1Name"
                class="h-full w-full object-cover"
              />
              <span
                v-else
                class="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--tac-amber))]"
              >
                {{ (lineup1Name || "?").slice(0, 3) }}
              </span>
            </component>
            <div
              class="flex flex-col gap-[0.35rem] min-w-0 items-start lg:items-start"
            >
              <span
                class="font-mono text-[0.6rem] tracking-[0.28em] uppercase text-muted-foreground/70"
              >
                {{ $t("match.lineup.lineup_1") }}
              </span>
              <NuxtLink
                v-if="lineup1TeamId"
                :to="`/teams/${lineup1TeamId}`"
                :class="[
                  teamClasses,
                  match.winning_lineup_id === match.lineup_1_id && 'is-winner',
                  'transition-opacity hover:opacity-80 cursor-pointer',
                ]"
              >
                <span :class="teamGhostClasses" aria-hidden="true">
                  {{ lineup1Name }}
                </span>
                <span
                  :class="[
                    teamMainClasses,
                    match.winning_lineup_id === match.lineup_1_id &&
                      teamMainWinnerClasses,
                  ]"
                >
                  {{ lineup1Name }}
                </span>
              </NuxtLink>
              <div
                v-else
                :class="[
                  teamClasses,
                  match.winning_lineup_id === match.lineup_1_id && 'is-winner',
                ]"
              >
                <span :class="teamGhostClasses" aria-hidden="true">
                  {{ lineup1Name }}
                </span>
                <span
                  :class="[
                    teamMainClasses,
                    match.winning_lineup_id === match.lineup_1_id &&
                      teamMainWinnerClasses,
                  ]"
                >
                  {{ lineup1Name }}
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-center">
            <div v-if="hasScores" class="inline-flex items-center gap-4">
              <span
                :class="[
                  scoreClasses,
                  mapScores.l1 > mapScores.l2 &&
                    '!text-[hsl(var(--tac-amber))] [text-shadow:0_0_18px_hsl(var(--tac-amber)/0.35)]',
                ]"
              >
                <AnimatedStat :value="mapScores.l1" />
              </span>
              <span :class="[vsBaseClasses, 'uppercase']">{{
                $t("common.vs")
              }}</span>
              <span
                :class="[
                  scoreClasses,
                  mapScores.l2 > mapScores.l1 &&
                    '!text-[hsl(var(--tac-amber))] [text-shadow:0_0_18px_hsl(var(--tac-amber)/0.35)]',
                ]"
              >
                <AnimatedStat :value="mapScores.l2" />
              </span>
            </div>
            <span
              v-else
              :class="[vsBaseClasses, 'text-base px-4 py-[0.6rem] uppercase']"
              >{{ $t("common.vs") }}</span
            >
          </div>

          <div
            class="flex items-center gap-3 min-w-0 justify-center text-center lg:justify-end lg:text-right flex-row-reverse lg:flex-row"
          >
            <div
              class="flex flex-col gap-[0.35rem] min-w-0 items-start lg:items-end"
            >
              <span
                class="font-mono text-[0.6rem] tracking-[0.28em] uppercase text-muted-foreground/70"
              >
                {{ $t("match.lineup.lineup_2") }}
              </span>
              <NuxtLink
                v-if="lineup2TeamId"
                :to="`/teams/${lineup2TeamId}`"
                :class="[
                  teamClasses,
                  match.winning_lineup_id === match.lineup_2_id && 'is-winner',
                  'transition-opacity hover:opacity-80 cursor-pointer',
                ]"
              >
                <span :class="teamGhostClasses" aria-hidden="true">
                  {{ lineup2Name }}
                </span>
                <span
                  :class="[
                    teamMainClasses,
                    match.winning_lineup_id === match.lineup_2_id &&
                      teamMainWinnerClasses,
                  ]"
                >
                  {{ lineup2Name }}
                </span>
              </NuxtLink>
              <div
                v-else
                :class="[
                  teamClasses,
                  match.winning_lineup_id === match.lineup_2_id && 'is-winner',
                ]"
              >
                <span :class="teamGhostClasses" aria-hidden="true">
                  {{ lineup2Name }}
                </span>
                <span
                  :class="[
                    teamMainClasses,
                    match.winning_lineup_id === match.lineup_2_id &&
                      teamMainWinnerClasses,
                  ]"
                >
                  {{ lineup2Name }}
                </span>
              </div>
            </div>
            <component
              :is="lineup2TeamId ? 'NuxtLink' : 'div'"
              :to="lineup2TeamId ? `/teams/${lineup2TeamId}` : undefined"
              class="shrink-0 h-12 w-12 border border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.1)] flex items-center justify-center overflow-hidden"
              :class="
                lineup2TeamId && 'transition-opacity hover:opacity-80 cursor-pointer'
              "
            >
              <img
                v-if="lineup2AvatarSrc"
                :src="lineup2AvatarSrc"
                :alt="lineup2Name"
                class="h-full w-full object-cover"
              />
              <span
                v-else
                class="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[hsl(var(--tac-amber))]"
              >
                {{ (lineup2Name || "?").slice(0, 3) }}
              </span>
            </component>
          </div>
        </div>

        <div
          class="flex items-center gap-[0.6rem] justify-center flex-wrap mt-4 pt-[0.85rem] border-t border-border font-mono text-[0.72rem] tracking-[0.15em] uppercase text-muted-foreground"
        >
          <span
            v-if="showAutoCancel"
            class="inline-flex items-center gap-[0.3rem] text-[0.6rem] leading-none tracking-[0.12em] text-destructive"
            :title="$t('match.auto_canceling')"
          >
            <AlertTriangle class="w-2.5 h-2.5 shrink-0" />
            <span>{{ $t("match.auto_canceling") }}</span>
            <span class="font-mono tabular-nums">{{
              formattedAutoCancelCountdown
            }}</span>
          </span>
          <span
            v-if="showAutoCancel && isNative && match.options?.best_of"
            class="opacity-40"
            >·</span
          >
          <span v-if="isNative && match.options?.best_of">
            {{
              $t("match.options.best_of.option", {
                count: match.options.best_of,
              })
            }}
          </span>
          <span
            v-if="isNative && match.e_region?.description"
            class="opacity-40"
            >·</span
          >
          <span v-if="isNative && match.e_region?.description">
            {{ match.e_region.description }}
          </span>
          <span v-if="isNative && formattedSchedule" class="opacity-40">·</span>
          <span v-if="formattedSchedule">
            {{ formattedSchedule }}
          </span>
        </div>
      </header>
    </PageTransition>

    <PageTransition v-if="hasMatchClips" :delay="60">
      <MatchHighlightsReel :match="match" />
    </PageTransition>

    <!-- While the Overview tab is open it takes the full width (Team 1 |
         stage | Team 2); the info column moves below it. -->
    <div
      class="grid items-start gap-4 md:gap-6 lg:gap-8 grid-cols-1"
      :class="
        overviewShown
          ? ''
          : 'lg:grid-cols-[minmax(320px,_400px)_minmax(0,1fr)]'
      "
    >
      <!-- Left column: match info and maps. On desktop it's the first grid
           column; on mobile it drops below the stream. Match Chat and Team
           Chat live in the Chat Hub (see chatHubContext). -->
      <div
        class="grid grid-cols-1 gap-y-4 md:gap-y-6 min-w-0"
        :class="
          overviewShown
            ? 'order-2'
            : showLiveStreamBlock
              ? 'order-2 lg:order-none'
              : ''
        "
      >
        <PageTransition :delay="100">
          <MatchInfo
            :match="match"
            :hide-connect="overviewShown && overviewStage === 'pre-match'"
            :hide-check-in="overviewShown && overviewStage === 'check-in'"
            :hide-schedule="overviewShown && overviewStage === 'schedule'"
          ></MatchInfo>
        </PageTransition>

        <PageTransition :delay="200">
          <div
            v-if="
              !overviewShown &&
              match.options.best_of &&
              match.options.best_of > 0
            "
            class="flex flex-col gap-3"
          >
            <div
              v-for="(slot, index) in selectedStatsMapId
                ? statsEligibleMatchMaps(match.match_maps)
                : mapSlots"
              :key="slot?.id ?? `map-slot-${index}`"
            >
              <MatchMaps
                v-if="slot"
                :match="match"
                :match-map="slot"
                :is-active="selectedStatsMapId === slot.id"
                @open-stats="
                  selectedStatsMapId = nextSelectedStatsMapId(
                    selectedStatsMapId,
                    $event,
                  )
                "
              ></MatchMaps>
              <div
                v-else
                class="rounded-xl overflow-hidden border-2 border-dashed border-border/60"
              >
                <div
                  class="aspect-[16/5] bg-muted/40 flex items-center justify-center text-muted-foreground"
                >
                  <div class="flex flex-col items-center gap-1">
                    <span class="text-sm uppercase tracking-wide font-semibold">
                      {{ $t("match.map_number", { count: index + 1 }) }}
                    </span>
                    <span class="text-xs">
                      {{ $t("match.map_tbd") }}
                    </span>
                  </div>
                </div>
                <div class="bg-muted/40 border-t border-border/30 px-3 py-2.5">
                  <div class="flex items-center justify-center">
                    <span class="text-xs text-muted-foreground">—</span>
                  </div>
                </div>
              </div>
            </div>
            <div
              v-show="
                !selectedStatsMapId && showVetoPicks && vetoPickCount !== 0
              "
              class="rounded-xl border border-border/40 bg-card/40 px-1.5 py-1.5"
            >
              <div
                class="font-mono text-[0.6rem] font-bold tracking-[0.28em] uppercase text-muted-foreground/70 text-center mb-1"
              >
                {{ $t("common.map_veto") }}
              </div>
              <MatchPicksDisplay
                v-if="showVetoPicks"
                :match="match"
                @update:count="vetoPickCount = $event"
              />
            </div>
          </div>
        </PageTransition>
      </div>

      <!-- Right column: the live stream surface (game-streamer rows
           get the full WHEP LiveStreamPlayer; embeds stay in
           StreamEmbed) stacked above the scoreboard/tabs. On mobile it
           rises above the left column so the stream leads. -->
      <div
        class="min-w-0 flex flex-col gap-4 md:gap-6"
        :class="
          overviewShown
            ? 'order-1'
            : showLiveStreamBlock
              ? 'order-1 lg:order-none'
              : ''
        "
      >
        <PageTransition v-if="showLiveStreamBlock">
          <div class="min-w-0 space-y-4">
            <LiveStreamPlayer
              v-if="hasGameStreamer"
              :match-id="match.id"
              class="max-w-[1500px] w-full"
            />
            <StreamEmbed
              v-if="embeddableStreams.length > 0"
              :streams="embeddableStreams"
              :match-id="match.id"
              class="max-w-[1500px] w-full overflow-x-auto"
            />
          </div>
        </PageTransition>

        <div class="min-w-0">
          <PageTransition :delay="100">
            <template
              v-if="
                regions.length === 0 &&
                match.options.region_veto &&
                !match.region
              "
            >
            <Alert
              variant="destructive"
              class="bg-red-600 text-white max-w-md mb-6"
            >
              <AlertTitle>{{
                $t("match.region_veto.no_regions_available")
              }}</AlertTitle>
              <AlertDescription>
                {{ $t("match.region_veto.no_regions_available_description") }}
              </AlertDescription>
            </Alert>
          </template>
        </PageTransition>

        <!-- Region veto, map veto and Captain Pick progress all live in the
             Overview tab now, so the page has one continuous lifecycle. -->
        <PageTransition :delay="200">
          <MatchTabs
            v-model:selected-map-id="selectedStatsMapId"
            :match="match"
            :overview-available="!!overviewStage"
            :overview-default="overviewDefault"
            :overview-focus="overviewFocus"
            :overview-restart="overviewRestart"
            @update:active-tab="matchTab = $event"
          >
            <template #overview>
              <MatchOverview
                v-if="overviewStage"
                :match="match"
                :stage="overviewStage"
                :captain-pick-progress="publicCaptainPick.progress"
                :participant-draft="participantDraft"
                :participant="captainPickMatch.participant"
                :now="lifecycleNow"
                @pick="pickCaptainPlayer"
              />
            </template>
          </MatchTabs>
        </PageTransition>
        </div>
      </div>
    </div>

    <MatchAdminBottomBar v-if="canViewMatchAdminBar" :match="match" />
    </template>
  </div>
</template>

<script lang="ts">
import {
  $,
  order_by,
  e_match_status_enum,
  e_player_roles_enum,
} from "~/generated/zeus";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { mapFields } from "~/graphql/mapGraphql";
import { matchLineups } from "~/graphql/matchLineupsGraphql";
import { playerFields } from "~/graphql/playerFields";
import { matchOptionsFields } from "~/graphql/matchOptionsFields";
import { eloFields } from "~/graphql/eloFields";
import { useMatchContext } from "~/composables/useMatchContext";
import {
  matchChatHubContext,
  captainPickChatHubContext,
  useChatHubContext,
} from "~/composables/useChatHubContext";
import {
  CAPTAIN_PICK_LINEUP_LOCK,
  createCaptainPickMatchStatus,
  isCaptainPickChatParticipant,
  isCaptainPickLineupLocked,
} from "~/composables/useCaptainPickMatchStatus";
import { computed as computedRef } from "vue";
import { getCaptainPickDraft } from "~/utilities/captainPickDraft";
import socket from "~/web-sockets/Socket";
import type { CaptainPickRequest } from "~/composables/useCaptainPickActions";
import {
  overviewIsDefault,
  overviewStage as deriveOverviewStage,
  matchServerReady,
  rememberServerReadyAt,
  forgetServerReadyAt,
  lifecycleRestarted,
  PRE_SERVER_STAGES,
  scoreboardHandoffAt,
  SCOREBOARD_HANDOFF_MS,
  OVERVIEW_TAB,
} from "~/utilities/matchLifecycle";

// generated/zeus predates demo_processing_started_at (needs a live Hasura
// codegen run to pick it up, same reason as partyFields in
// matchLineupsGraphql.ts) -- spread as `any` so the excess property check
// on the match_maps selector below doesn't fail the build.
const demoProcessingFields: any = {
  demo_processing_started_at: true,
};

// Same reason: matches.map_veto_sequence (the server's whole map veto, see
// get_map_veto_sequence) is newer than the generated client. The Overview's
// veto strip shows its upcoming steps from it.
// Same reason: matches.elo_voided (admin "Void ELO") is newer than the
// generated client. MatchActions hides Void ELO once it is set.
const eloVoidedField: any = {
  elo_voided: true,
};

const mapVetoSequenceField: any = {
  map_veto_sequence: true,
};

export default {
  // Lineup components below lock manual edits while this is an active
  // Captain Pick draft's match (see useCaptainPickMatchStatus).
  provide() {
    return {
      [CAPTAIN_PICK_LINEUP_LOCK]: computedRef(
        () => this.captainPickLineupsLocked,
      ),
    };
  },
  created() {
    // Whether this match is an active Captain Pick draft's match, and
    // whether the viewer is one of its ten -- asked from the API.
    this.captainPick = createCaptainPickMatchStatus();
    this.captainPickMatch = this.captainPick.state;
    this.publicProgress = createCaptainPickProgress(useRuntimeConfig().public.apiDomain);
    this.publicCaptainPick = this.publicProgress.state;
    this.$watch(
      () => (this.match ? `${this.match.id}:${this.match.status}` : null),
      () => {
        this.captainPick.update(this.match);
        this.publicProgress.update(this.match);
      },
      { immediate: true },
    );
    // Opens the Chat Hub on this match's Match Chat (plus the viewer's own
    // Team Chat, if any) while this page is open. Options API: not inside
    // setup(), so it's disposed in unmounted() below.
    this.chatHub = useChatHubContext(() => this.chatHubContext);
  },
  unmounted() {
    this.chatHub?.dispose();
    this.captainPick?.stop();
    this.publicProgress?.stop();
    if (this.lifecycleHandoffTimer) {
      clearTimeout(this.lifecycleHandoffTimer);
    }
    useMatchContext().value = null;
    if (this.autoCancelInterval) {
      clearInterval(this.autoCancelInterval);
    }
  },
  data() {
    return {
      match: undefined,
      publicCaptainPick: { matchId: null, progress: null },
      // The MatchTabs tab on screen (the Overview takes the full width).
      matchTab: null as string | null,
      // Clock for the Overview's 30 second cooldown. Only bumped when the
      // handoff is due (see the overviewHandoffAt watcher).
      lifecycleNow: Date.now(),
      // When this device first saw the match's server ready (connect details
      // usable); the hidden 30 second handoff to the Scoreboard counts from
      // here. See matchServerReady / rememberServerReadyAt.
      serverReadyAt: null as number | null,
      // Bumped when the same match restarts its lifecycle (see
      // overviewStageScope); MatchTabs returns to the Overview.
      overviewRestart: 0,
      lifecycleHandoffTimer: undefined as
        | ReturnType<typeof setTimeout>
        | undefined,
      vetoPickCount: undefined,
      autoCancelRemainingSeconds: 0,
      autoCancelInterval: undefined as ReturnType<typeof setInterval> | undefined,
      // Tracks CameraRequirementOverlay's own live/continuously-polled
      // status (see @update:ready) — informational only. The overlay
      // now decides its own visibility internally, in both directions,
      // so a disconnect mid-match re-blocks without needing this page
      // to unmount/remount anything.
      cameraReady: false,
      cameraTokenRequestedAt: null as string | null,
      captainPickMatch: {
        matchId: null,
        resolved: false,
        active: false,
        participant: false,
      },
    };
  },
  watch: {
    // The server put the match (back) before its server stage: a ready
    // moment remembered from an earlier run of this same match must not
    // hand the new run over to the Scoreboard. Viewers who were already
    // handed over return to the Overview when it happens live.
    overviewStageScope: {
      immediate: true,
      handler(scope: string | null, previous: string | null) {
        if (!scope) return;
        const [matchId, stage] = scope.split(":");
        const [previousId, previousStage] = (previous ?? "").split(":");
        if (PRE_SERVER_STAGES.has(stage as any)) {
          forgetServerReadyAt(matchId);
        }
        if (
          previousId === matchId &&
          lifecycleRestarted(previousStage as any, stage as any)
        ) {
          this.overviewRestart += 1;
        }
      },
    },
    // Veto completion alone never starts the handoff: it waits for the server
    // to be ready (the moment Join Server / Copy IP become usable).
    serverReadyScope: {
      immediate: true,
      handler() {
        this.serverReadyAt =
          this.match && matchServerReady(this.match)
            ? rememberServerReadyAt(this.match.id, Date.now())
            : null;
      },
    },
    // 30 seconds after serverReadyAt (or right away once a map is in play),
    // the Scoreboard becomes the default view, silently.
    overviewHandoffAt: {
      immediate: true,
      handler(handoffAt: number | null) {
        if (this.lifecycleHandoffTimer) {
          clearTimeout(this.lifecycleHandoffTimer);
          this.lifecycleHandoffTimer = undefined;
        }
        this.lifecycleNow = Date.now();
        if (handoffAt === null || handoffAt <= this.lifecycleNow) {
          return;
        }
        // Capped so a client clock running behind the server can't stretch
        // the cooldown; when it fires, the handoff is due regardless.
        this.lifecycleHandoffTimer = setTimeout(
          () => {
            this.lifecycleHandoffTimer = undefined;
            this.lifecycleNow = Math.max(Date.now(), handoffAt);
          },
          Math.min(handoffAt - this.lifecycleNow, SCOREBOARD_HANDOFF_MS),
        );
      },
    },
    cameraRequestScope: {
      flush: "sync",
      handler() {
        this.cameraTokenRequestedAt = null;
      },
    },
    "match.cancels_at": {
      immediate: true,
      handler(cancelsAt) {
        if (this.autoCancelInterval) {
          clearInterval(this.autoCancelInterval);
          this.autoCancelInterval = undefined;
        }
        if (!cancelsAt) {
          this.autoCancelRemainingSeconds = 0;
          return;
        }
        this.updateAutoCancelCountdown();
        this.autoCancelInterval = setInterval(this.updateAutoCancelCountdown, 1000);
      },
    },
  },
  methods: {
    pickCaptainPlayer(request: CaptainPickRequest) {
      socket.event("matchmaking:captain-pick", request);
    },
    updateAutoCancelCountdown() {
      const cancelsAt = this.match?.cancels_at;
      if (!cancelsAt) {
        this.autoCancelRemainingSeconds = 0;
        return;
      }
      const diff = Math.floor(
        (new Date(cancelsAt).getTime() - Date.now()) / 1000,
      );
      this.autoCancelRemainingSeconds = Math.max(0, diff);
    },
  },
  apollo: {
    $subscribe: {
      cameraRequest: {
        // Hasura still enforces steam_id = X-Hasura-User-Id. The extra
        // viewer filter also restarts this subscription on account changes.
        query: typedGql("subscription")({
          match_camera_tokens: [
            {
              where: {
                match_id: { _eq: $("matchId", "uuid!") },
                steam_id: { _eq: $("steamId", "bigint!") },
              },
              limit: 1,
            },
            { requested_at: true },
          ],
        }),
        variables: function () {
          return {
            matchId: this.matchId,
            steamId: useAuthStore().me?.steam_id,
          };
        },
        skip: function () {
          return !useAuthStore().me?.steam_id;
        },
        result: function ({ data }) {
          const variables =
            this.$apollo.subscriptions.cameraRequest.lastApolloOptions.variables;
          // Ignore an old operation during route/auth changes, before
          // Apollo's reactive watchers have restarted or stopped it.
          if (
            !useAuthStore().me?.steam_id ||
            variables.matchId !== this.matchId ||
            variables.steamId !== useAuthStore().me?.steam_id
          ) {
            return;
          }
          this.cameraTokenRequestedAt =
            data.match_camera_tokens?.[0]?.requested_at ?? null;
        },
      },
      matches_by_pk: {
        variables: function () {
          return {
            matchId: this.$route.params.id,
            order_by_name: order_by.asc,
            order_by_round_kills: order_by.asc,
            order_by_round: order_by.desc,
          };
        },
        query: typedGql("subscription")({
          matches_by_pk: [
            {
              id: $("matchId", "uuid!"),
            },
            {
              id: true,
              status: true,
              started_at: true,
              source: true,
              invite_code: true,
              draft_games: [
                {},
                {
                  id: true,
                  match_id: true,
                  host_steam_id: true,
                  status: true,
                  is_organizer: true,
                },
              ],
              e_match_status: {
                description: true,
              },
              region: true,
              e_region: {
                description: true,
              },
              is_coach: true,
              is_captain: true,
              is_in_lineup: true,
              is_organizer: true,
              can_start: true,
              can_schedule: true,
              can_check_in: true,
              requested_organizer: true,
              is_tournament_match: true,
              label: true,
              can_assign_server: true,
              can_stream_live: true,
              min_players_per_lineup: true,
              max_players_per_lineup: true,
              server_id: true,
              server_type: true,
              server_region: true,
              server_plugin_runtime: true,
              is_server_online: true,
              lineup_1_id: true,
              lineup_2_id: true,
              winning_lineup_id: true,
              map_veto_type: true,
              ...mapVetoSequenceField,
              ...eloVoidedField,
              map_veto_picking_lineup_id: true,
              region_veto_picking_lineup_id: true,
              connection_link: true,
              connection_string: true,
              tv_connection_string: true,
              is_match_server_available: true,
              cancels_at: true,
              map_veto_pick_expires_at: true,
              scheduled_at: true,
              ended_at: true,
              server_error: true,
              organizer: playerFields,
              options: {
                ...matchOptionsFields,
              },
              tournament_brackets: [
                { limit: 1 },
                {
                  id: true,
                  // The bracket's open re-scheduling proposals, shown by the
                  // Overview's schedule stage (same rows as the league
                  // schedule and its notifications).
                  scheduling_proposals: [
                    { order_by: [{ created_at: order_by.desc }] },
                    {
                      id: true,
                      proposed_time: true,
                      status: true,
                      message: true,
                      proposed_by_steam_id: true,
                      proposed_by: { steam_id: true, name: true },
                    },
                  ],
                  stage: {
                    tournament: {
                      id: true,
                      name: true,
                      status: true,
                    },
                  },
                },
              ],
              region_veto_picks: {
                type: true,
                region: true,
              },
              match_maps: [
                {
                  order_by: {
                    order: order_by.asc,
                  },
                },
                {
                  id: true,
                  order: true,
                  lineup_1_side: true,
                  lineup_2_side: true,
                  map: mapFields,
                  is_current_map: true,
                  demos_total_size: true,
                  demos_download_url: true,
                  status: true,
                  ...demoProcessingFields,
                  lineup_1_score: true,
                  lineup_2_score: true,
                  winning_lineup_id: true,
                  vetos: {
                    side: true,
                    type: true,
                    match_lineup_id: true,
                  },
                  demos: {
                    id: true,
                    size: true,
                    download_url: true,
                    metadata_parsed_at: true,
                    total_ticks: true,
                    geometry_validated: true,
                    created_at: true,
                  },
                  rounds: [
                    {
                      order_by: {
                        round: $("order_by_round", "order_by"),
                      },
                    },
                    {
                      lineup_1_score: true,
                      lineup_2_score: true,
                      lineup_1_money: true,
                      lineup_2_money: true,
                      lineup_1_side: true,
                      lineup_2_side: true,
                      winning_side: true,
                      winning_reason: true,
                      round: true,
                      kills: [
                        {
                          order_by: {
                            time: $("order_by_round_kills", "order_by"),
                          },
                        },
                        {
                          with: true,
                          headshot: true,
                          player: {
                            steam_id: true,
                          },
                          attacked_player: {
                            steam_id: true,
                          },
                        },
                      ],
                      assists: [
                        {},
                        {
                          attacker_steam_id: true,
                          attacked_steam_id: true,
                          flash: true,
                        },
                      ],
                    },
                  ],
                },
              ],
              lineup_1: [{}, matchLineups],
              lineup_2: [{}, matchLineups],
              elo_changes: [{}, eloFields],
              streams: [
                {
                  order_by: [
                    {
                      priority: order_by.asc,
                    },
                    {
                      title: order_by.asc,
                    },
                  ],
                },
                {
                  id: true,
                  match_id: true,
                  link: true,
                  title: true,
                  priority: true,
                  is_game_streamer: true,
                  is_live: true,
                  mode: true,
                  status: true,
                  stream_url: true,
                  error_message: true,
                  last_status_at: true,
                  status_history: true as any,
                },
              ],
            },
          ],
        }),
        result: function ({ data }) {
          const match = data.matches_by_pk;

          if (!match) {
            // Deleted/gone — leave. Canceling keeps the row, so we stay.
            if (this.match !== null) {
              this.match = null;
              useMatchContext().value = null;
              navigateTo("/watch");
            }
            return;
          }

          // Check-in and veto for a draft-created match happen in the draft
          // room, so the match page sends you there when a draft lobby exists.
          const draftGameId = match.draft_games?.[0]?.id;
          if (
            draftGameId &&
            [
              e_match_status_enum.WaitingForCheckIn,
              e_match_status_enum.Veto,
            ].includes(match.status)
          ) {
            navigateTo(`/draft-room/${draftGameId}`);
            return;
          }

          this.match = match;

          const mc = useMatchContext();
          const displayText =
            match.label ||
            `${match.lineup_1?.name ?? this.$t("common.tbd")} vs ${match.lineup_2?.name ?? this.$t("common.tbd")}`;
          const tournament = match.tournament_brackets?.[0]?.stage?.tournament;
          mc.value = {
            id: match.id,
            displayText,
            ...(tournament
              ? { tournament: { id: tournament.id, name: tournament.name } }
              : {}),
          };
        },
      },
    },
  },
  computed: {
    // A Captain Pick draft owns this PickingPlayers match: the public feed has
    // its picks, or (between the final pick and the match moving to veto) the
    // API has confirmed the draft for this match.
    captainPickActive() {
      if (this.match?.status !== e_match_status_enum.PickingPlayers) {
        return false;
      }
      return (
        !!this.participantDraft || !!this.publicCaptainPick.progress ||
        (this.captainPickMatch.matchId === this.match.id &&
          this.captainPickMatch.active)
      );
    },
    overviewStage() {
      return deriveOverviewStage(this.match, {
        captainPickActive: this.captainPickActive,
      });
    },
    overviewStageScope() {
      return this.match ? `${this.match.id}:${this.overviewStage}` : null;
    },
    serverReadyScope() {
      return this.match
        ? `${this.match.id}:${matchServerReady(this.match)}`
        : null;
    },
    overviewHandoffAt() {
      return scoreboardHandoffAt(this.match, this.serverReadyAt);
    },
    // The Overview is the default view until 30 seconds after the server is
    // ready; then MatchTabs hands over to the Scoreboard once.
    overviewDefault() {
      return overviewIsDefault(
        this.match,
        this.overviewStage,
        this.lifecycleNow,
        this.serverReadyAt,
      );
    },
    overviewShown() {
      return !!this.overviewStage && this.matchTab === OVERVIEW_TAB;
    },
    // The viewer's own Captain Pick draft (only the ten players have one),
    // for the existing participant turn gate, pick request and real timer.
    participantDraft() {
      const draft = getCaptainPickDraft(
        useMatchmakingStore().joinedMatchmakingQueues?.confirmation,
      );
      return draft && draft.matchId === this.match?.id ? draft : null;
    },
    // Brings a captain back to the Overview when it's their veto turn, so
    // the veto controls are never hidden behind another tab.
    overviewFocus() {
      return (
        this.match?.status === e_match_status_enum.Veto &&
        !(this.match.is_organizer && !this.match.is_captain) &&
        !!(
          this.match.lineup_1?.can_pick_map_veto ||
          this.match.lineup_2?.can_pick_map_veto ||
          this.match.lineup_1?.can_pick_region_veto ||
          this.match.lineup_2?.can_pick_region_veto
        )
      );
    },
    // Mirrors rcon.service.ts's canAccessServer: being the organizer alone
    // is never enough server-side (non-staff players organize their own
    // scrims routinely), so gating the floating Admin/RCON bar on
    // is_organizer alone exposed it to regular verified users.
    canViewMatchAdminBar() {
      return (
        !!this.match?.is_organizer &&
        useAuthStore().isRoleAbove(e_player_roles_enum.moderator)
      );
    },
    cameraRequestScope() {
      return `${this.matchId}:${useAuthStore().me?.steam_id ?? ""}`;
    },
    apiDomain() {
      return useRuntimeConfig().public.apiDomain;
    },
    lineup1Name() {
      return this.match?.lineup_1?.name || this.$t("match.lineup.lineup_1");
    },
    lineup2Name() {
      return this.match?.lineup_2?.name || this.$t("match.lineup.lineup_2");
    },
    lineup1AvatarSrc() {
      const avatarUrl = this.match?.lineup_1?.team?.avatar_url;
      if (!avatarUrl) return null;
      return `https://${this.apiDomain}/${avatarUrl}`;
    },
    lineup2AvatarSrc() {
      const avatarUrl = this.match?.lineup_2?.team?.avatar_url;
      if (!avatarUrl) return null;
      return `https://${this.apiDomain}/${avatarUrl}`;
    },
    lineup1TeamId() {
      return this.match?.lineup_1?.team_id ?? null;
    },
    lineup2TeamId() {
      return this.match?.lineup_2?.team_id ?? null;
    },
    // Which lineup (if any) the current viewer belongs to -- as a player
    // (is_on_lineup) or as that lineup's coach. Matchmaking/draft lineups
    // are ad-hoc, not backed by a persistent Team, so this can't reuse the
    // "team" chat type -- it's keyed off the lineup itself instead.
    myLineup() {
      if (this.match?.lineup_1?.is_on_lineup) {
        return this.match.lineup_1;
      }
      if (this.match?.lineup_2?.is_on_lineup) {
        return this.match.lineup_2;
      }
      const mySteamId = useAuthStore().me?.steam_id;
      if (!mySteamId) {
        return null;
      }
      if (String(this.match?.lineup_1?.coach?.steam_id) === String(mySteamId)) {
        return this.match.lineup_1;
      }
      if (String(this.match?.lineup_2?.coach?.steam_id) === String(mySteamId)) {
        return this.match.lineup_2;
      }
      return null;
    },
    myLineupChatId() {
      if (!this.myLineup?.id) {
        return null;
      }
      return `${this.match.id}:${this.myLineup.id}`;
    },
    captainPickLineupsLocked() {
      return isCaptainPickLineupLocked(this.match, this.captainPickMatch);
    },
    // The shared Match Chat: everyone canJoinLobby lets in, plus the ten
    // players of a Captain Pick draft while they're still being picked
    // (not seated in the lineups yet). The API authorizes the join itself.
    canUseMatchChat() {
      return (
        this.canJoinLobby ||
        isCaptainPickChatParticipant(this.match, this.captainPickMatch)
      );
    },
    // Before final seating, team privacy still uses the existing draft room.
    // Finalization hands the same Match Chat to the normal match context.
    chatHubContext() {
      if (this.participantDraft &&
          ["Drafting", "CreatingMatch"].includes(this.participantDraft.phase)) {
        return captainPickChatHubContext(
          this.participantDraft, useAuthStore().me?.steam_id ?? null,
          (key, params) => this.$t(key, params),
        );
      }
      return matchChatHubContext(
        this.match,
        this.canUseMatchChat,
        this.myLineup,
        (key, params) => this.$t(key, params),
      );
    },
    // Deliberately stricter than myLineup: is_on_lineup is only true
    // for an actual rostered player row (see is_on_lineup.sql), not a
    // coach — coaches never publish a webcam, so they should never be
    // blocked by the overlay.
    isCameraPlayer() {
      return !!(
        this.match?.lineup_1?.is_on_lineup || this.match?.lineup_2?.is_on_lineup
      );
    },
    // Set by an admin's "Request camera" action on the scoreboard (⋮)
    // menu regardless of camera_required -- the doping-control-style
    // spot check. Same row camera_required's own token-minting also
    // writes to, just distinguished by this timestamp being non-null.
    cameraSpotCheckRequested() {
      return !!useAuthStore().me?.steam_id && !!this.cameraTokenRequestedAt;
    },
    // Whether CameraRequirementOverlay should be mounted at all. This
    // is intentionally NOT gated on cameraReady/ready-ness — the
    // component now stays mounted for the whole active match and shows
    // or hides *itself* based on live, continuously-polled status (see
    // its own template). Unmounting it here the moment the camera goes
    // ready is what used to make a later disconnect invisible until F5.
    showCameraOverlay() {
      if (!this.isCameraPlayer) return false;
      // Spot checks can be requested from check-in onward (see
      // LineupOverviewRow's canRequestCameraSpotCheck) -- wider window
      // than the blanket camera_required flow below, which never has a
      // token to offer until the veto->Live transition mints one (see
      // MatchesController.generateCameraTokensIfRequired), so showing
      // the overlay any earlier for that path would just block every
      // player on a token that doesn't exist yet.
      if (this.cameraSpotCheckRequested) {
        return ["WaitingForCheckIn", "Veto", "Live", "WaitingForServer"].includes(
          this.match?.status,
        );
      }
      return (
        !!this.match?.options?.camera_required &&
        ["Veto", "Live", "WaitingForServer"].includes(this.match?.status)
      );
    },
    mapScores() {
      const maps = this.match?.match_maps || [];
      const l1Id = this.match?.lineup_1_id;
      const l2Id = this.match?.lineup_2_id;
      let l1 = 0;
      let l2 = 0;
      for (const m of maps) {
        if (m.winning_lineup_id === l1Id) l1++;
        else if (m.winning_lineup_id === l2Id) l2++;
      }
      return { l1, l2 };
    },
    hasScores() {
      const scoreStates = [
        e_match_status_enum.Live,
        e_match_status_enum.Finished,
        e_match_status_enum.Forfeit,
        e_match_status_enum.Surrendered,
        e_match_status_enum.Tie,
      ];
      return (
        this.match?.status &&
        scoreStates.includes(this.match.status) &&
        this.mapScores.l1 + this.mapScores.l2 > 0
      );
    },
    statusTier() {
      const s = this.match?.status;
      if (s === e_match_status_enum.Live) return "live";
      if (
        s === e_match_status_enum.Scheduled ||
        s === e_match_status_enum.WaitingForCheckIn ||
        s === e_match_status_enum.WaitingForServer
      ) {
        return "pending";
      }
      if (
        s === e_match_status_enum.Veto ||
        s === e_match_status_enum.PickingPlayers
      ) {
        return "veto";
      }
      if (s === e_match_status_enum.Finished) return "finished";
      if (
        s === e_match_status_enum.Forfeit ||
        s === e_match_status_enum.Surrendered ||
        s === e_match_status_enum.Canceled
      ) {
        return "ended";
      }
      return "neutral";
    },
    tournamentContext() {
      return this.match?.tournament_brackets?.[0]?.stage?.tournament ?? null;
    },
    showAutoCancel() {
      return (
        this.match?.cancels_at &&
        this.match.status !== e_match_status_enum.Canceled &&
        this.match.status !== e_match_status_enum.Veto &&
        // Live shows its own large "Time to connect" countdown next to the
        // Join Server button (MatchInfo.vue) instead of this small header one.
        this.match.status !== e_match_status_enum.Live
      );
    },
    formattedAutoCancelCountdown() {
      const total = Math.max(0, this.autoCancelRemainingSeconds);
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
      const ss = String(s).padStart(2, "0");
      return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
    },
    formattedSchedule() {
      const when = this.match?.scheduled_at || this.match?.ended_at;
      if (!when) return null;
      try {
        return new Date(when).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        });
      } catch {
        return null;
      }
    },
    isNative() {
      return !this.match?.source || this.match.source === "5stack";
    },
    showVetoPicks() {
      if (!this.match) return false;
      if (this.match.source && this.match.source !== "5stack") return false;
      const hasVeto =
        this.match.options?.map_veto || this.match.options?.region_veto;
      if (!hasVeto) return false;
      return this.match.status !== e_match_status_enum.Veto;
    },
    mapSlots() {
      if (!this.match || !this.match.options?.best_of) {
        return this.match?.match_maps ?? [];
      }

      const bestOf = this.match.options.best_of;
      const maps = this.match.match_maps || [];
      const matchEnded = [
        e_match_status_enum.Finished,
        e_match_status_enum.Forfeit,
        e_match_status_enum.Surrendered,
        e_match_status_enum.Tie,
        e_match_status_enum.Canceled,
      ].includes(this.match.status);

      if (matchEnded) {
        return maps;
      }

      const slots = [];
      for (let i = 0; i < bestOf; i++) {
        slots.push(maps[i] || null);
      }

      return slots;
    },
    showSeparators() {
      return useApplicationSettingsStore().showSeparators;
    },
    matchId() {
      return this.$route.params.id;
    },
    regions() {
      return useApplicationSettingsStore().availableRegions.filter((region) => {
        return region.is_lan === false;
      });
    },
    canJoinLobby() {
      if (!this.match) {
        return false;
      }

      if (
        ![
          e_match_status_enum.Live,
          e_match_status_enum.PickingPlayers,
          e_match_status_enum.Scheduled,
          e_match_status_enum.Veto,
          e_match_status_enum.WaitingForCheckIn,
          e_match_status_enum.WaitingForServer,
        ].includes(this.match.status)
      ) {
        return false;
      }

      return (
        this.match.is_in_lineup ||
        this.match.is_organizer ||
        this.match.is_coach
      );
    },
    hasGameStreamer() {
      return (this.match?.streams || []).some((s) => s.is_game_streamer);
    },
    embeddableStreams() {
      return (this.match?.streams || []).filter((s) => !s.is_game_streamer);
    },
    showLiveStreamBlock() {
      return (
        this.showLiveStreams &&
        (this.match?.streams?.length || 0) > 0 &&
        !this.match?.is_in_lineup &&
        !this.match?.is_coach
      );
    },
    showLiveStreams() {
      if (
        [
          e_match_status_enum.Finished,
          e_match_status_enum.Forfeit,
          e_match_status_enum.Surrendered,
          e_match_status_enum.Tie,
          e_match_status_enum.Canceled,
        ].includes(this.match?.status)
      ) {
        if (this.match?.ended_at) {
          const allowExtraTime = new Date(this.match.ended_at);
          allowExtraTime.setMinutes(allowExtraTime.getMinutes() + 10);

          if (allowExtraTime > new Date()) {
            return true;
          }
        }

        return false;
      }

      return true;
    },
  },
};
</script>
