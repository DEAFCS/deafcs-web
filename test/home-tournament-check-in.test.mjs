import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { checkInText, checkInWindow, homeCheckIn } from "../components/home/dashboard/homeTournamentCheckIn.ts";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

// Start 20:00; window 19:00 -> 19:45 (opens 60, closes 15 minutes before).
const START = "2026-10-23T20:00:00.000Z";
const BEFORE = new Date("2026-10-23T18:00:00.000Z");
const DURING = new Date("2026-10-23T19:10:00.000Z");
const AFTER = new Date("2026-10-23T19:50:00.000Z");
const ME = "76561198000000009";

function tournament(over = {}) {
  return {
    start: START,
    status: "RegistrationClosed",
    registration_version: 2,
    check_in_required: true,
    check_in_setting: "Captains",
    check_in_opens_before_minutes: 60,
    check_in_closes_before_minutes: 15,
    check_in_ends_at: null,
    check_in_started: false,
    min_players_per_lineup: 5,
    is_organizer: false,
    ...over,
  };
}
function team(over = {}) {
  return {
    checked_in_at: null,
    can_manage: false,
    roster: [ME, "2", "3", "4", "5"].map((player_steam_id) => ({ player_steam_id, checked_in_at: null })),
    ...over,
  };
}
const fmt = (date) => date.toISOString().slice(11, 16);
const run = (t, tm, now, extra = {}) => homeCheckIn({ tournament: t, team: tm, steamId: ME, now, ...extra });

test("check-in disabled: nothing is shown", () => {
  assert.equal(run(tournament({ check_in_required: false }), team(), DURING), null);
});

test("legacy registration (version 1) is left to its own check-in", () => {
  assert.equal(run(tournament({ registration_version: 1 }), team(), DURING), null);
});

test("once the tournament has started the check-in phase is not shown", () => {
  for (const status of ["Live", "Paused", "Finished"]) {
    assert.equal(run(tournament({ status }), team(), AFTER), null);
  }
});

test("window edges follow TournamentCheckInPanel, the stamped close wins", () => {
  const w = checkInWindow(tournament());
  assert.equal(new Date(w.opensAt).toISOString(), "2026-10-23T19:00:00.000Z");
  assert.equal(new Date(w.closesAt).toISOString(), "2026-10-23T19:45:00.000Z");
  const stamped = checkInWindow(tournament({ check_in_ends_at: "2026-10-23T19:40:00.000Z" }));
  assert.equal(new Date(stamped.closesAt).toISOString(), "2026-10-23T19:40:00.000Z");
});

test("upcoming shows opening and closing times, no action", () => {
  const c = run(tournament(), team({ can_manage: true }), BEFORE);
  assert.equal(c.state, "upcoming");
  assert.equal(c.canAct, false);
  assert.deepEqual(checkInText(c, fmt), { value: "Opens 19:00, closes 19:45", tone: "muted" });
});

test("the server latch opens the window even before the local clock", () => {
  const c = run(tournament({ check_in_started: true }), team({ can_manage: true }), new Date("2026-10-23T18:59:00Z"));
  assert.equal(c.state, "open");
});

test("Captains mode: the captain (can_manage) gets the action", () => {
  const c = run(tournament(), team({ can_manage: true }), DURING);
  assert.equal(c.state, "open");
  assert.equal(c.canAct, true);
  assert.equal(c.actionLabel, "Check in team");
  assert.deepEqual(checkInText(c, fmt), { value: "Open until 19:45", tone: "hot" });
});

test("Captains mode: a teammate is told the captain checks in, no action", () => {
  const c = run(tournament(), team(), DURING);
  assert.equal(c.canAct, false);
  assert.equal(c.actionLabel, null);
  assert.equal(checkInText(c, fmt).value, "Open until 19:45. Your captain checks in the team");
});

test("Captains mode: teammates see that the captain already checked the team in", () => {
  const c = run(tournament(), team({ checked_in_at: "2026-10-23T19:05:00Z" }), DURING);
  assert.equal(c.state, "done");
  assert.equal(c.canAct, false);
  assert.deepEqual(checkInText(c, fmt), { value: "Your captain checked the team in", tone: "ok" });
  const captain = run(tournament(), team({ can_manage: true, checked_in_at: "2026-10-23T19:05:00Z" }), DURING);
  assert.equal(checkInText(captain, fmt).value, "Checked in");
});

