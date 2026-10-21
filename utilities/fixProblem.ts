// Ported from 5Stack WEB 681116a (#908), utilities/fixProblem.ts.
//
// DEAFCS differences:
// - Only the step-aware recovery fixes live here: the veto fixes, Restore
//   Round and Restart Map. Set Winner, Forfeit, Reboot, Reparse, Cancel and
//   Delete stay in the match's "..." menu, so each has one entry point.
// - No "Ban or Pick for {team}": DEAFCS's veto override is the switch on the
//   veto board itself.
// - No "They need more time" (extendMatchAutoCancel is not in the DEAFCS api).
// - Restart Match is administrators only and lands with fix/restart-match;
//   until then canRestartMatch is false and the item never shows.
// - Captain Pick fixes come with the Captain Pick work; the dock keeps a slot
//   for them but this menu adds none.
import type { Component } from "vue";
import { History, RefreshCw, RotateCcw, Timer, Undo2 } from "lucide-vue-next";
import { e_match_map_status_enum, e_match_status_enum } from "~/generated/zeus";
import { currentMatchAdminStep } from "~/utilities/matchAdminSteps";
import mapLabel from "~/utilities/mapLabel";

export type FixProblemKey =
  | "restore"
  | "restart_map"
  | "restart"
  | "undo_last"
  | "mispick"
  | "redo"
  | "time";

export type FixProblemItem = {
  key: FixProblemKey | string;
  icon: Component;
  title: string;
  description: string;
  tone?: "danger";
};

export type FixProblemMenu = {
  stepLabel: string;
  now: FixProblemItem[];
  anytime: FixProblemItem[];
  later?: string;
};

export type FixProblemState = {
  status: string;
  stepLabel: string;
  currentMapStatus?: string | null;
  mapsStarted: boolean;
  rush: boolean;
  mapVeto: boolean;
  vetoPicks: number;
  vetoTeam?: string | null;
  vetoClockRunning: boolean;
  lastPick?: { team: string; map: string } | null;
  // DEAFCS: an organizer on one of the teams below match_organizer can't touch
  // the veto or the map (the api refuses them too).
  canControl: boolean;
  canRestartMatch: boolean;
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

const PRE_MAP: string[] = [
  e_match_status_enum.PickingPlayers,
  e_match_status_enum.WaitingForCheckIn,
  e_match_status_enum.Veto,
  e_match_status_enum.WaitingForServer,
];

const MAP_IN_PROGRESS = ["Warmup", "Live", "Overtime", "Paused"];

const MAP_RESTARTABLE = [...MAP_IN_PROGRESS, "Knife"];

// What Fix a Problem offers: the fixes for the step the match is in first,
// then the ones that always apply. A fix that can't apply yet is left out
// rather than shown greyed; `later` says what the next step unlocks.
export function fixProblemItems(
  t: Translate,
  state: FixProblemState,
): FixProblemMenu {
  const status = state.status;
  const live = status === e_match_status_enum.Live;
  const veto = status === e_match_status_enum.Veto;
  const mapInProgress =
    live && MAP_IN_PROGRESS.includes(state.currentMapStatus ?? "");
  const mapRestartable =
    live && MAP_RESTARTABLE.includes(state.currentMapStatus ?? "");
  const vetoRewindable =
    state.mapVeto &&
    state.vetoPicks > 0 &&
    (veto ||
      ((live || status === e_match_status_enum.WaitingForServer) &&
        !state.mapsStarted));

  const now: FixProblemItem[] = [];
  const anytime: FixProblemItem[] = [];

  if (state.canControl) {
    if (veto && state.vetoPicks > 0 && state.lastPick) {
      now.push({
        key: "undo_last",
        icon: Undo2,
        title: t("match.fix_menu.undo_last_title"),
        description: t("match.fix_menu.undo_last_description", state.lastPick),
      });
    }

    if (vetoRewindable) {
      now.push(
        {
          key: "mispick",
          icon: History,
          title: t("match.fix_menu.mispick_title"),
          description: t("match.fix_menu.mispick_description"),
        },
        {
          key: "redo",
          icon: RotateCcw,
          title: t("match.fix_menu.redo_title"),
          description: t("match.fix_menu.redo_description"),
        },
      );
    }

    if (veto && state.vetoTeam && state.vetoClockRunning) {
      now.push({
        key: "time",
        icon: Timer,
        title: t("match.fix_menu.time_title"),
        description: t("match.fix_menu.time_description", {
          team: state.vetoTeam,
        }),
      });
    }

    if (mapInProgress && !state.rush) {
      now.push({
        key: "restore",
        icon: History,
        title: t("match.recovery.fix.restore_title"),
        description: t("match.fix_menu.restore_description"),
      });
    }

    if (mapRestartable) {
      now.push({
        key: "restart_map",
        icon: RotateCcw,
        title: t("match.recovery.fix.restart_map_title"),
        description: t("match.recovery.fix.restart_map_description"),
      });
    }
  }

  // DEAFCS: the restart branch's own strings (match.recovery.restart.*).
  if (
    state.canRestartMatch &&
    (live || status === e_match_status_enum.WaitingForServer)
  ) {
    anytime.push({
      key: "restart",
      icon: RefreshCw,
      title: t("match.recovery.restart.title"),
      description: t("match.recovery.restart.description"),
      tone: "danger",
    });
  }

  // DEAFCS: no "results unlock later" note, since result fixes are in the
  // "..." menu rather than here.
  const later = PRE_MAP.includes(status)
    ? t("match.fix_menu.later_rounds")
    : undefined;

  return { stepLabel: state.stepLabel, now, anytime, later };
}

// Fix a Problem for a match as the api hands it over, with its veto picks in
// order. What the viewer may do is the caller's to say.
export function matchFixMenu(
  t: Translate,
  match: any,
  vetoPicks: any[],
  allowed: {
    canControl: boolean;
    canRestartMatch: boolean;
  },
): FixProblemMenu {
  const currentMap = match.match_maps?.find((map: any) => map.is_current_map);
  const step = currentMatchAdminStep(match);
  const stepKey =
    step === "live" && currentMap?.status === e_match_map_status_enum.Paused
      ? "paused"
      : step === "finished" && match.status === e_match_status_enum.Canceled
        ? "canceled"
        : step;
  const lineupName = (id: string) =>
    id === match.lineup_1_id
      ? match.lineup_1?.name
      : id === match.lineup_2_id
        ? match.lineup_2?.name
        : "";
  const vetoTeam = match.map_veto_picking_lineup_id
    ? lineupName(match.map_veto_picking_lineup_id) || null
    : null;
  // Nobody chooses the Decider, so the last step anyone took is the one
  // before it.
  const last = vetoPicks.findLast((pick: any) => pick.type !== "Decider");
  return fixProblemItems(t, {
    status: match.status,
    stepLabel: t(`match.admin_bar.steps.${stepKey}`),
    currentMapStatus: currentMap?.status ?? null,
    mapsStarted: (match.match_maps ?? []).some(
      (map: any) => map.status && map.status !== "Scheduled",
    ),
    rush: match.options?.type === "Rush",
    mapVeto: !!match.options?.map_veto,
    vetoPicks: vetoPicks.length,
    vetoTeam,
    // DEAFCS: matches.map_veto_pick_expires_at (upstream: veto_pick_expires_at).
    vetoClockRunning: !!match.map_veto_pick_expires_at,
    lastPick: last
      ? {
          team: lineupName(last.match_lineup_id) ?? "",
          map: mapLabel(last.map),
        }
      : null,
    canControl: allowed.canControl,
    canRestartMatch: allowed.canRestartMatch,
  });
}
