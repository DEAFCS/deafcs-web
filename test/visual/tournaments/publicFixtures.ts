// Local-only fixture data for the public tournament page preview. Nothing
// here talks to any backend; names and ids are invented.

const TEAM_NAMES = [
  "Northern Stars",
  "Quiet Force",
  "Orange Squad",
  "DEAFCS Denmark",
  "Silent Strike with a long team name",
  "Hands Up",
  "Signal Lost",
  "Copenhagen Wolves",
];

export const teams = TEAM_NAMES.map((name, i) => ({
  id: `t${i + 1}`,
  name,
  team_id: `team-${i + 1}`,
  team: { name },
  eligible_at: new Date().toISOString(),
  roster: [],
}));

let matchSeq = 0;
function finished(t1: any, t2: any, s1: number, s2: number) {
  matchSeq++;
  const l1 = { id: `l1-${matchSeq}`, name: t1.name };
  const l2 = { id: `l2-${matchSeq}`, name: t2.name };
  return {
    id: `m${matchSeq}`,
    status: "Finished",
    options: { best_of: 1 },
    lineup_1_id: l1.id,
    lineup_2_id: l2.id,
    lineup_1: l1,
    lineup_2: l2,
    winning_lineup_id: s1 > s2 ? l1.id : l2.id,
    match_maps: [
      {
        winning_lineup_id: s1 > s2 ? l1.id : l2.id,
        lineup_1_score: s1,
        lineup_2_score: s2,
        map: { name: "de_mirage", label: "Mirage" },
      },
    ],
  };
}
function live(t1: any, t2: any, bestOf = 3) {
  matchSeq++;
  return {
    id: `m${matchSeq}`,
    status: "Live",
    options: { best_of: bestOf },
    lineup_1_id: `l1-${matchSeq}`,
    lineup_2_id: `l2-${matchSeq}`,
    lineup_1: { id: `l1-${matchSeq}`, name: t1.name },
    lineup_2: { id: `l2-${matchSeq}`, name: t2.name },
    winning_lineup_id: null,
    match_maps: [
      { winning_lineup_id: `l1-${matchSeq}`, lineup_1_score: 13, lineup_2_score: 9, map: { name: "de_nuke" } },
      { winning_lineup_id: null, lineup_1_score: 7, lineup_2_score: 5, map: { name: "de_ancient" } },
    ],
  };
}

type Node = Record<string, any>;
function node(id: string, group: number, path: string, round: number, number: number, extra: Node = {}): Node {
  return { id, group, path, round, match_number: number, bye: false, match: null, feeding_brackets: [], ...extra };
}
// Wire winner/loser edges (parent_bracket/loser_bracket + feeding_brackets).
function link(all: Node[], from: string, to: string, kind: "winner" | "loser") {
  const a = all.find((b) => b.id === from)!;
  const b = all.find((x) => x.id === to)!;
  const ref = { id: b.id, round: b.round, group: b.group, match_number: b.match_number, path: b.path };
  if (kind === "winner") a.parent_bracket = ref;
  else a.loser_bracket = ref;
  b.feeding_brackets.push({
    id: a.id,
    round: a.round,
    match_number: a.match_number,
    path: a.path,
    group: a.group,
    parent_bracket_id: kind === "winner" ? b.id : undefined,
    loser_parent_bracket_id: kind === "loser" ? b.id : undefined,
  });
}

