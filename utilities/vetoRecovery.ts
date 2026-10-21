// Veto Recovery: which of Undo the Last Step, Fix a Mis-pick, Redo the Veto and
// Give 30 Seconds More apply now. The veto part of upstream 5Stack WEB's
// utilities/fixProblem.ts (681116a, #908), the same rules and strings.
//
// DEAFCS: these live in the match's "..." menu for staff (the Admin Dock is
// administrators only), so there is no Fix a Problem menu around them.
import type { Component } from "vue";
import { History, RotateCcw, Timer, Undo2 } from "lucide-vue-next";
import { e_match_status_enum, e_player_roles_enum } from "~/generated/zeus";
import mapLabel from "~/utilities/mapLabel";

export type VetoRecoveryKey = "undo_last" | "mispick" | "redo" | "time";

export type VetoRecoveryItem = {
  key: VetoRecoveryKey;
  icon: Component;
  title: string;
  description: string;
};

type Translate = (key: string, values?: Record<string, unknown>) => string;

// DEAFCS: what the api's rewindMapVeto and extendVetoClock accept (also while
// playing in the match): administrators and match organizers on every match,
// tournament organizers on their own tournaments' matches. Never a match's
// owner or a moderator. The api checks it again.
export function canRecoverVeto(
  match: any,
  isRoleAbove: (role: e_player_roles_enum) => boolean,
) {
  if (
    isRoleAbove(e_player_roles_enum.administrator) ||
    (isRoleAbove(e_player_roles_enum.match_organizer) &&
      !isRoleAbove(e_player_roles_enum.tournament_organizer))
  ) {
    return true;
  }
  return (
    isRoleAbove(e_player_roles_enum.tournament_organizer) &&
    !!match?.is_organizer &&
    !!match?.is_tournament_match
  );
}

// Whether the veto can still be taken back at all: picks were made and no map
// has started (the api refuses a map with rounds or a demo too).
export function vetoRewindable(match: any, picks: number) {
  const mapsStarted = (match?.match_maps ?? []).some(
    (map: any) => map.status && map.status !== "Scheduled",
  );
  return (
    !!match?.options?.map_veto &&
    picks > 0 &&
    (match.status === e_match_status_enum.Veto ||
      ([
        e_match_status_enum.WaitingForServer,
        e_match_status_enum.Live,
      ].includes(match.status) &&
        !mapsStarted))
  );
}

// The step Undo takes back: nobody chooses the Decider, so the last step
// anyone took is the one before it.
export function lastVetoStep(picks: any[]) {
  return picks.at(-1)?.type === "Decider" ? picks.length - 1 : picks.length;
}

export function vetoRecoveryItems(
  t: Translate,
  match: any,
  picks: any[],
): VetoRecoveryItem[] {
  const veto = match?.status === e_match_status_enum.Veto;
  const lineupName = (id: string) =>
    id === match.lineup_1_id
      ? match.lineup_1?.name
      : id === match.lineup_2_id
        ? match.lineup_2?.name
        : "";
  const vetoTeam = match?.map_veto_picking_lineup_id
    ? lineupName(match.map_veto_picking_lineup_id) || null
    : null;
  const last = picks.findLast((pick: any) => pick.type !== "Decider");

  const items: VetoRecoveryItem[] = [];

  if (veto && picks.length > 0 && last) {
    items.push({
      key: "undo_last",
      icon: Undo2,
      title: t("match.fix_menu.undo_last_title"),
      description: t("match.fix_menu.undo_last_description", {
        team: lineupName(last.match_lineup_id) ?? "",
        map: mapLabel(last.map),
      }),
    });
  }

  if (vetoRewindable(match, picks.length)) {
    items.push(
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

  // DEAFCS: matches.map_veto_pick_expires_at (upstream: veto_pick_expires_at).
  if (veto && vetoTeam && match.map_veto_pick_expires_at) {
    items.push({
      key: "time",
      icon: Timer,
      title: t("match.fix_menu.time_title"),
      description: t("match.fix_menu.time_description", { team: vetoTeam }),
    });
  }

  return items;
}
