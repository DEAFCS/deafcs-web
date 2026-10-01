// The match page's pre-game Overview: which stage it shows, when it hands
// over to the Scoreboard, and display helpers for its team panels, Captain
// Pick history and veto strip. Everything is derived from data the page
// already has (the match subscription, its veto picks and the public Captain
// Pick feed). Nothing here is a second source of truth.

import {
  captainPickPlayer,
  type CaptainPickDraftState,
} from "~/utilities/captainPickDraft";

export type OverviewStage = "captain-pick" | "veto" | "pre-match";

/** One chip of the Overview's progress strip. */
export type OverviewStripStep = {
  label: string;
  // t1/t2: that team's turn (amber/blue), ban: red, decider: neutral.
  tone: "t1" | "t2" | "ban" | "decider";
  state: "done" | "current" | "upcoming";
};

// The MatchTabs value of the Overview tab. Not "overview": that is a legacy
// ?tab= alias MatchTabs maps to the Scoreboard's general lens.
export const OVERVIEW_TAB = "lifecycle";

// How long the final teams and maps stay up after the match goes Live
// before the Scoreboard becomes the default view.
export const SCOREBOARD_HANDOFF_MS = 30_000;

type LifecycleMatch = {
  status?: string | null;
  source?: string | null;
  started_at?: string | null;
};

/** Which stage the Overview tab shows, or null when there is no Overview. */
export function overviewStage(
  match: LifecycleMatch | null | undefined,
  { captainPickActive }: { captainPickActive: boolean },
): OverviewStage | null {
  if (!match) return null;
  // Imported (e.g. FACEIT) matches have no DEAFCS lifecycle.
  if (match.source && match.source !== "5stack") return null;
  switch (match.status) {
    case "PickingPlayers":
      // Only a Captain Pick draft. Manual lineups keep the Scoreboard flow.
      return captainPickActive ? "captain-pick" : null;
    case "Veto":
      return "veto";
    case "WaitingForServer":
    case "Live":
      return "pre-match";
    default:
      return null;
  }
}

/**
 * When the Scoreboard takes over as the default view, as epoch ms.
 *
 * Anchored on matches.started_at, which Postgres stamps when the match
 * becomes Live (the last veto action, or a server freeing up after
 * WaitingForServer). Every viewer and every refresh sees the same moment.
 */
export function scoreboardHandoffAt(
  match: LifecycleMatch | null | undefined,
): number | null {
  if (match?.status !== "Live" || !match.started_at) return null;
  const startedAt = Date.parse(match.started_at);
  return Number.isNaN(startedAt) ? null : startedAt + SCOREBOARD_HANDOFF_MS;
}

/** Milliseconds of the cooldown left, never more than the full window. */
export function scoreboardHandoffRemainingMs(
  match: LifecycleMatch | null | undefined,
  now: number,
): number {
  const handoffAt = scoreboardHandoffAt(match);
  if (handoffAt === null) return 0;
  // A client clock running behind the server must not stretch the window.
  return Math.min(SCOREBOARD_HANDOFF_MS, Math.max(0, handoffAt - now));
}

/** Whether the Overview is the match page's default view right now. */
export function overviewIsDefault(
  match: LifecycleMatch | null | undefined,
  stage: OverviewStage | null,
  now: number,
): boolean {
  if (!stage) return false;
  if (stage !== "pre-match") return true;
  if (match?.status === "WaitingForServer") return true;
  return scoreboardHandoffRemainingMs(match, now) > 0;
}

/** MatchTabs' default tab: the Overview while it is the default view. */
export function defaultMatchTab(
  overviewAvailable: boolean,
  overviewDefault: boolean,
): string {
  return overviewAvailable && overviewDefault ? OVERVIEW_TAB : "scoreboard";
}

/**
 * The one-time handoff: when the Overview stops being the default view, a
 * viewer still on it moves to the Scoreboard. Any other moment (or a tab
 * chosen later, the Overview included) is left alone. Null means no change.
 */
