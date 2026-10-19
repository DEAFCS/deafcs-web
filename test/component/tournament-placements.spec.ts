// Adapted from 5Stack WEB 45a580e0 and 9738824c (StageStandings.spec.ts,
// TournamentTeamPlacement.spec.ts); MIT Copyright (c) 2025 5Stack.gg; see
// LICENSE.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import en from "../../i18n/locales/en.json";
import StageStandings from "../../components/tournament/StageStandings.vue";
import TournamentResults from "../../components/tournament/TournamentResults.vue";
import TournamentTeam from "../../components/tournament/TournamentTeam.vue";
import { usablePodiumSteps } from "../../graphql/tournamentPodium";

// A four-team single elimination without a third-place match. The standings
// view splits the two semifinal losers on round ratio and KDR (3rd and 4th);
// the tournament's placements put both at 3rd.
const team = (id: string) => ({ id, name: `Team ${id.toUpperCase()}`, roster: [] });
const results = [
  { tournament_team_id: "a", rank: 1, placement: 1, wins: 2, losses: 0, team: team("a") },
  { tournament_team_id: "b", rank: 2, placement: 2, wins: 1, losses: 1, team: team("b") },
  { tournament_team_id: "c", rank: 3, placement: 3, wins: 0, losses: 1, team: team("c") },
  { tournament_team_id: "d", rank: 4, placement: 4, wins: 0, losses: 1, team: team("d") },
];
const sharedThird = [
  { placement: 1, tournament_team_id: "a", name: "Team A" },
  { placement: 2, tournament_team_id: "b", name: "Team B" },
  { placement: 3, tournament_team_id: "c", name: "Team C" },
  { placement: 3, tournament_team_id: "d", name: "Team D" },
];

const standings = (placements: Array<any>, rows = results) => {
  const component = StageStandings as any;
  const ctx: any = {
    stage: { results: rows, groups: 1 },
    placements,
    onlyGroup: null,
    groupDisplay: (n: number) => String(n),
    displayTeamName: component.methods.displayTeamName,
  };
  ctx.placementByTeam = component.computed.placementByTeam.call(ctx);
  return component.computed.groups.call(ctx)[0].entries;
};

describe("final stage standings follow the tournament's placements", () => {
  it("puts both semifinal losers at 3rd, tied", () => {
    const entries = standings(sharedThird);

    expect(entries.map((e: any) => [e.teamId, e.rank, e.tied])).toEqual([
      ["a", 1, false],
      ["b", 2, false],
      ["c", 3, true],
      ["d", 3, true],
    ]);
  });

  it("orders the third-place decider's winner ahead of a team the tiebreakers liked", () => {
    // The runner-up and the decider winner both finish 1-1; the view put the
    // decider's winner 2nd.
    const rows = [
      { ...results[0] },
      { ...results[2], tournament_team_id: "c", rank: 2, placement: 2, wins: 1, losses: 1 },
      { ...results[1], tournament_team_id: "b", rank: 3, placement: 3, wins: 1, losses: 1 },
      { ...results[3] },
    ];
    const entries = standings(
      [
        { placement: 1, tournament_team_id: "a" },
        { placement: 2, tournament_team_id: "b" },
        { placement: 3, tournament_team_id: "c" },
      ],
      rows,
    );

    expect(entries.map((e: any) => [e.teamId, e.rank])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ]);
  });

  it("shows the 3rd-place prize for both teams sharing 3rd, with the shared note", () => {
    const entries = standings(sharedThird);

    expect(
      entries.map((e: any) => [e.teamId, e.prizePlacement, e.sharedPlacement]),
    ).toEqual([
      ["a", 1, false],
      ["b", 2, false],
      ["c", 3, true],
      ["d", 3, true],
    ]);
  });

  it("gives each prize to the team at that place after a third-place match", () => {
    const rows = [
      { ...results[0] },
      { ...results[2], tournament_team_id: "c", rank: 2, placement: 2, wins: 1, losses: 1 },
      { ...results[1], tournament_team_id: "b", rank: 3, placement: 3, wins: 1, losses: 1 },
      { ...results[3] },
    ];
    const entries = standings(
      [
        { placement: 1, tournament_team_id: "a" },
        { placement: 2, tournament_team_id: "b" },
        { placement: 3, tournament_team_id: "c" },
      ],
      rows,
    );

    expect(entries.map((e: any) => [e.teamId, e.prizePlacement, e.sharedPlacement])).toEqual([
      ["a", 1, false],
      ["b", 2, false],
      ["c", 3, false],
      ["d", 4, false],
    ]);
  });

  it("keeps the standings' prize places without placements", () => {
    const entries = standings([]);

    expect(entries.map((e: any) => [e.prizePlacement, e.sharedPlacement])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, false],
    ]);
  });

  it("renders the shared note only beside a shared place's prize", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../components/tournament/StageStandings.vue"),
      "utf8",
    );
    expect(source).toContain("prizeForPlacement(entry.prizePlacement)");
    expect(source).toMatch(
      /v-if="entry\.sharedPlacement && prizeForPlacement\(entry\.prizePlacement\)"/,
    );
    expect(en.tournament.results_table.shared_prize_note).toBe(
      "Shared place. The organizer's tournament rules decide the prize.",
    );
    expect(en.tournament.results_table.shared_prize_note).not.toContain("—");
  });

  it("is unchanged without placements (earlier stages, unfinished tournaments)", () => {
    const entries = standings([]);

    expect(entries.map((e: any) => [e.teamId, e.rank, e.tied])).toEqual([
      ["a", 1, false],
      ["b", 2, false],
      ["c", 3, false],
      ["d", 4, false],
    ]);
  });
});

