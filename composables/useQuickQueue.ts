import { computed, ref } from "vue";
import { useNow } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import socket from "~/web-sockets/Socket";
import { toast } from "~/components/ui/toast";
import { e_match_types_enum } from "~/generated/zeus";
import { localServerTime } from "~/utilities/matchmakingDeadline";
import { EXPECTED_PLAYERS } from "~/utilities/matchmakingPartySize";
import {
  isJoinPending,
  markJoinPending,
} from "~/utilities/matchmakingJoinPending";
import {
  buildMatchmakingModes,
  canQueueMode,
  joinQueuePayload,
  modeFormat,
  modePartyLimit,
  playersInQueue,
  regionStatsKey,
  type MatchmakingMode,
  type MatchmakingQueueVariant,
} from "~/utilities/matchmakingModes";

// Queueing from anywhere, not just the Play page (5Stack's useQuickQueue): the
// header's Play button queues the mode you played last, its arrow picks
// another, and the hub's party room shows the same line. The Play page uses
// the same modes and the same join, so the three never disagree about what you
// can queue.
//
// DEAFCS: the modes are DEAFCS's four (Captain Pick, Competitive, Wingman,
// Duel), keyed by mode key because Captain Pick and Competitive share a match
// type. Eligibility is DEAFCS's (Captain Pick solo, the Competitive party cap,
// one lineup otherwise, the website restriction), and join sends the same
// payload /play always sent. The API re-checks every rule.

const LAST_MODE_KEY = "matchmaking-last-mode";

function readLastMode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_MODE_KEY);
  } catch {
    return null;
  }
}

const lastMode = ref<string | null>(readLastMode());

export function rememberQueueMode(key: string) {
  lastMode.value = key;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_MODE_KEY, key);
  } catch {
    // Remembering the mode is a convenience; a blocked store just means the
    // button falls back to the first mode the party can play.
  }
}

export type QuickQueueMode = MatchmakingMode & {
  canQueue: boolean;
  expected: number;
  limit: number;
  inQueue: number;
};

type QueueDetails = {
  type: e_match_types_enum;
  variant?: MatchmakingQueueVariant;
  regions?: string[];
  joinedAt?: string;
  serverNow?: string;
  receivedAt?: number;
};

