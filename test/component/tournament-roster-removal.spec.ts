import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { canRemoveTournamentRosterMember } from "../../utilities/tournamentRosterRemoval";

// "Remove" must only be offered when the backend will accept it. The backend
// (Hasura delete permissions on tournament_team_roster, covered by
// api-deafcs test/tournament-substitute-roster-permissions.spec.ts) lets the
// team owner, a team Admin, the team captain, a tournament roster Admin and the
// organizers remove a player, until the tournament is Live (organizer-role
// sessions) or finished/cancelled (nobody). The minimum-lineup lock is applied
// separately by the row.
// Importing the row pulls in the generated GraphQL types, which is slow.
vi.setConfig({ testTimeout: 60_000 });

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const base = {
  status: "RegistrationOpen",
  isSelf: false,
  canManage: true,
  hasTournamentOrganizerRole: false,
};

describe("canRemoveTournamentRosterMember", () => {
  it("is offered to a team manager (owner, team Admin, captain, roster Admin, organizer) while registration is open", () => {
    expect(canRemoveTournamentRosterMember(base)).toBe(true);
  });

  it("is never offered to someone who cannot manage the team", () => {
    expect(canRemoveTournamentRosterMember({ ...base, canManage: false })).toBe(false);
  });

  it("is never offered on yourself (that is Leave)", () => {
    expect(canRemoveTournamentRosterMember({ ...base, isSelf: true })).toBe(false);
  });

  it.each(["Setup", "RegistrationOpen", "RegistrationClosed", "Paused", "CheckInReview"])(
    "is offered while the tournament is %s",
    (status) => {
      expect(canRemoveTournamentRosterMember({ ...base, status })).toBe(true);
    },
  );

  it.each(["Finished", "Cancelled", "CancelledMinTeams"])(
    "is hidden once the tournament is %s, even for an organizer role",
    (status) => {
      expect(canRemoveTournamentRosterMember({ ...base, status })).toBe(false);
      expect(
        canRemoveTournamentRosterMember({ ...base, status, hasTournamentOrganizerRole: true }),
      ).toBe(false);
    },
  );

  it("is hidden when Live, except for an organizer-role session", () => {
    expect(canRemoveTournamentRosterMember({ ...base, status: "Live" })).toBe(false);
    expect(
      canRemoveTournamentRosterMember({ ...base, status: "Live", hasTournamentOrganizerRole: true }),
    ).toBe(true);
  });

  it("is hidden when the status is unknown", () => {
    expect(canRemoveTournamentRosterMember({ ...base, status: undefined })).toBe(false);
  });
});

describe("the tournament member row", () => {
  let hasOrganizerRole = false;
  beforeEach(() => {
    hasOrganizerRole = false;
    vi.stubGlobal("useAuthStore", () => ({ isRoleAbove: () => hasOrganizerRole }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flag = async (ctx: Record<string, unknown>) => {
    const { default: Row } = await import("../../components/tournament/TournamentTeamMemberRow.vue");
    return (Row as any).computed.canRemoveMember.call(ctx);
  };

  it("offers Remove to a team owner or Admin who is not an organizer", async () => {
    expect(
      await flag({
        tournament: { status: "RegistrationOpen", is_organizer: false },
        isCurrentUser: false,
        canManageTeam: true,
      }),
    ).toBe(true);
  });

  it("does not offer Remove to an ordinary member", async () => {
    expect(
      await flag({
        tournament: { status: "RegistrationOpen", is_organizer: false },
        isCurrentUser: false,
        canManageTeam: false,
      }),
    ).toBe(false);
  });

  it("does not offer Remove on yourself, or once the tournament is over", async () => {
    expect(
      await flag({ tournament: { status: "RegistrationOpen" }, isCurrentUser: true, canManageTeam: true }),
    ).toBe(false);
    expect(
      await flag({ tournament: { status: "Finished" }, isCurrentUser: false, canManageTeam: true }),
    ).toBe(false);
  });

  it("while Live offers Remove only to an organizer-role session", async () => {
    const ctx = { tournament: { status: "Live" }, isCurrentUser: false, canManageTeam: true };
    expect(await flag(ctx)).toBe(false);
    hasOrganizerRole = true;
    expect(await flag(ctx)).toBe(true);
  }, 60_000);

  it("the Remove menu item and the remove action use the new rule, not the role-editing flag", () => {
    const row = read("components/tournament/TournamentTeamMemberRow.vue");
    expect(row).toMatch(/v-if="canRemoveMember"\s+class="text-destructive"/);
    expect(row).toContain("if (!this.canRemoveMember || this.rosterLockedAtMin) return;");
    expect(row).toContain("this.canPromoteCaptain || this.canLeaveSelf || this.canRemoveMember");
    // Changing a role is still organizer-only.
    expect(row).toMatch(/canUpdateRole\(\) \{[\s\S]*this\.tournament\?\.is_organizer/);
  });
});

describe("leaving a team", () => {
  it("only removes the player from this team's tournament entry, not from every tournament", () => {
    const team = read("components/tournament/TournamentTeam.vue");
    const leave = team.slice(team.indexOf("async leaveTeam()"));
    const where = leave.slice(0, leave.indexOf("async addMember"));
    expect(where).toContain("tournament_team_id");
    expect(where).toContain("_eq: this.team.id");
  });
});
