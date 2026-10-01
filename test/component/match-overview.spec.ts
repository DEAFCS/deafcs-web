import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { draftAfter, makeDraft } from "./fixtures/captainPick";

vi.mock("~/components/draft-games/DraftTeamPanel.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).TeamPanel,
}));
vi.mock("~/components/draft-games/DraftPlayerCard.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).PlayerCard,
}));
vi.mock("~/components/match/MatchRegionVeto.vue", () => ({
  default: { name: "MatchRegionVeto", template: `<div data-testid="region-veto" />` },
}));
vi.mock("~/components/ClipBoard.vue", () => ({
  default: {
    name: "ClipBoard",
    props: ["data"],
    template: `<button data-testid="copy-ip"><slot /></button>`,
  },
}));
const sounds = {
  playMatchFoundSound: vi.fn(),
  playTickSound: vi.fn(),
  playCountdownSound: vi.fn(),
};
vi.mock("~/composables/useSound", () => ({ useSound: () => sounds }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

import {
  captainPickHistory,
  ctStartTeam,
  defaultMatchTab,
  mapVetoPattern,
  mapVetoTurnTeam,
  OVERVIEW_TAB,
  overviewIsDefault,
  overviewStage,
  scoreboardHandoffAt,
  scoreboardHandoffRemainingMs,
  SCOREBOARD_HANDOFF_MS,
  tabAfterOverviewChange,
  vetoMapStates,
  vetoSteps,
} from "../../utilities/matchLifecycle";
import { mapVetoPickMutation } from "../../graphql/mapVetoPick";
import MatchOverview from "../../components/match/overview/MatchOverview.vue";
import OverviewVeto from "../../components/match/overview/OverviewVeto.vue";
import OverviewPreMatch from "../../components/match/overview/OverviewPreMatch.vue";
import { $, order_by, e_match_status_enum, e_player_roles_enum } from "../../generated/zeus";
import { typedGql } from "../../generated/zeus/typedDocumentNode";
import { mapFields } from "../../graphql/mapGraphql";
import { matchLineups } from "../../graphql/matchLineupsGraphql";
import { playerFields } from "../../graphql/playerFields";
import { matchOptionsFields } from "../../graphql/matchOptionsFields";
import { eloFields } from "../../graphql/eloFields";
import { getCaptainPickDraft } from "../../utilities/captainPickDraft";

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
const matchmaking = { joinedMatchmakingQueues: { confirmation: undefined as any } };
const apollo = { mutate: vi.fn().mockResolvedValue({}) };

const globalConfig = () => ({
  config: { globalProperties: { $t: t, $apollo: apollo } as any },
  stubs: { Label: { template: "<label><slot /></label>" }, Switch: true, NuxtLink: { props: ["to"], template: `<a :href="to"><slot /></a>` } },
});

beforeEach(() => {
  auth.me = null;
  auth.role = null;
  matchmaking.joinedMatchmakingQueues.confirmation = undefined;
  apollo.mutate.mockClear();
  Object.values(sounds).forEach((fn) => fn.mockClear());
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useMatchmakingStore", () => matchmaking);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useApplicationSettingsStore", () => ({ settings: [] }));
  vi.stubGlobal("useMatchLobbyStore", () => ({ lobbyChat: {} }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const lineup = (name: string, players: string[], extra: Record<string, any> = {}) => ({
  id: `${name}-id`,
  name,
  lineup_players: players.map((steam_id, index) => ({
    steam_id,
    captain: index === 0,
    player: { steam_id, name: `P${steam_id}` },
  })),
  ...extra,
});
const pool = ["mirage", "inferno", "nuke", "ancient", "anubis", "dust2", "train"].map((name) => ({
  id: name,
  name: `de_${name}`,
  label: null,
  poster: `/img/maps/${name}.webp`,
}));
const baseMatch = (overrides: Record<string, any> = {}) => ({
  id: "m1",
  status: "Veto",
  source: "5stack",
  started_at: null,
  min_players_per_lineup: 5,
  lineup_1_id: "Alpha-id",
  lineup_2_id: "Bravo-id",
  lineup_1: lineup("Alpha", ["11", "12", "13", "14", "15"]),
  lineup_2: lineup("Bravo", ["21", "22", "23", "24", "25"]),
  options: { type: "Competitive", best_of: 3, map_veto: true, region_veto: false, map_pool: { maps: pool } },
  match_maps: [],
  map_veto_type: "Ban",
  map_veto_picking_lineup_id: "Alpha-id",
  is_in_lineup: false,
  is_captain: false,
  is_coach: false,
  is_organizer: false,
  ...overrides,
});
const pick = (type: string, map: string, lineupId: string | null, side: string | null = null) => ({
  id: `${type}-${map}-${side ?? ""}`,
  type,
  side,
  match_lineup_id: lineupId,
  map: pool.find((m) => m.id === map),
});
// A finished Bo3 veto as Postgres records it (Bo3 swaps after four turns).
const bo3Picks = [
  pick("Ban", "ancient", "Alpha-id"),
  pick("Ban", "anubis", "Bravo-id"),
  pick("Pick", "mirage", "Alpha-id"),
  pick("Side", "mirage", "Bravo-id", "CT"),
  pick("Pick", "nuke", "Bravo-id"),
  pick("Side", "nuke", "Alpha-id", "TERRORIST"),
  pick("Ban", "dust2", "Bravo-id"),
  pick("Ban", "train", "Alpha-id"),
  pick("Decider", "inferno", "Bravo-id"),
];

// ---------------------------------------------------------------------------

describe("lifecycle stage and cooldown", () => {
  it("Captain Pick only for a real draft; ordinary and tournament matches go straight to veto", () => {
    expect(overviewStage(baseMatch({ status: "PickingPlayers" }), { captainPickActive: true })).toBe("captain-pick");
    expect(overviewStage(baseMatch({ status: "PickingPlayers" }), { captainPickActive: false })).toBeNull();
    expect(overviewStage(baseMatch(), { captainPickActive: false })).toBe("veto");
    expect(overviewStage(baseMatch({ is_tournament_match: true }), { captainPickActive: false })).toBe("veto");
    expect(overviewStage(baseMatch({ status: "WaitingForServer" }), { captainPickActive: false })).toBe("pre-match");
    expect(overviewStage(baseMatch({ status: "Live" }), { captainPickActive: false })).toBe("pre-match");
    expect(overviewStage(baseMatch({ status: "Finished" }), { captainPickActive: false })).toBeNull();
    expect(overviewStage(baseMatch({ source: "faceit" }), { captainPickActive: false })).toBeNull();
  });

  it("the 30 second cooldown is anchored on started_at: halfway shows the rest, expired skips it", () => {
    expect(SCOREBOARD_HANDOFF_MS).toBe(30_000);
    const live = (ago: number) => baseMatch({ status: "Live", started_at: iso(-ago) });
    expect(scoreboardHandoffAt(live(20_000))).toBe(NOW + 10_000);
    expect(scoreboardHandoffRemainingMs(live(20_000), NOW)).toBe(10_000);
    expect(overviewIsDefault(live(20_000), "pre-match", NOW)).toBe(true);
    // A refresh does not restart it: the same timestamp, the same remainder.
    expect(scoreboardHandoffRemainingMs(live(20_000), NOW + 5_000)).toBe(5_000);
    expect(overviewIsDefault(live(31_000), "pre-match", NOW)).toBe(false);
    expect(overviewIsDefault(baseMatch({ status: "WaitingForServer" }), "pre-match", NOW)).toBe(true);
    expect(overviewIsDefault(baseMatch(), "veto", NOW)).toBe(true);
    expect(overviewIsDefault(baseMatch({ status: "Live", started_at: null }), "pre-match", NOW)).toBe(false);
    // A client clock behind the server never stretches the window.
    expect(scoreboardHandoffRemainingMs(baseMatch({ status: "Live", started_at: iso(90_000) }), NOW)).toBe(30_000);
  });

  it("hands over to the Scoreboard once, and never overrides a tab chosen afterwards", () => {
    expect(OVERVIEW_TAB).not.toBe("overview"); // a legacy Scoreboard alias
    expect(defaultMatchTab(true, true)).toBe(OVERVIEW_TAB);
    expect(defaultMatchTab(true, false)).toBe("scoreboard");
    expect(defaultMatchTab(false, true)).toBe("scoreboard");
    expect(tabAfterOverviewChange(OVERVIEW_TAB, true, false)).toBe("scoreboard");
    expect(tabAfterOverviewChange("economy", true, false)).toBeNull();
    expect(tabAfterOverviewChange(OVERVIEW_TAB, false, false)).toBeNull();
    expect(tabAfterOverviewChange(OVERVIEW_TAB, false, true)).toBeNull();
  });
});

describe("veto sequence", () => {
  it("mirrors get_map_veto_pattern for Bo1, Bo3 and Bo5", () => {
    expect(mapVetoPattern(3, 7)).toEqual(["Ban", "Ban", "Pick", "Side", "Pick", "Side", "Ban", "Ban", "Decider"]);
    expect(mapVetoPattern(1, 7)).toEqual(["Ban", "Ban", "Ban", "Ban", "Ban", "Ban", "Decider"]);
    expect(mapVetoPattern(5, 7)).toEqual(["Ban", "Ban", "Pick", "Side", "Pick", "Side", "Pick", "Side", "Pick", "Side", "Decider"]);
    expect(mapVetoPattern(2, 7)).toEqual([]);
    expect([0, 1, 2, 3, 4, 5].map((turn) => mapVetoTurnTeam(3, turn))).toEqual([1, 2, 1, 2, 2, 1]);
    expect([0, 1, 2].map((turn) => mapVetoTurnTeam(1, turn))).toEqual([1, 2, 1]);
  });

  it("done steps are the real picks, the current one is the server's, the rest is previewed", () => {
    const match = baseMatch({ map_veto_type: "Pick", map_veto_picking_lineup_id: "Alpha-id" });
    const steps = vetoSteps(match, bo3Picks.slice(0, 2));
    expect(steps.map((s) => [s.type, s.team, s.state])).toEqual([
      ["Ban", 1, "done"],
      ["Ban", 2, "done"],
      ["Pick", 1, "current"],
      ["Pick", 2, "upcoming"],
      ["Ban", 2, "upcoming"],
      ["Ban", 1, "upcoming"],
      ["Decider", null, "upcoming"],
    ]);
    // A side choice rides on its pick.
    const side = vetoSteps(baseMatch({ map_veto_type: "Side", map_veto_picking_lineup_id: "Bravo-id" }), bo3Picks.slice(0, 3));
    expect(side[2]).toMatchObject({ type: "Pick", state: "current", choosingSide: true });
    // Disagreeing with the server: no guesses about the future.
    const odd = vetoSteps(baseMatch({ map_veto_type: "Ban" }), [pick("Pick", "nuke", "Alpha-id")]);
    expect(odd.map((s) => s.state)).toEqual(["done", "current"]);
  });

  it("maps carry their state, team and side", () => {
    const rows = Object.fromEntries(vetoMapStates(baseMatch({ status: "Live" }), bo3Picks).map((r) => [r.map.id, r]));
    expect(rows.ancient).toMatchObject({ state: "banned", team: 1 });
    expect(rows.mirage).toMatchObject({ state: "picked", team: 1, side: "CT", sideTeam: 2 });
    expect(rows.nuke).toMatchObject({ state: "picked", team: 2 });
    expect(rows.inferno).toMatchObject({ state: "decider", team: null });
    expect(vetoMapStates(baseMatch(), []).every((r) => r.state === "available")).toBe(true);
    expect(ctStartTeam({ lineup_1_side: "TERRORIST", lineup_2_side: "CT" })).toBe(2);
    expect(ctStartTeam({})).toBeNull();
  });
});

describe("Captain Pick overview", () => {
  const mountOverview = (props: Record<string, any>) =>
    mount(MatchOverview, { props, global: globalConfig() });

  it("Team 1 | pool | Team 2 with the real pick order, filling live and read only", async () => {
    const wrapper = mountOverview({
      match: { id: "m1", status: "PickingPlayers", options: {} },
      stage: "captain-pick",
      captainPickProgress: makeDraft(),
    });
    const chips = () => wrapper.findAll('[data-testid="overview-strip-step"]');
    expect(chips().map((c) => c.text())).toEqual(makeDraft().pickOrder.map((l) => `T${l}`));
    expect(chips()[0].attributes("data-state")).toBe("current");
    expect(chips()[1].attributes("data-state")).toBe("upcoming");
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toContain("Player 2");
    expect(wrapper.get('[data-testid="spectator-available"]').text()).toContain("(8)");

    await wrapper.setProps({ captainPickProgress: draftAfter([{ steam_id: "3" }, { steam_id: "4" }]) });
    expect(chips().map((c) => c.attributes("data-state")).slice(0, 3)).toEqual(["done", "done", "current"]);
    expect(wrapper.get('[data-testid="overview-team-1"]').text()).toContain("Player 3");
    expect(wrapper.get('[data-testid="overview-team-2"]').text()).toContain("Player 4");
    expect(wrapper.get('[data-testid="spectator-available"]').text()).toContain("(6)");
    expect(wrapper.get('[data-testid="spectator-history"]').text()).toContain("Player 3");
    expect(wrapper.findAll("button,input,textarea")).toHaveLength(0);
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(false);
  });

  it("rebuilds the pick history from the public feed", () => {
    const history = captainPickHistory(draftAfter([{ steam_id: "3" }, { steam_id: "4" }, { steam_id: "5" }]));
    expect(history.map((h) => [h.lineup, h.captain.name, h.picked.name])).toEqual([
      [1, "Player 2", "Player 3"],
      [2, "Player 1", "Player 4"],
      [2, "Player 1", "Player 5"],
    ]);
    // The auto-placed last player is not a pick.
    const done = draftAfter(["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id })));
    expect(captainPickHistory(done)).toHaveLength(7);
  });

  it("participants keep their workflow: a link to their Captain Pick and the real timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    auth.me = { steam_id: "2" };
    const draft = { ...makeDraft(), matchId: "m1", serverNow: iso(0), deadline: iso(20_000) };
    const wrapper = mountOverview({
      match: { id: "m1", status: "PickingPlayers", options: {} },
      stage: "captain-pick",
      captainPickProgress: makeDraft(),
      participantDraft: draft,
      participant: true,
    });
    expect(wrapper.get('[data-testid="open-captain-pick"]').attributes("href")).toBe("/play/captain-pick");
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="overview-action-bar"]').classes()).toContain("is-mine");
    // Still no pick buttons on the match page itself.
    expect(wrapper.findAll("button")).toHaveLength(0);
  });

  it("after the final pick the middle becomes the veto, same match, teams kept", async () => {
    const wrapper = mountOverview({
      match: { ...baseMatch({ status: "PickingPlayers" }) },
      stage: "captain-pick",
      captainPickProgress: null,
    });
    expect(wrapper.find('[data-testid="spectator-finalizing"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="overview-team-1"]').text()).toContain("P11");

    await wrapper.setProps({ match: baseMatch(), stage: "veto" });
    expect(wrapper.get('[data-testid="match-overview"]').attributes("data-stage")).toBe("veto");
    expect(wrapper.find('[data-testid="captain-pick-spectator"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="overview-veto"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="overview-team-1"]').text()).toContain("P15");
    expect(wrapper.get('[data-testid="overview-team-2"]').text()).toContain("P25");
  });
});

describe("veto overview", () => {
  // As the match_map_veto_picks subscription delivers them.
  const mountOverview = async (match: any, picks: any[]) => {
    const wrapper = mount(MatchOverview, { props: { match, stage: "veto" }, global: globalConfig() });
    // $data: the component also has a <script setup> block, so vm.picks
    // would land on the setup proxy instead of the options data.
    (wrapper.vm as any).$data.picks = picks;
    await wrapper.vm.$nextTick();
    return wrapper;
  };

  it("colors the strip: bans red, Team 1 picks amber, Team 2 picks blue, decider neutral", async () => {
    const wrapper = await mountOverview(
      baseMatch({ map_veto_type: "Ban", map_veto_picking_lineup_id: "Bravo-id", lineup_2: lineup("Bravo", ["21"], { is_picking_map_veto: true }) }),
      bo3Picks.slice(0, 6),
    );
    await wrapper.vm.$nextTick();
    const chips = wrapper.findAll('[data-testid="overview-strip-step"]');
    expect(chips.map((c) => c.attributes("data-tone"))).toEqual(["ban", "ban", "t1", "t2", "ban", "ban", "decider"]);
    expect(chips.map((c) => c.attributes("data-state"))).toEqual(["done", "done", "done", "done", "current", "upcoming", "upcoming"]);
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toContain("match.lifecycle.veto_ban");
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toContain("Bravo");
    expect(wrapper.get('[data-testid="overview-action-hint"]').text()).toContain("match.lifecycle.wait_ban");
    expect(wrapper.findAllComponents({ name: "DraftTeamPanel" }).map((p: any) => p.props("active"))).toEqual([false, true]);
  });

  it("Bo1 is all bans and a decider", async () => {
    const wrapper = await mountOverview(baseMatch({ options: { ...baseMatch().options, best_of: 1 } }), []);
    await wrapper.vm.$nextTick();
    const tones = wrapper.findAll('[data-testid="overview-strip-step"]').map((c) => c.attributes("data-tone"));
    expect(tones).toEqual(["ban", "ban", "ban", "ban", "ban", "ban", "decider"]);
  });

  it("shows the region veto in the middle while one is pending", async () => {
    const wrapper = await mountOverview(baseMatch({ options: { ...baseMatch().options, region_veto: true }, region: null }), []);
    expect(wrapper.find('[data-testid="region-veto"]').exists()).toBe(true);
  });
});

describe("veto actions", () => {
  const mountVeto = (match: any, picks: any[] = []) =>
    mount(OverviewVeto, { props: { match, picks }, global: globalConfig() });

  it("spectators see live map states and cannot act", async () => {
    const wrapper = mountVeto(baseMatch(), bo3Picks.slice(0, 2));
    expect(wrapper.get('[data-testid="veto-map-ancient"]').attributes("data-state")).toBe("banned");
    await wrapper.setProps({ picks: bo3Picks.slice(0, 3) });
    expect(wrapper.get('[data-testid="veto-map-mirage"]').attributes("data-state")).toBe("picked");
    expect(wrapper.get('[data-testid="veto-map-mirage"]').attributes("data-team")).toBe("1");
    expect(wrapper.findAll("button")).toHaveLength(0);
    await wrapper.get('[data-testid="veto-map-nuke"]').trigger("click");
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    expect(apollo.mutate).not.toHaveBeenCalled();
  });

  it("the captain confirms a ban, and the existing mutation carries it to Postgres", async () => {
    const match = baseMatch({ is_captain: true, lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true }) });
    const wrapper = mountVeto(match, bo3Picks.slice(0, 1));
    expect(sounds.playMatchFoundSound).toHaveBeenCalled();
    await wrapper.get('[data-testid="veto-map-mirage"]').trigger("click");
    expect(apollo.mutate).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="veto-confirm-question"]').text()).toContain("match.lifecycle.confirm_ban_question");
    expect(wrapper.get('[data-testid="veto-confirm-question"]').text()).toContain("Mirage");

    await wrapper.get('[data-testid="veto-confirm-cancel"]').trigger("click");
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    // Banned maps can't be chosen.
    await wrapper.get('[data-testid="veto-map-ancient"]').trigger("click");
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);

    await wrapper.get('[data-testid="veto-map-mirage"]').trigger("click");
    await wrapper.get('[data-testid="veto-confirm-submit"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: mapVetoPickMutation,
      variables: { map_id: "mirage", type: "Ban", match_id: "m1", match_lineup_id: "Alpha-id" },
    });
  });

  it("an organizer who is not a captain cannot act unless they use the override", async () => {
    const match = baseMatch({ is_organizer: true, lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true }) });
    const wrapper = mountVeto(match);
    expect(wrapper.findAll('button[data-testid^="veto-map-"]')).toHaveLength(0);
    await wrapper.get('[data-testid="veto-override"]').trigger("click");
    expect(wrapper.findAll('button[data-testid^="veto-map-"]').length).toBeGreaterThan(0);
  });

  it("Bo3 side choice: CT or T on the picked map, confirmed, through the same mutation", async () => {
    const match = baseMatch({
      is_captain: true,
      map_veto_type: "Side",
      map_veto_picking_lineup_id: "Bravo-id",
      lineup_2: lineup("Bravo", ["21"], { can_pick_map_veto: true }),
    });
    const wrapper = mountVeto(match, bo3Picks.slice(0, 3));
    expect(wrapper.get('[data-testid="veto-side-map"]').text()).toBe("Mirage");
    expect(wrapper.find('[data-testid="veto-maps"]').exists()).toBe(false);
    await wrapper.get('[data-testid="veto-side-CT"]').trigger("click");
    expect(wrapper.get('[data-testid="veto-confirm-question"]').text()).toContain('"side":"CT"');
    await wrapper.get('[data-testid="veto-confirm-submit"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: mapVetoPickMutation,
      variables: { map_id: "mirage", type: "Side", side: "CT", match_id: "m1", match_lineup_id: "Bravo-id" },
    });
  });

  it("MatchMapVeto sends the very same mutation", () => {
    const veto = readFileSync(path.resolve(__dirname, "../../components/match/MatchMapVeto.vue"), "utf8");
    expect(veto).toContain("mutation: mapVetoPickMutation,");
  });
});