/** 8-team single elimination: round 1 played, one semi live, final TBD. */
export function singleEliminationStage(state: "draw" | "live" | "finished") {
  matchSeq = 0;
  const t = teams;
  const all: Node[] = [
    node("se1", 1, "WB", 1, 1, { team_1: t[0], team_2: t[7], team_1_seed: 1, team_2_seed: 8 }),
    node("se2", 1, "WB", 1, 2, { team_1: t[3], team_2: t[4], team_1_seed: 4, team_2_seed: 5 }),
    node("se3", 1, "WB", 1, 3, { team_1: t[1], team_2: t[6], team_1_seed: 2, team_2_seed: 7 }),
    node("se4", 1, "WB", 1, 4, { team_1: t[2], team_2: t[5], team_1_seed: 3, team_2_seed: 6 }),
    node("se5", 1, "WB", 2, 1),
    node("se6", 1, "WB", 2, 2),
    node("se7", 1, "WB", 3, 1),
  ];
  link(all, "se1", "se5", "winner");
  link(all, "se2", "se5", "winner");
  link(all, "se3", "se6", "winner");
  link(all, "se4", "se6", "winner");
  link(all, "se5", "se7", "winner");
  link(all, "se6", "se7", "winner");
  if (state !== "draw") {
    const r1 = [
      ["se1", 0, 7, 13, 6], ["se2", 3, 4, 11, 13], ["se3", 1, 6, 13, 4], ["se4", 2, 5, 13, 10],
    ] as const;
    for (const [id, a, b, s1, s2] of r1) {
      const n = all.find((x) => x.id === id)!;
      n.match = finished(t[a], t[b], s1, s2);
    }
    const se5 = all.find((x) => x.id === "se5")!;
    se5.team_1 = t[0]; se5.team_2 = t[4]; se5.team_1_seed = 1; se5.team_2_seed = 5;
    const se6 = all.find((x) => x.id === "se6")!;
    se6.team_1 = t[1]; se6.team_2 = t[2]; se6.team_1_seed = 2; se6.team_2_seed = 3;
    if (state === "live") {
      se5.match = live(t[0], t[4]);
      se6.scheduled_at = new Date(Date.now() + 3 * 3600000).toISOString();
    } else {
      se5.match = finished(t[0], t[4], 13, 8);
      se6.match = finished(t[1], t[2], 7, 13);
      const se7 = all.find((x) => x.id === "se7")!;
      se7.team_1 = t[0]; se7.team_2 = t[2];
      se7.match = finished(t[0], t[2], 16, 14);
    }
  }
  return {
    id: "stage-se", order: 1, type: "SingleElimination", groups: 1, min_teams: 4, max_teams: 8,
    default_best_of: 1, settings: {}, e_tournament_stage_type: { description: "Single Elimination" },
    brackets: all,
  };
}

/** 8-team double elimination with upper and lower brackets. */
export function doubleEliminationStage(state: "draw" | "live" | "finished") {
  matchSeq = 0;
  const t = teams;
  const all: Node[] = [
    node("w1", 1, "WB", 1, 1, { team_1: t[0], team_2: t[7], team_1_seed: 1, team_2_seed: 8 }),
    node("w2", 1, "WB", 1, 2, { team_1: t[3], team_2: t[4], team_1_seed: 4, team_2_seed: 5 }),
    node("w3", 1, "WB", 1, 3, { team_1: t[1], team_2: t[6], team_1_seed: 2, team_2_seed: 7 }),
    node("w4", 1, "WB", 1, 4, { team_1: t[2], team_2: t[5], team_1_seed: 3, team_2_seed: 6 }),
    node("w5", 1, "WB", 2, 5), node("w6", 1, "WB", 2, 6),
    node("w7", 1, "WB", 3, 7),
    node("gf", 1, "WB", 4, 8),
    node("l1", 2, "LB", 1, 9), node("l2", 2, "LB", 1, 10),
    node("l3", 2, "LB", 2, 11), node("l4", 2, "LB", 2, 12),
    node("l5", 2, "LB", 3, 13),
    node("l6", 2, "LB", 4, 14),
  ];
  for (const [a, b] of [["w1", "w5"], ["w2", "w5"], ["w3", "w6"], ["w4", "w6"], ["w5", "w7"], ["w6", "w7"], ["w7", "gf"], ["l1", "l3"], ["l2", "l4"], ["l3", "l5"], ["l4", "l5"], ["l5", "l6"], ["l6", "gf"]]) link(all, a, b, "winner");
  for (const [a, b] of [["w1", "l1"], ["w2", "l1"], ["w3", "l2"], ["w4", "l2"], ["w5", "l4"], ["w6", "l3"], ["w7", "l6"]]) link(all, a, b, "loser");
  if (state !== "draw") {
    const get = (id: string) => all.find((x) => x.id === id)!;
    get("w1").match = finished(t[0], t[7], 13, 3);
    get("w2").match = finished(t[3], t[4], 9, 13);
    get("w3").match = finished(t[1], t[6], 13, 11);
    get("w4").match = finished(t[2], t[5], 13, 7);
    Object.assign(get("w5"), { team_1: t[0], team_2: t[4] });
    Object.assign(get("w6"), { team_1: t[1], team_2: t[2] });
    Object.assign(get("l1"), { team_1: t[7], team_2: t[3] });
    Object.assign(get("l2"), { team_1: t[6], team_2: t[5] });
    get("w5").match = live(t[0], t[4]);
    get("l1").match = finished(t[7], t[3], 4, 13);
    get("l2").match = { ...live(t[6], t[5], 1), status: "WaitingForCheckIn", match_maps: [] };
    Object.assign(get("l3"), { team_1: t[3] });
    get("w6").scheduled_eta = new Date(Date.now() + 2 * 3600000).toISOString();
  }
  return {
    id: "stage-de", order: 1, type: "DoubleElimination", groups: 1, min_teams: 4, max_teams: 8,
    default_best_of: 1, settings: {}, e_tournament_stage_type: { description: "Double Elimination" },
    brackets: all,
  };
}

