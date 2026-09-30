// Whether the match on screen is an active Captain Pick draft's match, and
// whether the viewer is one of its ten players. Only the API knows (its
// matchId -> draft mapping and draft state), so the match page asks it over
// the socket (matchmaking:captain-pick:match-status) and keeps the answer for
// that match only.
//
// Used for two things, neither of which grants anything by itself:
//   - locking manual lineup edits while the drafted teams are still being
//     picked (the API's finalizer would refuse lineups it didn't draft)
//   - offering the ten players the match's Match Chat on the match page
//     (the chat service authorizes the join on its own)
import { reactive } from "vue";
import socket from "~/web-sockets/Socket";

export const CAPTAIN_PICK_LINEUP_LOCK = "captainPickLineupsLocked";

const STATUS_EVENT = "matchmaking:captain-pick:match-status";

export interface CaptainPickMatchStatus {
  matchId: string | null;
  active: boolean;
  participant: boolean;
}

type MatchLike = { id?: string | null; status?: string | null } | null;

export function createCaptainPickMatchStatus() {
  const state = reactive<CaptainPickMatchStatus>({
    matchId: null,
    active: false,
    participant: false,
  });
  let requestedFor: string | null = null;

  const listener = socket.listen(
    STATUS_EVENT,
    (data: { matchId?: string; active?: boolean; participant?: boolean }) => {
      // Only the answer for the match currently on screen.
      if (!data?.matchId || data.matchId !== requestedFor) return;
      state.matchId = data.matchId;
      state.active = !!data.active;
      state.participant = !!data.participant;
    },
  );

  function reset() {
    state.matchId = null;
    state.active = false;
    state.participant = false;
  }

  // Asks once per match while it is picking players; anything else can't be
  // an active draft's match.
  function update(match: MatchLike) {
    if (!match?.id || match.status !== "PickingPlayers") {
      requestedFor = null;
      reset();
      return;
    }
    if (requestedFor === match.id) return;
    requestedFor = match.id;
    reset();
    socket.event(STATUS_EVENT, { matchId: match.id });
  }

  return { state, update, stop: () => listener.stop() };
}

function appliesTo(match: MatchLike, state: CaptainPickMatchStatus) {
  return (
    !!match?.id &&
    match.status === "PickingPlayers" &&
    state.active &&
    state.matchId === match.id
  );
}

export function isCaptainPickLineupLocked(
  match: MatchLike,
  state: CaptainPickMatchStatus,
) {
  return appliesTo(match, state);
}

export function isCaptainPickChatParticipant(
  match: MatchLike,
  state: CaptainPickMatchStatus,
) {
  return appliesTo(match, state) && state.participant;
}
