// Shared "tournament attendance" check-in window -- computed purely from
// tournament.start plus the two configurable offsets
// (attendance_check_in_open_before_minutes / _close_before_minutes), the
// same fields the backend scheduler (ProcessTournamentAttendance) derives
// its own open/close cutoffs from. Deliberately independent of whether the
// backend has actually opened the window yet (individual_check_in_ends_at),
// so the card/detail-page copy can show the scheduled window even before it
// opens.

export type TournamentAttendanceTiming = {
  start?: string | null;
  attendance_check_in_open_before_minutes?: number | null;
  attendance_check_in_close_before_minutes?: number | null;
  // Present on the fuller tournament objects the detail page loads; used by
  // the visibility helpers below, which tolerate their absence.
  status?: string | null;
  individual_check_in_ends_at?: string | null;
};

export type AttendanceWindow = {
  opensAt: Date;
  closesAt: Date;
};

const DEFAULT_OPEN_BEFORE_MINUTES = 60;
const DEFAULT_CLOSE_BEFORE_MINUTES = 15;

export function attendanceWindow(
  tournament?: TournamentAttendanceTiming | null,
): AttendanceWindow | null {
  if (!tournament?.start) {
    return null;
  }
  const start = new Date(tournament.start);
  if (Number.isNaN(start.getTime())) {
    return null;
  }
  const openBefore =
    tournament.attendance_check_in_open_before_minutes ??
    DEFAULT_OPEN_BEFORE_MINUTES;
  const closeBefore =
    tournament.attendance_check_in_close_before_minutes ??
    DEFAULT_CLOSE_BEFORE_MINUTES;

  return {
    opensAt: new Date(start.getTime() - openBefore * 60_000),
    closesAt: new Date(start.getTime() - closeBefore * 60_000),
  };
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

// "18:00-18:45" -- compact range for cards/lists.
export function formatAttendanceWindowRange(
  tournament?: TournamentAttendanceTiming | null,
): string | null {
  const window = attendanceWindow(tournament);
  if (!window) {
    return null;
  }
  return `${formatClockTime(window.opensAt)}–${formatClockTime(window.closesAt)}`;
}

// --- Attendance status visibility -------------------------------------------
//
// Attendance state (checked in / still pending) is public: every registered
// team and every Solo Random signup already exposes checked_in_at to the
// `guest` select permission, so anyone looking at the tournament can see who
// has confirmed. The value of showing it is that it is scannable at a glance,
// which only works if every participant carries a status, not just your own.
//
// Lifecycle, deliberately narrow so the badges are information rather than
// clutter:
//
//   RegistrationOpen  - shown from the moment the window opens. Before that,
//                       nobody has been asked to check in yet, so a wall of
//                       "Pending check-in" would be misleading.
//   RegistrationClosed- still shown. This is the pre-start period where
//                       attendance has just been finalized and users most
//                       need to see that the surviving participants really
//                       did check in.
//   Live / Finished / - hidden. Every remaining participant checked in by
//   Cancelled           definition, so the badge stops carrying information
//                       and the bracket becomes the story.
const ATTENDANCE_VISIBLE_STATUSES = ["RegistrationOpen", "RegistrationClosed"];

// The scheduled window is currently open. Keyed off the backend's
// individual_check_in_ends_at (the same field the check-in actions validate
// against) rather than the derived schedule, so the button only appears when
// the backend would actually accept a check-in.
export function attendanceCheckInOpen(
  tournament?: TournamentAttendanceTiming | null,
): boolean {
  const endsAt = tournament?.individual_check_in_ends_at;
  return !!endsAt && new Date(endsAt) > new Date();
}

// The window has opened at some point -- currently open, or already closed.
// Accepts either signal: the backend having stamped
// individual_check_in_ends_at, or the derived schedule's open time having
// passed (which covers the seconds before ProcessTournamentAttendance's next
// pass).
export function attendanceCheckInOpened(
  tournament?: TournamentAttendanceTiming | null,
): boolean {
  if (tournament?.individual_check_in_ends_at) {
    return true;
  }
  const window = attendanceWindow(tournament);
  return !!window && window.opensAt <= new Date();
}

export function showAttendanceStatuses(
  tournament?: TournamentAttendanceTiming | null,
): boolean {
  if (!tournament?.status) {
    return false;
  }
  if (!ATTENDANCE_VISIBLE_STATUSES.includes(tournament.status)) {
    return false;
  }
  return attendanceCheckInOpened(tournament);
}

// --- Solo Random finalization -----------------------------------------------
//
// Two things need to know when a Solo Random tournament's participant pool has
// been finalized, and both are derived from data the page already loads rather
// than any new column or status:
//
//   * Generated teams. Team generation creates tournament_teams rows and
//     stamps each selected signup with tournament_team_id, but never sets the
//     team's own checked_in_at -- those players completed tournament
//     attendance individually, before the team existed. Reading the team ids
//     back off the signups identifies generated teams from real data instead
//     of guessing at names like "Team 1".
//
//   * Sitting out. Generation assigns as many players as fill whole teams and
//     leaves the remainder Waitlisted. Before the cutoff, Waitlisted means
//     "a spot may still open". Once teams exist it means the opposite: the
//     pool is final and this player is sitting out. The presence of generated
//     teams is what separates the two, so no "not_selected" status is needed.

export type TournamentSignupLike = {
  player_steam_id?: string | number | null;
  status?: string | null;
  checked_in_at?: string | null;
  tournament_team_id?: string | null;
};

// Team ids that came out of Solo Random generation.
export function generatedTeamIds(
  signups?: Array<TournamentSignupLike> | null,
): Set<string> {
  const ids = new Set<string>();
  for (const signup of signups ?? []) {
    if (signup?.tournament_team_id) {
      ids.add(String(signup.tournament_team_id));
    }
  }
  return ids;
}

// Have Solo Random teams been generated yet? Only meaningful for individual
// registration; a team tournament's teams are registered, not generated.
export function soloRandomTeamsGenerated(
  signups?: Array<TournamentSignupLike> | null,
): boolean {
  return generatedTeamIds(signups).size > 0;
}

// This signup is finalized and sitting out: teams have been generated and it
// did not get one. Deliberately does NOT require checked_in_at -- a player who
// was Waitlisted from the start sits out for the same reason and should get
// the same explanation, not silence.
export function isFinalizedSitOut(
  signup?: TournamentSignupLike | null,
  signups?: Array<TournamentSignupLike> | null,
): boolean {
  if (!signup) {
    return false;
  }
  if (signup.tournament_team_id) {
    return false;
  }
  if (signup.status !== "Waitlisted") {
    return false;
  }
  return soloRandomTeamsGenerated(signups);
}

// --- Schedule freeze --------------------------------------------------------
//
// The four organizer-editable values that define the attendance schedule are
// the tournament's start (date and time, one control) plus the two offsets.
// Once the window has opened, the scheduler and every registered participant
// are already acting on it, so changing any of them retroactively moves a
// window that is currently in force. Live testing produced exactly that
// confusion.
//
// Delegates to attendanceCheckInOpened rather than recomputing anything, so
// the lock can never disagree with the badge/panel lifecycle. Naturally
// one-way for the tournament's life: opensAt stays in the past once reached,
// and the backend stamp only ever confirms it, so the fields never quietly
// become editable again after the window has passed.
//
// Callers must pass the PERSISTED tournament, never live form values --
// otherwise an organizer could push the start into the future and unfreeze
// themselves. The backend enforces the same rule against OLD values.
export function isAttendanceScheduleFrozen(
  tournament?: TournamentAttendanceTiming | null,
): boolean {
  return attendanceCheckInOpened(tournament);
}

// --- Individual leave eligibility -------------------------------------------
//
// One rule for every "leave this Solo Random tournament" control, mirroring
// what removeTournamentIndividualPlayer already enforces server-side.
//
// Being checked in deliberately does NOT block leaving: a player may register,
// check in, change their mind and leave, right up until the participant pool
// is finalized. The header button used to disable itself for the whole
// attendance window, which is why it disagreed with the player row.
export function canLeaveIndividualTournament(
  signup?: TournamentSignupLike | null,
  tournament?: { status?: string | null } | null,
): boolean {
  if (!signup || !tournament) {
    return false;
  }
  // The registration/check-in cutoff is the RegistrationOpen ->
  // RegistrationClosed transition, so the status is the cutoff.
  if (tournament.status !== "RegistrationOpen") {
    return false;
  }
  // Assigned to a generated team: they are in the bracket now.
  if (signup.tournament_team_id) {
    return false;
  }
  return signup.status === "Registered" || signup.status === "Waitlisted";
}
