// Match actions the viewer must take right now, for ActionToasts. Derived
// only from the viewer's own matches subscription (MatchLobbyStore.myMatches):
// every flag here is the server's (can_check_in, checked_in, is_ready,
// can_pick_map_veto, can_pick_region_veto), so nothing is decided client-side.
//
// One item per match and action. Its id stays the same while the action is
// open (repeated subscription updates never re-toast) and the item disappears
// once the server says it is done, so a later turn is a new notification.

export type MatchActionKind = "check_in" | "region_veto" | "map_veto";

export type MatchAction = {
  id: string;
  matchId: string;
  kind: MatchActionKind;
  // Where Open Match goes: the match page, or the draft room for a
  // draft-created match (the match page redirects there anyway).
  target: string;
};

type Lineup = {
  name?: string | null;
  is_on_lineup?: boolean | null;
  is_ready?: boolean | null;
  can_pick_map_veto?: boolean | null;
  can_pick_region_veto?: boolean | null;
  lineup_players?: Array<{ steam_id: string | number; checked_in?: boolean | null }> | null;
} | null;

type MyMatch = {
  id: string;
  status?: string | null;
  is_in_lineup?: boolean | null;
  can_check_in?: boolean | null;
  lineup_1?: Lineup;
  lineup_2?: Lineup;
  draft_games?: Array<{ id: string }> | null;
};

export function matchActions(
  matches: MyMatch[] | null | undefined,
  mySteamId: string | number | null | undefined,
): MatchAction[] {
  if (!mySteamId) return [];
  const me = String(mySteamId);
  const actions: MatchAction[] = [];
  for (const match of matches ?? []) {
    // Players only: organizers and spectators never get these.
    if (!match.is_in_lineup) continue;
    const mine = [match.lineup_1, match.lineup_2].find((lineup) => lineup?.is_on_lineup) ?? null;
    if (!mine) continue;
    const draftId = match.draft_games?.[0]?.id;
    const target = draftId ? `/draft-room/${draftId}` : `/matches/${match.id}`;
    const add = (kind: MatchActionKind) =>
      actions.push({ id: `match-${kind}:${match.id}`, matchId: match.id, kind, target });

    if (match.status === "WaitingForCheckIn") {
      const myRow = (mine.lineup_players ?? []).find((p) => String(p.steam_id) === me);
      // Eligible (Players: any player; Captains: the captain), not checked in
      // yet, and the team still needs it.
      if (match.can_check_in && myRow && !myRow.checked_in && !mine.is_ready) {
        add("check_in");
      }
    } else if (match.status === "Veto") {
      // Only the acting captain's lineup has these, and only on its turn.
      if (mine.can_pick_region_veto) add("region_veto");
      else if (mine.can_pick_map_veto) add("map_veto");
    }
  }
  return actions;
}

/** The viewer already has the action in front of them. */
export function onActionPage(action: MatchAction, path: string): boolean {
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "");
  return clean === action.target || clean === `/matches/${action.matchId}`;
}