export function useQuickQueue() {
  const { t } = useI18n();
  const matchmakingStore = useMatchmakingStore();
  const settings = useApplicationSettingsStore();

  // Only accepted lobby members queue -- pending invites don't count, which is
  // how the api sizes the lobby too.
  const partySize = computed(() => {
    const lobby = matchmakingStore.currentLobby as any;
    const accepted = lobby?.players?.filter(
      (player: { status: string }) => player.status === "Accepted",
    );
    return accepted?.length || 1;
  });

  const regions = computed(() =>
    (matchmakingStore.preferredRegions as Array<{ value: string }>).map(
      (region) => region.value,
    ),
  );

  const restricted = computed(() => !!useWebsiteRestrictionStore().isRestricted);

  const modes = computed<QuickQueueMode[]>(() =>
    buildMatchmakingModes({
      isTypeEnabled: (type) =>
        settings.isMatchmakingTypeEnabled(type.toLowerCase()),
      captainPickEnabled: settings.captainPickEnabled,
    }).map((mode) => ({
      ...mode,
      canQueue:
        !restricted.value &&
        canQueueMode(mode, partySize.value, settings.maxCompetitivePartySize),
      expected: EXPECTED_PLAYERS[mode.type] ?? 0,
      limit: modePartyLimit(mode, settings.maxCompetitivePartySize),
      inQueue: playersInQueue(
        matchmakingStore.regionStats,
        regionStatsKey(mode),
        regions.value,
      ),
    })),
  );

  // The mode the Play button queues with one click: the last one played if the
  // party can still play it, otherwise the first one it can.
  const quickMode = computed(
    () =>
      modes.value.find(
        (mode) => mode.key === lastMode.value && mode.canQueue,
      ) ??
      modes.value.find((mode) => mode.canQueue) ??
      null,
  );

  const queue = computed(
    () =>
      (matchmakingStore.joinedMatchmakingQueues as any)?.details as
        | QueueDetails
        | undefined,
  );

  // The mode a running search is for, so its color and name match the picker.
  const queueMode = computed(() => {
    const details = queue.value;
    if (!details) return null;
    const variant = details.variant === "CaptainPick" ? "CaptainPick" : "Standard";
    return (
      modes.value.find(
        (mode) => mode.type === details.type && mode.variant === variant,
      ) ?? { key: details.type, type: details.type, variant }
    );
  });

  // When the search started on this device's clock. The server stamps
  // joinedAt on its own clock and sends its clock with it (Theft's
  // serverNow/receivedAt), so a device whose clock is off still counts from
  // the real start.
  const startedAt = computed(() =>
    localServerTime(queue.value?.joinedAt, queue.value),
  );

  // How long the search has been running, as m:ss. Only reads the clock while
  // a search is on, so an idle header never re-renders on the tick.
  const now = useNow({ interval: 1000 });
  const clock = computed(() => {
    const started = startedAt.value;
    if (started === undefined) return null;
    const seconds = Math.max(
      0,
      Math.floor((now.value.getTime() - started) / 1000),
    );
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  });

  // The mode's name: Captain Pick by its queue name, everything else by its
  // match type title.
  function modeTitle(mode: {
    type: string;
    variant?: MatchmakingQueueVariant;
  }) {
    if (mode.variant === "CaptainPick") {
      return t("matchmaking.captain_pick.title");
    }
    return t(`matchmaking.match_types.${mode.type.toLowerCase()}.title`);
  }

  // "Competitive 5v5", "Captain Pick 5v5".
  function modeLabel(mode: { type: string; variant?: MatchmakingQueueVariant }) {
    return `${modeTitle(mode)} ${modeFormat(mode as { type: e_match_types_enum })}`;
  }

  function requirementText(mode: QuickQueueMode) {
    if (mode.variant === "CaptainPick") {
      return t("matchmaking.captain_pick.solo_only");
    }
    if (mode.type === e_match_types_enum.Duel) {
      return t("matchmaking.party_size.duel_requirement");
    }
    return t("matchmaking.party_size.requirement", { half: mode.limit });
  }

  // The one place a search starts. Every check /play always made, in the same
  // order; the API repeats them.
  function join(mode: QuickQueueMode | string) {
    const picked =
      typeof mode === "string"
        ? modes.value.find((candidate) => candidate.key === mode)
        : modes.value.find((candidate) => candidate.key === mode.key);
    if (!picked) return false;
    const me = useAuthStore().me;
    if (!me?.steam_id) {
      navigateTo("/login?redirect=/play");
      return false;
    }
    // Already searching, in a ready check or a Captain Pick draft, or a
    // join is on its way: nothing new to start.
    const current = matchmakingStore.joinedMatchmakingQueues as any;
    if (current?.details || current?.confirmation || isJoinPending()) {
      return false;
    }
    // Only the party leader queues (the API refuses everyone else).
    const lobby = matchmakingStore.currentLobby as any;
    if (
      lobby?.players?.length &&
      !lobby.players.some(
        (slot: any) =>
          slot.captain && String(slot.player?.steam_id) === String(me.steam_id),
      )
    ) {
      return false;
    }
    if (!settings.matchmakingRoleAllowed) {
      toast({
        title: t("pages.play.matchmaking.verification_required"),
        variant: "destructive",
      });
      return false;
    }
    if (!settings.matchmakingEnabled) {
      toast({
        title: t("pages.play.matchmaking.closed"),
        variant: "destructive",
      });
      return false;
    }
    if (restricted.value) {
      toast({ title: t("account_restriction.short"), variant: "destructive" });
      return false;
    }
    if (!picked.canQueue) {
      toast({ title: requirementText(picked), variant: "destructive" });
      return false;
    }
    if (regions.value.length === 0) {
      toast({
        title: t("matchmaking.no_preferred_regions"),
        variant: "destructive",
      });
      return false;
    }
    rememberQueueMode(picked.key);
    markJoinPending();
    socket.event(
      "matchmaking:join-queue",
      joinQueuePayload(picked, regions.value),
    );
    return true;
  }

  // Exactly what /play always sent to leave: no data.
  function leave() {
    socket.event(
      "matchmaking:leave",
      undefined as unknown as Record<string, unknown>,
    );
  }

  return {
    partySize,
    regions,
    modes,
    quickMode,
    queue,
    queueMode,
    clock,
    modeTitle,
    modeLabel,
    requirementText,
    join,
    leave,
  };
}
