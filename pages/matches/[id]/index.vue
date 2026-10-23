<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onUnmounted,
  provide,
  ref,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { useApolloClient } from "@vue/apollo-composable";
import gql from "graphql-tag";
import { useMatchClips } from "~/composables/useMatchClips";
import MatchOverview from "~/components/match/overview/MatchOverview.vue";
import { createCaptainPickProgress } from "~/composables/useCaptainPickProgress";
import MatchTabs from "~/components/match/MatchTabs.vue";
import MatchMaps from "~/components/match/MatchMaps.vue";
import MatchInfo from "~/components/match/MatchInfo.vue";
import MatchHighlightsReel from "~/components/match/MatchHighlightsReel.vue";
import MatchHeader from "~/components/match/MatchHeader.vue";
import CameraRequirementOverlay from "~/components/match/CameraRequirementOverlay.vue";
import { e_match_status_enum } from "~/generated/zeus";
import StreamEmbed from "~/components/StreamEmbed.vue";
import LiveStreamPlayer from "~/components/match/LiveStreamPlayer.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
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

const MatchAdminBottomBar = defineAsyncComponent(
  () => import("~/components/match/MatchAdminBottomBar.vue"),
);
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
      <!-- The match stage (5Stack WEB 85b4f0f9): scorebug band on top,
           highlights underneath, one rounded surface. The highlights fold in
           when the clips arrive. -->
      <section
        class="relative isolate overflow-hidden rounded-2xl bg-muted/20 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-white/[0.07]"
      >
        <MatchHeader :match="match" />
        <div
          class="grid transition-[grid-template-rows] [transition-duration:240ms] ease-out motion-reduce:transition-none"
          :class="hasMatchClips ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
        >
          <div class="min-h-0 overflow-hidden">
            <MatchHighlightsReel v-if="hasMatchClips" :match="match" />
          </div>
        </div>
      </section>
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
           Chat live in the Chat Hub (see chatHubContext), reached from the
           Chat Hub icon on desktop and mobile (no page-level Open Chat
           button, Anders 2026-10-14). -->
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
  withoutMobileAutoOpen,
} from "~/composables/useChatHubContext";
import { isMobileChatHubLayout } from "~/composables/useRightSidebar";
import {
  CAPTAIN_PICK_LINEUP_LOCK,
  createCaptainPickMatchStatus,
  isCaptainPickChatParticipant,
  isCaptainPickLineupLocked,
} from "~/composables/useCaptainPickMatchStatus";
import { computed as computedRef } from "vue";
import { getCaptainPickDraft } from "~/utilities/captainPickDraft";
import { fetchMatchAutoStreams } from "~/composables/useTwitchApi";
import {
  autoPovEligible,
  matchStreamBlockVisible,
  mergeMatchStreams,
} from "~/utilities/matchStreams";
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
    // Read once on entering the page (not reactive), so on a phone the Hub
    // never opens by itself here, even after rotating past the breakpoint.
    this.chatHubMobileLayout = isMobileChatHubLayout();
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
    this.stopAutoStreams();
  },
  data() {
    return {
      // Live half (subscription) and static half (one-time query) of the
      // match; `match` (computed) merges them. See the apollo block.
      matchLive: undefined,
      matchStatic: undefined,
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
      // Live CS2 Twitch streams of this match's seated players (see
      // autoStreamsKey). Not stored anywhere: polled while the match is
      // live, merged after the manual streams in embeddableStreams.
      autoStreams: [] as any[],
      autoStreamsTimer: undefined as ReturnType<typeof setInterval> | undefined,
    };
  },
  watch: {
    // The static half (see the apollo block) only moves with these: a status
    // change (who may schedule, assign a server, stream), a server
    // assignment, a new organizer, someone joining/leaving a lineup, or a
    // different viewer (login/logout). One key, so several of them changing
    // in the same tick refetch once. A different match id needs no refetch:
    // the query's variables changed, so Apollo already runs it again.
    matchStaticRefreshKey(key, previousKey) {
      if (!key || !previousKey || key === previousKey) return;
      if (key.split("|")[0] !== previousKey.split("|")[0]) return;
      void this.refetchMatchStatic();
    },
    // Automatic player POV streams: only once gameplay is live and only for
    // viewers who neither play nor coach in it (the API enforces the same
    // rules). They come and go with the players' Twitch status and stop as
    // soon as the match is no longer live -- no reload needed.
    autoStreamsKey: {
      immediate: true,
      handler(key) {
        this.stopAutoStreams();
        this.autoStreams = [];
        if (!key) return;
        const matchId = this.match.id;
        const load = async () => {
          const streams = await fetchMatchAutoStreams([matchId]);
          if (this.autoStreamsKey === key) this.autoStreams = streams[matchId] ?? [];
        };
        void load();
        this.autoStreamsTimer = setInterval(load, 45_000);
      },
    },
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
  },
  methods: {
    refetchMatchStatic() {
      return this.$apollo?.queries?.matchStatic?.refetch();
    },
    stopAutoStreams() {
      if (this.autoStreamsTimer) {
        clearInterval(this.autoStreamsTimer);
        this.autoStreamsTimer = undefined;
      }
    },
    pickCaptainPlayer(request: CaptainPickRequest) {
      socket.event("matchmaking:captain-pick", request);
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
              // The viewer's membership/permission fields and the organizer
              // record live in `matchStatic` (a one-time query, refetched on
              // status, server, organizer or lineup changes). Each is a
              // function the database re-ran for this row on every
              // subscription tick, for every viewer (5Stack upstream made the
              // same split). `requested_organizer` is not requested at all:
              // nothing reads it, and it scanned the notifications table.
              //
              // can_start and can_check_in stay live: they read lineup
              // readiness, which changes during check-in.
              can_start: true,
              can_check_in: true,
              organizer_steam_id: true,
              is_tournament_match: true,
              label: true,
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
            if (this.matchLive !== null) {
              this.matchLive = null;
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

          this.matchLive = match;

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
    // The viewer's membership/permission fields and the organizer record:
    // fetched once instead of on every tick of the subscription above, and
    // refetched by the watchers on status, server, organizer and lineup
    // changes (the only things that move them).
    matchStatic: {
      variables: function () {
        return { matchId: this.$route.params.id };
      },
      skip: function () {
        return !this.$route.params.id;
      },
      // network-only: these are the viewer's own permissions, and the Apollo
      // cache is not cleared on login/logout, so a cached answer could belong
      // to the previous account.
      fetchPolicy: "network-only",
      query: typedGql("query")({
        matches_by_pk: [
          {
            id: $("matchId", "uuid!"),
          },
          {
            id: true,
            is_coach: true,
            is_captain: true,
            is_in_lineup: true,
            is_organizer: true,
            can_schedule: true,
            can_assign_server: true,
            can_stream_live: true,
            organizer: playerFields,
          },
        ],
      }),
      update: (data: any) => data?.matches_by_pk ?? null,
    },
  },
  computed: {
    // Both halves as the single object the page and every child already
    // expect. `matchLive` gates it: until the subscription has said the match
    // exists there is nothing to show, and null means the row is gone.
    match(): Record<string, any> | null | undefined {
      if (!this.matchLive) {
        return this.matchLive;
      }
      return { ...(this.currentMatchStatic ?? {}), ...this.matchLive };
    },
    // The static half, only when it belongs to the match on screen: right
    // after navigating to another match the previous one's permissions must
    // not be shown for the new one.
    currentMatchStatic(): Record<string, any> | null {
      const live = this.matchLive;
      const stat = this.matchStatic;
      return live && stat && stat.id === live.id ? stat : null;
    },
    matchStaticRefreshKey(): string | null {
      const live = this.matchLive;
      if (!live) return null;
      return [
        live.id,
        live.status,
        live.server_id ?? "",
        live.organizer_steam_id ?? "",
        this.matchLineupMembershipKey ?? "",
        useAuthStore().me?.steam_id ?? "",
      ].join("|");
    },
    // Who is on either lineup (players, captains, coaches). When it changes,
    // so can the viewer's is_in_lineup / is_captain / is_coach.
    matchLineupMembershipKey(): string | null {
      const live = this.matchLive;
      if (!live) return null;
      return [live.lineup_1, live.lineup_2]
        .map((lineup: any) =>
          [
            lineup?.id ?? "",
            lineup?.coach?.steam_id ?? "",
            lineup?.captain?.player?.steam_id ?? "",
            ...(lineup?.lineup_players ?? []).map((p: any) =>
              String(p.steam_id ?? p.placeholder_name ?? ""),
            ),
          ].join(","),
        )
        .join("|");
    },
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
    // Moderators may read a running match's shared Match Chat (Anders
    // 2026-10-15); posting stays with the match's own people and the API
    // enforces both. Never a Team Chat: see matchChatHubContext.
    canStaffReadMatchChat() {
      return (
        !!this.match &&
        !this.canUseMatchChat &&
        [
          e_match_status_enum.Live,
          e_match_status_enum.PickingPlayers,
          e_match_status_enum.Scheduled,
          e_match_status_enum.Veto,
          e_match_status_enum.WaitingForCheckIn,
          e_match_status_enum.WaitingForServer,
        ].includes(this.match.status) &&
        useAuthStore().isRoleAbove(e_player_roles_enum.moderator)
      );
    },
    // DEAFCS: the Admin Dock (RCON console and logs) is mounted for
    // administrators only. Organizers use the match's "..." menu.
    canViewMatchAdminBar() {
      return useAuthStore().isRoleAbove(e_player_roles_enum.administrator);
    },
    cameraRequestScope() {
      return `${this.matchId}:${useAuthStore().me?.steam_id ?? ""}`;
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
    // On the mobile layout the rooms are offered without auto-opening the
    // Hub (see withoutMobileAutoOpen), for every viewer role.
    chatHubContext() {
      const context =
        this.participantDraft &&
        ["Drafting", "CreatingMatch"].includes(this.participantDraft.phase)
          ? captainPickChatHubContext(
              this.participantDraft, useAuthStore().me?.steam_id ?? null,
              (key, params) => this.$t(key, params),
            )
          : matchChatHubContext(
              this.match,
              this.canUseMatchChat,
              this.myLineup,
              (key, params) => this.$t(key, params),
              this.canStaffReadMatchChat,
            );
      return withoutMobileAutoOpen(context, !!this.chatHubMobileLayout);
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
    // Manual streams first (staff order, custom titles), then automatic
    // player POVs; a POV staff already attached by hand appears once.
    embeddableStreams() {
      return mergeMatchStreams(
        (this.match?.streams || []).filter((s) => !s.is_game_streamer),
        this.autoStreams,
        (key, values) => this.$t(key, values),
      );
    },
    // Polling key for automatic POVs: set only once gameplay is live (Live
    // with its server up; ready check, Captain Pick, veto and server boot
    // show manual streams only) and the viewer may watch its streams
    // (anti-cheat: never its own players or coaches).
    autoStreamsKey() {
      // Wait for the static half: until it lands, is_in_lineup/is_coach are
      // unknown and a player would briefly look like a spectator.
      if (!this.currentMatchStatic) return null;
      return autoPovEligible(this.match) ? this.match.id : null;
    },
    // Manual streams from the first pre-match stage on; automatic POVs only
    // join once gameplay is live (autoStreamsKey). Never for the match's
    // own players or coaches.
    showLiveStreamBlock() {
      return matchStreamBlockVisible(
        this.match,
        (this.match?.streams?.length || 0) > 0 || this.autoStreams.length > 0,
      );
    },
  },
};
</script>
