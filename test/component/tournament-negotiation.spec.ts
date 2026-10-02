import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

// Inline dialog (the real one teleports to <body>).
vi.mock("~/components/ui/dialog", () => {
  const passthrough = (name: string) => defineComponent({ name, setup: (_, { slots }) => () => h("div", slots.default?.()) });
  return {
    Dialog: defineComponent({
      name: "Dialog",
      props: { open: Boolean },
      setup: (props, { slots }) => () => (props.open ? h("div", { "data-testid": "dialog" }, slots.default?.()) : null),
    }),
    DialogContent: defineComponent({
      name: "DialogContent",
      inheritAttrs: true,
      setup: (_, { slots }) => () => h("div", slots.default?.()),
    }),
    DialogDescription: passthrough("DialogDescription"),
    DialogHeader: passthrough("DialogHeader"),
    DialogTitle: passthrough("DialogTitle"),
  };
});
// The league's own propose form (window-checked); here only what it submits.
vi.mock("~/components/league/ProposeTimeDialog.vue", () => ({
  default: defineComponent({
    name: "ProposeTimeDialog",
    props: ["open", "weekOpensAt", "weekClosesAt", "initialDate", "matchup"],
    emits: ["submit", "update:open"],
    setup: (props, { emit }) => () =>
      h("button", {
        "data-testid": "propose-form-submit",
        "data-opens": props.weekOpensAt,
        "data-closes": props.weekClosesAt,
        onClick: () => emit("submit", "2026-10-04T18:00:00.000Z", "gg"),
      }),
  }),
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

import BracketNegotiation from "../../components/tournament/BracketNegotiation.vue";
import {
  managesBracket,
  negotiableBracket,
  proposalWindow,
} from "../../utilities/bracketNegotiation";
import { overviewStage } from "../../utilities/matchLifecycle";
import {
  MY_MANAGED_TEAMS_QUERY,
  PROPOSE_TIME_MUTATION,
  RESPOND_PROPOSAL_MUTATION,
} from "../../graphql/leagues";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const iso = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();
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
const local = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

beforeEach(() => {
  auth.me = null;
  auth.role = null;
  apollo.mutate.mockClear();
  apollo.query.mockReset().mockResolvedValue({ data: { teams: [] } });
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const negotiated = { scheduling_mode: "negotiated", league_season_division: null };
const proposal = (id: string, status: string, by: string, hours: number) => ({
  id,
  status,
  message: null,
  proposed_by_steam_id: by,
  proposed_by: { steam_id: by, name: `P${by}` },
  proposed_time: iso(hours),
});
// Team A (teamA, managed by 11) vs Team B (teamB, managed by 21).
const bracket = (extra: Record<string, any> = {}) => ({
  id: "b1",
  round: 1,
  bye: false,
  scheduled_at: null,
  // A projection only.
  scheduled_eta: iso(1),
  team_1: { id: "tt1", name: "Alpha", team_id: "teamA", team: { name: "Alpha" } },
  team_2: { id: "tt2", name: "Bravo", team_id: "teamB", team: { name: "Bravo" } },
  match: null,
  scheduling_proposals: [],
  ...extra,
});
const viewer = (steamId: string | null, teams: string[] = [], role = "user") => {
  auth.me = steamId ? { steam_id: steamId } : null;
  auth.role = steamId ? role : null;
  apollo.query.mockResolvedValue({ data: { teams: teams.map((id) => ({ id })) } });
};
const mountOpen = async (b: any) => {
  const wrapper = mount(BracketNegotiation, {
    props: { bracket: b, stage: { windows: [] } },
    global: { config: { globalProperties: { $t: t, $apollo: apollo } as any } },
  });
  await wrapper.get('[data-testid="bracket-negotiation-open"]').trigger("click");
  await flushPromises();
  return wrapper;
};

describe("which brackets negotiate here", () => {
  it("only a normal negotiated tournament's playable fixtures", () => {
    expect(negotiableBracket(negotiated, bracket())).toBe(true);
    // Before and after the match exists, until it goes past check-in.
    expect(negotiableBracket(negotiated, bracket({ match: { status: "Scheduled" } }))).toBe(true);
    expect(negotiableBracket(negotiated, bracket({ match: { status: "WaitingForCheckIn" } }))).toBe(true);
    expect(negotiableBracket(negotiated, bracket({ match: { status: "Veto" } }))).toBe(false);
    expect(negotiableBracket(negotiated, bracket({ match: { status: "Finished" } }))).toBe(false);
    // Fixed / auto scheduling: unchanged, nothing here.
    expect(negotiableBracket({ scheduling_mode: "auto" }, bracket())).toBe(false);
    expect(negotiableBracket(null, bracket())).toBe(false);
    // League fixtures stay on the league schedule.
    expect(negotiableBracket({ scheduling_mode: "negotiated", league_season_division: { id: "d1" } }, bracket())).toBe(false);
    // Byes, finished brackets and brackets still waiting for a team.
    expect(negotiableBracket(negotiated, bracket({ bye: true }))).toBe(false);
    expect(negotiableBracket(negotiated, bracket({ finished: true }))).toBe(false);
    expect(negotiableBracket(negotiated, bracket({ team_2: null }))).toBe(false);
  });

  it("the proposal window mirrors the trigger: the round's window, else the next two weeks", () => {
    expect(proposalWindow({ windows: [] }, bracket(), NOW)).toEqual({ opensAt: iso(0), closesAt: iso(14 * 24) });
    expect(
      proposalWindow({ windows: [{ round: 1, opens_at: iso(24), closes_at: iso(72) }, { round: 2, opens_at: iso(200), closes_at: iso(300) }] }, bracket(), NOW),
    ).toEqual({ opensAt: iso(24), closesAt: iso(72) });
    expect(managesBracket(bracket(), ["teamB"])).toBe(true);
    expect(managesBracket(bracket(), ["other"])).toBe(false);
    expect(managesBracket(bracket({ team_1: { id: "tt1", team_id: null }, team_2: { id: "tt2", team_id: null } }), [])).toBe(false);
  });
});

describe("bracket card", () => {
  it("shows the state to everyone, never the projected ETA as an agreement", () => {
    const quiet = mount(BracketNegotiation, { props: { bracket: bracket(), stage: null }, global: { config: { globalProperties: { $t: t, $apollo: apollo } as any } } });
    expect(quiet.get('[data-testid="bracket-negotiation-state"]').text()).toBe("tournament.negotiation.no_time");
    expect(quiet.text()).not.toContain(local(iso(1)));
    const pending = mount(BracketNegotiation, {
      props: { bracket: bracket({ scheduling_proposals: [proposal("p1", "Pending", "11", 48)] }), stage: null },
      global: { config: { globalProperties: { $t: t, $apollo: apollo } as any } },
    });
    expect(pending.get('[data-testid="bracket-negotiation-state"]').text()).toBe(`tournament.negotiation.proposed:${JSON.stringify({ time: local(iso(48)) })}`);
  });

  it("never opens the match or the organizer's schedule dialog", async () => {
    const parentClick = vi.fn();
    const Parent = defineComponent({
      setup: () => () => h("div", { onClick: parentClick }, [h(BracketNegotiation, { bracket: bracket(), stage: null })]),
    });
    const wrapper = mount(Parent, { global: { config: { globalProperties: { $t: t, $apollo: apollo } as any } } });
    await wrapper.get('[data-testid="bracket-negotiation-open"]').trigger("click");
    await wrapper.get('[data-testid="bracket-negotiation"]').trigger("click");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("Team A's manager proposes through the league mutation, inside the window", async () => {
    viewer("11", ["teamA"]);
    const wrapper = await mountOpen(bracket());
    expect(apollo.query).toHaveBeenCalledWith(expect.objectContaining({ query: MY_MANAGED_TEAMS_QUERY, variables: { steamId: "11" } }));
    await wrapper.get('[data-testid="bracket-propose"]').trigger("click");
    const form = wrapper.get('[data-testid="propose-form-submit"]');
    expect(form.attributes("data-opens")).toBe(iso(0));
    expect(form.attributes("data-closes")).toBe(iso(14 * 24));
    await form.trigger("click");
    await flushPromises();
    expect(apollo.mutate).toHaveBeenCalledTimes(1);
    expect(apollo.mutate).toHaveBeenCalledWith({
      mutation: PROPOSE_TIME_MUTATION,
      variables: { bracketId: "b1", proposedTime: "2026-10-04T18:00:00.000Z", message: "gg" },
    });
  });

  it("the opponent can accept, or counter (Countered, then a new proposal)", async () => {
    viewer("21", ["teamB"]);
    const pending = bracket({ scheduling_proposals: [proposal("p1", "Pending", "11", 48)] });
    const wrapper = await mountOpen(pending);
    await wrapper.get('[data-testid="bracket-accept"]').trigger("click");
    await flushPromises();
    expect(apollo.mutate).toHaveBeenLastCalledWith({ mutation: RESPOND_PROPOSAL_MUTATION, variables: { proposalId: "p1", status: "Accepted" } });

    apollo.mutate.mockClear();
    await wrapper.get('[data-testid="bracket-counter"]').trigger("click");
    await wrapper.get('[data-testid="propose-form-submit"]').trigger("click");
    await flushPromises();
    expect(apollo.mutate.mock.calls.map(([call]: any) => [call.mutation, call.variables])).toEqual([
      [RESPOND_PROPOSAL_MUTATION, { proposalId: "p1", status: "Countered" }],
      [PROPOSE_TIME_MUTATION, { bracketId: "b1", proposedTime: "2026-10-04T18:00:00.000Z", message: "gg" }],
    ]);
  });

  it("the proposer waits for the other side", async () => {
    viewer("11", ["teamA"]);
    const wrapper = await mountOpen(bracket({ scheduling_proposals: [proposal("p1", "Pending", "11", 48)] }));
    expect(wrapper.find('[data-testid="bracket-accept"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="bracket-awaiting"]').text()).toBe("league.schedule.awaiting_opponent");
    // Still free to propose a different time.
    expect(wrapper.find('[data-testid="bracket-propose"]').exists()).toBe(true);
  });

  it("guests and unrelated players can see it all but not act", async () => {
    const pending = bracket({
      scheduling_proposals: [proposal("p2", "Pending", "21", 72), proposal("p1", "Countered", "11", 48)],
    });
    for (const [steam, teams] of [[null, []], ["99", ["someOtherTeam"]]] as const) {
      viewer(steam, [...teams]);
      apollo.query.mockClear();
      const wrapper = await mountOpen(pending);
      if (!steam) expect(apollo.query).not.toHaveBeenCalled();
      expect(wrapper.get('[data-testid="bracket-proposal-p2"]').text()).toContain(local(iso(72)));
      expect(wrapper.get('[data-testid="bracket-negotiation-history"]').text()).toContain("league.schedule.status.Countered");
      expect(wrapper.findAll("button").map((b) => b.attributes("data-testid"))).toEqual(["bracket-negotiation-open"]);
      expect(wrapper.get('[data-testid="bracket-negotiation-readonly"]').exists()).toBe(true);
    }
  });

  it("administrators keep their authority; tournament organizers keep the bracket schedule dialog", async () => {
    viewer("1", [], "administrator");
    const wrapper = await mountOpen(bracket({ scheduling_proposals: [proposal("p1", "Pending", "11", 48)] }));
    expect(wrapper.find('[data-testid="bracket-accept"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="bracket-propose"]').exists()).toBe(true);
    // A tournament organizer without a team is read-only here (the trigger
    // only lets team managers and administrators negotiate)...
    viewer("2", [], "tournament_organizer");
    const organizer = await mountOpen(bracket({ scheduling_proposals: [proposal("p1", "Pending", "11", 48)] }));
    expect(organizer.find('[data-testid="bracket-accept"]').exists()).toBe(false);
    // ...and still sets a time directly with the existing dialog.
    const card = readFileSync(path.resolve(__dirname, "../../components/tournament/TournamentMatch.vue"), "utf8");
    expect(card).toMatch(/if \(props\.tournament\?\.is_organizer\) \{\s*emit\("schedule-bracket", bracket\);/);
  });

  it("an accepted time is the committed one; the created match opens on the Overview schedule stage", async () => {
    // tau_league_scheduling_proposals: bracket.scheduled_at = agreed time and
    // a Scheduled match at that time (verified against the real triggers).
    const agreed = bracket({
      scheduled_at: iso(48),
      match: { id: "m1", status: "Scheduled" },
      scheduling_proposals: [proposal("p1", "Accepted", "11", 48)],
    });
    const wrapper = await mountOpen(agreed);
    expect(wrapper.get('[data-testid="bracket-negotiation-agreed"]').text()).toBe(`tournament.negotiation.agreed:${JSON.stringify({ time: local(iso(48)) })}`);
    expect(wrapper.find('[data-testid^="bracket-proposal-"]').exists()).toBe(false);
    expect(overviewStage({ status: "Scheduled", source: "5stack" }, { captainPickActive: false })).toBe("schedule");
  });
});

describe("tournament page wiring", () => {
  const source = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("the bracket card renders it only for negotiable brackets", () => {
    expect(source("components/tournament/TournamentMatch.vue")).toMatch(/<BracketNegotiation\s+v-if="negotiableBracket\(props\.tournament, bracket as any\)"/);
  });

  it("the tournament subscription carries proposals, team ids, windows and the league marker", () => {
    const detail = source("components/tournament/TournamentDetail.vue");
    expect(detail).toContain("league_season_division: { id: true }");
    expect(detail).toMatch(/windows: \[\s*\{\},\s*\{ round: true, opens_at: true, closes_at: true \}/);
    expect(detail).toMatch(/team_1: \{\s*id: true,\s*name: true,\s*team_id: true/);
    expect(detail).toMatch(/scheduling_proposals: \[[\s\S]*proposed_by_steam_id: true/);
  });

  it("the league schedule's own surfaces are untouched", () => {
    for (const file of ["components/league/FixtureDetailDialog.vue", "components/league/ProposeTimeDialog.vue", "components/league/ProposeTimeForm.vue", "graphql/leagues.ts"]) {
      expect(source(file)).not.toContain("BracketNegotiation");
    }
  });
});