describe("the podium reads the tournament's placements", () => {
  const podium = (podiumSteps: Array<any> | null) => {
    const component = TournamentResults as any;
    const ctx: any = {
      tournament: { status: "Finished", stages: [{ id: "s1", order: 1, type: "SingleElimination", results }] },
      podiumSteps,
      isFinished: true,
      finalStageType: "SingleElimination",
      displayTeamName: (t: any) => t?.name ?? "",
    };
    return component.computed.podium.call(ctx);
  };

  it("shows both semifinal losers on the 3rd step", () => {
    expect(podium(sharedThird).map((e: any) => [e.placement, e.teamId, e.teamName])).toEqual([
      [1, "a", "Team A"],
      [2, "b", "Team B"],
      [3, "c", "Team C"],
      [3, "d", "Team D"],
    ]);
  });

  it("falls back to the final stage's standings without them", () => {
    expect(podium(null).map((e: any) => [e.placement, e.teamId])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("keeps the standings for a last stage played in groups (no podium from the api)", () => {
    expect(podium([]).map((e: any) => e.placement)).toEqual([1, 2, 3]);
  });
});

describe("podium award artwork on a shared step", () => {
  const hasAwardFor = (occurrences: Array<any>, placement: number, teamId?: string) =>
    (TournamentResults as any).methods.hasAwardFor.call(
      { awardOccurrences: occurrences },
      placement,
      teamId,
    );
  const bronzeForC = [
    { placement: 3, recipients: [{ tournament_team_id: "c" }, { tournament_team_id: "c", player_steam_id: "1" }] },
  ];

  it("shows the bronze only on the team that was granted it", () => {
    expect(hasAwardFor(bronzeForC, 3, "c")).toBe(true);
    expect(hasAwardFor(bronzeForC, 3, "d")).toBe(false);
  });

  it("keeps the placement-only check when no team is given", () => {
    expect(hasAwardFor(bronzeForC, 3)).toBe(true);
    expect(hasAwardFor(bronzeForC, 1)).toBe(false);
  });
});

describe("a team's placement badge", () => {
  const badge = (podiumSteps: Array<any> | null, teamId: string) =>
    (TournamentTeam as any).computed.finalPlacement.call({
      tournament: { status: "Finished", trophies: [], stages: [{ order: 1, results }] },
      team: { id: teamId },
      podiumSteps,
    });

  it("is 3rd for both teams sharing 3rd", () => {
    expect(badge(sharedThird, "c")).toBe(3);
    expect(badge(sharedThird, "d")).toBe(3);
  });

  it("falls back to the standings without placements", () => {
    expect(badge(null, "d")).toBe(4);
  });
});

describe("placements from the api are only used when they name a champion", () => {
  it("passes complete placements through", () => {
    expect(usablePodiumSteps(sharedThird)).toBe(sharedThird);
  });

  it("drops placements without a 1st (an old final with no recorded winner)", () => {
    expect(
      usablePodiumSteps([
        { placement: 3, tournament_team_id: "c" },
        { placement: 3, tournament_team_id: "d" },
      ]),
    ).toBeNull();
  });

  it("drops an empty list (a final stage played in groups) and a missing field", () => {
    expect(usablePodiumSteps([])).toBeNull();
    expect(usablePodiumSteps(null)).toBeNull();
    expect(usablePodiumSteps(undefined)).toBeNull();
  });
});
