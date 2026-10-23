// DEAFCS: the two pre-match recovery actions in the match's "..." menu,
// Reset Veto (upstream 5Stack WEB 681116a #908's Redo the Veto) and Reset
// Captain Pick. When each applies; the api checks the same again.
import { e_match_status_enum, e_player_roles_enum } from "~/generated/zeus";

// What the api's rewindMapVeto and resetCaptainPick accept (also while
// playing in the match): administrators and match organizers on every match,
// tournament organizers on their own tournaments' matches. Never a match's
// owner or a moderator.
export function canRunPreMatchRecovery(
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

// Whether the map veto can be reset: it may be running, or done but no map
// has started (the api also refuses a map with rounds or a demo). Upstream's
// vetoRewindable (utilities/fixProblem.ts).
export function vetoResettable(match: any, picks: number) {
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

// Picks made so far in a Captain Pick, from its public progress: each team
// starts with its captain.
export function captainPickPicks(
  progress: { lineups?: Record<1 | 2, Array<string>> } | null | undefined,
) {
  if (!progress?.lineups) {
    return 0;
  }
  return (
    Math.max(0, (progress.lineups[1]?.length ?? 0) - 1) +
    Math.max(0, (progress.lineups[2]?.length ?? 0) - 1)
  );
}

// While the captains pick and somebody has been picked. Once the teams lock
// (CreatingMatch) the match is being seated and the api refuses.
export function captainPickResettable(
  match: any,
  progress: { phase?: string; lineups?: Record<1 | 2, Array<string>> } | null,
) {
  return (
    match?.status === e_match_status_enum.PickingPlayers &&
    progress?.phase === "Drafting" &&
    captainPickPicks(progress) > 0
  );
}
