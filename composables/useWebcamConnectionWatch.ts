// Decides when a multi-party webcam call has really dropped, shared by the
// popout window (WebcamCallRoom.vue) and the phone/QR page
// (WebcamTokenJoin.vue).
//
// The old rule was "one status poll said not-ready, so the call is over".
// A single slow or failed request (mobile data hiccup, a request that was
// in flight while the phone changed network) therefore tore the call down
// with "Connection dropped". Now:
// - a not-ready answer must repeat DROP_GRACE_POLLS times in a row,
// - the first check after the page comes back to the foreground counts at
//   once (a backgrounded phone's WebRTC session is already dead, waiting
//   longer only delays the reconnect),
// - a link the server reports as expired (the person was removed from the
//   room, lost access, or the chat window closed) is final: reconnecting
//   with it can never work, so it is not retried and not described as a
//   dropped connection,
// - a real drop is retried automatically a couple of times before asking
//   the person to tap Join call.

export const DROP_GRACE_POLLS = 3;
export const MAX_AUTO_RECONNECTS = 2;
// Consecutive healthy polls after which earlier auto reconnects are
// forgotten, so a long call can recover from drops more than twice.
export const STABLE_POLLS_RESET = 15;

export type WebcamStatusSample = {
  ready: boolean;
  reason?: string | null;
};

export type WebcamWatchVerdict = "ok" | "waiting" | "dropped" | "expired";

export function createDropWatcher(grace = DROP_GRACE_POLLS) {
  let misses = 0;
  let stable = 0;
  let autoReconnects = 0;

  return {
    sample(
      status: WebcamStatusSample,
      options: { afterResume?: boolean } = {},
    ): WebcamWatchVerdict {
      if (status.ready) {
        misses = 0;
        stable++;
        if (stable >= STABLE_POLLS_RESET) autoReconnects = 0;
        return "ok";
      }
      stable = 0;
      if (status.reason === "expired") return "expired";
      misses++;
      if (options.afterResume || misses >= grace) return "dropped";
      return "waiting";
    },
    canAutoReconnect(): boolean {
      return autoReconnects < MAX_AUTO_RECONNECTS;
    },
    noteAutoReconnect(): void {
      autoReconnects++;
      misses = 0;
      stable = 0;
    },
    // A deliberate (manual) join starts from a clean slate.
    reset(): void {
      misses = 0;
      stable = 0;
      autoReconnects = 0;
    },
  };
}

export const WEBCAM_REMOVED_MESSAGE =
  "You were removed from the webcam room, or this link has expired. Open the webcam from the tournament chat to join again.";
export const WEBCAM_DROPPED_MESSAGE =
  "Connection dropped. Tap Join call to reconnect.";
