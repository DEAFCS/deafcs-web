// Pure logic behind the /play matchmaking hero: how a mode's seats fill for a
// party, and which state the hero is in. Kept out of the components so the
// rules are testable without the stores and the socket (5Stack's
// matchmakingHero, 5stackgg/web d12ef01b).
//
// DEAFCS: a party never fills both sides (no in-house matches), and a mode's
// own limit decides how many seats a party may take (Captain Pick 1, the
// Competitive cap), so the seats take that limit. The hero also knows
// DEAFCS's verification, closed, website-restriction and Captain Pick draft
// states.

export type SeatLayout = {
  perSide: number;
  // Your party's seats on your side (top row).
  mine: number;
  // Hollow red seats past the end of your row: the part of the party the
  // mode can't take.
  overflow: number;
  // Seats on the other side: always 0 in DEAFCS (kept for upstream parity).
  theirs: number;
};

// `party` is 0 for a guest, so nothing is yours. `limit` is the biggest party
// the mode accepts (modePartyLimit); it defaults to one side.
export function seatLayout(
  expected: number,
  party: number,
  limit?: number,
): SeatLayout {
  const perSide = Math.max(1, Math.floor(expected / 2));
  const fits = Math.min(perSide, limit ?? perSide);
  return {
    perSide,
    mine: Math.min(party, fits),
    overflow: Math.max(0, party - fits),
    theirs: 0,
  };
}

export type HeroState =
  | "guest"
  | "unverified"
  | "banned"
  | "cooldown"
  | "captain-pick"
  | "match"
  | "found"
  | "searching"
  | "restricted"
  | "closed"
  | "member"
  | "no-region"
  | "idle";

export type HeroInputs = {
  // The matchmaking switch, for everyone.
  matchmakingEnabled: boolean;
  // This account meets matchmaking_min_role (DEAFCS verification).
  roleAllowed: boolean;
  isGuest: boolean;
  isBanned: boolean;
  hasCooldown: boolean;
  // Read-only website restriction (DEAFCS).
  isRestricted: boolean;
  // Committed to a Captain Pick draft that has no match yet (DEAFCS).
  inCaptainPick: boolean;
  // A ready check is pending or its match was created.
  hasConfirmation: boolean;
  // The confirmation's match has loaded.
  hasMatch: boolean;
  isSearching: boolean;
  // Node regions exist but every one is over the player's latency limit.
  noRegions: boolean;
  // In a party that someone else leads.
  isMember: boolean;
};

// Order matters: a sanction outranks the queue, a match outranks the ready
// check that produced it, and the ready check outranks the search under it.
// DEAFCS: the hero is never hidden. Verification outranks everything a signed
// in player sees (it is worth doing even while matchmaking is closed), and a
// party member hears that the leader starts the search before the closed
// notice, as /play always said.
export function heroState(inputs: HeroInputs): HeroState {
  if (inputs.isGuest) return "guest";
  if (!inputs.roleAllowed) return "unverified";
  if (inputs.isBanned) return "banned";
  if (inputs.hasCooldown) return "cooldown";
  if (inputs.inCaptainPick) return "captain-pick";
  if (inputs.hasConfirmation && inputs.hasMatch) return "match";
  if (inputs.hasConfirmation) return "found";
  if (inputs.isSearching) return "searching";
  if (inputs.isRestricted) return "restricted";
  if (inputs.isMember) return "member";
  if (!inputs.matchmakingEnabled) return "closed";
  if (inputs.noRegions) return "no-region";
  return "idle";
}

// The hero swaps between three shapes; everything that isn't a search or a
// match is the mode picker with a different footer.
export function heroShape(state: HeroState): "picker" | "search" | "match" {
  if (state === "searching" || state === "found") return "search";
  if (state === "match" || state === "captain-pick") return "match";
  return "picker";
}

// Latency arrives as a fixed-2 string; the hero shows whole milliseconds.
export function roundedPing(latency: string | undefined): number | null {
  if (latency === undefined) return null;
  const value = Number(latency);
  // A LAN answers in under a millisecond; "0 ms" reads as broken.
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : null;
}
