import { reactive } from "vue";

// DEAFCS: Reset Veto and Reset Captain Pick for one match, shared by the
// "..." menu's items (MatchPreMatchRecoveryMenuItems, unmounted whenever the
// menu closes) and their confirm dialogs (MatchPreMatchRecoveryDialogs, which
// stay mounted with the match's actions and follow the veto picks and the
// Captain Pick progress).
export type PreMatchRecoveryState = {
  vetoPicks: number;
  canResetVeto: boolean;
  captainPicks: number;
  canResetCaptainPick: boolean;
  // The confirm that is open, with the pick count it was opened on (the api
  // refuses when the veto or the draft moved on since).
  confirming: "veto" | "captain_pick" | null;
  expected: number;
  busy: boolean;
};

const states = reactive(new Map<string, PreMatchRecoveryState>());

export function preMatchRecoveryState(matchId: string | undefined) {
  return matchId ? states.get(matchId) : undefined;
}

export function registerPreMatchRecovery(
  matchId: string,
  state: PreMatchRecoveryState,
) {
  states.set(matchId, state);
  return states.get(matchId)!;
}

export function unregisterPreMatchRecovery(
  matchId: string,
  state: PreMatchRecoveryState,
) {
  if (states.get(matchId) === state) {
    states.delete(matchId);
  }
}
