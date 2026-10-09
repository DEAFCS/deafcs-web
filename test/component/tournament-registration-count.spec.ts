import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tournamentRegistrationCount } from "../../utilities/tournamentRegistrationCount";

const cup = (over: Record<string, any> = {}, teams = 0, agents = 0, maxTeams = 8, type = "Competitive") => ({
  registration_version: 2,
  registration_type: "both",
  options: { type },
  stages: [{ max_teams: maxTeams }],
  teams_aggregate: { aggregate: { count: teams } },
  free_agents_aggregate: { aggregate: { count: agents } },
  ...over,
});

describe("tournament registration progress", () => {
  it("a Teams-only tournament still counts teams", () => {
    expect(tournamentRegistrationCount(cup({ registration_type: "teams" }, 11, 0, 12))).toEqual({
      count: 11,
      capacity: 12,
      unit: "teams",
    });
  });

  it("a Free Agents-only tournament counts players", () => {
    expect(tournamentRegistrationCount(cup({ registration_type: "free_agents" }, 0, 23, 8))).toEqual({
      count: 23,
      capacity: 40,
      unit: "players",
    });
  });

  it("Teams + Free Agents counts players: a team contributes its 5 active seats, not its 7 roster", () => {
    // 3 registered 5v5 teams (7 roster members each) + 8 Free Agents = 15 + 8.
    expect(tournamentRegistrationCount(cup({}, 3, 8, 8))).toEqual({ count: 23, capacity: 40, unit: "players" });
  });

  it("a 2v2 team with 4 roster players contributes 2", () => {
    expect(tournamentRegistrationCount(cup({}, 3, 2, 8, "Wingman"))).toEqual({ count: 8, capacity: 16, unit: "players" });
  });

  it("a 1v1 entry contributes 1", () => {
    expect(tournamentRegistrationCount(cup({}, 4, 3, 16, "Duel"))).toEqual({ count: 7, capacity: 16, unit: "players" });
  });

  it("the roster size never enters the count (the aggregate is teams, not players)", () => {
    const source = readFileSync(path.resolve(__dirname, "../../utilities/tournamentRegistrationCount.ts"), "utf8");
    expect(source).not.toMatch(/roster_aggregate|.rosterb/);
    const fields = readFileSync(path.resolve(__dirname, "../../graphql/tournamentCardFields.ts"), "utf8");
    expect(fields).not.toMatch(/roster_aggregate|broster:/);
  });

  it("the denominator is max teams x the match size", () => {
    expect(tournamentRegistrationCount(cup({}, 0, 0, 12)).capacity).toBe(60);
    expect(tournamentRegistrationCount(cup({}, 0, 0, 12, "Wingman")).capacity).toBe(24);
    expect(tournamentRegistrationCount(cup({}, 0, 0, 12, "Duel")).capacity).toBe(12);
  });

  it("never shows more than the capacity (waitlisted agents are beyond it)", () => {
    expect(tournamentRegistrationCount(cup({}, 7, 12, 8))).toEqual({ count: 40, capacity: 40, unit: "players" });
    expect(tournamentRegistrationCount(cup({ registration_type: "free_agents" }, 0, 50, 8))).toEqual({
      count: 40,
      capacity: 40,
      unit: "players",
    });
  });
});

describe("staff Free Agent controls", () => {
  it("are offered before registration opens, while it is open and in a held check-in review", () => {
    const source = readFileSync(path.resolve(__dirname, "../../components/tournament/TournamentFreeAgents.vue"), "utf8");
    const block = source.match(/const POOL_EDITABLE_STATUSES[\s\S]*?\];/)![0];
    for (const status of ["Setup", "RegistrationOpen", "CheckInReview"]) expect(block).toContain(status);
    for (const status of ["RegistrationClosed", "Live", "Finished"]) expect(block).not.toContain(status);
    expect(source).toMatch(/canAddToPool = computed[\s\S]*POOL_EDITABLE_STATUSES/);
    expect(source).toMatch(/canRemoveFromPool = computed[\s\S]*POOL_EDITABLE_STATUSES/);
    // Players leave on their own only in Setup / open registration, as before.
    expect(source).toMatch(/const canLeave = computed[\s\S]*?Setup,[\s\S]*?RegistrationOpen,\s*\]/);
  });
});
