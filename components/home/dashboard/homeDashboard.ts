// Shared pieces of the signed-in homepage dashboard (components/home/
// dashboard). Panels use the same muted vertical gradient as the /play
// matchmaking hero and mode tiles, with a light blur so the page reads as
// one glass surface over the DEAFCS background.

export const homePanelClasses =
  "relative isolate min-w-0 overflow-hidden rounded-xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--muted)/0.26),hsl(var(--muted)/0.07))] shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)] backdrop-blur-md";

export const homePanelPaddingClasses = "p-4 sm:p-5";

export const homeEmptyClasses =
  "flex items-center gap-2.5 rounded-lg border border-dashed border-border/70 px-4 py-3 text-[13px] text-muted-foreground";

// Who the dashboard is for. `preview` is the dev-only logged-out preview
// (pages/index.vue ?previewHome=logged-in); `samples` additionally fills
// empty sections with clearly labelled local sample data (dev only).
export type HomeViewer = {
  steamId: string;
  name: string;
  preview: boolean;
  samples: boolean;
};

export const SAMPLE_BADGE_TEXT = "Sample data · local preview only";

// Statuses where a match still needs the player (same set as the header's
// "my matches" lobby nav, MatchLobbyStore.subscribeToMyMatches).
export const ACTIVE_MATCH_STATUSES = [
  "Scheduled",
  "WaitingForCheckIn",
  "Veto",
  "WaitingForServer",
  "PickingPlayers",
  "Live",
] as const;

// `steamId` is usually a zeus $("steam_id", "bigint!") variable.
export function lineupHasPlayer(steamId: unknown) {
  return {
    _or: [
      { lineup_1: { lineup_players: { steam_id: { _eq: steamId } } } },
      { lineup_2: { lineup_players: { steam_id: { _eq: steamId } } } },
    ],
  };
}

export function formatCount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat().format(value)
    : "-";
}

// Runs `load` once the element is close to the viewport, for sections below
// the fold (no request until the player scrolls towards them).
export function whenNearViewport(
  el: Element | null | undefined,
  load: () => void,
): () => void {
  if (!el || typeof IntersectionObserver === "undefined") {
    load();
    return () => {};
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        load();
      }
    },
    { rootMargin: "400px 0px" },
  );
  observer.observe(el);
  return () => observer.disconnect();
}
