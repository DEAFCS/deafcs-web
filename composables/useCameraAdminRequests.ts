import { reactive } from "vue";
import { fetchCameraPlayers } from "~/composables/useCameraApi";

// Shared, ref-counted "who currently has a pending spot check" state
// for the (⋮) menu's Request/Stop camera toggle (LineupOverviewRow).
// A full scoreboard mounts one row per player, all for the same
// match -- without this, each row would independently poll
// GET admin/:matchId/players on its own timer, ie. N duplicate
// requests every tick for an N-player match. Every row instead shares
// one poll loop per matchId, torn down once the last row unmounts.

type MatchRequestState = {
  data: Record<string, boolean>; // steamId -> requested
  refCount: number;
  timer: ReturnType<typeof setInterval> | null;
  loading: boolean;
};

const registry = new Map<string, MatchRequestState>();

function getOrCreate(matchId: string): MatchRequestState {
  let entry = registry.get(matchId);
  if (!entry) {
    entry = reactive({
      data: {},
      refCount: 0,
      timer: null,
      loading: false,
    }) as MatchRequestState;
    registry.set(matchId, entry);
  }
  return entry;
}

async function refresh(matchId: string): Promise<void> {
  const entry = registry.get(matchId);
  if (!entry || entry.loading) return;
  entry.loading = true;
  try {
    const { lineup_1, lineup_2 } = await fetchCameraPlayers(matchId);
    const next: Record<string, boolean> = {};
    for (const player of [...lineup_1.players, ...lineup_2.players]) {
      next[player.steamId] = player.requested;
    }
    entry.data = next;
  } catch {
    // Best-effort -- keep the last known state on a transient failure
    // rather than flashing the toggle back to "Request camera".
  } finally {
    entry.loading = false;
  }
}

export function subscribeCameraAdminRequests(matchId: string) {
  const entry = getOrCreate(matchId);
  entry.refCount += 1;
  if (entry.refCount === 1) {
    refresh(matchId);
    entry.timer = setInterval(() => refresh(matchId), 5000);
  }
  return {
    unsubscribe() {
      entry.refCount -= 1;
      if (entry.refCount <= 0) {
        if (entry.timer) clearInterval(entry.timer);
        registry.delete(matchId);
      }
    },
  };
}

export function isCameraRequested(matchId: string, steamId: string): boolean {
  return !!registry.get(matchId)?.data?.[String(steamId)];
}

// Flips the toggle instantly on the admin's own click, without waiting
// for the next 5s poll tick to confirm it server-side.
export function setCameraRequestedOptimistic(
  matchId: string,
  steamId: string,
  value: boolean,
): void {
  const entry = getOrCreate(matchId);
  entry.data = { ...entry.data, [String(steamId)]: value };
}
