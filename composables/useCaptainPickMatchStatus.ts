// Whether the match on screen is an active Captain Pick draft's match, and
// whether the viewer is one of its ten players. Only the API knows (its
// matchId -> draft mapping and draft state), so the match page asks it over
// the socket (matchmaking:captain-pick:match-status) and keeps the answer for
// that match only.
//
// Used for two things, neither of which grants anything by itself:
//   - locking manual lineup edits while the drafted teams are still being
//     picked (the API's finalizer would refuse lineups it didn't draft).
//     Fail-safe: a picking match stays locked until the API has answered,
//     and only a (retried) "not a Captain Pick match" unlocks it.
//   - offering the ten players the match's Match Chat on the match page,
//     only on the API's positive answer (the chat service authorizes the
//     join on its own).
import { reactive } from "vue";
import socket from "~/web-sockets/Socket";

export const CAPTAIN_PICK_LINEUP_LOCK = "captainPickLineupsLocked";

const STATUS_EVENT = "matchmaking:captain-pick:match-status";

// The match shell can be visible a moment before the server has recorded
// which draft it belongs to, so a "no" is asked again a couple of times
// before it is believed. A "yes" is final.
export const CAPTAIN_PICK_STATUS_ATTEMPTS = 3;
export const CAPTAIN_PICK_STATUS_RETRY_MS = 1500;

export interface CaptainPickMatchStatus {
  matchId: string | null;
  // The API has settled the question for this match.
  resolved: boolean;
  active: boolean;
  participant: boolean;
}

type MatchLike = { id?: string | null; status?: string | null } | null;

export function createCaptainPickMatchStatus() {
  const state = reactive<CaptainPickMatchStatus>({
    matchId: null,
    resolved: false,
    active: false,
    participant: false,
  });
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearRetry() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function ask() {
    const matchId = state.matchId;
    if (!matchId) return;
    attempts += 1;
    socket.event(STATUS_EVENT, { matchId });
    clearRetry();
    // Asks again if this attempt gets no answer, or only a "no", in time.
    if (attempts < CAPTAIN_PICK_STATUS_ATTEMPTS) {
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (state.matchId === matchId && !state.resolved) ask();
      }, CAPTAIN_PICK_STATUS_RETRY_MS);
    }
  }

  const listener = socket.listen(
    STATUS_EVENT,
    (data: { matchId?: string; active?: boolean; participant?: boolean }) => {
      // Only the answer for the match currently on screen.
      if (!data?.matchId || data.matchId !== state.matchId) return;

      if (data.active) {
        clearRetry();
        state.resolved = true;
        state.active = true;
        state.participant = !!data.participant;
        return;
      }

      // A "no" is only believed once the retries are used up; until then
      // the pending retry asks again.
      if (!state.active && attempts >= CAPTAIN_PICK_STATUS_ATTEMPTS) {
        clearRetry();
        state.resolved = true;
        state.participant = false;
      }
    },
  );

  function track(matchId: string | null) {
    clearRetry();
    attempts = 0;
    state.matchId = matchId;
    state.resolved = false;
    state.active = false;
    state.participant = false;
  }

  // Asks while the match is picking players; anything else can't be an
  // active draft's match. A new match, or leaving PickingPlayers, drops
  // any pending retry.
  function update(match: MatchLike) {
    if (!match?.id || match.status !== "PickingPlayers") {
      if (state.matchId !== null) track(null);
      return;
    }
    if (state.matchId === match.id) return;
    track(match.id);
    ask();
  }

  function stop() {
    clearRetry();
    listener.stop();
  }

  return { state, update, stop };
}

// Locked while picking unless the API has settled that this match is not a
// Captain Pick draft's match. Unknown (not asked yet, waiting, retrying)
// stays locked.
export function isCaptainPickLineupLocked(
  match: MatchLike,
  state: CaptainPickMatchStatus,
) {
  if (!match?.id || match.status !== "PickingPlayers") return false;
  const settledOrdinary =
    state.matchId === match.id && state.resolved && !state.active;
  return !settledOrdinary;
}

// Only on the API's positive answer for this very match.
export function isCaptainPickChatParticipant(
  match: MatchLike,
  state: CaptainPickMatchStatus,
) {
  return (
    !!match?.id &&
    match.status === "PickingPlayers" &&
    state.matchId === match.id &&
    state.resolved &&
    state.active &&
    state.participant
  );
}
