// Adapted from 5Stack WEB 85b4f0f9 (utilities/vetoOrder.ts); MIT Copyright (c)
// 2025 5Stack.gg; see LICENSE.
//
// The order of a veto, so the rail can show every step before it happens.
//
// DEAFCS: 5Stack ports its api's get_map_veto_pattern and turn rule to
// TypeScript here. The DEAFCS api runs a different pattern (the Valve major
// rulebook: up to two opening bans, the picks, then any further bans) and its
// own turn rule (get_map_veto_turn_team: best of 3 swaps after the 4th
// action), and it already publishes the whole order as
// matches.map_veto_sequence (get_map_veto_sequence). So the order is read from
// the server instead of re-derived; nothing about it is computed here.

export type VetoStepType = "Ban" | "Pick" | "Side" | "Decider";

export type VetoOrderStep = {
  type: VetoStepType;
  // 1 = lineup_1, 2 = lineup_2, null = nobody (the decider closes itself).
  lineup: 1 | 2 | null;
};

// What the rail draws: the pool, every step with what happened on it so far,
// and the two lineups.
export type VetoBoardItem = {
  id: string;
  label: string;
  poster?: string | null;
  patch?: string | null;
  ping?: number | null;
  serverStatus?: string | null;
};

export type VetoBoardRecord = {
  itemId: string;
  lineup: 1 | 2 | null;
  side?: string | null;
  auto?: boolean;
};

export type VetoBoardStep = VetoOrderStep & {
  record: VetoBoardRecord | null;
};

export type VetoBoardLineup = {
  name: string;
  crest: string | null;
  monogram: string;
};

type ServerVetoStep = { index: number; type: string; team: number | null };

const STEP_TYPES: VetoStepType[] = ["Ban", "Pick", "Side", "Decider"];

// The map veto as the DEAFCS api runs it, from matches.map_veto_sequence.
// Empty when the match has no valid veto (the api then sends null).
export function mapVetoOrder(match: any): VetoOrderStep[] {
  const sequence = (match?.map_veto_sequence ?? []) as ServerVetoStep[];
  if (!Array.isArray(sequence)) {
    return [];
  }
  return [...sequence]
    .sort((a, b) => a.index - b.index)
    .filter((step) => STEP_TYPES.includes(step.type as VetoStepType))
    .map((step) => ({
      type: step.type as VetoStepType,
      lineup:
        step.type === "Decider"
          ? null
          : step.team === 1 || step.team === 2
            ? step.team
            : null,
    }));
}
