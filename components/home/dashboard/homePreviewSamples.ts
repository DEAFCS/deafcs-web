// LOCAL PREVIEW ONLY. Sample data for the signed-in dashboard's sections
// that have nothing to show yet, so their design can be reviewed with
// `npm run dev` at /?previewHome=logged-in&samples=1.
//
// Only ever loaded through `import.meta.dev && viewer.samples` dynamic
// imports, so production builds never include it. Every section that shows
// these renders a visible "Sample data" badge, and every name says Sample.

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function lineup(id: string, name: string, players: Array<{ steam_id: string; checked_in: boolean }>) {
  return { id, name, team: null, lineup_players: players };
}

export function sampleScheduledMatches(steamId: string) {
  return [
    {
      id: "sample-match-1",
      status: "WaitingForCheckIn",
      scheduled_at: hoursFromNow(-0.1),
      cancels_at: hoursFromNow(0.2),
      region: null,
      can_check_in: false,
      connection_link: null,
      options: { best_of: 1, type: "Competitive" },
      lineup_1: lineup("sample-l1", "Sample Team A", [
        { steam_id: steamId, checked_in: false },
        { steam_id: "1", checked_in: true },
        { steam_id: "2", checked_in: true },
      ]),
      lineup_2: lineup("sample-l2", "Sample Team B", [
        { steam_id: "3", checked_in: true },
        { steam_id: "4", checked_in: false },
      ]),
      match_maps: [{ map: { name: "de_mirage", label: null } }],
      tournament_brackets: [{ stage: { tournament: { id: "sample-t", name: "Sample Cup" } } }],
    },
    {
      id: "sample-match-2",
      status: "Scheduled",
      scheduled_at: hoursFromNow(26),
      region: null,
      can_check_in: false,
      connection_link: null,
      options: { best_of: 3, type: "Wingman" },
      lineup_1: lineup("sample-l3", "Sample Duo", [{ steam_id: steamId, checked_in: false }]),
      lineup_2: lineup("sample-l4", "Sample Opponents", []),
      match_maps: [],
      tournament_brackets: [],
    },
  ];
}

export function sampleTournament() {
  const tournament = {
    id: "sample-tournament",
    name: "Sample Cup (preview)",
    start: hoursFromNow(5),
    status: "RegistrationClosed",
    e_tournament_status: { description: "Registration Closed" },
    registration_version: 2,
    check_in_required: true,
    check_in_setting: "Captains",
    check_in_opens_before_minutes: 60,
    check_in_closes_before_minutes: 15,
    check_in_ends_at: null,
    check_in_started: false,
    min_players_per_lineup: 5,
    is_organizer: false,
    current_stage: 1,
    options: { type: "Competitive" },
    teams_aggregate: { aggregate: { count: 8 } },
    stages: [{ order: 1, e_tournament_stage_type: { description: "Double Elimination" } }],
    rosters: [
      {
        checked_in_at: null,
        tournament_team: {
          id: "sample-team",
          name: "Sample Team A",
          checked_in_at: null,
          can_manage: true,
          roster: [],
          results: null,
        },
      },
    ],
    individual_signups: [],
    free_agents: [],
  };
  const bracket = {
    id: "sample-bracket",
    round: 1,
    scheduled_at: null,
    scheduled_eta: hoursFromNow(5),
    match_id: null,
    match: null,
    tournament_team_id_1: "sample-team",
    tournament_team_id_2: "sample-team-b",
    team_1: { id: "sample-team", name: "Sample Team A" },
    team_2: { id: "sample-team-b", name: "Sample Team B" },
  };
  return { tournament, bracket };
}

export function sampleStreamers() {
  return [
    {
      steamId: "0",
      playerName: "Sample Streamer",
      avatarUrl: null,
      channel: "sample",
      link: "https://www.twitch.tv/",
      title: "Sample title: Competitive grind on DEAFCS",
      viewerCount: 12,
      startedAt: hoursFromNow(-1.4),
    },
    {
      steamId: "1",
      playerName: "Sample Player B",
      avatarUrl: null,
      channel: "sample_b",
      link: "https://www.twitch.tv/",
      title: "Sample title: Wingman with friends",
      viewerCount: 4,
      startedAt: hoursFromNow(-0.3),
    },
  ];
}

export function samplePlayerOfMonth() {
  return {
    winner: {
      occurrence: { id: "sample-potm", effective_at: new Date().toISOString(), award: null },
      recipient: {
        recipient_note: "Sample note written by staff when awarding.",
        player: { steam_id: "0", name: "Sample Player", avatar_url: null },
      },
    },
    stats: { matches: 24, rating: 1.18, adr: 86.4 },
  };
}