describe("pre-match summary", () => {
  const liveMatch = (overrides: Record<string, any> = {}) =>
    baseMatch({
      status: "Live",
      started_at: iso(-5_000),
      is_server_online: true,
      server_id: "s1",
      match_maps: [
        { id: "mm1", order: 1, map: pool[0], lineup_1_side: "TERRORIST", lineup_2_side: "CT" },
        { id: "mm2", order: 2, map: pool[2], lineup_1_side: "CT", lineup_2_side: "TERRORIST" },
        { id: "mm3", order: 3, map: pool[1], lineup_1_side: null, lineup_2_side: null },
      ],
      ...overrides,
    });
  const mountSummary = (match: any) =>
    mount(OverviewPreMatch, { props: { match, picks: bo3Picks }, global: globalConfig() });

  it("Bo3: Map 1, Map 2 and the decider, with starting sides", () => {
    const wrapper = mountSummary(liveMatch());
    expect(wrapper.get('[data-testid="pre-match-map-1"]').text()).toContain("Mirage");
    expect(wrapper.get('[data-testid="pre-match-map-1"]').text()).toContain('"team":"Bravo"');
    expect(wrapper.get('[data-testid="pre-match-map-2"]').text()).toContain('"team":"Alpha"');
    expect(wrapper.get('[data-testid="pre-match-map-3"]').text()).toContain("Inferno");
    expect(wrapper.get('[data-testid="pre-match-map-3"]').find('[data-testid="pre-match-decider"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="pre-match-map-3"]').find('[data-testid="pre-match-side"]').exists()).toBe(false);
  });

  it("Bo1 shows one map", () => {
    const wrapper = mountSummary(
      liveMatch({ options: { ...baseMatch().options, best_of: 1 }, match_maps: [{ id: "mm1", order: 1, map: pool[1] }] }),
    );
    expect(wrapper.findAll('[data-testid^="pre-match-map-"]')).toHaveLength(1);
  });

  it("server preparation states", () => {
    expect(mountSummary(liveMatch({ status: "WaitingForServer" })).get('[data-testid="pre-match-server"]').attributes("data-state")).toBe("waiting");
    expect(mountSummary(liveMatch({ is_server_online: false })).get('[data-testid="pre-match-server"]').attributes("data-state")).toBe("starting");
    expect(mountSummary(liveMatch()).get('[data-testid="pre-match-server"]').attributes("data-state")).toBe("ready");
  });

  it("Join Server and Copy IP follow the existing permissions and never leak", () => {
    const secret = { connection_string: "connect 1.2.3.4:27015; password x", connection_link: "steam://connect/1.2.3.4" };
    const guest = mountSummary(liveMatch(secret));
    expect(guest.html()).not.toContain("1.2.3.4");

    auth.me = { steam_id: "99" };
    const spectator = mountSummary(liveMatch({ connection_string: null, connection_link: null }));
    expect(spectator.find('[data-testid="copy-ip"]').exists()).toBe(false);
    expect(spectator.find("a[href^='steam://']").exists()).toBe(false);

    auth.me = { steam_id: "11" };
    const player = mountSummary(liveMatch({ ...secret, is_in_lineup: true }));
    expect(player.find('[data-testid="copy-ip"]').exists()).toBe(true);
    expect(player.find("a[href='steam://connect/1.2.3.4']").exists()).toBe(true);
  });

  it("the cooldown bar counts down from started_at", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const wrapper = mount(MatchOverview, {
      props: { match: liveMatch({ started_at: iso(-20_000) }), stage: "pre-match", now: NOW },
      global: globalConfig(),
    });
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toBe("match.lifecycle.match_starting");
    expect(wrapper.find('[data-testid="overview-clock"]').text()).toContain("10");
    const live = mount(MatchOverview, {
      props: { match: liveMatch({ started_at: iso(-60_000) }), stage: "pre-match", now: NOW },
      global: globalConfig(),
    });
    expect(live.get('[data-testid="overview-action-title"]').text()).toBe("match.lifecycle.match_live");
    expect(live.find('[data-testid="overview-clock"]').exists()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The page's real Options block, imports stripped (as guest-match-page.spec).
const pageSource = readFileSync(path.resolve(__dirname, "../../pages/matches/[id]/index.vue"), "utf8");
const pageScript = parse(pageSource).descriptor.script!.content;
const pageAst = ts.createSourceFile("match.ts", pageScript, ts.ScriptTarget.Latest, true);
let pageBody = pageScript;
for (const node of [...pageAst.statements].reverse()) {
  if (ts.isImportDeclaration(node)) pageBody = pageBody.slice(0, node.pos) + pageBody.slice(node.end);
}
const pageExports: any = {};
new Function(
  "exports", "$", "order_by", "e_match_status_enum", "e_player_roles_enum", "typedGql", "mapFields", "matchLineups", "playerFields", "matchOptionsFields", "eloFields",
  "overviewStage", "overviewIsDefault", "scoreboardHandoffAt", "SCOREBOARD_HANDOFF_MS", "OVERVIEW_TAB", "getCaptainPickDraft", "useAuthStore", "useMatchmakingStore",
  ts.transpileModule(pageBody, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
)(
  pageExports, $, order_by, e_match_status_enum, e_player_roles_enum, typedGql, mapFields, matchLineups, playerFields, matchOptionsFields, eloFields,
  overviewStage, overviewIsDefault, scoreboardHandoffAt, SCOREBOARD_HANDOFF_MS, OVERVIEW_TAB, getCaptainPickDraft, () => auth, () => matchmaking,
);
const page = pageExports.default;
const pageContext = (state: Record<string, any>) => {
  const ctx: any = {
    publicCaptainPick: { progress: null },
    captainPickMatch: { matchId: null, active: false, participant: false },
    lifecycleNow: NOW,
    lifecycleHandoffTimer: undefined,
    matchTab: null,
    ...state,
  };
  for (const name of ["captainPickActive", "overviewStage", "overviewHandoffAt", "overviewDefault", "overviewShown", "participantDraft", "overviewFocus"]) {
    Object.defineProperty(ctx, name, { get: () => page.computed[name].call(ctx) });
  }
  return ctx;
};
const template = parse(pageSource).descriptor.template!.content;

describe("match page", () => {
  it("keeps the normal banner and its ... menu from the start of Captain Pick", () => {
    const header = template.slice(template.indexOf("<header"), template.indexOf("</header>"));
    expect(header).toContain('<MatchActions :match="match" />');
    expect(header).toContain("match.options.best_of.option");
    expect(header).toContain("match.e_region.description");
    // The banner is not gated on any status or lifecycle stage.
    expect(template.slice(0, template.indexOf("<header"))).not.toMatch(/overview|PickingPlayers/);
  });

  it("Captain Pick stage only for a real draft, also between the final pick and veto", () => {
    const picking = baseMatch({ status: "PickingPlayers" });
    expect(pageContext({ match: picking }).overviewStage).toBeNull();
    expect(pageContext({ match: picking, publicCaptainPick: { progress: makeDraft() } }).overviewStage).toBe("captain-pick");
    expect(pageContext({ match: picking, captainPickMatch: { matchId: "m1", active: true } }).overviewStage).toBe("captain-pick");
  });

  it("the cooldown timer survives refreshes and hands over once", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const ctx = pageContext({ match: baseMatch({ status: "Live", started_at: iso(-15_000) }) });
    page.watch.overviewHandoffAt.handler.call(ctx, ctx.overviewHandoffAt);
    expect(ctx.overviewDefault).toBe(true);
    vi.advanceTimersByTime(14_000);
    expect(ctx.overviewDefault).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(ctx.overviewDefault).toBe(false);

    const late = pageContext({ match: baseMatch({ status: "Live", started_at: iso(-45_000) }) });
    page.watch.overviewHandoffAt.handler.call(late, late.overviewHandoffAt);
    expect(late.lifecycleHandoffTimer).toBeUndefined();
    expect(late.overviewDefault).toBe(false);
  });

  it("brings a captain back to the Overview on their veto turn only", () => {
    const turn = (overrides: any) => pageContext({ match: baseMatch(overrides) }).overviewFocus;
    expect(turn({})).toBe(false);
    expect(turn({ lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true }) })).toBe(true);
    expect(turn({ is_organizer: true, lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true }) })).toBe(false);
    expect(turn({ status: "Live", lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true }) })).toBe(false);
  });

  it("uses the viewer's own draft for the timer only on that match", () => {
    matchmaking.joinedMatchmakingQueues.confirmation = { captainPick: { ...makeDraft(), matchId: "m1" } };
    expect(pageContext({ match: baseMatch({ status: "PickingPlayers" }) }).participantDraft?.matchId).toBe("m1");
    expect(pageContext({ match: baseMatch({ id: "other", status: "PickingPlayers" }) }).participantDraft).toBeNull();
  });

  it("wires the Overview into MatchTabs, full width while it's open", () => {
    expect(template).toMatch(/<MatchTabs[\s\S]*:overview-available="!!overviewStage"[\s\S]*:overview-default="overviewDefault"[\s\S]*:overview-focus="overviewFocus"[\s\S]*@update:active-tab="matchTab = \$event"/);
    expect(pageContext({ match: baseMatch(), matchTab: OVERVIEW_TAB }).overviewShown).toBe(true);
    expect(pageContext({ match: baseMatch(), matchTab: "scoreboard" }).overviewShown).toBe(false);
    // No veto or Captain Pick UI outside the Overview, no invented toggle.
    expect(template).not.toMatch(/<MatchMapVeto|<MatchRegionVeto|<CaptainPickProgress|show-scoreboard/);
  });

  it("removes the inline Match Chat and Team Chat; the Chat Hub keeps both rooms", () => {
    expect(template).not.toContain("<ChatLobby");
    expect(page.computed.chatHubContext.toString()).toContain("this.canUseMatchChat");
    expect(page.computed.chatHubContext.toString()).toContain("this.myLineup");
    expect(page.created.toString()).toContain("useChatHubContext(() => this.chatHubContext)");
  });

  it("leaves staff, RCON and stream controls as they were", () => {
    expect(template).toContain('<MatchAdminBottomBar v-if="canViewMatchAdminBar" :match="match" />');
    expect(page.computed.canViewMatchAdminBar.toString()).toContain("e_player_roles_enum.moderator");
    const tabs = readFileSync(path.resolve(__dirname, "../../components/match/MatchTabs.vue"), "utf8");
    expect(tabs).toContain('<DropdownMenuItem v-if="canViewAdmin" @click="activeTab = \'server\'">');
    expect(tabs).toContain('<SelectItem v-if="canViewAdmin" value="server">');
  });
});
