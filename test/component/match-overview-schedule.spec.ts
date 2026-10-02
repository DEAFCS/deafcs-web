import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("~/components/draft-games/DraftTeamPanel.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).TeamPanel,
}));
vi.mock("~/components/draft-games/DraftPlayerCard.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).PlayerCard,
}));
vi.mock("~/components/match/MatchRegionVeto.vue", () => ({
  default: { name: "MatchRegionVeto", template: `<div data-testid="region-veto" />` },
}));
// The organizer's real schedule form (vee-validate, calendar); its own
// mutation and rules are unchanged, here only where it is placed matters.
vi.mock("~/components/match/ScheduleMatch.vue", () => ({
  default: { name: "ScheduleMatch", props: ["match"], template: `<div data-testid="schedule-match-form" />` },
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/composables/useSound", () => ({
  useSound: () => ({ playMatchFoundSound: vi.fn(), playTickSound: vi.fn(), playCountdownSound: vi.fn() }),
}));

import {
  defaultMatchTab,
  OVERVIEW_TAB,
  overviewIsDefault,
  overviewStage,
  pendingScheduleProposals,
  startsInText,
} from "../../utilities/matchLifecycle";
import MatchOverview from "../../components/match/overview/MatchOverview.vue";
import OverviewSchedule from "../../components/match/overview/OverviewSchedule.vue";
import MatchInfo from "../../components/match/MatchInfo.vue";
import { MY_MANAGED_TEAMS_QUERY, RESPOND_PROPOSAL_MUTATION } from "../../graphql/leagues";

