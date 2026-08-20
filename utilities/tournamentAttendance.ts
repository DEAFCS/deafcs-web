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
