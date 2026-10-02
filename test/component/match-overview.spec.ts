import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse, compileScript, compileTemplate } from "@vue/compiler-sfc";
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
  OVERVIEW_TAB,
  overviewIsDefault,
  overviewStage,
  matchMapInPlay,
  matchServerReady,
  rememberServerReadyAt,
  forgetServerReadyAt,
  lifecycleRestarted,
  PRE_SERVER_STAGES,
  scoreboardHandoffAt,
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
// Same order as AuthStore's roleOrder.
const ROLES = ["user", "verified_user", "streamer", "moderator", "match_organizer", "tournament_organizer", "administrator"];
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
  stubs: { Badge: { template: "<span><slot /></span>" }, Label: { template: "<label><slot /></label>" }, Switch: true, NuxtLink: { props: ["to"], template: `<a :href="to"><slot /></a>` } },
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
// matches.map_veto_sequence exactly as get_map_veto_sequence returns it
// (locked by api-deafcs test/map-veto.spec.ts).
const seq = (steps: string) =>
  steps.split(" ").map((step, index) => {
    const [type, team] = step.split(":");
    return { index, type, team: Number(team) };
  });
const BO3_SEQUENCE = seq("Ban:1 Ban:2 Pick:1 Side:2 Pick:2 Side:1 Ban:2 Ban:1 Decider:2");
const BO1_SEQUENCE = seq("Ban:1 Ban:2 Ban:1 Ban:2 Ban:1 Ban:2 Decider:1");
const baseMatch = (overrides: Record<string, any> = {}) => ({
  map_veto_sequence: BO3_SEQUENCE,
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

  it("the hidden 30 second handoff starts only when the server is ready, never at veto completion", () => {
    expect(SCOREBOARD_HANDOFF_MS).toBe(30_000);
    const live = (extra: any = {}) =>
      baseMatch({ status: "Live", started_at: iso(-600_000), server_id: "s1", is_server_online: false, ...extra });
    // Veto finished ten minutes ago, server still booting: stays on the Overview.
    expect(matchServerReady(live())).toBe(false);
    expect(scoreboardHandoffAt(live(), null)).toBeNull();
    expect(overviewIsDefault(live(), "pre-match", NOW, null)).toBe(true);
    expect(overviewIsDefault(baseMatch({ status: "WaitingForServer" }), "pre-match", NOW, null)).toBe(true);
    expect(overviewIsDefault(live({ server_id: null, is_server_online: true }), "pre-match", NOW, null)).toBe(true);
    // Server up (Join Server / Copy IP usable): 30 seconds from then.
    const ready = live({ is_server_online: true });
    expect(matchServerReady(ready)).toBe(true);
    expect(scoreboardHandoffAt(ready, NOW - 20_000)).toBe(NOW + 10_000);
    expect(overviewIsDefault(ready, "pre-match", NOW, NOW - 20_000)).toBe(true);
    expect(overviewIsDefault(ready, "pre-match", NOW, NOW - 31_000)).toBe(false);
    // Once a map is being played, everyone is on the Scoreboard.
    const playing = live({ is_server_online: true, match_maps: [{ id: "mm1", status: "Live" }] });
    expect(matchMapInPlay(playing)).toBe(true);
    expect(matchMapInPlay(live({ match_maps: [{ id: "mm1", status: "Warmup" }] }))).toBe(false);
    expect(overviewIsDefault(playing, "pre-match", NOW, NOW)).toBe(false);
    expect(overviewIsDefault(baseMatch(), "veto", NOW)).toBe(true);
  });

  it("remembers when the server was first seen ready, so a refresh continues the same 30 seconds", () => {
    window.localStorage.clear();
    expect(rememberServerReadyAt("m1", NOW)).toBe(NOW);
    // A refresh 12 seconds later resumes from the first moment.
    expect(rememberServerReadyAt("m1", NOW + 12_000)).toBe(NOW);
    // Per match.
    expect(rememberServerReadyAt("m2", NOW + 12_000)).toBe(NOW + 12_000);
    // A stored moment "in the future" (clock change) can't extend the window.
    window.localStorage.setItem("deafcs:match-server-ready:m3", String(NOW + 60_000));
    expect(rememberServerReadyAt("m3", NOW)).toBe(NOW);
    window.localStorage.clear();
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
  it("takes upcoming steps from the server's sequence and computes none itself", () => {
    const upcoming = (match: any) =>
      vetoSteps(match, []).map((s) => `${s.type}:${s.team ?? "-"}:${s.state}`);
    expect(upcoming(baseMatch())).toEqual([
      "Ban:1:current", "Ban:2:upcoming", "Pick:1:upcoming", "Pick:2:upcoming",
      "Ban:2:upcoming", "Ban:1:upcoming", "Decider:-:upcoming",
    ]);
    // A different (e.g. future) server rule is followed as-is.
    expect(upcoming(baseMatch({ map_veto_sequence: seq("Ban:1 Ban:1 Decider:2") }))).toEqual([
      "Ban:1:current", "Ban:1:upcoming", "Decider:-:upcoming",
    ]);
    // No sequence (no valid veto): only what has happened and the current step.
    expect(upcoming(baseMatch({ map_veto_sequence: null }))).toEqual(["Ban:1:current"]);
    // The copied formula is gone from the WEB.
    const source = readFileSync(path.resolve(__dirname, "../../utilities/matchLifecycle.ts"), "utf8");
    expect(source).not.toMatch(/mapVetoPattern|mapVetoTurnTeam|turn >= 4|preBans/);
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
    // The public feed's pick clock reaches spectators too.
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(true);
  });

  it("spectators get the real pick clock, corrected by the server's time, and resynced on every snapshot", async () => {
    vi.useFakeTimers();
    // This device runs 60s fast; the server says 20s are left.
    vi.setSystemTime(NOW + 60_000);
    const wrapper = mountOverview({
      match: { id: "m1", status: "PickingPlayers", options: {} },
      stage: "captain-pick",
      captainPickProgress: { ...makeDraft(), serverNow: iso(0), deadline: iso(20_000), timerSeconds: 30 },
    });
    const clock = () => wrapper.findComponent({ name: "DraftClock" });
    expect(Date.parse(clock().props("deadline")) - Date.now()).toBe(20_000);
    expect(clock().props("total")).toBe(30);

    // A reconnect snapshot later in the turn: 8s left, re-anchored on arrival.
    vi.advanceTimersByTime(5_000);
    await wrapper.setProps({
      captainPickProgress: { ...makeDraft(), serverNow: iso(22_000), deadline: iso(30_000), timerSeconds: 30 },
    });
    expect(Date.parse(clock().props("deadline")) - Date.now()).toBe(8_000);

    // No clock once nobody is picking (the feed sends null).
    await wrapper.setProps({
      captainPickProgress: { ...makeDraft(), pickingLineup: null, pickIndex: null, phase: "CreatingMatch", deadline: null, timerSeconds: null },
    });
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

  it("participants use the same Overview with selectable cards and the real timer", () => {
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
    expect(wrapper.find('[data-testid="open-captain-pick"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="captain-pick-player-3"]').attributes("role")).toBe("button");
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="overview-action-bar"]').classes()).toContain("is-mine");
    // Picking uses the main pool cards; the profile action stays separate.
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

  it("the veto clock is the match's own map_veto_pick_expires_at, for every viewer", async () => {
    const expires = iso(17_000);
    const wrapper = await mountOverview(baseMatch({ map_veto_pick_expires_at: expires }), []);
    expect(wrapper.findComponent({ name: "DraftClock" }).props("deadline")).toBe(expires);
    // A region veto runs on the same server timer.
    const region = await mountOverview(
      baseMatch({
        map_veto_pick_expires_at: expires,
        region: null,
        options: { ...baseMatch().options, region_veto: true, regions: ["EU", "NA"] },
      }),
      [],
    );
    expect(region.findComponent({ name: "DraftClock" }).props("deadline")).toBe(expires);
  });

  it("Bo1 is all bans and a decider", async () => {
    const wrapper = await mountOverview(
      baseMatch({ options: { ...baseMatch().options, best_of: 1 }, map_veto_sequence: BO1_SEQUENCE }),
      [],
    );
    await wrapper.vm.$nextTick();
    const tones = wrapper.findAll('[data-testid="overview-strip-step"]').map((c) => c.attributes("data-tone"));
    expect(tones).toEqual(["ban", "ban", "ban", "ban", "ban", "ban", "decider"]);
  });

  it("shows the region stage in the middle while a region veto is pending", async () => {
    const wrapper = await mountOverview(
      baseMatch({ options: { ...baseMatch().options, region_veto: true, regions: ["EU", "NA"] }, region: null }),
      [],
    );
    expect(wrapper.find('[data-testid="overview-region"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overview-veto"]').exists()).toBe(false);
  });

  it("without a region veto, keeps the organizer's own Set Server Region form", async () => {
    const wrapper = await mountOverview(baseMatch(), []);
    expect(wrapper.find('[data-testid="region-veto"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overview-veto"]').exists()).toBe(true);
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

    // A press outside the selected card cancels without submitting.
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    expect(apollo.mutate).not.toHaveBeenCalled();
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

  it("completed BO1 uses its known decider while match_maps catches up", () => {
    const wrapper = mount(OverviewPreMatch, {
      props: {
        match: liveMatch({ options: { ...baseMatch().options, best_of: 1 }, match_maps: [] }),
        picks: [pick("Decider", "inferno", "Alpha-id")],
      },
      global: globalConfig(),
    });
    expect(wrapper.get('[data-testid="pre-match-map-1"]').text()).toContain("Inferno");
    expect(wrapper.text()).not.toContain("match.map_tbd");
  });

  it("one server panel right under the maps: booting from the end of the veto, no separate status bar", () => {
    for (const viewer of [null, { steam_id: "99" }]) {
      auth.me = viewer;
      // Veto done, no server yet / server assigned but still booting.
      for (const match of [
        liveMatch({ status: "WaitingForServer", server_id: null, is_server_online: false }),
        liveMatch({ is_server_online: false }),
        liveMatch({ server_id: null, is_server_online: false }),
      ]) {
        const wrapper = mountSummary(match);
        const panel = wrapper.get('[data-testid="pre-match-connect"]');
        expect(panel.attributes("data-state")).toBe("booting");
        // QuickMatchConnect's own booting box, the Scoreboard's.
        expect(panel.text()).toContain("match.server.booting");
        expect(panel.find('[data-testid="copy-ip"]').exists()).toBe(false);
        expect(panel.text()).not.toContain("match.time_to_connect");
        expect(wrapper.find('[data-testid="pre-match-server"]').exists()).toBe(false);
        expect(wrapper.text()).not.toContain("match.lifecycle.server_ready");
        // Directly after the final maps.
        const children = [...wrapper.get('[data-testid="overview-pre-match"]').element.children];
        expect(children.map((el) => el.getAttribute("data-testid"))).toEqual(["pre-match-maps", "pre-match-connect"]);
      }
    }
    auth.me = null;
    const ready = mountSummary(liveMatch());
    expect(ready.get('[data-testid="pre-match-connect"]').attributes("data-state")).toBe("ready");
    expect(ready.text()).not.toContain("match.server.booting");
  });

  it("the same panel turns into Time to Connect, Copy IP and Join Server once the server is up", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    auth.me = { steam_id: "11" };
    const secret = { is_in_lineup: true, cancels_at: iso(150_000), connection_string: "connect 1.2.3.4", connection_link: "steam://connect/1.2.3.4" };
    const warmup = (extra: any) => {
      const match = liveMatch({ ...secret, ...extra });
      match.match_maps[0] = { ...match.match_maps[0], is_current_map: true, status: "Warmup" };
      return match;
    };
    const wrapper = mountSummary(warmup({ is_server_online: false }));
    const panel = () => wrapper.get('[data-testid="pre-match-connect"]');
    expect(panel().text()).toContain("match.server.booting");
    expect(panel().find('[data-testid="copy-ip"]').exists()).toBe(false);
    await wrapper.setProps({ match: warmup({ is_server_online: true }) });
    expect(panel().attributes("data-state")).toBe("ready");
    expect(panel().text()).not.toContain("match.server.booting");
    expect(panel().text()).toContain("match.time_to_connect");
    expect(panel().text()).toContain("2:30");
    expect(panel().find('[data-testid="copy-ip"]').exists()).toBe(true);
    expect(panel().find("a[href='steam://connect/1.2.3.4']").exists()).toBe(true);
    wrapper.unmount();
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

  it("the internal handoff has no visible countdown or transition message", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const wrapper = mount(MatchOverview, {
      props: { match: liveMatch({ started_at: iso(-20_000) }), stage: "pre-match", now: NOW },
      global: globalConfig(),
    });
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toBe("match.lifecycle.match_live");
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain("match.lifecycle.switching_in");
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
  "deriveOverviewStage", "overviewIsDefault", "scoreboardHandoffAt", "SCOREBOARD_HANDOFF_MS", "OVERVIEW_TAB", "getCaptainPickDraft", "useAuthStore", "useMatchmakingStore",
  "matchServerReady", "rememberServerReadyAt", "forgetServerReadyAt", "lifecycleRestarted", "PRE_SERVER_STAGES",
  ts.transpileModule(pageBody, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
)(
  pageExports, $, order_by, e_match_status_enum, e_player_roles_enum, typedGql, mapFields, matchLineups, playerFields, matchOptionsFields, eloFields,
  overviewStage, overviewIsDefault, scoreboardHandoffAt, SCOREBOARD_HANDOFF_MS, OVERVIEW_TAB, getCaptainPickDraft, () => auth, () => matchmaking,
  matchServerReady, rememberServerReadyAt, forgetServerReadyAt, lifecycleRestarted, PRE_SERVER_STAGES,
);
const page = pageExports.default;
const pageContext = (state: Record<string, any>) => {
  const ctx: any = {
    publicCaptainPick: { progress: null },
    captainPickMatch: { matchId: null, active: false, participant: false },
    lifecycleNow: NOW,
    lifecycleHandoffTimer: undefined,
    serverReadyAt: null,
    overviewRestart: 0,
    matchTab: null,
    ...state,
  };
  for (const name of ["captainPickActive", "overviewStage", "overviewStageScope", "serverReadyScope", "overviewHandoffAt", "overviewDefault", "overviewShown", "participantDraft", "overviewFocus"]) {
    Object.defineProperty(ctx, name, { get: () => page.computed[name].call(ctx) });
  }
  return ctx;
};
const template = parse(pageSource).descriptor.template!.content;

describe("match page", () => {
  it("compiled template binds the computed stage, not the imported helper", () => {
    const { descriptor } = parse(pageSource);
    const script = compileScript(descriptor, { id: "overview-regression" });
    const compiled = compileTemplate({
      source: descriptor.template!.content,
      filename: "index.vue",
      id: "overview-regression",
      compilerOptions: { bindingMetadata: script.bindings },
    });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain("stage: $options.overviewStage");
    expect(compiled.code).not.toContain("$setup.overviewStage");
  });

  it("subscribes to the live timestamp needed for the handoff and stage label", () => {
    const query = page.apollo.$subscribe.matches_by_pk.query;
    const fields = query.definitions[0].selectionSet.selections[0].selectionSet.selections;
    expect(fields.map((field: any) => field.name.value)).toContain("started_at");
  });

  it.each(["Ban", "Pick"])("active BO1 %s stays actionable despite a full future sequence", async (type) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const match = baseMatch({
      options: { ...baseMatch().options, best_of: 1 },
      map_veto_sequence: BO1_SEQUENCE,
      map_veto_type: type,
      map_veto_pick_expires_at: iso(12_000),
      is_captain: true,
      lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true, is_picking_map_veto: true }),
    });
    const stage = pageContext({ match }).overviewStage;
    const wrapper = mount(MatchOverview, { props: { match, stage }, global: globalConfig() });
    expect(wrapper.attributes("data-stage")).toBe("veto");
    expect(wrapper.find('[data-testid="overview-pre-match"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="overview-clock"]').text()).toContain("12");
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toContain(`match.lifecycle.veto_${type.toLowerCase()}`);
    expect(wrapper.text()).not.toContain("match.lifecycle.match_live");
    await wrapper.get('[data-testid="veto-map-mirage"]').trigger("click");
    await wrapper.get('[data-testid="veto-confirm-submit"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: mapVetoPickMutation,
      variables: { map_id: "mirage", type, match_id: "m1", match_lineup_id: "Alpha-id" },
    });
    wrapper.unmount();
  });

  it("spectator BO1 veto renders cards and timer without actions, then transitions only on server status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const match = baseMatch({ options: { ...baseMatch().options, best_of: 1 }, map_veto_sequence: BO1_SEQUENCE, map_veto_pick_expires_at: iso(15_000) });
    const wrapper = mount(MatchOverview, { props: { match, stage: pageContext({ match }).overviewStage }, global: globalConfig() });
    expect(wrapper.findAll('button[data-testid^="veto-map-"]')).toHaveLength(0);
    expect(wrapper.findAll('[data-testid^="veto-map-"]').length).toBe(7);
    await wrapper.get('[data-testid="veto-map-mirage"]').trigger("click");
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    expect(apollo.mutate).not.toHaveBeenCalled();
    const complete = { ...match, status: "WaitingForServer", map_veto_type: null, map_veto_pick_expires_at: null, match_maps: [{ id: "mm1", order: 1, map: pool[1] }] };
    await wrapper.setProps({ match: complete, stage: pageContext({ match: complete }).overviewStage });
    expect(wrapper.find('[data-testid="overview-veto"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="pre-match-map-1"]').text()).toContain("Inferno");
    expect(wrapper.get('[data-testid="overview-action-title"]').text()).toBe("match.lifecycle.preparing_server");
    expect(wrapper.text()).not.toContain("match.lifecycle.match_live");
    wrapper.unmount();
  });

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

  it("stays on the Overview while the server prepares, then hands over silently 30s after it is ready", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    window.localStorage.clear();
    const run = (ctx: any) => {
      page.watch.serverReadyScope.handler.call(ctx);
      page.watch.overviewHandoffAt.handler.call(ctx, ctx.overviewHandoffAt);
    };
    // Veto done long ago, server still booting: no handoff timer at all.
    const booting = baseMatch({ status: "Live", started_at: iso(-600_000), server_id: "s1", is_server_online: false });
    const ctx = pageContext({ match: booting });
    run(ctx);
    expect(ctx.serverReadyAt).toBeNull();
    expect(ctx.lifecycleHandoffTimer).toBeUndefined();
    expect(ctx.overviewDefault).toBe(true);

    // The server comes up: the hidden 30 seconds start now.
    ctx.match = { ...booting, is_server_online: true };
    run(ctx);
    expect(ctx.serverReadyAt).toBe(NOW);
    vi.advanceTimersByTime(29_000);
    expect(ctx.overviewDefault).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(ctx.overviewDefault).toBe(false);

    // A refresh 10s into the window continues it rather than restarting.
    vi.setSystemTime(NOW + 10_000);
    const refreshed = pageContext({ match: { ...booting, is_server_online: true } });
    run(refreshed);
    expect(refreshed.serverReadyAt).toBe(NOW);
    expect(refreshed.overviewDefault).toBe(true);
    // A refresh after the window: straight to the Scoreboard.
    vi.setSystemTime(NOW + 45_000);
    const late = pageContext({ match: { ...booting, is_server_online: true } });
    run(late);
    expect(late.lifecycleHandoffTimer).toBeUndefined();
    expect(late.overviewDefault).toBe(false);
    window.localStorage.clear();
  });

  describe("same match restarted after its Scoreboard handoff", () => {
    const run = (ctx: any, previousScope: string | null) => {
      page.watch.overviewStageScope.handler.call(ctx, ctx.overviewStageScope, previousScope);
      page.watch.serverReadyScope.handler.call(ctx);
      page.watch.overviewHandoffAt.handler.call(ctx, ctx.overviewHandoffAt);
    };
    const live = (online: boolean) => baseMatch({ status: "Live", started_at: iso(-600_000), server_id: "s1", is_server_online: online });

    it("handoff done -> back to veto -> Overview again -> a later ready state gets a fresh 30 seconds", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      window.localStorage.clear();
      // First run: server ready, 30 seconds pass, handed over.
      const ctx = pageContext({ match: live(true) });
      run(ctx, null);
      expect(ctx.serverReadyAt).toBe(NOW);
      vi.advanceTimersByTime(30_000);
      expect(ctx.overviewDefault).toBe(false);
      expect(window.localStorage.getItem("deafcs:match-server-ready:m1")).toBe(String(NOW));

      // The same match is reset into a new veto.
      vi.setSystemTime(NOW + 120_000);
      let previous = ctx.overviewStageScope;
      ctx.match = baseMatch({ status: "Veto" });
      run(ctx, previous);
      expect(ctx.overviewStage).toBe("veto");
      expect(ctx.overviewDefault).toBe(true);
      expect(ctx.overviewRestart).toBe(1);
      expect(ctx.serverReadyAt).toBeNull();
      expect(window.localStorage.getItem("deafcs:match-server-ready:m1")).toBeNull();

      // Veto done, the new server boots: still the Overview.
      vi.setSystemTime(NOW + 300_000);
      previous = ctx.overviewStageScope;
      ctx.match = live(false);
      run(ctx, previous);
      expect(ctx.overviewDefault).toBe(true);
      expect(ctx.overviewRestart).toBe(1);

      // Ready again: a fresh window from now, not the first run's moment.
      previous = ctx.overviewStageScope;
      ctx.match = live(true);
      run(ctx, previous);
      expect(ctx.serverReadyAt).toBe(NOW + 300_000);
      expect(ctx.overviewDefault).toBe(true);
      vi.advanceTimersByTime(29_000);
      expect(ctx.overviewDefault).toBe(true);
      vi.advanceTimersByTime(1_000);
      expect(ctx.overviewDefault).toBe(false);
      window.localStorage.clear();
    });

    it("a page opened during the new run ignores the old ready moment too", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW + 600_000);
      window.localStorage.setItem("deafcs:match-server-ready:m1", String(NOW));
      const ctx = pageContext({ match: baseMatch({ status: "Veto" }) });
      run(ctx, null);
      expect(window.localStorage.getItem("deafcs:match-server-ready:m1")).toBeNull();
      // Opening the page is not a restart: the viewer's tab is left alone.
      expect(ctx.overviewRestart).toBe(0);
      ctx.match = live(true);
      run(ctx, "m1:veto");
      expect(ctx.serverReadyAt).toBe(NOW + 600_000);
      expect(ctx.overviewDefault).toBe(true);
      window.localStorage.clear();
    });

    it("a server reboot mid-match is not a restart; nothing is cleared on a plain re-render", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      window.localStorage.setItem("deafcs:match-server-ready:m1", String(NOW - 60_000));
      const ctx = pageContext({ match: live(true) });
      run(ctx, null);
      // Same stage again (a re-render, or the server going offline mid-game).
      ctx.match = live(false);
      run(ctx, ctx.overviewStageScope);
      expect(ctx.overviewRestart).toBe(0);
      expect(window.localStorage.getItem("deafcs:match-server-ready:m1")).toBe(String(NOW - 60_000));
      // Another match's lifecycle never touches this one.
      expect(lifecycleRestarted("pre-match", "veto")).toBe(true);
      expect(lifecycleRestarted("veto", "pre-match")).toBe(false);
      expect(lifecycleRestarted(null, "veto")).toBe(false);
      expect([...PRE_SERVER_STAGES].sort()).toEqual(["captain-pick", "check-in", "schedule", "veto"]);
      forgetServerReadyAt("m2");
      expect(window.localStorage.getItem("deafcs:match-server-ready:m1")).toBe(String(NOW - 60_000));
      window.localStorage.clear();
    });

    it("MatchTabs returns everyone to the Overview on a restart", () => {
      expect(template).toContain(':overview-restart="overviewRestart"');
      const tabs = readFileSync(path.resolve(__dirname, "../../components/match/MatchTabs.vue"), "utf8");
      expect(tabs).toMatch(/overviewRestart\(\) \{\s*if \(this\.overviewAvailable\) \{\s*this\.activeTab = OVERVIEW_TAB_VALUE;/);
    });
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


describe("Overview layout refinement", () => {
  const mountVeto = (match: any, picks: any[] = []) => mount(OverviewVeto, { props: { match, picks }, global: globalConfig() });
  const liveMatch = (extra: any = {}) => baseMatch({ status: "Live", is_server_online: true, match_maps: [{ id: "mm1", order: 1, map: pool[1] }], ...extra });
  it("places action, region/progress and authoritative timer in separate banner columns", async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const match = baseMatch({ region: "Germany", map_veto_pick_expires_at: iso(19_000), lineup_1: lineup("Alpha", ["11"], { is_picking_map_veto: true }) });
    const wrapper = mount(MatchOverview, { props: { match, stage: "veto" }, global: globalConfig() });
    expect(wrapper.get('[data-testid="overview-banner-left"] [data-testid="overview-action-title"]').text()).toContain('"team":"Alpha"');
    expect(wrapper.get('[data-testid="overview-banner-middle"] [data-testid="overview-banner-region"]').text()).toContain("Germany");
    expect(wrapper.get('[data-testid="overview-banner-middle"] [data-testid="overview-strip"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="overview-banner-right"] [data-testid="overview-clock"]').text()).toContain("19");
    await wrapper.setProps({ match: { ...match, map_veto_type: null } });
    expect(wrapper.find('[data-testid="overview-banner-right"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each(["Ban", "Pick"])("%s confirmation: one centered Confirm in the selected card, dismissed by any outside press or Escape", async (type) => {
    const wrapper = mountVeto(baseMatch({ map_veto_type: type, is_captain: true, lineup_1: lineup("Alpha", ["11"], { can_pick_map_veto: true }) }), []);
    const press = async (target: Element) => {
      target.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      await wrapper.vm.$nextTick();
    };
    await wrapper.get('[data-testid="veto-map-inferno"]').trigger("click");
    const card = wrapper.get('[data-testid="veto-map-inferno"]');
    expect(card.classes()).toContain("is-selected");
    expect(card.element.tagName).toBe("DIV"); // Avoid nesting confirm buttons in a button.
    expect(card.get('[data-testid="veto-confirm-question"]').text()).toContain(type.toLowerCase());
    expect(card.get('[data-testid="veto-confirm"]').attributes("role")).toBe("group");
    expect(card.get('[data-testid="veto-confirm"]').classes()).toEqual(expect.arrayContaining(["items-center", "justify-center"]));
    // No Cancel button: Confirm is the only action.
    expect(wrapper.find('[data-testid="veto-confirm-cancel"]').exists()).toBe(false);
    expect(card.findAll("button").map((b) => b.attributes("data-testid"))).toEqual(["veto-confirm-submit"]);

    // A press anywhere outside the card cancels, without submitting.
    await press(document.body);
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="veto-map-inferno"]').classes()).not.toContain("is-selected");

    // Clicking the selected card itself (outside Confirm) cancels too.
    await wrapper.get('[data-testid="veto-map-inferno"]').trigger("click");
    await press(wrapper.get('[data-testid="veto-map-inferno"]').element);
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(true);
    await wrapper.get('[data-testid="veto-map-inferno"] [data-testid="veto-confirm"]').trigger("click");
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);

    // Escape cancels.
    await wrapper.get('[data-testid="veto-map-inferno"]').trigger("click");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="veto-confirm"]').exists()).toBe(false);

    // Another map: the press cancels the first, the click selects the second.
    await wrapper.get('[data-testid="veto-map-inferno"]').trigger("click");
    await press(wrapper.get('[data-testid="veto-map-nuke"]').element);
    await wrapper.get('[data-testid="veto-map-nuke"]').trigger("click");
    expect(wrapper.find('[data-testid="veto-map-inferno"] [data-testid="veto-confirm"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="veto-map-nuke"] [data-testid="veto-confirm"]').exists()).toBe(true);
    expect(apollo.mutate).not.toHaveBeenCalled();

    // Only Confirm submits, once.
    await wrapper.get('[data-testid="veto-map-nuke"] [data-testid="veto-confirm-submit"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledTimes(1);
    expect(apollo.mutate.mock.calls[0][0].variables).toMatchObject({ map_id: "nuke", type });
    wrapper.unmount();
  });

  it("CT/T confirmation has no Cancel and is dismissed by an outside press or Escape", async () => {
    const side = mountVeto(baseMatch({ map_veto_type: "Side", is_captain: true, lineup_2: lineup("Bravo", ["21"], { can_pick_map_veto: true }) }), bo3Picks.slice(0, 3));
    await side.get('[data-testid="veto-side-CT"]').trigger("click");
    expect(side.find('[data-testid="veto-confirm-cancel"]').exists()).toBe(false);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await side.vm.$nextTick();
    expect(side.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    await side.get('[data-testid="veto-side-T"]').trigger("click");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await side.vm.$nextTick();
    expect(side.find('[data-testid="veto-confirm"]').exists()).toBe(false);
    expect(apollo.mutate).not.toHaveBeenCalled();
    side.unmount();
  });

  it("override stays outside the centered map grid and side confirmation stays inside its map", async () => {
    const wrapper = mountVeto(baseMatch({ is_organizer: true }), []);
    expect(wrapper.get('[data-testid="veto-maps"]').classes()).toContain("justify-center");
    expect(wrapper.get('[data-testid="veto-maps"]').classes()).toContain("flex-wrap");
    expect(wrapper.get('[data-testid="veto-maps"]').find('[data-testid="veto-override"]').exists()).toBe(false);
    await wrapper.get('[data-testid="veto-override"]').trigger("click");
    await wrapper.get('[data-testid="veto-map-mirage"]').trigger("click");
    expect(wrapper.get('[data-testid="veto-map-mirage"] [data-testid="veto-confirm"]').exists()).toBe(true);
    wrapper.unmount();
    const side = mountVeto(baseMatch({ map_veto_type: "Side", is_captain: true, lineup_2: lineup("Bravo", ["21"], { can_pick_map_veto: true }) }), bo3Picks.slice(0,3));
    await side.get('[data-testid="veto-side-CT"]').trigger("click");
    expect(side.get('[data-testid="veto-side-choice"] [data-testid="veto-confirm"]').exists()).toBe(true);
    expect(side.find('[data-testid="veto-maps"]').exists()).toBe(false);
    side.unmount();
  });

  it("a banned map's art goes dark, its BANNED · T1/T2 tag stays fully bright", () => {
    const wrapper = mountVeto(baseMatch({ map_veto_type: "Ban" }), bo3Picks.slice(0, 2));
    const banned = wrapper.get('[data-testid="veto-map-ancient"]');
    expect(banned.classes()).toContain("is-banned");
    const tag = banned.get('[data-testid="veto-map-tag"]');
    expect(tag.text()).toContain("match.lifecycle.map_banned");
    expect(tag.text()).toContain("T1");
    // The tag is not inside the dimmed poster, and nothing between it and the
    // card carries an opacity/filter utility.
    const poster = banned.get("img.veto-map-poster");
    expect(poster.element.contains(tag.element)).toBe(false);
    for (let el: Element | null = tag.element; el && el !== banned.element; el = el.parentElement) {
      expect([...el.classList].filter((c) => /^(opacity-|grayscale|brightness-|filter)/.test(c))).toEqual([]);
    }
    // The scoped CSS dims only the poster, never the card itself.
    const style = parse(readFileSync(path.resolve(__dirname, "../../components/match/overview/OverviewVeto.vue"), "utf8")).descriptor.styles[0].content;
    const cardRule = style.match(/\.veto-map\.is-banned \{([^}]*)\}/)![1];
    expect(cardRule).not.toMatch(/opacity|filter/);
    expect(cardRule).toContain("--tone: var(--destructive)");
    const posterRule = style.match(/\.veto-map\.is-banned \.veto-map-poster \{([^}]*)\}/)![1];
    expect(posterRule).toContain("opacity: 0.45");
    expect(posterRule).toContain("filter: grayscale(0.9)");
    // The name keeps its own dim + line-through.
    expect(banned.find(".line-through").exists()).toBe(true);
    wrapper.unmount();
  });

  it("CT/T choice keeps the map grid's footprint; choosing a side works exactly as before", async () => {
    const captain = { is_captain: true, lineup_2: lineup("Bravo", ["21"], { can_pick_map_veto: true }) };
    // A Pick is on the table, then the server asks Bravo for a side.
    const wrapper = mountVeto(baseMatch({ map_veto_type: "Ban", ...captain }), bo3Picks.slice(0, 2));
    expect(wrapper.find('[data-testid="veto-maps"]').exists()).toBe(true);
    // The grid's rendered height (ResizeObserver in a browser) is what the
    // side choice takes over.
    (wrapper.vm as any).$.data.mapGridHeight = 412;
    await wrapper.setProps({ match: baseMatch({ map_veto_type: "Side", ...captain }), picks: bo3Picks.slice(0, 3) });
    const side = wrapper.get('[data-testid="veto-side-choice"]');
    expect(wrapper.find('[data-testid="veto-maps"]').exists()).toBe(false);
    expect(side.attributes("style")).toContain("height: 412px");
    expect(side.classes()).toContain("w-full");
    // Map background and name kept; slightly smaller CT/T cards.
    expect(side.find("img").attributes("src")).toBe("/img/maps/mirage.webp");
    expect(side.get('[data-testid="veto-side-map"]').text()).toBe("Mirage");
    expect(side.get('[data-testid="veto-side-CT"]').classes()).toEqual(expect.arrayContaining(["px-4", "py-2"]));
    // Same CT/T confirmation and mutation as before.
    await side.get('[data-testid="veto-side-CT"]').trigger("click");
    await wrapper.get('[data-testid="veto-confirm-submit"]').trigger("click");
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: mapVetoPickMutation,
      variables: { map_id: "mirage", type: "Side", side: "CT", match_id: "m1", match_lineup_id: "Alpha-id" },
    });
    wrapper.unmount();

    // Opened straight into a side choice (nothing measured yet): the shape a
    // three-column grid of this 7-map pool has (3 rows of 4:3 cards).
    const fresh = mountVeto(baseMatch({ map_veto_type: "Side", ...captain }), bo3Picks.slice(0, 3));
    const style = fresh.get('[data-testid="veto-side-choice"]').attributes("style");
    expect(style).toContain("aspect-ratio: 4 / 3");
    expect(style).toContain("min-height: 12rem");
    fresh.unmount();
  });

  it("active veto: picked maps and the decider show who starts CT once the server set it", () => {
    // As Postgres writes them on each Side pick (create_match_map_from_veto):
    // Mirage (Alpha's pick, Bravo chose CT), Nuke (Bravo's pick, Alpha chose T).
    const match = baseMatch({
      map_veto_type: "Ban",
      map_veto_picking_lineup_id: "Bravo-id",
      match_maps: [
        { id: "mm1", order: 1, map: pool[0], lineup_1_side: "TERRORIST", lineup_2_side: "CT" },
        { id: "mm2", order: 2, map: pool[2], lineup_1_side: "CT", lineup_2_side: "TERRORIST" },
      ],
    });
    const picks = bo3Picks.slice(0, 7);
    const states = vetoMapStates(match, picks);
    const byId = (id: string) => states.find((row: any) => row.map.id === id)!;
    expect(byId("mirage")).toMatchObject({ state: "picked", team: 1, ctTeam: 2 });
    expect(byId("nuke")).toMatchObject({ state: "picked", team: 2, ctTeam: 1 });
    expect(byId("ancient")).toMatchObject({ state: "banned", ctTeam: null });

    const wrapper = mountVeto(match, picks);
    const mirage = wrapper.get('[data-testid="veto-map-mirage"]');
    expect(mirage.text()).toContain("match.lifecycle.map_picked");
    expect(mirage.text()).toContain("T1");
    expect(mirage.get('[data-testid="veto-map-side"]').text()).toBe('match.lifecycle.starts_ct:{"team":"Bravo"}');
    expect(wrapper.get('[data-testid="veto-map-nuke"] [data-testid="veto-map-side"]').text()).toBe('match.lifecycle.starts_ct:{"team":"Alpha"}');
    // Banned and still-open maps have no side line.
    expect(wrapper.get('[data-testid="veto-map-ancient"]').find('[data-testid="veto-map-side"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="veto-map-train"]').find('[data-testid="veto-map-side"]').exists()).toBe(false);
    wrapper.unmount();

    // A picked map whose side choice is still pending: nothing guessed.
    const pending = baseMatch({ map_veto_type: "Side", match_maps: [] });
    const sidePending = mountVeto({ ...pending, map_veto_type: "Ban" }, bo3Picks.slice(0, 3));
    expect(sidePending.get('[data-testid="veto-map-mirage"]').find('[data-testid="veto-map-side"]').exists()).toBe(false);
    sidePending.unmount();

    // The decider: only once its match_maps row carries sides.
    const deciderMatch = (sides: any) => baseMatch({
      status: "Veto",
      map_veto_type: null,
      match_maps: [{ id: "mm3", order: 3, map: pool[1], ...sides }],
    });
    expect(vetoMapStates(deciderMatch({ lineup_1_side: null, lineup_2_side: null }), bo3Picks).find((r: any) => r.map.id === "inferno")).toMatchObject({ state: "decider", ctTeam: null });
    const decided = mountVeto(deciderMatch({ lineup_1_side: "CT", lineup_2_side: "TERRORIST" }), bo3Picks);
    expect(decided.get('[data-testid="veto-map-inferno"] [data-testid="veto-map-side"]').text()).toBe('match.lifecycle.starts_ct:{"team":"Alpha"}');
    decided.unmount();
  });

  it("constrains final map, server, Time to Connect and Connect/Copy to the middle", () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW); auth.me = { steam_id: "11" };
    const match = liveMatch({ cancels_at: iso(120_000), is_in_lineup: true, connection_string: "connect 1.2.3.4", connection_link: "steam://connect/1.2.3.4" });
    match.match_maps[0] = { ...match.match_maps[0], is_current_map: true, status: "Warmup" };
    const wrapper = mount(MatchOverview, { props: { match, stage: "pre-match" }, global: globalConfig() });
    const middle = wrapper.get('[data-testid="overview-middle"]');
    expect(middle.classes()).toContain("justify-self-center");
    expect(middle.classes()).toContain("max-w-2xl");
    expect(middle.get('[data-testid="pre-match-connect"]').attributes("data-state")).toBe("ready");
    expect(wrapper.find('[data-testid="pre-match-server"]').exists()).toBe(false);
    expect(middle.get('[data-testid="pre-match-connect"]').text()).toContain("match.time_to_connect");
    expect(middle.get('[data-testid="pre-match-connect"] [data-testid="copy-ip"]').exists()).toBe(true);
    expect(middle.get('a[href="steam://connect/1.2.3.4"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="overview-clock"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("Overview tab is staff-only; non-staff lose Scoreboard only during the pre-game lifecycle", () => {
    const source = readFileSync(path.resolve(__dirname, "../../components/match/MatchTabs.vue"), "utf8");
    const descriptor = parse(source).descriptor;
    const ast = ts.createSourceFile("tabs.ts", descriptor.script!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const statement = ast.statements.find(ts.isExportAssignment)! as ts.ExportAssignment;
    const object = statement.expression as ts.ObjectLiteralExpression;
    const computed = (object.properties.find((node) => node.name?.getText(ast) === "computed") as ts.PropertyAssignment).initializer as ts.ObjectLiteralExpression;
    const pick = (name: string) => computed.properties.find((node) => node.name?.getText(ast) === name)!.getText(ast);
    const fns = new Function(
      "OVERVIEW_TAB_VALUE", "e_player_roles_enum", "useAuthStore",
      "return ({" + [pick("canSeeLifecycleTabs"), pick("hideLifecycleTabs"), pick("hideTabsRow")].join(",") + "})",
    )("lifecycle", e_player_roles_enum, () => auth);
    const viewer = (role: string | null, extra: any = {}) => {
      auth.role = role;
      const ctx: any = { activeTab: "lifecycle", overviewDefault: true, match: { is_organizer: false, is_captain: false, is_in_lineup: false }, ...extra };
      ctx.canSeeLifecycleTabs = fns.canSeeLifecycleTabs.call(ctx);
      ctx.hideLifecycleTabs = fns.hideLifecycleTabs.call(ctx);
      ctx.hideTabsRow = fns.hideTabsRow.call(ctx);
      return ctx;
    };
    // Pre-game lifecycle: guest, user, captain, player, own-match organizer, streamer.
    for (const ctx of [
      viewer(null),
      viewer("user", { match: { is_captain: true, is_in_lineup: true } }),
      viewer("verified_user", { match: { is_organizer: true } }),
      viewer("streamer"),
    ]) {
      expect(ctx.canSeeLifecycleTabs).toBe(false);
      expect(ctx.hideLifecycleTabs).toBe(true);
      expect(ctx.hideTabsRow).toBe(true);
    }
    // After the handoff / live / finished: Scoreboard and the row are back,
    // the Overview tab stays hidden.
    const after = viewer("user", { overviewDefault: false, activeTab: "economy" });
    expect(after.hideLifecycleTabs).toBe(false);
    expect(after.hideTabsRow).toBe(false);
    expect(after.canSeeLifecycleTabs).toBe(false);
    // Staff (moderator and up) see both tabs throughout.
    for (const role of ["moderator", "match_organizer", "tournament_organizer", "administrator"]) {
      expect(viewer(role).canSeeLifecycleTabs).toBe(true);
      expect(viewer(role).hideLifecycleTabs).toBe(false);
      expect(viewer(role).hideTabsRow).toBe(false);
    }

    // The real desktop/mobile trigger markup with those predicates.
    const triggers = descriptor.template!.content.match(/<(?:TabsTrigger|SelectItem)[^>]*(?:OVERVIEW_TAB|value="scoreboard")[^>]*>[\s\S]*?<\/(?:TabsTrigger|SelectItem)>/g)!;
    expect(triggers).toHaveLength(4);
    const render = (ctx: any) => mount({ template: '<div>' + triggers.join('') + '</div>', data: () => ({ overviewAvailable: true, OVERVIEW_TAB: "lifecycle", hideLifecycleTabs: ctx.hideLifecycleTabs, canSeeLifecycleTabs: ctx.canSeeLifecycleTabs }) }, { global: { ...globalConfig(), stubs: { TabsTrigger: { template: '<button><slot /></button>' }, SelectItem: { template: '<option><slot /></option>' } } } });
    const count = (ctx: any) => { const w = render(ctx); const texts = w.findAll('button,option').map((el) => el.text()); w.unmount(); return texts; };
    expect(count(viewer("user"))).toEqual([]);
    expect(count(viewer("user", { overviewDefault: false }))).toEqual(["match.tabs.scoreboard", "match.tabs.scoreboard"]);
    expect(count(viewer("moderator"))).toEqual(["match.tabs.overview", "match.tabs.scoreboard", "match.tabs.overview", "match.tabs.scoreboard"]);
    auth.role = null;
  });
});