export function tabAfterOverviewChange(
  activeTab: string,
  wasDefault: boolean,
  isDefault: boolean,
): string | null {
  return wasDefault && !isDefault && activeTab === OVERVIEW_TAB
    ? "scoreboard"
    : null;
}

type LineupPlayer = {
  steam_id: string;
  captain?: boolean | null;
  placeholder_name?: string | null;
  player?: Record<string, any> | null;
};

/** A match lineup in the member shape DraftTeamPanel renders. */
export function lineupMembers(
  lineup: { lineup_players?: LineupPlayer[] | null } | null | undefined,
) {
  return (lineup?.lineup_players ?? []).map((row, index) => ({
    steam_id: String(row.steam_id),
    pick_order: index,
    player: row.player ?? {
      steam_id: String(row.steam_id),
      name: row.placeholder_name ?? "",
    },
  }));
}

export function lineupCaptainSteamId(
  lineup: { lineup_players?: LineupPlayer[] | null } | null | undefined,
): string | null {
  const captain = lineup?.lineup_players?.find((row) => row.captain);
  return captain ? String(captain.steam_id) : null;
}

type ProgressLike = Pick<
  CaptainPickDraftState,
  "captains" | "participants" | "lineups" | "pickIndex" | "pickOrder"
>;

/**
 * The picks made so far, in the Draft Log shape, rebuilt from the public
 * feed: pick i belongs to pickOrder[i], and each lineup lists its captain
 * first and then its players in the order they were picked. The last player
 * the server places automatically is not a pick and is not listed.
 */
