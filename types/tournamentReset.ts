// The match a tournament reset acts on: the fields the winner choice needs.
// Both the bracket card and the match page pass the match they already have.
export type ResetMatch = {
  id: string;
  lineup_1_id?: string | null;
  lineup_2_id?: string | null;
  lineup_1?: { id?: string | null; name?: string | null } | null;
  lineup_2?: { id?: string | null; name?: string | null } | null;
};
