/**
 * The Captain Pick draft as the API sends it on matchmaking:details
 * (confirmation.captainPick). The server is authoritative for everything
 * here: captains, first pick, turn, deadline and every selection.
 */
export type CaptainPickLineup = 1 | 2;

export type CaptainPickPhase =
  | "Drafting"
  | "CreatingMatch"
  | "MatchCreated"
  | "Failed";

export interface CaptainPickParticipant {
  steam_id: string;
  name: string;
  avatar_url: string | null;
  elo: number;
}

export interface CaptainPickSelection {
  pickIndex: number;
  lineup: CaptainPickLineup;
  steam_id: string;
  auto: boolean;
  captain_steam_id: string;
  at: string | null;
}

export interface CaptainPickDraftState {
  draftId: string;
  phase: CaptainPickPhase;
  region: string;
  serverNow: string;
  pickOrder: Array<CaptainPickLineup>;
  pickIndex: number | null;
  pickingLineup: CaptainPickLineup | null;
  pickingCaptainSteamId: string | null;
  deadline: string | null;
  timerSeconds: number | null;
  firstPickLineup: CaptainPickLineup;
  firstPickReason: "LowerElo" | "EqualEloCoinFlip";
  captains: Record<CaptainPickLineup, string>;
  participants: Array<CaptainPickParticipant>;
  lineups: Record<CaptainPickLineup, Array<string>>;
  available: Array<string>;
  picks: Array<CaptainPickSelection>;
  matchId: string | null;
}

/** Present only once all ten accepted: the group is committed. */
export function getCaptainPickDraft(
  confirmation:
    | { captainPick?: CaptainPickDraftState | null }
    | null
    | undefined,
): CaptainPickDraftState | null {
  return confirmation?.captainPick ?? null;
}

/**
 * The ready check the player still has to deal with, if any. Standard
 * matchmaking has no match id only while checking in; a Captain Pick group
 * also has none for the whole draft, but past 10/10 it is not checking in.
 */
export function pendingReadyCheck<
  T extends { matchId?: string | null; captainPick?: unknown },
>(confirmation: T | null | undefined): T | null {
  if (!confirmation || confirmation.matchId || confirmation.captainPick) {
    return null;
  }
  return confirmation;
}

/** A draft that still needs its own screen (no match to go to yet). */
export function isCaptainPickInProgress(
  draft: CaptainPickDraftState | null | undefined,
): boolean {
  return (
    !!draft && (draft.phase === "Drafting" || draft.phase === "CreatingMatch")
  );
}

export function isMyCaptainPickTurn(
  draft: CaptainPickDraftState | null | undefined,
  steamId: string | null | undefined,
): boolean {
  return (
    !!draft &&
    !!steamId &&
    draft.phase === "Drafting" &&
    draft.pickIndex !== null &&
    String(draft.pickingCaptainSteamId) === String(steamId)
  );
}

/**
 * The server's deadline translated to this device's clock, using the
 * server time sent with the same update. Only a display value: a skewed
 * local clock can't make the countdown lie, and it never picks anyone.
 */
export function localCaptainPickDeadline(
  draft: Pick<CaptainPickDraftState, "deadline" | "serverNow">,
  receivedAt: number = Date.now(),
): string | null {
  if (!draft.deadline) {
    return null;
  }
  const deadline = new Date(draft.deadline).getTime();
  const serverNow = new Date(draft.serverNow).getTime();
  if (!Number.isFinite(deadline) || !Number.isFinite(serverNow)) {
    return draft.deadline;
  }
  return new Date(deadline - (serverNow - receivedAt)).toISOString();
}

export function captainPickParticipant(
  draft: CaptainPickDraftState,
  steamId: string,
): CaptainPickParticipant | undefined {
  return draft.participants.find(
    (participant) => String(participant.steam_id) === String(steamId),
  );
}

/**
 * A lineup in the shape the Draft Games roster components render: captain
 * first (pick order 0), then everyone in the order they joined the team.
 * The ELO shown is the Competitive ELO the draft was started with.
 */
export function captainPickLineupMembers(
  draft: CaptainPickDraftState,
  lineup: CaptainPickLineup,
) {
  return draft.lineups[lineup].map((steamId, index) => {
    const participant = captainPickParticipant(draft, steamId);
    return {
      steam_id: steamId,
      pick_order: index,
      player: {
        steam_id: steamId,
        name: participant?.name ?? steamId,
        avatar_url: participant?.avatar_url ?? null,
        elo: { competitive: participant?.elo },
      },
    };
  });
}
