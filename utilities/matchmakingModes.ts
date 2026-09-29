import { e_match_types_enum } from "~/generated/zeus";
import { canPartyQueue } from "~/utilities/matchmakingPartySize";
import { matchTypeColorStyle } from "~/utilities/matchTypeColors";

/**
 * The /play matchmaking choices. 5v5 Captain Pick is a queue mode, not a
 * match type: it queues and plays as Competitive, only the teams are drafted
 * by two captains. Everything after the match exists is plain Competitive.
 */
export type MatchmakingQueueVariant = "Standard" | "CaptainPick";

export interface MatchmakingMode {
  // Stable id for keys, colors, labels and the region-stats entry.
  key: string;
  type: e_match_types_enum;
  variant: MatchmakingQueueVariant;
}

export const CAPTAIN_PICK_MODE_KEY = "CompetitiveCaptainPick";

// Kept out of MATCH_TYPE_RGB on purpose: that map lists real match types
// (badges, match history filters), and Captain Pick matches are Competitive.
const CAPTAIN_PICK_RGB = "250 204 21";

/** Card accent for a /play mode. */
export function modeColorStyle(mode: {
  type?: string | null;
  variant?: MatchmakingQueueVariant;
}): Record<string, string> {
  return mode.variant === "CaptainPick"
    ? { "--mode-rgb": CAPTAIN_PICK_RGB }
    : matchTypeColorStyle(mode.type);
}

// Order on /play: Pick System, Competitive, Wingman, Duel.
const MODE_ORDER: Array<MatchmakingMode> = [
  {
    key: CAPTAIN_PICK_MODE_KEY,
    type: e_match_types_enum.Competitive,
    variant: "CaptainPick",
  },
  {
    key: e_match_types_enum.Competitive,
    type: e_match_types_enum.Competitive,
    variant: "Standard",
  },
  {
    key: e_match_types_enum.Wingman,
    type: e_match_types_enum.Wingman,
    variant: "Standard",
  },
  {
    key: e_match_types_enum.Duel,
    type: e_match_types_enum.Duel,
    variant: "Standard",
  },
];

/**
 * Captain Pick has its own switch, independent of the Standard 5v5 one, so
 * it can be offered even while Standard 5v5 is off (and vice versa).
 */
export function buildMatchmakingModes(options: {
  isTypeEnabled: (type: e_match_types_enum) => boolean;
  captainPickEnabled: boolean;
}): Array<MatchmakingMode> {
  return MODE_ORDER.filter((mode) =>
    mode.variant === "CaptainPick"
      ? options.captainPickEnabled
      : options.isTypeEnabled(mode.type),
  );
}

/** The matchmaking:region-stats key a mode's queue count is reported under. */
export function regionStatsKey(mode: {
  type: e_match_types_enum;
  variant: MatchmakingQueueVariant;
}): string {
  return mode.variant === "CaptainPick" ? `${mode.type}CaptainPick` : mode.type;
}

/** matchmaking:join-queue payload. Standard is sent exactly as before. */
export function joinQueuePayload(
  mode: { type: e_match_types_enum; variant: MatchmakingQueueVariant },
  regions: Array<string>,
): {
  type: e_match_types_enum;
  regions: Array<string>;
  variant?: "CaptainPick";
} {
  if (mode.variant === "CaptainPick") {
    return { type: mode.type, regions, variant: "CaptainPick" };
  }
  return { type: mode.type, regions };
}

/** Captain Pick is solo queue only; Standard modes keep their party rules. */
export function canQueueMode(
  mode: { type: e_match_types_enum; variant: MatchmakingQueueVariant },
  partySize: number,
  maxCompetitivePartySize: number,
): boolean {
  if (mode.variant === "CaptainPick") {
    return partySize === 1;
  }
  return canPartyQueue(mode.type, partySize, maxCompetitivePartySize);
}

/**
 * Players in a queue across the given regions. A lobby can sit in several
 * regions at once, so each lobby is counted once, by its index.
 */
export function playersInQueue(
  regionStats: Partial<
    Record<
      string,
      Partial<Record<string, Array<{ index: number; size: number }>>>
    >
  >,
  statsKey: string,
  regionValues: Array<string>,
): number {
  const lobbySizes = new Map<number, number>();
  for (const regionValue of regionValues) {
    for (const entry of regionStats[regionValue]?.[statsKey] ?? []) {
      lobbySizes.set(entry.index, entry.size);
    }
  }
  let total = 0;
  for (const size of lobbySizes.values()) {
    total += size;
  }
  return total;
}