const NOW = Date.parse("2026-10-02T11:46:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const t = (key: string, args?: Record<string, unknown>) =>
  args && Object.keys(args).length ? `${key}:${JSON.stringify(args)}` : key;
const ROLES = ["user", "verified_user", "streamer", "moderator", "match_organizer", "tournament_organizer", "administrator"];
const auth = {
  me: null as null | { steam_id: string },
  role: null as null | string,
  isRoleAbove(role: string) {
    return !!this.role && ROLES.indexOf(this.role) >= ROLES.indexOf(role);
  },
};
const apollo = { mutate: vi.fn().mockResolvedValue({}), query: vi.fn() };
const globalConfig = () => ({
  config: { globalProperties: { $t: t, $apollo: apollo } as any },
  stubs: { NuxtLink: { props: ["to"], template: `<a :href="to"><slot /></a>` } },
});

beforeEach(() => {
  auth.me = null;
  auth.role = null;
  apollo.mutate.mockClear();
  apollo.query.mockReset().mockResolvedValue({ data: { teams: [] } });
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useMatchmakingStore", () => ({ joinedMatchmakingQueues: {} }));
  vi.stubGlobal("useApplicationSettingsStore", () => ({ settings: [] }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useMatchLobbyStore", () => ({ lobbyChat: {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lineup = (name: string, teamId: string | null, players: string[]) => ({
  id: `${name}-id`,
  name,
  team_id: teamId,
  lineup_players: players.map((steam_id, index) => ({
    steam_id,
    captain: index === 0,
    player: { steam_id, name: `P${steam_id}` },
  })),
});
const proposal = (id: string, status: string, by: string, offsetMs: number) => ({
  id,
  status,
  message: null,
  proposed_by_steam_id: by,
  proposed_by: { steam_id: by, name: `P${by}` },
  proposed_time: iso(offsetMs),
});
const scheduled = (overrides: Record<string, any> = {}) => ({
  id: "m1",
  status: "Scheduled",
  source: "5stack",
  started_at: null,
  // 2 h 14 min from now: the real committed start.
  scheduled_at: iso((2 * 60 + 14) * 60_000),
  min_players_per_lineup: 5,
  lineup_1_id: "Alpha-id",
  lineup_2_id: "Bravo-id",
  lineup_1: lineup("Alpha", "teamA", ["11", "12", "13", "14", "15"]),
  lineup_2: lineup("Bravo", "teamB", ["21", "22", "23", "24", "25"]),
  options: { type: "Competitive", best_of: 3, map_veto: true, region_veto: false, map_pool: { maps: [] } },
  match_maps: [],
  can_schedule: false,
  is_organizer: false,
  tournament_brackets: [
    {
      id: "b1",
      // A projection only: never shown as the agreed time.
      scheduled_eta: iso(5 * 60_000),
      scheduling_proposals: [],
      stage: { tournament: { id: "t1", name: "Cup", status: "Live" } },
    },
  ],
  ...overrides,
});
const withProposals = (proposals: any[], extra: Record<string, any> = {}) => {
  const match = scheduled(extra);
  match.tournament_brackets[0].scheduling_proposals = proposals;
  return match;
};
const local = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

describe("schedule stage selection", () => {
  it("a future Scheduled match opens on the Overview, not the empty Scoreboard", () => {
    const match = scheduled();
    const stage = overviewStage(match, { captainPickActive: false });
    expect(stage).toBe("schedule");
    expect(overviewIsDefault(match, stage, NOW)).toBe(true);
    expect(defaultMatchTab(true, overviewIsDefault(match, stage, NOW))).toBe(OVERVIEW_TAB);
    // Imported matches still have no lifecycle.
    expect(overviewStage({ ...match, source: "faceit" }, { captainPickActive: false })).toBeNull();
  });

  it("only the server's status moves it on: check-in, then the normal lifecycle", () => {
    const stage = (status: string) => overviewStage(scheduled({ status }), { captainPickActive: false });
    expect(stage("Scheduled")).toBe("schedule");
    expect(stage("WaitingForCheckIn")).toBe("check-in");
    expect(stage("Veto")).toBe("veto");
    expect(stage("WaitingForServer")).toBe("pre-match");
  });

  it("relative start text from scheduled_at only", () => {
    expect(startsInText(iso((2 * 60 + 14) * 60_000), NOW)).toBe("2h 14m");
    expect(startsInText(iso(2 * 3_600_000), NOW)).toBe("2h");
    expect(startsInText(iso((3 * 1440 + 4 * 60) * 60_000), NOW)).toBe("3d 4h");
    expect(startsInText(iso(45 * 60_000), NOW)).toBe("45m");
    expect(startsInText(iso(20_000), NOW)).toBe("1m");
    expect(startsInText(iso(-1_000), NOW)).toBeNull();
    expect(startsInText(null, NOW)).toBeNull();
  });
});

describe("schedule Overview", () => {
  const mountOverview = (match: any) =>
    mount(MatchOverview, { props: { match, stage: overviewStage(match, { captainPickActive: false }) }, global: globalConfig() });

  it("MATCH SCHEDULED, the committed local date/time and a countdown, teams left and right", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const match = scheduled();
    const wrapper = mountOverview(match);
    expect(wrapper.attributes("data-stage")).toBe("schedule");
    const middle = wrapper.get('[data-testid="overview-middle"]');
    expect(middle.get('[data-testid="overview-schedule"]').attributes("data-state")).toBe("committed");
    expect(middle.text()).toContain("match.lifecycle.schedule_kicker");
    expect(middle.get('[data-testid="schedule-time"]').text()).toBe(local(match.scheduled_at));
    expect(middle.get('[data-testid="schedule-time"]').attributes("datetime")).toBe(match.scheduled_at);
    expect(middle.get('[data-testid="schedule-starts-in"]').text()).toBe('match.lifecycle.starts_in:{"time":"2h 14m"}');
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toBe("match.lifecycle.schedule_title");
    expect(wrapper.get('[data-testid="overview-action-hint"]').text()).toBe("match.lifecycle.check_in_opens");
    // No timer ring, no strip, no other stage, no empty Scoreboard bits.
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="overview-strip"]').exists()).toBe(false);
    for (const other of ["overview-check-in", "overview-veto", "overview-pre-match"]) {
      expect(wrapper.find(`[data-testid="${other}"]`).exists()).toBe(false);
    }
    expect(wrapper.text()).not.toContain("match.map_tbd");
    expect(wrapper.find('[data-testid="overview-team-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overview-team-2"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("never presents scheduled_eta as an agreed time", () => {
    const wrapper = mountOverview(scheduled({ scheduled_at: null }));
    expect(wrapper.get('[data-testid="overview-schedule"]').attributes("data-state")).toBe("unset");
    expect(wrapper.find('[data-testid="schedule-time"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="schedule-unset"]').text()).toBe("match.lifecycle.schedule_unset");
    expect(wrapper.text()).not.toContain(local(iso(5 * 60_000)));
    wrapper.unmount();
  });

  it("the countdown ticks, and a passed time waits for the server instead of moving on", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const wrapper = mountOverview(scheduled({ scheduled_at: iso(60_000 * 31) }));
    expect(wrapper.get('[data-testid="schedule-starts-in"]').text()).toContain('"time":"31m"');
    vi.advanceTimersByTime(15 * 60_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="schedule-starts-in"]').text()).toContain('"time":"16m"');
    vi.advanceTimersByTime(20 * 60_000);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="schedule-starts-in"]').text()).toBe("match.lifecycle.starting_soon");
    // Still the schedule stage: no client-side check-in, veto or server.
    expect(wrapper.attributes("data-stage")).toBe("schedule");
    expect(apollo.mutate).not.toHaveBeenCalled();
    // The server opens check-in: the Overview follows.
    const checkIn = { ...scheduled(), status: "WaitingForCheckIn", options: { ...scheduled().options, check_in_setting: "Captains" } };
    await wrapper.setProps({ match: checkIn, stage: "check-in" });
    expect(wrapper.find('[data-testid="overview-schedule"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="overview-check-in"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("organizers keep their existing ScheduleMatch controls, in the middle", () => {
    const organizer = mountOverview(scheduled({ can_schedule: true, is_organizer: true }));
    expect(organizer.get('[data-testid="overview-middle"] [data-testid="schedule-organizer"] [data-testid="schedule-match-form"]').exists()).toBe(true);
    const viewer = mountOverview(scheduled());
    expect(viewer.find('[data-testid="schedule-organizer"]').exists()).toBe(false);
  });
});

describe("negotiated time changes", () => {
  const mountSchedule = async (match: any) => {
    const wrapper = mount(OverviewSchedule, { props: { match }, global: globalConfig() });
    await flushPromises();
    return wrapper;
  };

  it("only pending proposals are shown, and the agreed time stays the committed scheduled_at", async () => {
    const match = withProposals([
      proposal("p1", "Pending", "21", 26 * 3_600_000),
      proposal("p0", "Accepted", "11", 2 * 3_600_000),
      proposal("px", "Superseded", "11", 3 * 3_600_000),
    ]);
    expect(pendingScheduleProposals(match).map((p) => p.id)).toEqual(["p1"]);
    const wrapper = await mountSchedule(match);
    expect(wrapper.findAll('[data-testid^="schedule-proposal-"]')).toHaveLength(1);
    expect(wrapper.get('[data-testid="schedule-proposal-p1"]').text()).toContain(local(iso(26 * 3_600_000)));
    expect(wrapper.get('[data-testid="schedule-proposal-p1"]').text()).toContain("P21");
    expect(wrapper.get('[data-testid="schedule-time"]').text()).toBe(local(match.scheduled_at));
  });

  it("the other team's manager can accept or decline through the existing mutation", async () => {
    auth.me = { steam_id: "11" };
    auth.role = "user";
    apollo.query.mockResolvedValue({ data: { teams: [{ id: "teamA" }] } });
    const wrapper = await mountSchedule(withProposals([proposal("p1", "Pending", "21", 26 * 3_600_000)]));
    expect(apollo.query).toHaveBeenCalledWith(expect.objectContaining({ query: MY_MANAGED_TEAMS_QUERY, variables: { steamId: "11" } }));
    await wrapper.get('[data-testid="schedule-accept"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: RESPOND_PROPOSAL_MUTATION,
      variables: { proposalId: "p1", status: "Accepted" },
    });
    await flushPromises();
    await wrapper.get('[data-testid="schedule-decline"]').trigger("click");
    expect(apollo.mutate).toHaveBeenLastCalledWith({
      mutation: RESPOND_PROPOSAL_MUTATION,
      variables: { proposalId: "p1", status: "Declined" },
    });
  });

  it("the proposer, other players and guests wait; administrators may always answer", async () => {
    const pending = () => withProposals([proposal("p1", "Pending", "21", 26 * 3_600_000)]);
    // The proposing manager cannot accept their own proposal.
    auth.me = { steam_id: "21" };
    auth.role = "user";
    apollo.query.mockResolvedValue({ data: { teams: [{ id: "teamB" }] } });
    let wrapper = await mountSchedule(pending());
    expect(wrapper.find('[data-testid="schedule-accept"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="schedule-awaiting"]').text()).toBe("league.schedule.awaiting_opponent");
    // A player who manages neither team.
    auth.me = { steam_id: "12" };
    apollo.query.mockResolvedValue({ data: { teams: [] } });
    wrapper = await mountSchedule(pending());
    expect(wrapper.find('[data-testid="schedule-accept"]').exists()).toBe(false);
    // A guest: nothing is even looked up.
    auth.me = null;
    auth.role = null;
    apollo.query.mockClear();
    wrapper = await mountSchedule(pending());
    expect(apollo.query).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="schedule-accept"]').exists()).toBe(false);
    // League/tournament administrators (the trigger's is_league_admin).
    auth.me = { steam_id: "1" };
    auth.role = "administrator";
    wrapper = await mountSchedule(pending());
    expect(wrapper.find('[data-testid="schedule-accept"]').exists()).toBe(true);
  });

  it("an accepted proposal shows as the new committed time once the server moves scheduled_at", async () => {
    const before = withProposals([proposal("p1", "Pending", "21", 26 * 3_600_000)]);
    const wrapper = await mountSchedule(before);
    const after = withProposals([proposal("p1", "Accepted", "21", 26 * 3_600_000)], { scheduled_at: iso(26 * 3_600_000) });
    await wrapper.setProps({ match: after });
    expect(wrapper.find('[data-testid="schedule-proposals"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="schedule-time"]').text()).toBe(local(iso(26 * 3_600_000)));
  });
});

describe("negotiated scheduling model (unchanged backend)", () => {
  // Initial negotiation happens outside the match page; the match is created
  // by the first accepted proposal, as Scheduled at the agreed time.
  it("the first agreement arrives as a Scheduled match whose scheduled_at is the agreed time", async () => {
    const agreed = 2 * 86_400_000;
    const match = withProposals([proposal("p0", "Accepted", "21", agreed)], { scheduled_at: iso(agreed) });
    expect(overviewStage(match, { captainPickActive: false })).toBe("schedule");
    const wrapper = mount(OverviewSchedule, { props: { match }, global: globalConfig() });
    await flushPromises();
    expect(wrapper.get('[data-testid="schedule-time"]').text()).toBe(local(iso(agreed)));
    expect(wrapper.find('[data-testid="schedule-proposals"]').exists()).toBe(false);
  });

  it("the match page invents no negotiation actions of its own", async () => {
    auth.me = { steam_id: "11" };
    auth.role = "user";
    apollo.query.mockResolvedValue({ data: { teams: [{ id: "teamA" }] } });
    const wrapper = mount(OverviewSchedule, {
      props: { match: withProposals([proposal("p1", "Pending", "21", 86_400_000)]) },
      global: globalConfig(),
    });
    await flushPromises();
    // Only the existing respond actions; proposing stays in the league schedule.
    expect(wrapper.findAll("button").map((b) => b.attributes("data-testid"))).toEqual(["schedule-accept", "schedule-decline"]);
    expect(wrapper.text()).not.toMatch(/league\.schedule\.propose(?!d_by)/);
    expect(wrapper.text()).not.toContain("league.schedule.counter");
    const source = readFileSync(path.resolve(__dirname, "../../components/match/overview/OverviewSchedule.vue"), "utf8");
    expect(source).not.toMatch(/PROPOSE_TIME_MUTATION|insert_league_scheduling_proposals/);
  });
});

describe("page wiring", () => {
  const page = readFileSync(path.resolve(__dirname, "../../pages/matches/[id]/index.vue"), "utf8");

  it("subscribes to the bracket's proposals and hides the info column's duplicate schedule form", () => {
    expect(page).toMatch(/tournament_brackets: \[[\s\S]*scheduling_proposals: \[[\s\S]*proposed_time: true[\s\S]*proposed_by_steam_id: true/);
    expect(page).toContain(`:hide-schedule="overviewShown && overviewStage === 'schedule'"`);
  });

  it("MatchInfo drops ScheduleMatch only when asked", () => {
    const match = scheduled({ can_schedule: true, options: { ...scheduled().options, coaches: false } });
    expect(mount(MatchInfo, { props: { match }, global: globalConfig() }).find('[data-testid="schedule-match-form"]').exists()).toBe(true);
    expect(mount(MatchInfo, { props: { match, hideSchedule: true }, global: globalConfig() }).find('[data-testid="schedule-match-form"]').exists()).toBe(false);
  });
});
