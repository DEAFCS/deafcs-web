// Open Registration is refused when the tournament's start time has passed (a
// tournament returned to Setup keeps its old start). The backend simply answers
// "not allowed", so the Manage menu would show nothing at all; this names that
// one reason. Every other refusal keeps the action hidden as before.
const STATUSES_THAT_CAN_REOPEN = [
  "Setup",
  "RegistrationClosed",
  "Cancelled",
  "CancelledMinTeams",
];

export function openRegistrationBlockedByStart(
  tournament: Record<string, any> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!tournament || !tournament.is_organizer || tournament.can_open_registration) {
    return false;
  }

  if (!STATUSES_THAT_CAN_REOPEN.includes(tournament.status)) {
    return false;
  }

  return !!tournament.start && new Date(tournament.start).getTime() <= now;
}
