import { reactive } from "vue";
import type { CaptainPickDraftState } from "~/utilities/captainPickDraft";

// A projection of the existing draft, never a second authoritative state model.
export type CaptainPickProgress = Pick<
  CaptainPickDraftState,
  | "phase"
  | "captains"
  | "participants"
  | "lineups"
  | "available"
  | "pickIndex"
  | "pickOrder"
  | "pickingLineup"
>;

export function createCaptainPickProgress(apiDomain: string) {
  const state = reactive<{
    matchId: string | null;
    progress: CaptainPickProgress | null;
  }>({
    matchId: null,
    progress: null,
  });
  let source: EventSource | null = null;

  function stop() {
    source?.close();
    source = null;
    state.matchId = null;
    state.progress = null;
  }

  function update(match: { id?: string; status?: string } | null | undefined) {
    if (!match?.id || match.status !== "PickingPlayers") {
      stop();
      return;
    }
    if (state.matchId === match.id) return;
    stop();
    state.matchId = match.id;
    if (typeof EventSource === "undefined") return;
    const current = new EventSource(
      `https://${apiDomain}/matchmaking/captain-pick/${encodeURIComponent(match.id)}/progress`,
    );
    source = current;
    current.onmessage = (event) => {
      if (source !== current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.matchId !== state.matchId) return;
        state.progress =
          data.active && !data.completed ? (data.progress ?? null) : null;
        if (data.completed) {
          current.close();
          source = null;
        }
      } catch {
        state.progress = null;
      }
    };
    // Native EventSource retries and gets a fresh Redis snapshot. Hide stale picks.
    current.onerror = () => {
      if (source === current) state.progress = null;
    };
  }
  return { state, update, stop };
}