const banner =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400"><defs><linearGradient id="b"><stop stop-color="#1b2530"/><stop offset="1" stop-color="#b8661c"/></linearGradient></defs><rect width="1600" height="400" fill="url(#b)"/><path d="M980 0L1600 260L760 400Z" fill="#0d141b" opacity=".55"/></svg>',
  );

const organizers = [
  { steam_id: "100", name: "TricoN" },
  { steam_id: "101", name: "Theft" },
];

export type Variant =
  | "open"
  | "ineligible"
  | "wingman"
  | "finished"
  | "external"
  | "se"
  | "de"
  | "organizer";

export function publicTournament(variant: Variant) {
  const start = new Date(Date.now() + 4 * 86400000);
  start.setUTCHours(12, 0, 0, 0);
  const base: Record<string, any> = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "DEAFCS 5v5 Cup #2",
    status: "RegistrationOpen",
    e_tournament_status: { description: "Registration Open" },
    registration_version: 1,
    registration_type: "teams",
    start: start.toISOString(),
    banner: null,
    logo: null,
    homepage: "https://deafcs.net",
    location: null,
    description:
      "Five-a-side Counter-Strike for deaf and hard of hearing players. Bring your team, check in on time, and play fair.\n\nMatches are best of one until the final, which is best of three.",
    categories: [{ category: "OnlineEvent", e_tournament_category: { description: "Online Event" } }],
    options: { type: "Competitive", best_of: 1, mr: 12, map_veto: true, number_of_substitutes: 2, map_pool: { maps: [] } },
    min_players_per_lineup: 5,
    max_players_per_lineup: 7,
    min_role: "verified_user",
    meets_min_role: true,
    min_elo: null,
    max_elo: null,
    invite_only: false,
    registration_unlocked: true,
    can_join: true,
    is_organizer: false,
    admin: organizers[0],
    organizers: [{ organizer: organizers[1] }],
    teams_aggregate: { aggregate: { count: 6 } },
    teams: teams.slice(0, 6),
    stages: [],
    prizes: [{ place: 1, prize: "€150" }, { place: 2, prize: "€50" }],
    individual_signups: [],
    free_agents: [],
    trophies_enabled: true,
    auto_start: true,
  };
  base.banner = null;
  (base as any).__banner = banner;

  switch (variant) {
    case "ineligible":
      return { ...base, min_elo: 7000, max_elo: null, meets_min_role: false };
    case "wingman":
      return {
        ...base,
        name: "Wingman Weekender",
        registration_version: 2,
        registration_type: "both",
        options: { ...base.options, type: "Wingman", number_of_substitutes: 0 },
        min_players_per_lineup: 2,
        max_players_per_lineup: 2,
        min_elo: 4000,
        max_elo: 9000,
        homepage: "www.deafcs.net",
        check_in_required: true,
        check_in_setting: "Players",
      };
    case "external":
      return {
        ...base,
        name: "Nordic Deaf Esports Open",
        homepage: "nordic-deaf-esports.example/open",
        categories: [
          { category: "LAN", e_tournament_category: { description: "LAN" } },
          { category: "LocationEvent", e_tournament_category: { description: "Location Event" } },
        ],
        location: "Valby Hallen, Copenhagen, 2500, Denmark",
      };
    case "finished":
      return {
        ...base,
        name: "DEAFCS 5v5 Cup #1",
        status: "Finished",
        e_tournament_status: { description: "Finished" },
        start: new Date(Date.now() - 12 * 86400000).toISOString(),
        teams_aggregate: { aggregate: { count: 8 } },
        teams,
        stages: [doubleEliminationStage("live")],
      };
    case "se":
      return {
        ...base,
        status: "Live",
        e_tournament_status: { description: "Live" },
        start: new Date(Date.now() - 3600000).toISOString(),
        teams_aggregate: { aggregate: { count: 8 } },
        teams,
        stages: [singleEliminationStage("live")],
      };
    case "de":
      return {
        ...base,
        status: "Live",
        e_tournament_status: { description: "Live" },
        start: new Date(Date.now() - 3600000).toISOString(),
        teams_aggregate: { aggregate: { count: 8 } },
        teams,
        stages: [doubleEliminationStage("live")],
      };
    case "organizer":
      return { ...base, is_organizer: true, can_open_registration: false, can_close_registration: true };
    default:
      return base;
  }
}
