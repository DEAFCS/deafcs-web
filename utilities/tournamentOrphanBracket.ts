// A bracket slot that was played (finished) whose match row no longer exists:
// the winner already moved to the next round, but there is no match to reset.
// This is the one state that needs the repair action. An unfinished slot with
// both teams is picked up by the scheduler again once it has a schedule, and a
// bye has no match at all.
export function isOrphanedBracket(
  bracket:
    | {
        match?: unknown;
        bye?: boolean;
        finished?: boolean;
        team_1?: unknown;
        team_2?: unknown;
      }
    | null
    | undefined,
): boolean {
  return (
    !!bracket &&
    !bracket.match &&
    !bracket.bye &&
    bracket.finished === true &&
    !!bracket.team_1 &&
    !!bracket.team_2
  );
}