test("missed: the window closed without a team check-in", () => {
  const c = run(tournament(), team({ can_manage: true }), AFTER);
  assert.equal(c.state, "missed");
  assert.equal(c.canAct, false);
  assert.equal(checkInText(c, fmt).value, "Check-in missed by the team");
});

test("Players mode: each player checks in, with team progress", () => {
  const open = run(tournament({ check_in_setting: "Players" }), team(), DURING);
  assert.equal(open.canAct, true);
  assert.equal(open.actionLabel, "Check in");

  const roster = team().roster.map((m, i) => ({ ...m, checked_in_at: i < 3 ? "2026-10-23T19:05:00Z" : null }));
  const mine = run(tournament({ check_in_setting: "Players" }), team({ roster }), DURING);
  assert.equal(mine.canAct, false);
  assert.deepEqual(mine.teamProgress, { checkedIn: 3, needed: 5, meCheckedIn: true });
  assert.equal(checkInText(mine, fmt).value, "You are checked in. Team 3/5 until 19:45");

  // The trigger rolls the team up; then it is done for everyone.
  const done = run(tournament({ check_in_setting: "Players" }), team({ roster, checked_in_at: "2026-10-23T19:20:00Z" }), DURING);
  assert.equal(done.state, "done");
});

test("Players mode: a captain gets no extra power", () => {
  const roster = team().roster.map((m) => (m.player_steam_id === ME ? { ...m, checked_in_at: "x" } : m));
  const c = run(tournament({ check_in_setting: "Players" }), team({ can_manage: true, roster }), DURING);
  assert.equal(c.canAct, false);
});

test("Admin mode: players never get a check-in action", () => {
  for (const tm of [team(), team({ can_manage: true })]) {
    const c = run(tournament({ check_in_setting: "Admin" }), tm, DURING);
    assert.equal(c.canAct, false);
    assert.equal(checkInText(c, fmt).value, "Open until 19:45. An admin marks teams present");
  }
});

test("Admin mode: the organizer is sent to mark teams present, even when their team is in", () => {
  const c = run(
    tournament({ check_in_setting: "Admin", is_organizer: true }),
    team({ checked_in_at: "2026-10-23T19:05:00Z" }),
    DURING,
  );
  assert.equal(c.role, "organizer");
  assert.equal(c.canAct, true);
  assert.equal(c.actionLabel, "Mark teams present");
});

test("free agent without a team checks in for themself in every mode", () => {
  for (const mode of ["Captains", "Players", "Admin"]) {
    const c = run(tournament({ check_in_setting: mode }), null, DURING, { freeAgent: { status: "registered", checked_in_at: null } });
    assert.equal(c.role, "free_agent");
    assert.equal(c.canAct, true);
    assert.equal(c.actionLabel, "Check in");
  }
  const done = run(tournament(), null, DURING, { freeAgent: { status: "registered", checked_in_at: "2026-10-23T19:05:00Z" } });
  assert.equal(checkInText(done, fmt).value, "Checked in (free agent)");
  const missed = run(tournament(), null, AFTER, { freeAgent: { status: "registered", checked_in_at: null } });
  assert.equal(checkInText(missed, fmt).value, "Check-in missed");
});

test("no team and no free-agent row: nothing to report", () => {
  assert.equal(run(tournament(), null, DURING), null);
});

test("Your Tournament card: free agents, team stamps, action link, start time", async () => {
  const card = await read("../components/home/dashboard/HomeYourTournament.vue");
  // Free agents are found and kept out of team controls.
  assert.match(card, /free_agents: \{\s*player_steam_id: \{ _eq: \$\("steam_id", "bigint!"\) \},\s*status: \{ _neq: "withdrawn" \}/);
  assert.match(card, /freeAgent: team \? null : freeAgent/);
  // The team stamp, management right and roster stamps are read.
  assert.match(card, /checked_in_at: true,\s*can_manage: true,\s*roster: \[\{\}, \{ player_steam_id: true, checked_in_at: true \}\]/);
  // The action only links to the tournament page; no check-in mutation here.
  assert.match(card, /action = \{ label: checkIn\.actionLabel, to: `\/tournaments\/\$\{tournament\.id\}` \}/);
  assert.doesNotMatch(card, /checkIntoTournament|generateMutation/);
  // Start time is always shown; a started tournament says so.
  assert.match(card, /when: start \? formatStartTime\(tournament\.start, now\.value\) : null/);
  assert.match(card, /start > now\.value \? relativeWhen\(start, now\.value, t\) : "Started"/);
});
