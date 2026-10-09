import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("~/components/draft-games/DraftTeamPanel.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).TeamPanel,
}));
vi.mock("~/components/draft-games/DraftPlayerCard.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).PlayerCard,
}));
vi.mock("~/components/PlayerDisplay.vue", async () => ({
  default: (await import("./fixtures/playerDisplayStub")).PlayerDisplayStub,
}));
vi.mock("~/components/match/MatchRegionVeto.vue", () => ({
  default: { name: "MatchRegionVeto", template: `<div data-testid="region-veto" />` },
}));
const sounds = { playMatchFoundSound: vi.fn(), playTickSound: vi.fn(), playCountdownSound: vi.fn() };
vi.mock("~/composables/useSound", () => ({ useSound: () => sounds }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

import {
  checkInSummary,
  overviewIsDefault,
  overviewStage,
  regionSteps,
  regionVetoPending,
  regionVetoStates,
} from "../../utilities/matchLifecycle";
import { regionVetoPickMutation } from "../../graphql/regionVetoPick";
import MatchOverview from "../../components/match/overview/MatchOverview.vue";
import OverviewCheckIn from "../../components/match/overview/OverviewCheckIn.vue";
import OverviewRegion from "../../components/match/overview/OverviewRegion.vue";

const NOW = Date.parse("2026-10-01T20:00:00.000Z");
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const t = (key: string, args?: Record<string, unknown>) =>
  args && Object.keys(args).length ? `${key}:${JSON.stringify(args)}` : key;
const ROLES = ["user", "verified_user", "streamer", "match_organizer", "tournament_organizer", "moderator", "administrator"];
const auth = {
  me: null as null | { steam_id: string },
  role: null as null | string,
  isRoleAbove(role: string) {
    return !!this.role && ROLES.indexOf(this.role) >= ROLES.indexOf(role);
  },
};
let latencies: Record<string, { latency: string; isLan: boolean }> = {};
const apollo = { mutate: vi.fn().mockResolvedValue({}) };
const globalConfig = () => ({
  config: { globalProperties: { $t: t, $apollo: apollo } as any },
  stubs: { Label: { template: "<label><slot /></label>" }, Switch: true },
});

beforeEach(() => {
  auth.me = null;
  auth.role = null;
  latencies = {};
  apollo.mutate.mockClear();
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useMatchmakingStore", () => ({
    joinedMatchmakingQueues: {},
    getRegionlatencyResult: (region: string) => latencies[region],
  }));
  vi.stubGlobal("useApplicationSettingsStore", () => ({
    settings: [],
    availableRegions: [
      { value: "EU", description: "Europe", status: "Online" },
      { value: "NA", description: "North America", status: "Partial" },
      { value: "SA", description: "South America", status: "Offline" },
    ],
  }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const player = (steam_id: string, checked_in = false, captain = false) => ({
  steam_id,
  checked_in,
  captain,
  player: { steam_id, name: `P${steam_id}` },
});
const checkInMatch = (setting: string, overrides: Record<string, any> = {}) => ({
  id: "m1",
  status: "WaitingForCheckIn",
  source: "5stack",
  is_tournament_match: true,
  min_players_per_lineup: 5,
  cancels_at: iso(522_000),
  can_check_in: false,
  can_start: false,
  lineup_1_id: "A",
  lineup_2_id: "B",
  options: { type: "Competitive", check_in_setting: setting, best_of: 1, map_pool: { maps: [] } },
  lineup_1: {
    id: "A",
    name: "Alpha",
    is_ready: false,
    lineup_players: [player("11", true, true), player("12", true), player("13", true), player("14"), player("15")],
  },
  lineup_2: {
    id: "B",
    name: "Bravo",
    is_ready: true,
    lineup_players: ["21", "22", "23", "24", "25"].map((id, i) => player(id, true, i === 0)),
  },
  match_maps: [],
  ...overrides,
});

describe("check-in stage", () => {
  it("WaitingForCheckIn is its own Overview stage, and the default view", () => {
    const match = checkInMatch("Players");
    expect(overviewStage(match, { captainPickActive: false })).toBe("check-in");
    expect(overviewIsDefault(match, "check-in", NOW)).toBe(true);
    // Matchmaking matches are created straight into Live/Veto: no check-in.
    expect(overviewStage({ ...match, status: "Veto" }, { captainPickActive: false })).toBe("veto");
  });

  it("counts in the match's own check-in model", () => {
    expect(checkInSummary(checkInMatch("Players"))).toMatchObject({ mode: "Players", ready: 8, required: 10 });
    const captains = checkInSummary(checkInMatch("Captains"));
    expect(captains).toMatchObject({ mode: "Captains", ready: 1, required: 2 });
    expect(captains.teams.map((t) => t.ready)).toEqual([false, true]);
    expect(checkInSummary(checkInMatch("Admin")).mode).toBe("Admin");
  });

  const mountCheckIn = (match: any) =>
    mount(OverviewCheckIn, { props: { match }, global: globalConfig() });

  it("individual check-in: the real action for an eligible player, no per-team list or counter", async () => {
    auth.me = { steam_id: "14" };
    const wrapper = mountCheckIn(checkInMatch("Players", { can_check_in: true }));
    // The team cards beside the panel show each player: only team rows here.
    expect(wrapper.find('[data-testid="check-in-players"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="check-in-teams"] > li')).toHaveLength(2);
    expect(wrapper.find('[data-testid^="check-in-player-"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="check-in-progress-1"]').text()).toBe("3 / 5");
    expect(wrapper.get('[data-testid="check-in-progress-2"]').text()).toBe("match.lifecycle.ready");
    expect(wrapper.text()).not.toContain("match.lifecycle.players_checked_in");
    const button = wrapper.get("button");
    expect(button.text()).toContain("match.check_in.check_in");
    await button.trigger("click");
    expect(apollo.mutate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(apollo.mutate.mock.calls[0][0].mutation)).toContain("checkIntoMatch");
  });

  it("captain and admin check-in keep their team rows", () => {
    for (const setting of ["Captains", "Admin"]) {
      const wrapper = mountCheckIn(checkInMatch(setting));
      expect(wrapper.find('[data-testid="check-in-players"]').exists()).toBe(false);
      expect(wrapper.findAll('[data-testid="check-in-teams"] > li')).toHaveLength(2);
      expect(wrapper.find('[data-testid^="check-in-player-"]').exists()).toBe(false);
    }
  });

  it("no action for a viewer can_check_in rejects, or who is not in the lineup", () => {
    auth.me = { steam_id: "14" };
    expect(mountCheckIn(checkInMatch("Players", { can_check_in: false })).find("button").exists()).toBe(false);
    auth.me = { steam_id: "99" };
    expect(mountCheckIn(checkInMatch("Players", { can_check_in: true })).find("button").exists()).toBe(false);
  });

  it("team check-in: team-level state, Check in team for the captain only", () => {
    auth.me = { steam_id: "11" };
    // Team Alpha's captain hasn't checked in yet.
    const waiting = checkInMatch("Captains", { can_check_in: true });
    waiting.lineup_1.lineup_players = waiting.lineup_1.lineup_players.map((p) => ({ ...p, checked_in: false }));
    const captain = mountCheckIn(waiting);
    expect(captain.get('[data-testid="check-in-team-1"]').text()).toContain("match.lifecycle.waiting_check_in");
    expect(captain.get('[data-testid="check-in-team-1"]').text()).not.toContain("checked in");
    expect(captain.get('[data-testid="check-in-team-2"]').text()).toContain("match.lifecycle.ready");
    expect(captain.get("button").text()).toContain("match.lifecycle.check_in_team");
    // A team member: can_check_in is false for non-captains, read only.
    auth.me = { steam_id: "12" };
    expect(mountCheckIn(checkInMatch("Captains", { can_check_in: false })).find("button").exists()).toBe(false);
  });

  it("admin check-in and the organizer's existing Start/Skip Check-In menu action", () => {
    const admin = mountCheckIn(checkInMatch("Admin", { cancels_at: null }));
    expect(admin.find('[data-testid="check-in-admin"]').exists()).toBe(true);
    expect(admin.find('[data-testid="check-in-expired"]').exists()).toBe(false);
    expect(admin.find('[data-testid="check-in-organizer"]').exists()).toBe(false);
    const organizer = mountCheckIn(checkInMatch("Players", { can_start: true }));
    expect(organizer.find('[data-testid="check-in-organizer"]').exists()).toBe(true);
    // Tournament Check-in Time over with nobody ready: server paged organizers.
    expect(mountCheckIn(checkInMatch("Players", { cancels_at: null })).find('[data-testid="check-in-expired"]').exists()).toBe(true);
    expect(
      mountCheckIn(checkInMatch("Players", { cancels_at: null, is_tournament_match: false })).find('[data-testid="check-in-expired"]').exists(),
    ).toBe(false);
  });

  const mountOverview = (match: any) =>
    mount(MatchOverview, { props: { match, stage: "check-in" }, global: globalConfig() });

  it("the countdown is the server's cancels_at, so a refresh resumes it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const wrapper = mountOverview(checkInMatch("Players"));
    expect(wrapper.get('[data-testid="overview-countdown"]').text()).toContain("08:42");
    expect(wrapper.get('[data-testid="overview-action-hint"]').text()).toContain('"ready":8,"required":10');
    // A page opened two minutes later starts from the same deadline.
    vi.setSystemTime(NOW + 120_000);
    expect(mountOverview(checkInMatch("Players")).get('[data-testid="overview-countdown"]').text()).toContain("06:42");
    // Admin check-in has no timer.
    expect(mountOverview(checkInMatch("Admin")).find('[data-testid="overview-countdown"]').exists()).toBe(false);
  });

  it("team panels mark players only where each player checks in", () => {
    const panels = (match: any) =>
      mountOverview(match).findAllComponents({ name: "DraftTeamPanel" }).map((p: any) => p.props("checkInBySteamId"));
    expect(panels(checkInMatch("Players"))[0]).toEqual({ "11": true, "12": true, "13": true, "14": false, "15": false });
    expect(panels(checkInMatch("Captains"))).toEqual([null, null]);
  });

  it("moves on to whatever stage the server puts the match in", async () => {
    const wrapper = mountOverview(checkInMatch("Players"));
    const next = { ...checkInMatch("Players"), status: "Veto", region: null, options: { ...checkInMatch("Players").options, region_veto: true, regions: ["EU", "NA"] } };
    await wrapper.setProps({ match: next, stage: "veto" });
    expect(wrapper.find('[data-testid="overview-check-in"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="overview-region"]').exists()).toBe(true);
    await wrapper.setProps({ match: { ...next, region: "EU" }, stage: "veto" });
    expect(wrapper.find('[data-testid="overview-veto"]').exists()).toBe(true);
  });
});

describe("region stage", () => {
  const regionMatch = (overrides: Record<string, any> = {}) => ({
    id: "m1",
    status: "Veto",
    source: "5stack",
    region: null,
    lineup_1_id: "A",
    lineup_2_id: "B",
    region_veto_picking_lineup_id: "A",
    map_veto_pick_expires_at: null,
    is_organizer: false,
    options: { type: "Competitive", region_veto: true, regions: ["EU", "NA", "SA"], best_of: 1, map_pool: { maps: [] } },
    lineup_1: { id: "A", name: "Alpha", is_picking_region_veto: true, lineup_players: [player("11", false, true)] },
    lineup_2: { id: "B", name: "Bravo", lineup_players: [player("21", false, true)] },
    match_maps: [],
    ...overrides,
  });
  const ban = (region: string, lineup: string) => ({ type: "Ban", region, match_lineup_id: lineup });

  it("pending only while the server has not locked a region (one region: no veto at all)", () => {
    expect(regionVetoPending(regionMatch())).toBe(true);
    // The Veto trigger pre-selects the region when only one is viable.
    expect(regionVetoPending(regionMatch({ region: "EU", options: { ...regionMatch().options, regions: ["EU"] } }))).toBe(false);
    expect(regionVetoPending(regionMatch({ options: { ...regionMatch().options, region_veto: false } }))).toBe(false);
  });

  it("region states and steps come from the real picks; no future turns are guessed", () => {
    const picks = [ban("SA", "A")];
    const match = regionMatch({ region_veto_picking_lineup_id: "B" });
    expect(regionVetoStates(match, picks).map((r) => [r.value, r.state, r.team])).toEqual([
      ["EU", "available", null],
      ["NA", "available", null],
      ["SA", "banned", 1],
    ]);
    expect(regionSteps(match, picks).map((s) => [s.type, s.team, s.state])).toEqual([
      ["Ban", 1, "done"],
      ["Ban", 2, "current"],
    ]);
    const done = regionMatch({ region: "EU", region_veto_picking_lineup_id: null });
    const finished = [ban("SA", "A"), ban("NA", "B"), { type: "Decider", region: "EU", match_lineup_id: "A" }];
    expect(regionVetoStates(done, finished).find((r) => r.value === "EU")?.state).toBe("selected");
    expect(regionSteps(done, finished).map((s) => s.type)).toEqual(["Ban", "Ban", "Decider"]);
  });

  const mountRegion = (match: any, picks: any[] = []) =>
    mount(OverviewRegion, { props: { match, picks }, global: globalConfig() });

  it("the captain confirms a ban through the existing region mutation", async () => {
    const match = regionMatch({ lineup_1: { ...regionMatch().lineup_1, can_pick_region_veto: true } });
    const wrapper = mountRegion(match);
    expect(sounds.playMatchFoundSound).toHaveBeenCalled();
    await wrapper.get('[data-testid="region-EU"]').trigger("click");
    expect(apollo.mutate).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="region-confirm-question"]').text()).toContain('"region":"Europe"');
    await wrapper.get('[data-testid="region-confirm-submit"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: regionVetoPickMutation,
      variables: { region: "EU", type: "Ban", match_id: "m1", match_lineup_id: "A" },
    });
  });

  it("spectators and guests are read only, and bans update live", async () => {
    const wrapper = mountRegion(regionMatch());
    expect(wrapper.findAll("button")).toHaveLength(0);
    await wrapper.get('[data-testid="region-EU"]').trigger("click");
    expect(wrapper.find('[data-testid="region-confirm"]').exists()).toBe(false);
    await wrapper.setProps({ picks: [ban("NA", "A")] });
    expect(wrapper.get('[data-testid="region-NA"]').attributes("data-state")).toBe("banned");
    expect(wrapper.get('[data-testid="region-NA"]').attributes("data-team")).toBe("1");
  });

  it("organizer override follows MatchRegionVeto's own rule", () => {
    auth.role = "administrator";
    expect(mountRegion(regionMatch()).find('[data-testid="region-override"]').exists()).toBe(false);
    expect(mountRegion(regionMatch({ is_organizer: true })).find('[data-testid="region-override"]').exists()).toBe(true);
    auth.role = "user";
    expect(mountRegion(regionMatch({ is_organizer: true })).find('[data-testid="region-override"]').exists()).toBe(false);
  });

  it("shows the region's real status and the viewer's own ping, never a made-up one", () => {
    const wrapper = mountRegion(regionMatch());
    expect(wrapper.findAll('[data-testid="region-latency"]')).toHaveLength(0);
    expect(wrapper.get('[data-testid="region-NA"]').text()).toContain("North America");
    latencies = { EU: { latency: "23.40", isLan: false } };
    const measured = mountRegion(regionMatch());
    expect(measured.findAll('[data-testid="region-latency"]')).toHaveLength(1);
    expect(measured.get('[data-testid="region-EU"]').text()).toContain('"ms":23');
  });

  it("the action bar names the acting team, the regions left and the strip", async () => {
    const wrapper = mount(MatchOverview, { props: { match: regionMatch(), stage: "veto" }, global: globalConfig() });
    (wrapper.vm as any).$data.regionPicks = [ban("SA", "B")];
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toContain('"team":"Alpha"');
    expect(wrapper.get('[data-testid="overview-action-meta"]').text()).toContain('"count":2');
    const chips = wrapper.findAll('[data-testid="overview-strip-step"]');
    expect(chips.map((c) => [c.attributes("data-tone"), c.attributes("data-state")])).toEqual([
      ["ban", "done"],
      ["ban", "current"],
    ]);
    expect(wrapper.findAllComponents({ name: "DraftTeamPanel" }).map((p: any) => p.props("active"))).toEqual([true, false]);
  });

  it("once the region is locked, the map veto names it", () => {
    const wrapper = mount(MatchOverview, {
      props: {
        match: { ...regionMatch({ region: "EU", e_region: { description: "Europe" } }), map_veto_type: "Ban", lineup_1: { ...regionMatch().lineup_1, is_picking_region_veto: false, is_picking_map_veto: true } },
        stage: "veto",
      },
      global: globalConfig(),
    });
    expect(wrapper.find('[data-testid="overview-region"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="overview-banner-region"]').text()).toContain('"region":"Europe"');
  });
});

describe("page wiring", () => {
  const page = readFileSync(path.resolve(__dirname, "../../pages/matches/[id]/index.vue"), "utf8");
  it("hides the duplicate check-in action and countdown in the info column while the Overview shows them", () => {
    expect(page).toContain(`:hide-check-in="overviewShown && overviewStage === 'check-in'"`);
    const info = readFileSync(path.resolve(__dirname, "../../components/match/MatchInfo.vue"), "utf8");
    expect(info).toContain("return !!this.isInMatch && this.match.can_check_in && !this.hideCheckIn;");
  });
  it("MatchRegionVeto sends the same shared region mutation", () => {
    const veto = readFileSync(path.resolve(__dirname, "../../components/match/MatchRegionVeto.vue"), "utf8");
    expect(veto).toContain("mutation: regionVetoPickMutation,");
  });
});
