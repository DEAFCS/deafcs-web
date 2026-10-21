import { reactive } from "vue";

// DEAFCS: Veto Recovery's state for one match, shared by the "..." menu's
// items (MatchVetoRecoveryMenuItems, unmounted whenever the menu closes) and
// its dialogs (MatchVetoRecoveryDialogs, which stay mounted with the match's
// actions and own the veto picks subscription).
export type VetoRecoveryState = {
  picks: Array<any>;
  // Fix a Mis-pick / Redo the Veto: the Fix the Veto window, and the step it
  // opens on.
  fixOpen: boolean;
  fixStep: number;
  // Undo the Last Step's confirm, with the step and pick count it was
  // chosen from.
  undoOpen: boolean;
  undoStep: number;
  undoExpected: number;
  busy: boolean;
  extendVetoClock: () => Promise<void>;
};

const states = reactive(new Map<string, VetoRecoveryState>());

export function vetoRecoveryState(matchId: string | undefined) {
  return matchId ? states.get(matchId) : undefined;
}

export function registerVetoRecovery(
  matchId: string,
  state: VetoRecoveryState,
) {
  states.set(matchId, state);
  return states.get(matchId)!;
}

export function unregisterVetoRecovery(
  matchId: string,
  state: VetoRecoveryState,
) {
  if (states.get(matchId) === state) {
    states.delete(matchId);
  }
}
