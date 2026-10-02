// The match page's pre-game Overview: which stage it shows, when it hands
// over to the Scoreboard, and display helpers for its team panels, Captain
// Pick history and veto strip. Everything is derived from data the page
// already has (the match subscription, its veto picks and the public Captain
// Pick feed). Nothing here is a second source of truth.

import {
  captainPickPlayer,
  type CaptainPickDraftState,
} from "~/utilities/captainPickDraft";

export type OverviewStage = "check-in" | "captain-pick" | "veto" | "pre-match";

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
    // Match check-in (check_in_setting). Tournament attendance (individual
    // signups / team check-in) happens on the tournament before any match
    // exists, so it is never a match-page stage.
    case "WaitingForCheckIn":
      return "check-in";
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

type ServerMatch = LifecycleMatch & {
  server_id?: string | null;
  is_server_online?: boolean | null;
  match_maps?: Array<{ status?: string | null }> | null;
};

/**
 * The match's server is up, so its connect details are usable: the exact
 * state in which QuickMatchConnect stops showing "Server booting" and
 * offers Join Server / Copy IP (Live, a server assigned, is_server_online).
 * Viewer-independent; whether a viewer may see the address is still
 * Hasura's connection_string.
 */
export function matchServerReady(match: ServerMatch | null | undefined): boolean {
  return match?.status === "Live" && !!match.server_id && !!match.is_server_online;
}

// Map statuses before play starts: everything else means the server is
// running a map for real (Knife, Live, ... set by the game server).
const PRE_PLAY_MAP_STATUSES = new Set(["Scheduled", "Warmup"]);

/** A map is already being played: past the point of showing the Overview. */
export function matchMapInPlay(match: ServerMatch | null | undefined): boolean {
  return (match?.match_maps ?? []).some(
    (map) => !!map.status && !PRE_PLAY_MAP_STATUSES.has(map.status),
  );
}

/**
 * When the Scoreboard takes over as the default view, as epoch ms: 30
 * seconds after the server became ready. There is no server timestamp for
 * that moment (only the is_server_online boolean), so readyAt is when this
 * device first saw it, remembered per match so a refresh resumes the same
 * window (see rememberServerReadyAt). Once a map is in play the handoff is
 * due for everyone at once, whatever was remembered.
 */
export function scoreboardHandoffAt(
  match: ServerMatch | null | undefined,
  readyAt: number | null,
): number | null {
  if (!matchServerReady(match)) return null;
  if (matchMapInPlay(match)) return 0;
  return readyAt === null ? null : readyAt + SCOREBOARD_HANDOFF_MS;
}

/** Whether the Overview is the match page's default view right now. */
export function overviewIsDefault(
  match: ServerMatch | null | undefined,
  stage: OverviewStage | null,
  now: number,
  readyAt: number | null = null,
): boolean {
  if (!stage) return false;
  if (stage !== "pre-match") return true;
  // Waiting for a server, or the server still booting: stay on the Overview.
  if (!matchServerReady(match)) return true;
  const handoffAt = scoreboardHandoffAt(match, readyAt);
  return handoffAt === null || handoffAt > now;
}

const readyKey = (matchId: string) => `deafcs:match-server-ready:${matchId}`;

/**
 * The moment this device first saw the match's server ready, kept in
 * localStorage so a refresh continues the hidden 30 seconds instead of
 * restarting them. Falls back to "now" when storage is unavailable.
 */
