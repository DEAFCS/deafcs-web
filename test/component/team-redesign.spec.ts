import { describe, expect, it } from "vitest";
import { recipientToGrant, groupAwardsByTeam, tournamentWinnerTeamIds } from "~/components/teams/teamAwards";
import { teamRosterBuckets } from "~/utilities/teamRosterBuckets";
import { resolveAwardTier } from "~/utilities/awardSeed";
import { teamForm, teamOpponent, teamResult } from "~/utilities/teamResults";
import { relativeWhen } from "~/utilities/relativeWhen";

// A live DEAFCS award_recipients row: placement/source live on the occurrence,
// the artwork on the award, per-tournament overrides in tournament_award_slots.
function recipient(over: Record<string, any> = {}) {
  return {
    id: "r1",
    team_id: "team-1",
    player_steam_id: null,
    created_at: "2026-09-27T10:00:00Z",
    occurrence: {
      id: "o1",
      tournament_id: "t1",
      placement: 1,
      source: "tournament",
      award: { id: "a1", name: "1st Place", tier: "gold", silhouette: 2, image_url: "avatars/awards/gold.webp", system_key: "tournament_first" },
      tournament: { id: "t1", name: "5v5 Cup #1", start: "2026-09-20T10:00:00Z", stages: [{ type: "DoubleElimination" }] },
      ...over,
    },
    tournament_team: null,
    team: { id: "team-1", name: "Samurai", short_name: "SAM" },
  } as any;
}

describe("DEAFCS award adapter (occurrence -> upstream grant shape)", () => {
  it("flattens placement, source and tournament off the occurrence", () => {
    const grant = recipientToGrant(recipient());
    expect(grant).toMatchObject({
      id: "r1",
      team_id: "team-1",
      source: "tournament",
      placement: 1,
      tournament_id: "t1",
      created_at: "2026-09-27T10:00:00Z",
    });
    expect(grant.tournament?.name).toBe("5v5 Cup #1");
    // The artwork definition AwardArtwork renders, not a generated badge.
    expect(grant.award).toMatchObject({ id: "a1", tier: "gold", image_url: "avatars/awards/gold.webp" });
    expect(grant.trophy.placement).toBe(1);
  });

  it("applies the tournament's award slot override (name, silhouette, artwork)", () => {
    const grant = recipientToGrant(recipient(), [
      { tournament_id: "t1", slot: "champion", custom_name: "Grand Champions", silhouette_override: 5, image_override: "avatars/awards/custom.webp" },
      // Another tournament's override must not leak in.
      { tournament_id: "t2", slot: "champion", custom_name: "Other", image_override: "x.webp" },
    ]);
    expect(grant.award).toMatchObject({ name: "Grand Champions", silhouette: 5, image_url: "avatars/awards/custom.webp" });
    expect(grant.tournament_award).toMatchObject({ custom_name: "Grand Champions", silhouette: 5, image_url: "avatars/awards/custom.webp" });
  });

  it("falls back to a placement-tier definition when a tournament granted no award row", () => {
    const grant = recipientToGrant(recipient({ award: null, placement: 2 }));
    expect(grant.award).toMatchObject({ tier: "silver" });
  });

  it("keeps manual and non-tournament occurrences out of the winners filter", () => {
    const grants = [
      recipientToGrant(recipient()),
      recipientToGrant({ ...recipient(), id: "r2", team_id: "team-2", occurrence: { ...recipient().occurrence, id: "o2", source: "manual", tournament_id: null } }),
    ];
    expect(tournamentWinnerTeamIds(grants)).toEqual(["team-1"]);
    expect(Object.keys(groupAwardsByTeam(grants)).sort()).toEqual(["team-1", "team-2"]);
  });

  it("resolves tiers the way DEAFCS has them (no 'special' palette)", () => {
    expect(resolveAwardTier(0, null)).toBe("mvp");
    expect(resolveAwardTier(3, null)).toBe("bronze");
    expect(resolveAwardTier(null, "silver")).toBe("silver");
    expect(resolveAwardTier(null, "special")).toBe("bronze");
    expect(resolveAwardTier(undefined, null)).toBe("bronze");
  });
});

describe("Starting Five buckets follow DEAFCS roster semantics", () => {
  const roster = [
    { id: "a", status: "Starter", coach: false },
    { id: "b", status: "Starter", coach: true },
    { id: "c", status: "Substitute", coach: false },
    { id: "d", status: "Benched", coach: false },
    { id: "e", status: "Benched", coach: true },
    { id: "f", status: null, coach: false },
  ];

  it("puts every member in exactly one bucket and any coach under Coaches", () => {
    const buckets = teamRosterBuckets(roster as any);
    expect(buckets.starters.map((m: any) => m.id)).toEqual(["a"]);
    expect(buckets.substitutes.map((m: any) => m.id)).toEqual(["c"]);
    expect(buckets.bench.map((m: any) => m.id)).toEqual(["d"]);
    expect(buckets.coaches.map((m: any) => m.id)).toEqual(["b", "e"]);
  });

  it("is presentation only: it never reads or sets a role", () => {
    const member = Object.freeze({ id: "a", status: "Starter", coach: false, role: "Admin" });
    const buckets = teamRosterBuckets([member] as any);
    expect(buckets.starters[0]).toBe(member);
    expect(member.role).toBe("Admin");
  });
});

describe("team results helpers", () => {
  const match = {
    status: "Finished",
    lineup_1_id: "l1",
    lineup_2_id: "l2",
    winning_lineup_id: "l2",
    lineup_1: { team_id: "us", name: "Us" },
    lineup_2: { team_id: "them", name: "Them" },
  };

  it("reads W/L/T from the team's own lineup", () => {
    expect(teamResult(match, "us")).toBe("L");
    expect(teamResult(match, "them")).toBe("W");
    expect(teamResult({ ...match, winning_lineup_id: null }, "us")).toBe("T");
    expect(teamResult({ ...match, status: "Live" }, "us")).toBeNull();
    expect(teamOpponent(match, "us")?.name).toBe("Them");
  });

  it("lists form oldest to newest", () => {
    const newest = { ...match, winning_lineup_id: "l1" };
    expect(teamForm([newest, match], "us")).toEqual(["L", "W"]);
  });

  it("formats relative start times", () => {
    const t = (key: string, p?: any) => `${key}:${p?.count ?? ""}`;
    const now = new Date("2026-10-07T12:00:00Z");
    expect(relativeWhen(new Date("2026-10-07T11:00:00Z"), now, t)).toBe("");
    expect(relativeWhen(new Date("2026-10-07T12:15:00Z"), now, t)).toBe("pages.play.schedule.in_minutes:15");
    expect(relativeWhen(new Date("2026-10-08T12:00:00Z"), now, t)).toBe("pages.play.schedule.tomorrow:");
  });
});
