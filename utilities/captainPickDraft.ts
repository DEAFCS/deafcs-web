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

/** A committed draft that has not finished seating its players. */
export function isCaptainPickInProgress(
  draft: CaptainPickDraftState | null | undefined,
): boolean {
  return (
    !!draft && (draft.phase === "Drafting" || draft.phase === "CreatingMatch")
  );
}

/** The real match is the draft's home as soon as its shell exists. */
export function captainPickPath(draft: CaptainPickDraftState): string {
  return draft.matchId ? `/matches/${draft.matchId}` : "/play/captain-pick";
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
  draft: Pick<CaptainPickDraftState, "participants">,
  steamId: string,
): CaptainPickParticipant | undefined {
  return draft.participants.find(
    (participant) => String(participant.steam_id) === String(steamId),
  );
}

/**
 * The player object the Draft Games cards render (PlayerDisplay: flag,
 * ratings, avatar, profile link). Uses the public player record when it has
 * loaded (see useCaptainPickPlayers); until then, what the draft state
 * carries. Display only.
 */
export function captainPickPlayer(
  draft: Pick<CaptainPickDraftState, "participants">,
  steamId: string,
  players: Record<string, any> = {},
) {
  const record = players[String(steamId)];
  if (record) {
    return record;
  }
  const participant = captainPickParticipant(draft, steamId);
  return {
    steam_id: steamId,
    name: participant?.name ?? steamId,
    avatar_url: participant?.avatar_url ?? null,
    elo: { competitive: participant?.elo },
  };
}

/**
 * A lineup in the shape the Draft Games roster components render: captain
 * first (pick order 0), then everyone in the order they joined the team.
 */
export function captainPickLineupMembers(
  draft: Pick<CaptainPickDraftState, "participants" | "lineups">,
  lineup: CaptainPickLineup,
  players: Record<string, any> = {},
) {
  return draft.lineups[lineup].map((steamId, index) => ({
    steam_id: steamId,
    pick_order: index,
    player: captainPickPlayer(draft, steamId, players),
  }));
}

/** The side the viewer is on, straight from the server's lineups. */
export function myCaptainPickLineup(
  draft: CaptainPickDraftState | null | undefined,
  steamId: string | null | undefined,
): CaptainPickLineup | null {
  if (!draft || !steamId) {
    return null;
  }
  for (const lineup of [1, 2] as const) {
    if (draft.lineups[lineup].some((id) => String(id) === String(steamId))) {
      return lineup;
    }
  }
  return null;
}

/** Private team chat room for one side (server checks membership). */
export function captainPickTeamChatId(
  draftId: string,
  lineup: CaptainPickLineup,
): string {
  return `${draftId}:${lineup}`;
}

/** The Draft Games pick-order strip for this draft's seven timed picks. */
export function captainPickTimeline(
  draft: Pick<CaptainPickDraftState, "pickIndex" | "pickOrder" | "phase">,
) {
  const made = draft.pickIndex ?? draft.pickOrder.length;
  return draft.pickOrder.map((lineup, index) => ({
    lineup,
    state:
      index < made
        ? ("done" as const)
        : index === made && draft.phase === "Drafting"
          ? ("current" as const)
          : ("upcoming" as const),
  }));
}

/**
 * The server's pick history in the Draft Games log shape. Only real picks
 * (manual or timed-out): the last player the server places on Team B is not
 * a captain's pick and is not listed as one.
 */
export function captainPickLogEntries(
  draft: CaptainPickDraftState,
  players: Record<string, any> = {},
) {
  return draft.picks.map((pick) => ({
    id: `pick-${pick.pickIndex}`,
    lineup: pick.lineup,
    auto_picked: pick.auto,
    captain: captainPickPlayer(draft, pick.captain_steam_id, players),
    picked: captainPickPlayer(draft, pick.steam_id, players),
  }));
}
