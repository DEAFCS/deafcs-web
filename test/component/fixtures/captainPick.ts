import type { CaptainPickDraftState } from "~/utilities/captainPickDraft";

// Players 1..10; 1 and 2 captain, 2 is the lower rated one so picks first.
export const ELO: Record<string, number> = {
  "1": 12500,
  "2": 11900,
  "3": 9000,
  "4": 8500,
  "5": 8000,
  "6": 7000,
  "7": 6000,
  "8": 5000,
  "9": 4000,
  "10": 3000,
};

/** A fresh draft exactly as the API sends it: pick 1, captain 2's turn. */
export function makeDraft(
  overrides: Partial<CaptainPickDraftState> = {},
): CaptainPickDraftState {
  return {
    draftId: "draft-1",
    phase: "Drafting",
    region: "EU",
    serverNow: "2026-09-29T20:00:00.000Z",
    pickOrder: [1, 2, 1, 2, 1, 2, 1],
    pickIndex: 0,
    pickingLineup: 1,
    pickingCaptainSteamId: "2",
    deadline: "2026-09-29T20:00:30.000Z",
    timerSeconds: 30,
    firstPickLineup: 1,
    firstPickReason: "LowerElo",
    captains: { 1: "2", 2: "1" },
    participants: Object.entries(ELO).map(([steam_id, elo]) => ({
      steam_id,
      name: `Player ${steam_id}`,
      avatar_url: null,
      elo,
    })),
    lineups: { 1: ["2"], 2: ["1"] },
    available: ["3", "4", "5", "6", "7", "8", "9", "10"],
    picks: [],
    matchId: null,
    ...overrides,
  };
}

/**
 * The draft after the given selections, the way the server would report it
 * (A B A B A B A, last player to B once all seven are made).
 */
export function draftAfter(
  selections: Array<{ steam_id: string; auto?: boolean }>,
): CaptainPickDraftState {
  const base = makeDraft();
  const lineups = { 1: [...base.lineups[1]], 2: [...base.lineups[2]] };
  const picks = selections.map((selection, pickIndex) => {
    const lineup = base.pickOrder[pickIndex];
    lineups[lineup].push(selection.steam_id);
    return {
      pickIndex,
      lineup,
      steam_id: selection.steam_id,
      auto: !!selection.auto,
      captain_steam_id: base.captains[lineup],
      at: null,
    };
  });
  let available = base.available.filter(
    (id) => !selections.some((selection) => selection.steam_id === id),
  );
  const done = selections.length >= base.pickOrder.length;
  if (done) {
    lineups[2].push(...available);
    available = [];
  }
  const pickIndex = done ? null : selections.length;
  const pickingLineup = done ? null : base.pickOrder[selections.length];
  return {
    ...base,
    phase: done ? "CreatingMatch" : "Drafting",
    pickIndex,
    pickingLineup,
    pickingCaptainSteamId: pickingLineup ? base.captains[pickingLineup] : null,
    deadline: done ? null : base.deadline,
    timerSeconds: done ? null : base.timerSeconds,
    lineups,
    available,
    picks,
  };
}
