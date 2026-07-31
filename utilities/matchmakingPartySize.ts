import { e_match_types_enum } from "~/generated/zeus";

/**
 * Total players a queueable match type needs (both lineups combined).
 * Premier and Faceit are demo-import only — they are never matchmade.
 */
export const EXPECTED_PLAYERS: Partial<Record<e_match_types_enum, number>> = {
  [e_match_types_enum.Duel]: 2,
  [e_match_types_enum.Wingman]: 4,
  [e_match_types_enum.Competitive]: 10,
};

/**
 * A party may only queue a match type if it fits inside a single lineup (half
 * the match, so the other half gets filled by matchmaking). A full-size party
 * filling both lineups on its own used to be allowed as an "in-house scrim",
 * but that let a party guarantee its own match outcome (ELO farming), so it's
 * disallowed entirely regardless of match type.
 *
 * Competitive additionally has its own admin-configurable cap (default 5) —
 * a full 5-stack of strong players queueing together against a non-full-stack
 * team is unfair, so admins can lower how many can party up for Competitive.
 *
 * Wingman (4): 1-2 · Competitive (10): 1-5 (admin-configurable) · Duel (2): 1
 */
export function canPartyQueue(
  type: e_match_types_enum,
  partySize: number,
  maxCompetitivePartySize = 5,
): boolean {
  const expected = EXPECTED_PLAYERS[type];

  if (!expected) {
    return true;
  }

  const limit =
    type === e_match_types_enum.Competitive
      ? Math.min(expected / 2, maxCompetitivePartySize)
      : expected / 2;

  return partySize <= limit;
}
