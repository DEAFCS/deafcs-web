<script setup lang="ts">
import { dateLocale } from "~/utilities/dateLocale";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useResizeObserver } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useSubscription } from "@vue/apollo-composable";
import gql from "graphql-tag";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Crown,
  Lock,
  Play,
  Settings2,
  ShieldCheck,
  Signal,
  Users,
  X,
} from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import HeightSwap from "~/components/ui/transitions/HeightSwap.vue";
import Fold from "~/components/ui/transitions/Fold.vue";
import SteamIcon from "~/components/icons/SteamIcon.vue";
import PlayModeTile from "~/components/play/PlayModeTile.vue";
import PlaySeats from "~/components/play/PlaySeats.vue";
import QuickMatchConnect from "~/components/match/QuickMatchConnect.vue";
import MatchStatus from "~/components/match/MatchStatus.vue";
import MatchmakingSettingsPanel from "~/components/matchmaking/MatchmakingSettingsPanel.vue";
import { useQuickQueue } from "~/composables/useQuickQueue";
import { setActiveHub } from "~/composables/useHubState";
import { useRightSidebar } from "~/composables/useRightSidebar";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $ } from "~/generated/zeus";
import mapLabel from "~/utilities/mapLabel";
import { canQueueMode, modeColorStyle } from "~/utilities/matchmakingModes";
import {
  captainPickPath,
  getCaptainPickDraft,
  isCaptainPickInProgress,
} from "~/utilities/captainPickDraft";
import {
  tacticalCtaButtonClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";
import {
  heroShape,
  heroState,
  roundedPing,
} from "~/components/play/matchmakingHero";

// The /play matchmaking hero (5Stack's PlayMatchmaking, 5stackgg/web
// d12ef01b, from f5c184ea): one mode picker and one Find Match button, the
// search clock in its place while queued, and the match once one is made.
//
// DEAFCS differences:
// - DEAFCS's four modes (Captain Pick, Competitive, Wingman, Duel) with their
//   colors; Find Match goes through useQuickQueue.join, the same as the
//   header and the hub, and the API re-checks every rule.
// - party rules are DEAFCS's (Captain Pick solo, the Competitive cap, no
//   full-party queues), and a blocked tile names the rule.
// - verification (with its apply/pending/rejected link), the closed switch,
//   the website restriction and a committed Captain Pick draft are hero
//   states; the hero is never hidden, so players can tell matchmaking exists.
// - any party member can cancel a search, as /play always allowed.
// - no LAN play-where switch and no tournament cooldown line (upstream
//   features DEAFCS does not run).

const { t } = useI18n();
const settings = useApplicationSettingsStore();
const auth = useAuthStore();
const matchmaking = useMatchmakingStore();
const {
  partySize,
  modes,
  queue,
  queueMode,
  clock,
  modeTitle,
  modeLabel,
  requirementText,
  join,
  leave,
} = useQuickQueue();
const { setRightSidebarOpen } = useRightSidebar();

const me = computed(() => auth.me as any);
const isGuest = computed(() => !me.value?.steam_id);
const party = computed(() => (isGuest.value ? 0 : partySize.value));
const isRestricted = computed(() => !!useWebsiteRestrictionStore().isRestricted);

// The party itself lives in the header pill and the hub; here it is one line
// of context and who gets to press the button.
const lobby = computed(() => matchmaking.currentLobby as any);
const leader = computed(
  () => lobby.value?.players?.find((slot: any) => slot.captain)?.player,
);
const isMember = computed(
  () =>
    !!lobby.value &&
    !!leader.value &&
    String(leader.value.steam_id) !== String(me.value?.steam_id),
);

// The party rule alone (not the website restriction, which has its own
// notice), so a blocked tile names the real reason.
function partyFits(mode: (typeof modes.value)[number]) {
  return canQueueMode(mode, party.value || 1, settings.maxCompetitivePartySize);
}

// What the button queues: the tile the viewer picked if the party can still
// play it. Nothing is chosen for them unless only one mode fits.
const picked = ref<string | null>(null);
const selectable = computed(() =>
  modes.value.filter((mode) => isGuest.value || partyFits(mode)),
);
const selectedMode = computed(() => {
  if (isMember.value) return null;
  const choice = selectable.value.find((mode) => mode.key === picked.value);
  if (choice) return choice;
  return selectable.value.length === 1 ? selectable.value[0] : null;
});
// With nothing checked, Tab lands on the first mode it can pick, like a
// native radio set.
const tabStop = computed(
  () => selectedMode.value?.key ?? selectable.value[0]?.key ?? null,
);

const modeGrid = ref<HTMLElement | null>(null);

// One frame glides from tile to tile instead of each tile repainting its own
// border. It fades in where the first pick lands, keeps its last spot while
// fading out, and only glides between two picks (never on resize). DEAFCS: it
// takes the picked mode's color.
const frame = ref({ x: 0, y: 0, w: 0, h: 0 });
const frameShown = ref(false);
const frameGlides = ref(false);

function placeFrame(glide: boolean) {
  const index = modes.value.findIndex(
    (mode) => mode.key === selectedMode.value?.key,
  );
  const tile =
    index < 0
      ? null
      : modeGrid.value?.querySelectorAll<HTMLElement>('[role="radio"]')[index];
  if (!tile) {
    frameShown.value = false;
    return;
  }
  frameGlides.value = glide && frameShown.value;
  frame.value = {
    x: tile.offsetLeft,
    y: tile.offsetTop,
    w: tile.offsetWidth,
    h: tile.offsetHeight,
  };
  frameShown.value = true;
}

watch(
  () => selectedMode.value?.key,
  () => nextTick(() => placeFrame(true)),
);
onMounted(() => placeFrame(false));
useResizeObserver(modeGrid, () => placeFrame(false));

function pick(key: string) {
  picked.value = key;
}

// Arrow keys move through the radio group, skipping modes the party can't
// play -- the same model as a native radio set.
function onModeKey(event: KeyboardEvent) {
  const forward = ["ArrowRight", "ArrowDown"].includes(event.key);
  const back = ["ArrowLeft", "ArrowUp"].includes(event.key);
  if ((!forward && !back) || pickerLocked.value) return;
  event.preventDefault();
  const list = selectable.value;
  if (!list.length) return;
  const index = list.findIndex((mode) => mode.key === selectedMode.value?.key);
  const next =
    index < 0
      ? list[forward ? 0 : list.length - 1]
      : list[(index + (forward ? 1 : -1) + list.length) % list.length];
  pick(next.key);
  const position = modes.value.findIndex((mode) => mode.key === next.key);
  modeGrid.value
    ?.querySelectorAll<HTMLElement>('[role="radio"]')
    [position]?.focus();
}

// Regions: the ones a search would use, and the node-backed ones it skips
// (over the latency limit or unreachable), so the line explains itself.
type Region = { value: string; description?: string; is_lan?: boolean };

function regionName(region: Region) {
  return region.description || region.value;
}

const usedRegions = computed(() =>
  (matchmaking.preferredRegions as Region[]).map((region) => {
    const result = matchmaking.getRegionlatencyResult(region.value);
    return {
      value: region.value,
      name: regionName(region),
      ping: roundedPing(result?.latency),
    };
  }),
);

const skippedRegions = computed(() => {
  const used = new Set(usedRegions.value.map((region) => region.value));
  return (settings.availableRegions as any[])
    .filter(
      (region) => region.has_node && !region.is_lan && !used.has(region.value),
    )
    .map((region) => ({
      value: region.value,
      name: regionName(region),
      ping: roundedPing(
        matchmaking.getRegionlatencyResult(region.value)?.latency,
      ),
    }));
});

const noRegions = computed(
  () =>
    !isGuest.value &&
    (settings.availableRegions as any[]).some((region) => region.has_node) &&
    usedRegions.value.length === 0,
);

const maxLatency = computed(() => matchmaking.playerMaxAcceptableLatency);

// Sanctions (DEAFCS's own wording and date format).
function formatExpiry(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(dateLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const sanctionText = computed(() => {
  if (me.value?.is_banned) {
    const date = me.value.banned_until
      ? formatExpiry(me.value.banned_until)
      : "";
    return date
      ? t("matchmaking.banned_until", { date })
      : t("matchmaking.banned");
  }
  if (me.value?.matchmaking_cooldown) {
    return t("matchmaking.temp_banned", { time: me.value.matchmaking_cooldown });
  }
  return null;
});

// DEAFCS verification: the link reflects an application already sent.
const MY_VERIFICATION_STATUS_QUERY = gql`
  query MyVerificationStatusForPlay($steamId: bigint!) {
    verification_applications(
      where: { player_steam_id: { _eq: $steamId } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      status
    }
  }
`;
const verificationStatus = ref<string | null>(null);
watch(
  () => [me.value?.steam_id, settings.matchmakingRoleAllowed] as const,
  async ([steamId, roleAllowed]) => {
    if (!steamId || roleAllowed) return;
    try {
      const { data } = await getGraphqlClient().query({
        query: MY_VERIFICATION_STATUS_QUERY,
        variables: { steamId },
        fetchPolicy: "network-only",
      });
      verificationStatus.value =
        data?.verification_applications?.[0]?.status ?? null;
    } catch {
      // Best-effort: the link just falls back to "Get Verified" / /verify.
    }
  },
  { immediate: true },
);
const verificationLink = computed(() =>
  verificationStatus.value === "pending" ||
  verificationStatus.value === "rejected"
    ? "/verify/status"
    : "/verify",
);
const verificationLabel = computed(() => {
  if (verificationStatus.value === "pending") {
    return t("pages.play.matchmaking.verification_pending");
  }
  if (verificationStatus.value === "rejected") {
    return t("pages.play.matchmaking.verification_rejected");
  }
  return t("pages.play.matchmaking.get_verified");
});

// The ready check is the global modal (MatchmakingConfirm); once its match is
// created the hero shows that match with its connect panel. A Captain Pick
// confirmation is a draft first: the hero links to it.
const confirmation = computed(
  () => (matchmaking.joinedMatchmakingQueues as any)?.confirmation,
);
const captainPickDraft = computed(() =>
  getCaptainPickDraft(confirmation.value as any),
);
const inCaptainPick = computed(() =>
  isCaptainPickInProgress(captainPickDraft.value),
);

const matchSubscription = typedGql("subscription")({
  matches_by_pk: [
    { id: $("matchId", "uuid!") },
    {
      id: true,
      status: true,
      server_type: true,
      is_in_lineup: true,
      is_organizer: true,
      is_server_online: true,
      is_match_server_available: true,
      connection_string: true,
      connection_link: true,
      tv_connection_string: true,
      options: { tv_delay: true },
      // MatchStatus's VETO / LIVE / PAUSED label (DEAFCS #52).
      e_match_status: { description: true },
      winning_lineup_id: true,
      scheduled_at: true,
      lineup_1: { name: true },
      lineup_2: { name: true },
      match_maps: [
        {},
        {
          status: true,
          is_current_map: true,
          lineup_1_score: true,
          lineup_2_score: true,
          map: { name: true },
        },
      ],
    },
  ],
});

const { result: matchResult } = useSubscription(
  matchSubscription,
  () => ({ matchId: confirmation.value?.matchId }),
  () => ({ enabled: !!confirmation.value?.matchId }),
);

const match = computed(() => (matchResult.value as any)?.matches_by_pk ?? null);
const currentMap = computed(
  () =>
    match.value?.match_maps?.find((map: any) => map.is_current_map) ??
    match.value?.match_maps?.[0],
);

const state = computed(() =>
  heroState({
    matchmakingEnabled: settings.matchmakingEnabled,
    roleAllowed: settings.matchmakingRoleAllowed,
    isGuest: isGuest.value,
    isBanned: !!me.value?.is_banned,
    hasCooldown: !!me.value?.matchmaking_cooldown,
    isRestricted: isRestricted.value,
    inCaptainPick: inCaptainPick.value,
    hasConfirmation: !!confirmation.value,
    hasMatch: !!confirmation.value?.matchId && !!match.value,
    isSearching: !!queue.value,
    noRegions: noRegions.value,
    isMember: isMember.value,
  }),
);
const shape = computed(() => heroShape(state.value));

// The picker is shown in every picker state, but only idle (or a guest about
// to sign in) can use it.
const pickerLocked = computed(
  () => state.value !== "idle" && state.value !== "guest",
);

// The search: the mode it's for, where, and how many are waiting with you.
const searchMode = computed(() => queueMode.value ?? selectedMode.value);
const searchRegions = computed(() => {
  const values: string[] = queue.value?.regions ?? [];
  const byValue = new Map(
    (settings.availableRegions as Region[]).map((region) => [
      region.value,
      regionName(region),
    ]),
  );
  return values.map((value) => byValue.get(value) ?? value);
});
const searchInQueue = computed(
  () =>
    modes.value.find((mode) => mode.key === searchMode.value?.key)?.inQueue ??
    0,
);

const playersOnline = computed(
  () => (matchmaking.playersOnline as unknown[]).length,
);

function openParty() {
  setActiveHub("lobby");
  setRightSidebarOpen(true);
}

function signIn() {
  navigateTo("/login?redirect=/play");
}

function findMatch() {
  if (isGuest.value) {
    signIn();
    return;
  }
  if (selectedMode.value) join(selectedMode.value);
}

const settingsOpen = ref(false);

const primaryClasses =
  "h-11 min-w-[188px] gap-2 px-[22px] text-[15px] font-semibold bg-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber-foreground))] hover:bg-[hsl(var(--tac-amber)/0.9)] max-sm:min-w-0 max-sm:flex-1";
const linkClasses =
  "relative inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground underline decoration-muted-foreground/40 underline-offset-[3px] transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))] after:absolute after:-inset-y-3 after:inset-x-0 after:content-[''] [@media(pointer:fine)]:after:hidden";
</script>

<template>
  <section
    aria-labelledby="play-matchmaking-label"
    data-play-matchmaking
    :data-state="state"
    class="rounded-lg border border-border bg-[linear-gradient(180deg,hsl(var(--muted)/0.22),hsl(var(--muted)/0.06))]"
  >
    <div
      class="flex items-center justify-between gap-3 px-[18px] pt-4 max-sm:px-3.5 max-sm:pt-3.5"
    >
      <h2
        id="play-matchmaking-label"
        :class="[tacticalSectionLabelClasses, '!mb-0']"
      >
        <span :class="tacticalSectionTickClasses"></span>
        {{ $t("pages.play.matchmaking.label") }}
      </h2>
      <div class="flex items-center gap-3">
        <span
          v-if="!isGuest && playersOnline > 0"
          class="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground"
        >
          <span class="size-2 rounded-full bg-success"></span>
          <span>
            <b class="font-semibold tabular-nums text-foreground">{{
              playersOnline
            }}</b>
            {{ $t("pages.play.matchmaking.players_online", playersOnline) }}
          </span>
        </span>
      </div>
    </div>

    <HeightSwap>
      <!-- The picker: idle, guest, party member, and every sanction or
           access problem are the same tiles with a different footer. -->
      <div
        v-if="shape === 'picker'"
        key="picker"
        class="px-[18px] pb-[18px] pt-3.5 max-sm:px-3.5 max-sm:pb-3.5 max-sm:pt-3"
      >
        <Fold
          :open="
            state === 'banned' ||
            state === 'cooldown' ||
            state === 'no-region' ||
            state === 'restricted'
          "
        >
          <div
            data-play-notice
            class="mb-3.5 flex items-start gap-3 rounded-lg border border-destructive/35 bg-destructive/[0.06] px-3.5 py-3"
          >
            <component
              :is="state === 'cooldown' ? Clock : AlertTriangle"
              class="mt-0.5 size-4 shrink-0 text-destructive"
            />
            <div class="grid gap-0.5 text-[13px]">
              <template v-if="state === 'no-region'">
                <b class="text-sm font-bold">{{
                  $t("pages.play.matchmaking.no_region.title", {
                    ms: maxLatency,
                  })
                }}</b>
                <span class="text-foreground/80">{{
                  $t("pages.play.matchmaking.no_region.body")
                }}</span>
              </template>
              <b v-else-if="state === 'restricted'" class="text-sm font-semibold">
                {{ $t("account_restriction.short") }}
              </b>
              <b v-else class="text-sm font-semibold">{{ sanctionText }}</b>
            </div>
          </div>
        </Fold>

        <Fold :open="state === 'closed'">
          <div
            data-play-notice
            class="mb-3.5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 px-3.5 py-3"
          >
            <Lock class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 text-[13px] font-semibold">
              {{ $t("pages.play.matchmaking.closed") }}
            </span>
          </div>
        </Fold>

        <!-- Unverified players see the whole picker blurred, with the
             verification call to action centred over it. -->
        <div class="relative">
        <div
          :class="
            state === 'unverified' &&
            'pointer-events-none select-none opacity-60 blur-[6px]'
          "
          :inert="state === 'unverified'"
          :aria-hidden="state === 'unverified' ? 'true' : undefined"
        >
        <div
          ref="modeGrid"
          role="radiogroup"
          :aria-label="$t('pages.play.matchmaking.mode_group')"
          class="relative grid gap-3 max-sm:gap-2"
          :class="[
            'grid-cols-2',
            modes.length >= 4
              ? 'xl:grid-cols-4'
              : modes.length === 3
                ? 'xl:grid-cols-3'
                : '',
            modes.length % 2 === 1 &&
              'max-xl:[&>button:last-of-type]:col-span-2',
          ]"
          @keydown="onModeKey"
        >
          <PlayModeTile
            v-for="mode in modes"
            :key="mode.key"
            :data-mode-key="mode.key"
            :style="modeColorStyle(mode)"
            :title="modeTitle(mode)"
            :description="
              mode.variant === 'CaptainPick'
                ? $t('matchmaking.captain_pick.description')
                : $t(
                    `matchmaking.match_types.${mode.type.toLowerCase()}.description`,
                  )
            "
            :expected="mode.expected"
            :limit="mode.limit"
            :in-queue="isGuest ? null : mode.inQueue"
            :party="party"
            :can-queue="partyFits(mode)"
            :blocked-text="requirementText(mode)"
            :selected="mode.key === selectedMode?.key"
            :tab-stop="mode.key === tabStop"
            :locked="pickerLocked"
            @select="pick(mode.key)"
          />
          <span
            aria-hidden="true"
            class="pointer-events-none absolute left-0 top-0 z-10 rounded-lg shadow-[inset_0_0_0_2px_rgb(var(--mode-rgb))] [transition-duration:240ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            :class="[
              frameShown ? 'opacity-100' : 'opacity-0',
              frameGlides
                ? 'transition-[transform,width,height,opacity]'
                : 'transition-opacity',
            ]"
            :style="{
              ...(selectedMode ? modeColorStyle(selectedMode) : {}),
              transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`,
              width: `${frame.w}px`,
              height: `${frame.h}px`,
            }"
          ></span>
        </div>

        <div
          class="mt-4 flex items-center justify-between gap-x-6 gap-y-3.5 border-t border-border/70 pt-4 max-lg:flex-col max-lg:items-stretch max-sm:contents"
        >
          <div
            class="grid min-w-0 gap-[7px] max-sm:mt-3.5 max-sm:gap-1.5 max-sm:border-t max-sm:border-border/70 max-sm:pt-3"
          >
            <p
              v-if="isGuest"
              class="m-0 text-[13px] text-foreground/85 max-sm:text-[12.5px]"
            >
              {{ $t("pages.play.matchmaking.guest_line") }}
            </p>
            <template v-else>
              <div
                class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground/90 max-sm:text-[12.5px]"
              >
                <!-- One input group: the regions a search uses, with the
                     matchmaking settings appended to it. -->
                <div
                  class="inline-flex h-8 min-w-0 max-w-full items-stretch overflow-hidden rounded-md border border-border bg-white/[0.025]"
                >
                  <span class="flex min-w-0 items-center gap-2 pl-[13px] pr-2.5">
                    <Signal class="size-3.5 shrink-0 text-muted-foreground" />
                    <span class="min-w-0 truncate">
                      <template
                        v-for="(region, index) in usedRegions"
                        :key="region.value"
                      >
                        <span v-if="index" class="text-muted-foreground/55">
                          ·
                        </span>
                        <b class="font-semibold">{{ region.name }}</b>
                        <span
                          v-if="region.ping !== null"
                          class="ml-1 tabular-nums text-foreground/75"
                          >{{
                            $t("pages.play.matchmaking.regions.ms", {
                              ms: region.ping,
                            })
                          }}</span
                        >
                      </template>
                      <template
                        v-for="(region, index) in skippedRegions"
                        :key="region.value"
                      >
                        <span
                          v-if="index || usedRegions.length"
                          class="text-muted-foreground/55"
                        >
                          ·
                        </span>
                        <span class="text-muted-foreground">{{
                          region.ping === null
                            ? $t("pages.play.matchmaking.regions.unreachable", {
                                name: region.name,
                              })
                            : $t("pages.play.matchmaking.regions.skipped", {
                                name: region.name,
                                ms: region.ping,
                              })
                        }}</span>
                      </template>
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    class="my-1.5 w-px shrink-0 bg-border"
                  ></span>
                  <MatchmakingSettingsPanel v-model:open="settingsOpen">
                    <template #trigger>
                      <button
                        type="button"
                        data-play-settings
                        class="grid w-8 shrink-0 place-items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--tac-amber))]"
                        :class="
                          settingsOpen
                            ? 'bg-[hsl(var(--tac-amber)/0.12)] text-[hsl(var(--tac-amber))]'
                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                        "
                        :aria-label="$t('pages.play.matchmaking.settings')"
                      >
                        <Settings2 class="size-4" />
                      </button>
                    </template>
                  </MatchmakingSettingsPanel>
                </div>
              </div>

              <!-- Indented by the region group's inner padding so its icon
                   sits under the icons inside that group. -->
              <div
                class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 pl-3.5 text-[13px] text-foreground/90 max-sm:text-[12.5px]"
              >
                <Users
                  class="size-3.5 shrink-0 self-center text-muted-foreground"
                />
                <template v-if="isMember">
                  <span>{{
                    $t("pages.play.matchmaking.party.member", {
                      name: leader?.name,
                      count: party,
                    })
                  }}</span>
                  <span class="text-muted-foreground/55">·</span>
                  <span>{{
                    $t("layouts.party_room.leader_picks", {
                      name: leader?.name,
                    })
                  }}</span>
                </template>
                <template v-else-if="party > 1">
                  <span>{{
                    $t("pages.play.matchmaking.party.leader", { count: party })
                  }}</span>
                  <span class="text-muted-foreground/55">·</span>
                  <span>{{ $t("pages.play.matchmaking.party.you_lead") }}</span>
                </template>
                <span v-else>{{
                  $t("pages.play.matchmaking.queue_solo")
                }}</span>
                <span class="text-muted-foreground/55">·</span>
                <button type="button" :class="linkClasses" @click="openParty">
                  {{
                    party > 1 || isMember
                      ? $t("pages.play.matchmaking.party.open")
                      : $t("pages.play.matchmaking.party.invite")
                  }}
                </button>
              </div>
            </template>
          </div>

          <!-- On phones only the action sticks to the bottom: the footer
               dissolves (display: contents) so this sticks within the whole
               hero rather than its own row. -->
          <div
            class="flex shrink-0 items-center gap-3.5 max-lg:justify-between max-sm:sticky max-sm:bottom-[env(safe-area-inset-bottom,0px)] max-sm:z-10 max-sm:-mx-3.5 max-sm:-mb-3.5 max-sm:mt-3 max-sm:rounded-b-lg max-sm:bg-[linear-gradient(180deg,hsl(var(--background)/0.94),hsl(var(--background)/0.99))] max-sm:px-3.5 max-sm:py-3"
          >
            <div
              v-if="selectedMode && state !== 'guest'"
              class="grid justify-items-end gap-px text-right max-lg:justify-items-start max-lg:text-left max-sm:hidden"
            >
              <b class="text-sm font-bold">
                {{ modeLabel(selectedMode) }}
              </b>
              <span class="text-xs text-muted-foreground">
                {{
                  $t("pages.play.matchmaking.regions.count", usedRegions.length)
                }}
              </span>
            </div>

            <Button
              v-if="state === 'guest'"
              :class="primaryClasses"
              @click="signIn"
            >
              <SteamIcon class="size-4" />
              {{ $t("pages.play.matchmaking.sign_in") }}
            </Button>
            <Button
              v-else-if="state === 'no-region'"
              :class="primaryClasses"
              @click="settingsOpen = true"
            >
              <Signal class="size-4" />
              {{ $t("pages.play.matchmaking.regions.edit") }}
            </Button>
            <Button
              v-else-if="state === 'member'"
              variant="outline"
              :class="[
                primaryClasses,
                '!bg-transparent !text-muted-foreground',
              ]"
              disabled
            >
              <Lock class="size-4" />
              {{
                $t("pages.play.matchmaking.waiting_for", { name: leader?.name })
              }}
            </Button>
            <Button
              v-else
              data-find-match
              :class="primaryClasses"
              :disabled="state !== 'idle' || !selectedMode"
              @click="findMatch"
            >
              <Play class="size-4 fill-current" />
              {{ $t("pages.play.matchmaking.find_match") }}
            </Button>
          </div>
        </div>
        </div>
        <div
          v-if="state === 'unverified'"
          data-play-notice
          class="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <Lock class="size-6 text-muted-foreground" />
          <span class="text-sm font-semibold">
            {{ $t("pages.play.matchmaking.verification_required") }}
          </span>
          <Button
            as-child
            size="sm"
            :class="
              verificationStatus === 'pending'
                ? 'bg-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber-foreground))] hover:bg-[hsl(var(--tac-amber)/0.9)]'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
            "
          >
            <NuxtLink :to="verificationLink">
              <component
                :is="verificationStatus === 'pending' ? Clock : ShieldCheck"
                class="size-3.5"
              />
              {{ verificationLabel }}
            </NuxtLink>
          </Button>
        </div>
        </div>
      </div>

      <!-- Searching, and the ready check open over it. -->
      <div
        v-else-if="shape === 'search'"
        key="search"
        data-play-search
        class="px-[18px] pb-[18px] pt-3.5 max-sm:px-3.5 max-sm:pb-3.5 max-sm:pt-3"
        :style="searchMode ? modeColorStyle(searchMode) : undefined"
      >
        <div
          class="grid grid-cols-[200px_minmax(0,1fr)_auto] items-center gap-[22px] max-lg:grid-cols-[140px_minmax(0,1fr)] max-sm:grid-cols-1 max-sm:gap-3.5"
        >
          <div
            v-if="searchMode"
            class="grid content-center gap-3 rounded-lg border border-[rgb(var(--mode-rgb)/0.45)] bg-[rgb(var(--mode-rgb)/0.06)] p-4 max-sm:hidden"
          >
            <span class="flex items-center gap-3.5">
              <span
                aria-hidden="true"
                class="text-[30px] font-bold leading-none tabular-nums text-foreground/90"
                >{{ searchMode.expected / 2
                }}<i
                  class="mx-[0.14em] align-[0.3em] text-[0.5em] font-semibold not-italic text-muted-foreground"
                  >v</i
                >{{ searchMode.expected / 2 }}</span
              >
              <PlaySeats
                :expected="searchMode.expected"
                :party="party"
                :limit="searchMode.limit"
              />
            </span>
            <b class="text-[15px] font-bold">{{ modeTitle(searchMode) }}</b>
          </div>

          <div class="grid min-w-0 gap-1">
            <div
              class="text-[46px] font-bold leading-none tabular-nums max-sm:text-[40px]"
              role="timer"
              :aria-label="$t('pages.play.matchmaking.clock')"
            >
              {{ clock ?? "0:00" }}
            </div>
            <div v-if="searchMode" class="text-[17px] font-bold">
              {{
                $t("pages.play.matchmaking.searching", {
                  mode: modeLabel(searchMode),
                })
              }}
            </div>
            <div class="text-[13px] text-foreground/80">
              <template v-for="(name, index) in searchRegions" :key="name">
                <span v-if="index" class="text-muted-foreground/55"> · </span
                >{{ name }}
              </template>
              <span
                v-if="searchRegions.length"
                class="text-muted-foreground/55"
              >
                ·
              </span>
              {{
                searchInQueue > 0
                  ? $t("layouts.queue.in_queue", { count: searchInQueue })
                  : $t("pages.play.matchmaking.first_in_line")
              }}
            </div>
            <div
              v-if="state === 'found'"
              class="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-[hsl(var(--tac-amber))]"
            >
              <span
                class="size-2 rounded-full bg-[hsl(var(--tac-amber))]"
              ></span>
              {{ $t("pages.play.matchmaking.found") }}
            </div>
            <div v-else class="text-[12.5px] text-muted-foreground">
              <template v-if="isMember">
                {{
                  $t("pages.play.matchmaking.party.member", {
                    name: leader?.name,
                    count: party,
                  })
                }}
              </template>
              <template v-else-if="party > 1">
                {{
                  $t("pages.play.matchmaking.party.leader", { count: party })
                }}
                · {{ $t("pages.play.matchmaking.party.you_lead") }}
              </template>
              <template v-else>
                {{ $t("pages.play.matchmaking.party.solo") }}
              </template>
            </div>
          </div>

          <div
            v-if="state === 'searching'"
            class="flex items-center gap-2.5 max-lg:col-span-full"
          >
            <Button
              variant="outline"
              data-play-cancel
              class="relative h-8 gap-1.5 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-[''] [@media(pointer:fine)]:after:hidden"
              @click="leave"
            >
              <X class="size-4" />
              {{ $t("pages.play.matchmaking.cancel") }}
            </Button>
          </div>
        </div>
      </div>

      <!-- Committed to a Captain Pick draft: no match yet and no way to
           leave; the draft lives on its own screen (DEAFCS). -->
      <div
        v-else-if="state === 'captain-pick'"
        key="captain-pick"
        class="px-[18px] pb-[18px] pt-3.5 max-sm:px-3.5 max-sm:pb-3.5 max-sm:pt-3"
      >
        <div
          class="flex flex-wrap items-center gap-3 rounded-lg border border-[rgb(var(--mode-rgb)/0.35)] bg-[rgb(var(--mode-rgb)/0.06)] px-4 py-3"
          :style="modeColorStyle({ variant: 'CaptainPick' })"
          data-testid="captain-pick-in-progress"
        >
          <Crown class="size-4 shrink-0 text-[rgb(var(--mode-rgb))]" />
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-sm font-bold text-[rgb(var(--mode-rgb))]">
              {{ $t("matchmaking.captain_pick.in_progress") }}
            </span>
            <span class="text-[13px] text-muted-foreground">
              {{ $t("matchmaking.captain_pick.in_progress_description") }}
            </span>
          </div>
          <Button as-child variant="outline" class="h-9 gap-2">
            <NuxtLink
              :to="
                captainPickDraft
                  ? captainPickPath(captainPickDraft)
                  : '/play/captain-pick'
              "
            >
              {{ $t("matchmaking.captain_pick.open") }}
              <ArrowRight class="size-4" />
            </NuxtLink>
          </Button>
        </div>
      </div>

      <!-- In the match the ready check produced. -->
      <div
        v-else
        key="match"
        class="px-[18px] pb-[18px] pt-3.5 max-sm:px-3.5 max-sm:pb-3.5 max-sm:pt-3"
      >
        <div
          class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-[22px] gap-y-4 max-sm:grid-cols-1"
        >
          <div class="grid min-w-0 gap-2">
            <div
              class="flex flex-wrap items-center gap-2 text-[13px] font-semibold"
            >
              <!-- DEAFCS #52: the dynamic status badge, not a raw status. -->
              <MatchStatus v-if="match" :match="match" />
              <span class="font-normal text-foreground/80">
                <template v-if="searchMode">
                  · {{ modeLabel(searchMode) }}
                </template>
                <template v-if="currentMap">
                  · {{ mapLabel(currentMap.map) }}
                </template>
              </span>
            </div>
            <div class="grid max-w-md gap-1">
              <div
                class="flex items-center justify-between gap-3 text-[17px] font-bold"
              >
                <span class="truncate">{{ match?.lineup_1?.name }}</span>
                <span class="tabular-nums">{{
                  currentMap?.lineup_1_score ?? 0
                }}</span>
              </div>
              <div
                class="flex items-center justify-between gap-3 text-[17px] font-bold text-foreground/70"
              >
                <span class="truncate">{{ match?.lineup_2?.name }}</span>
                <span class="tabular-nums">{{
                  currentMap?.lineup_2_score ?? 0
                }}</span>
              </div>
            </div>
          </div>
          <!-- DEAFCS #52: Go to Match keeps the DEAFCS orange CTA. -->
          <NuxtLink
            v-if="match"
            :to="{ name: 'matches-id', params: { id: match.id } }"
            :class="[tacticalCtaButtonClasses, 'shrink-0 max-sm:w-full']"
          >
            {{ $t("matchmaking.go_to_match") }}
          </NuxtLink>
          <div v-if="match" class="col-span-full">
            <QuickMatchConnect :match="match" />
          </div>
        </div>
      </div>
    </HeightSwap>
  </section>
</template>