export function rememberServerReadyAt(matchId: string, now: number): number {
  try {
    const stored = Number(window.localStorage.getItem(readyKey(matchId)));
    // Never later than now (a clock change must not extend the window).
    if (Number.isFinite(stored) && stored > 0 && stored <= now) return stored;
    window.localStorage.setItem(readyKey(matchId), String(now));
  } catch {
    // Private mode / blocked storage: this page view only.
  }
  return now;
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
// Match check-in

type CheckInPlayer = { steam_id: string; checked_in?: boolean | null; captain?: boolean | null };
type CheckInMatch = {
  min_players_per_lineup?: number | null;
  options?: { check_in_setting?: string | null } | null;
  lineup_1?: { is_ready?: boolean | null; lineup_players?: CheckInPlayer[] | null } | null;
  lineup_2?: { is_ready?: boolean | null; lineup_players?: CheckInPlayer[] | null } | null;
};

/**
 * Check-in progress in the match's own model (check_in_setting):
 * Players: every player checks in, a lineup is ready at the match type's
 * minimum; Captains: one captain check-in readies the whole team; Admin: an
 * administrator starts the match, nothing to count. Readiness itself is the
 * server's is_ready, never recomputed here.
 */
export function checkInSummary(match: CheckInMatch) {
  const mode = (match.options?.check_in_setting ?? "Players") as
    | "Players"
    | "Captains"
    | "Admin";
  const perTeam = match.min_players_per_lineup || 5;
  const teams = ([1, 2] as const).map((team) => {
    const lineup = match[`lineup_${team}`];
    const players = lineup?.lineup_players ?? [];
    return {
      team,
      ready: !!lineup?.is_ready,
      checkedIn: players.filter((p) => p.checked_in).length,
      required: mode === "Captains" ? 1 : perTeam,
    };
  });
  const ready =
    mode === "Captains"
      ? teams.filter((t) => t.ready).length
      : teams.reduce((sum, t) => sum + Math.min(t.checkedIn, t.required), 0);
  const required = mode === "Captains" ? 2 : perTeam * 2;
  return { mode, teams, ready, required };
}

// ---------------------------------------------------------------------------
// Region veto

type RegionPick = { type: string; region: string; match_lineup_id?: string | null };
type RegionMatch = {
  status?: string | null;
  region?: string | null;
  lineup_1_id?: string | null;
  lineup_2_id?: string | null;
  region_veto_picking_lineup_id?: string | null;
  options?: { region_veto?: boolean | null; regions?: string[] | null } | null;
};

/** A region veto is running: the match is in Veto and no region is locked. */
export function regionVetoPending(match: RegionMatch | null | undefined): boolean {
  return (
    match?.status === "Veto" && !!match.options?.region_veto && !match.region
  );
}

export type RegionState = "available" | "banned" | "selected";

/** Each configured region's state, from the real region veto picks. */
export function regionVetoStates(match: RegionMatch, picks: RegionPick[] | null | undefined) {
  const byRegion = new Map(
    (picks ?? []).map((pick) => [pick.region.toLowerCase(), pick]),
  );
  return (match.options?.regions ?? []).map((value) => {
    const pick = byRegion.get(value.toLowerCase());
    const selected =
      pick?.type === "Decider" ||
      (!!match.region && match.region.toLowerCase() === value.toLowerCase());
    const state: RegionState = selected ? "selected" : pick ? "banned" : "available";
    return {
      value,
      state,
      team: pick && pick.type !== "Decider" ? teamOf(match, pick.match_lineup_id) : null,
    };
  });
}

/**
 * The region veto so far: the real picks, then the server's current turn.
 * Future turns are not shown (the order is not stored anywhere).
 */
export function regionSteps(match: RegionMatch, picks: RegionPick[] | null | undefined) {
  const steps = (picks ?? []).map((pick) => ({
    type: pick.type === "Decider" ? ("Decider" as const) : ("Ban" as const),
    team: pick.type === "Decider" ? null : teamOf(match, pick.match_lineup_id),
    state: "done" as VetoStepState,
  }));
  if (regionVetoPending(match) && match.region_veto_picking_lineup_id) {
    steps.push({
      type: "Ban",
      team: teamOf(match, match.region_veto_picking_lineup_id),
      state: "current",
    });
  }
  return steps;
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
  // The server's whole veto (matches.map_veto_sequence, from
  // get_map_veto_pattern and get_map_veto_turn_team). Null when the match has
  // no valid veto.
  map_veto_sequence?: Array<{ index: number; type: VetoAction; team: 1 | 2 }> | null;
  options?: {
    best_of?: number | null;
    map_pool?: { maps?: Array<{ id: string }> | null } | null;
  } | null;
};

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
 * map_veto_type and picking lineup, and upcoming steps come from the
 * server's map_veto_sequence. Nothing about the order is computed here.
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

  const upcoming = (match.map_veto_sequence ?? []).filter(
    (step) => step.type !== "Side",
  );
  // The server's sequence and its picks come from the same rules; this only
  // guards against an out-of-date sequence (e.g. a pool edited mid-veto).
  const consistent =
    inVeto &&
    upcoming.length >= steps.length &&
    steps.every((step, index) => step.type === upcoming[index].type);
  if (consistent) {
    for (let index = steps.length; index < upcoming.length; index++) {
      const next = upcoming[index];
      steps.push({
        type: next.type as VetoStep["type"],
        team: next.type === "Decider" ? null : next.team,
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
