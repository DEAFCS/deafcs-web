// Ported from 5Stack WEB 681116a (#908), utilities/rewind.ts: only the veto
// part (VetoStep, vetoTimelineSteps). DEAFCS's Rounds tab keeps its own round
// rewind code, so upstream's round helpers are not copied here.
import { e_sides_enum } from "~/generated/zeus";

export type VetoStepType = "Ban" | "Pick" | "Side" | "Decider";

export type VetoStep = {
  step: number;
  type: VetoStepType;
  lineup: 1 | 2 | null;
  map: string;
  side?: e_sides_enum;
};

// The veto as the Fix the Veto window draws it: every step of the pattern,
// with the map and side of the ones already taken.
export function vetoTimelineSteps(
  steps: Array<{
    type: VetoStepType;
    lineup: 1 | 2 | null;
    record: {
      itemId: string;
      lineup: 1 | 2 | null;
      side?: string | null;
    } | null;
  }>,
  mapName: (mapId: string) => string,
): VetoStep[] {
  return steps.map((step, index) => ({
    step: index + 1,
    type: step.type,
    lineup: step.record?.lineup ?? step.lineup,
    map: step.record ? mapName(step.record.itemId) : "",
    side: (step.record?.side ?? undefined) as e_sides_enum | undefined,
  }));
}