export function captainPickHistory(progress: ProgressLike) {
  const made = progress.pickIndex ?? progress.pickOrder.length;
  const seen: Record<number, number> = { 1: 0, 2: 0 };
  const entries = [];
  for (let index = 0; index < made; index++) {
    const lineup = progress.pickOrder[index];
    seen[lineup] += 1;
    const steamId = progress.lineups[lineup]?.[seen[lineup]];
    if (!steamId) break;
    entries.push({
      id: `pick-${index}`,
      lineup,
      auto_picked: false,
      captain: captainPickPlayer(progress, progress.captains[lineup]),
      picked: captainPickPlayer(progress, steamId),
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Veto

export type VetoAction = "Ban" | "Pick" | "Side" | "Decider";

type VetoPick = {
  type: string;
  side?: string | null;
  map?: { id: string } | null;
  match_lineup_id?: string | null;
};

type VetoMatch = {
  status?: string | null;
  lineup_1_id?: string | null;
  lineup_2_id?: string | null;
  map_veto_type?: string | null;
  map_veto_picking_lineup_id?: string | null;
  options?: {
    best_of?: number | null;
    map_pool?: { maps?: Array<{ id: string }> | null } | null;
  } | null;
};

/**
 * Mirror of get_map_veto_pattern(): the veto actions for a best-of and pool
 * size. Only used to preview steps that haven't happened yet; done steps
 * come from the real picks and the current one from the match itself.
 */
export function mapVetoPattern(bestOf: number, poolSize: number): VetoAction[] {
  const base: VetoAction[] = [];
  if (bestOf === 1 && poolSize > 0) {
    for (let i = 0; i < poolSize - 1; i++) base.push("Ban");
    base.push("Decider");
  } else if ((bestOf === 3 || bestOf === 5) && poolSize >= bestOf) {
    const bans = poolSize - bestOf;
    const preBans = Math.min(bans, 2);
    for (let i = 0; i < preBans; i++) base.push("Ban");
    for (let i = 0; i < bestOf - 1; i++) base.push("Pick");
    for (let i = 0; i < bans - preBans; i++) base.push("Ban");
    base.push("Decider");
  }
  return base.flatMap((type) =>
    type === "Pick" ? (["Pick", "Side"] as VetoAction[]) : [type],
  );
}

/**
 * Mirror of get_map_veto_picking_lineup_id() for map actions (Ban, Pick,
 * Decider), by their 0-based turn: Bo3 swaps the order after four turns.
 */
export function mapVetoTurnTeam(bestOf: number, turn: number): 1 | 2 {
  const even = turn % 2 === 0;
  if (bestOf === 3 && turn >= 4) return even ? 2 : 1;
  return even ? 1 : 2;
}

export type VetoStepState = "done" | "current" | "upcoming";
export type VetoStep = {
  type: "Ban" | "Pick" | "Decider";
  team: 1 | 2 | null;
  state: VetoStepState;
  mapId: string | null;
  // A Pick whose side choice is the current action.
  choosingSide: boolean;
};

const teamOf = (match: VetoMatch, lineupId?: string | null): 1 | 2 | null =>
  lineupId && lineupId === match.lineup_1_id
    ? 1
    : lineupId && lineupId === match.lineup_2_id
      ? 2
      : null;

/**
 * The veto as a strip of map actions (side choices ride on their Pick).
 * Done steps are the real picks, the current step is the match's own
 * map_veto_type and picking lineup, and upcoming steps are previewed from
 * the mirrored pattern only while it agrees with the server so far.
 */
export function vetoSteps(match: VetoMatch, picks: VetoPick[] | null | undefined) {
  const mapPicks = (picks ?? []).filter((pick) => pick.type !== "Side");
  const steps: VetoStep[] = mapPicks.map((pick) => ({
    type: pick.type as VetoStep["type"],
    team: pick.type === "Decider" ? null : teamOf(match, pick.match_lineup_id),
    state: "done",
    mapId: pick.map?.id ?? null,
    choosingSide: false,
  }));

  const inVeto = match.status === "Veto";
  const current = inVeto ? match.map_veto_type : null;
  if (current === "Side" && steps.length > 0) {
    const last = steps[steps.length - 1];
    last.state = "current";
    last.choosingSide = true;
  } else if (current === "Ban" || current === "Pick" || current === "Decider") {
    steps.push({
      type: current,
      team: current === "Decider" ? null : teamOf(match, match.map_veto_picking_lineup_id),
      state: "current",
      mapId: null,
      choosingSide: false,
    });
  }

  const bestOf = match.options?.best_of ?? 0;
  const expected = mapVetoPattern(bestOf, match.options?.map_pool?.maps?.length ?? 0)
    .filter((type) => type !== "Side") as VetoStep["type"][];
  const agrees =
    inVeto &&
    expected.length >= steps.length &&
    steps.every((step, index) => step.type === expected[index]);
  if (agrees) {
    for (let index = steps.length; index < expected.length; index++) {
      steps.push({
        type: expected[index],
        team: expected[index] === "Decider" ? null : mapVetoTurnTeam(bestOf, index),
        state: "upcoming",
        mapId: null,
        choosingSide: false,
      });
    }
  }
  return steps;
}

export type VetoMapState = "available" | "banned" | "picked" | "decider";

/** Each pool map's veto state, from the real picks. */
export function vetoMapStates(match: VetoMatch, picks: VetoPick[] | null | undefined) {
  const byMap = new Map<string, VetoPick>();
  const sideByMap = new Map<string, VetoPick>();
  for (const pick of picks ?? []) {
    if (!pick.map?.id) continue;
    if (pick.type === "Side") sideByMap.set(pick.map.id, pick);
    else byMap.set(pick.map.id, pick);
  }
  return (match.options?.map_pool?.maps ?? []).map((map) => {
    const pick = byMap.get(map.id);
    const side = sideByMap.get(map.id);
    const state: VetoMapState =
      pick?.type === "Ban"
        ? "banned"
        : pick?.type === "Pick"
          ? "picked"
          : pick?.type === "Decider"
            ? "decider"
            : "available";
    return {
      map,
      state,
      team: pick && pick.type !== "Decider" ? teamOf(match, pick.match_lineup_id) : null,
      sideTeam: side ? teamOf(match, side.match_lineup_id) : null,
      side: side?.side ?? null,
    };
  });
}

/** The lineup that starts CT on a match map, if sides are already set. */
export function ctStartTeam(matchMap: {
  lineup_1_side?: string | null;
  lineup_2_side?: string | null;
}): 1 | 2 | null {
  if (matchMap.lineup_1_side === "CT") return 1;
  if (matchMap.lineup_2_side === "CT") return 2;
  return null;
}
