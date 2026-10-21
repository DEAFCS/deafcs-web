// Check-in status for a "Your Tournament" card. The homepage only reports and
// links; checking in happens in the tournament page's TournamentCheckInPanel,
// which is the reference for every rule below (window edges, modes, who may
// act). Kept free of `~/` imports so the node tests can load it directly.

export type CheckInMode = "Captains" | "Players" | "Admin";

export type HomeCheckInState = "upcoming" | "open" | "done" | "missed";

export type HomeCheckIn = {
  state: HomeCheckInState;
  mode: CheckInMode;
  opensAt: Date | null;
  closesAt: Date | null;
  // The viewer can act right now: the tournament page shows them a check-in
  // (or, for an Admin-mode organizer, mark-present) button.
  canAct: boolean;
  actionLabel: string | null;
  // Who the status is about, for the wording.
  role: "free_agent" | "captain" | "teammate" | "player" | "organizer";
  // Players mode: the team rolls up once min_players_per_lineup confirm.
  teamProgress: { checkedIn: number; needed: number; meCheckedIn: boolean } | null;
};

type Roster = { player_steam_id?: unknown; checked_in_at?: string | null };

export type HomeCheckInInput = {
  tournament: {
    start?: string | null;
    status?: string | null;
    registration_version?: number | null;
    check_in_required?: boolean | null;
    check_in_setting?: string | null;
    check_in_opens_before_minutes?: number | null;
    check_in_closes_before_minutes?: number | null;
    check_in_ends_at?: string | null;
    check_in_started?: boolean | null;
    min_players_per_lineup?: number | null;
    is_organizer?: boolean | null;
  };
  team?: {
    checked_in_at?: string | null;
    can_manage?: boolean | null;
    roster?: Roster[] | null;
  } | null;
  freeAgent?: { status?: string | null; checked_in_at?: string | null } | null;
  steamId: string;
  now: Date;
};

const STARTED_STATUSES = ["Live", "Paused", "Finished", "Cancelled", "CancelledMinTeams"];

function ms(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

// TournamentCheckInPanel: the open edge is start minus the offset; the close
// edge prefers check_in_ends_at (stamped when the job opens the window).
export function checkInWindow(tournament: HomeCheckInInput["tournament"]) {
  const start = ms(tournament.start);
  const opensBefore = tournament.check_in_opens_before_minutes;
  const closesBefore = tournament.check_in_closes_before_minutes;
  const opensAt = start !== null && opensBefore != null ? start - Number(opensBefore) * 60_000 : null;
  const closesAt =
    ms(tournament.check_in_ends_at) ??
    (start !== null && closesBefore != null ? start - Number(closesBefore) * 60_000 : null);
  return { opensAt, closesAt };
}

export function homeCheckIn(input: HomeCheckInInput): HomeCheckIn | null {
  const { tournament, steamId } = input;
  const now = input.now.getTime();

  // Check-in off: nothing to say. The panel (and so this) is the unified
  // registration flow only; legacy individual sign-ups have their own window.
  if (tournament.check_in_required !== true || tournament.registration_version !== 2) {
    return null;
  }
  // Once the tournament is under way the check-in phase is over and the card
  // shows progress instead.
  if (STARTED_STATUSES.includes(String(tournament.status))) return null;

  const mode = (["Players", "Admin"].includes(String(tournament.check_in_setting))
    ? tournament.check_in_setting
    : "Captains") as CheckInMode;
  const { opensAt, closesAt } = checkInWindow(tournament);
  // check_in_started is a one-way server latch; the local clock may only make
  // the window earlier, never reopen it.
  const started = tournament.check_in_started === true || (opensAt !== null && now >= opensAt);
  const open = started && closesAt !== null && now < closesAt;
  const closed = started && !open;

  const base = {
    mode,
    opensAt: opensAt === null ? null : new Date(opensAt),
    closesAt: closesAt === null ? null : new Date(closesAt),
    teamProgress: null,
  };
  const stateOf = (checkedIn: boolean): HomeCheckInState =>
    checkedIn ? "done" : closed ? "missed" : open ? "open" : "upcoming";

  const team = input.team ?? null;

  // An Admin-mode organizer marks every team present; that stays open for
  // them even after their own team is in.
  if (mode === "Admin" && tournament.is_organizer === true && open) {
    return { ...base, state: "open", canAct: true, actionLabel: "Mark teams present", role: "organizer" };
  }

  // An undrafted free agent checks in for themself; the mode never gates it.
  if (!team && input.freeAgent) {
    const state = stateOf(!!input.freeAgent.checked_in_at);
    const canAct = state === "open";
    return { ...base, state, canAct, actionLabel: canAct ? "Check in" : null, role: "free_agent" };
  }

  if (!team) return null;

  const teamCheckedIn = !!team.checked_in_at;
  const state = stateOf(teamCheckedIn);
  const roster = team.roster ?? [];
  const mine = roster.find((member) => String(member.player_steam_id) === steamId);

  if (mode === "Players") {
    const needed = Math.max(0, Number(tournament.min_players_per_lineup) || 0);
    const checkedIn = roster.filter((member) => !!member.checked_in_at).length;
    const canAct = state === "open" && !!mine && !mine.checked_in_at;
    return {
      ...base,
      state,
      canAct,
      actionLabel: canAct ? "Check in" : null,
      role: "player",
      teamProgress: { checkedIn, needed, meCheckedIn: !!mine?.checked_in_at },
    };
  }

  if (mode === "Admin") {
    return { ...base, state, canAct: false, actionLabel: null, role: "player" };
  }

  // Captains: whoever may manage the team (captain, owner, roster Admin).
  const manages = team.can_manage === true;
  const canAct = state === "open" && manages;
  return {
    ...base,
    state,
    canAct,
    actionLabel: canAct ? "Check in team" : null,
    role: manages ? "captain" : "teammate",
  };
}

export type CheckInText = {
  value: string;
  tone: "hot" | "ok" | "muted";
};

// `format` turns a Date into the card's time text (formatStartTime on the
// card, a fixed formatter in the tests).
export function checkInText(checkIn: HomeCheckIn, format: (date: Date) => string): CheckInText {
  const opens = checkIn.opensAt ? format(checkIn.opensAt) : null;
  const closes = checkIn.closesAt ? format(checkIn.closesAt) : null;
  const until = closes ? ` until ${closes}` : "";

  switch (checkIn.state) {
    case "upcoming":
      return {
        value: opens && closes ? `Opens ${opens}, closes ${closes}` : opens ? `Opens ${opens}` : "Check-in required",
        tone: "muted",
      };
    case "done":
      return {
        value: checkIn.role === "teammate" ? "Your captain checked the team in" : checkIn.role === "free_agent" ? "Checked in (free agent)" : "Checked in",
        tone: "ok",
      };
    case "missed":
      return {
        value: checkIn.role === "free_agent" ? "Check-in missed" : "Check-in missed by the team",
        tone: "muted",
      };
    case "open": {
      if (checkIn.role === "organizer") return { value: `Open${until}. Mark teams present`, tone: "hot" };
      if (checkIn.mode === "Admin") return { value: `Open${until}. An admin marks teams present`, tone: "muted" };
      if (checkIn.role === "teammate") return { value: `Open${until}. Your captain checks in the team`, tone: "muted" };
      const progress = checkIn.teamProgress;
      if (progress?.meCheckedIn) {
        return {
          value: `You are checked in. Team ${progress.checkedIn}/${progress.needed}${until}`,
          tone: "ok",
        };
      }
      return { value: `Open${until}`, tone: "hot" };
    }
  }
}
