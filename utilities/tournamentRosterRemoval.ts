// Whether the web should offer "Remove" for another player on a tournament
// roster. It mirrors what Hasura will actually accept (api-deafcs
// hasura/metadata/.../public_tournament_team_roster.yaml, delete_permissions)
// so the button never promises something the backend refuses:
//
//  - the people who manage the team may remove: the team owner, a team Admin,
//    the team captain, a tournament roster Admin, the tournament's organizers
//    (all of which the tournament page reports as `can_manage` / is_organizer);
//  - nobody removes once the tournament is Finished or Cancelled;
//  - once it is Live, only an organizer-role session may (the user roles are
//    locked out of Live);
//  - leaving yourself is a separate action, never "remove".
//
// The database still refuses a removal that would drop a seeded team below
// its starting lineup; the caller passes that lock separately.
export const ROSTER_CLOSED_STATUSES = ["Cancelled", "CancelledMinTeams", "Finished"];

export function canRemoveTournamentRosterMember(input: {
  status: string | null | undefined;
  isSelf: boolean;
  canManage: boolean;
  hasTournamentOrganizerRole: boolean;
}): boolean {
  if (input.isSelf || !input.canManage || !input.status) {
    return false;
  }
  if (ROSTER_CLOSED_STATUSES.includes(input.status)) {
    return false;
  }
  if (input.status === "Live" && !input.hasTournamentOrganizerRole) {
    return false;
  }
  return true;
}
