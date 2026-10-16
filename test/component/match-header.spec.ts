import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

// 5Stack WEB 85b4f0f9 MatchHeader, with the DEAFCS adaptations: the mode
// badge stays, and the small auto-cancel countdown is hidden during the veto
// and while Live (those have their own clocks).
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string, args?: any) => (args ? `${key}:${JSON.stringify(args)}` : key) }),
}));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
const stub = (name: string) => ({ default: defineComponent({ name, props: ["match", "type", "source", "date", "lineup", "matchMap", "halves", "score"], setup: () => () => h("span", { "data-stub": name }) }) });
vi.mock("~/components/match/MatchActions.vue", () => stub("MatchActions"));
vi.mock("~/components/MatchSourceBadge.vue", () => stub("MatchSourceBadge"));
vi.mock("~/components/MatchTypeBadge.vue", () => stub("MatchTypeBadge"));
vi.mock("~/components/TimeAgo.vue", () => stub("TimeAgo"));

let MatchHeader: any;
beforeAll(async () => {
  MatchHeader = (await import("../../components/match/MatchHeader.vue")).default;
});

const lineup = (name: string, extra: any = {}) => ({
  name,
  team_id: "team-" + name,
  team: { avatar_url: null },
  lineup_players: [{ captain: true, player: { steam_id: name + "1", name: name + " captain", avatar_url: null } }],
  ...extra,
});

const match = (extra: any = {}) => ({
  id: "m",
  status: "Live",
  source: "5stack",
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  lineup_1: lineup("Alpha", { is_on_lineup: true }),
  lineup_2: lineup("Bravo"),
  options: { type: "Competitive", best_of: 3 },
  e_match_status: { description: "Live" },
  match_maps: [
    { id: "mm1", order: 1, map: { name: "de_inferno", label: "Inferno" }, winning_lineup_id: "l1", lineup_1_score: 13, lineup_2_score: 8 },
    { id: "mm2", order: 2, map: { name: "de_nuke", label: "Nuke" }, is_current_map: true, lineup_1_score: 4, lineup_2_score: 6 },
  ],
  ...extra,
});

const render = (m: any) =>
  mount(MatchHeader, {
    props: { match: m },
    global: { mocks: { $t: (key: string) => key }, stubs: { NuxtLink: { template: "<a><slot /></a>" } } },
  });

describe("MatchHeader (5Stack port)", () => {
  it("shows both teams, the actions menu and the mode badge", () => {
    const w = render(match());
    expect(w.text()).toContain("Alpha");
    expect(w.text()).toContain("Bravo");
    expect(w.find("[data-stub='MatchActions']").exists()).toBe(true);
    expect(w.find("[data-stub='MatchTypeBadge']").exists()).toBe(true);
  });

  it("draws a slot for every map of a series, played or not", () => {
    const w = render(match());
    // Two played maps plus the third, unplayed slot (desktop chips).
    expect(w.text()).toContain("match.map_number");
  });

  it("marks the viewer's own lineup with the amber ring", () => {
    const w = render(match());
    expect(w.html()).toContain("ring-[hsl(var(--tac-amber))]");
  });

  it("reads Final once the match is finished", () => {
    const w = render(match({ status: "Finished", winning_lineup_id: "l1", e_match_status: { description: "Finished" }, match_maps: match().match_maps.map((m: any) => ({ ...m, is_current_map: false, winning_lineup_id: "l1" })) }));
    expect(w.text()).toContain("match.header.final");
    expect(w.text()).toContain("match.header.winner");
  });

  it("hides the small auto-cancel clock while Live and in the veto, shows it before", () => {
    const soon = new Date(Date.now() + 60_000).toISOString();
    for (const status of ["Live", "Veto"]) {
      expect(render(match({ status, cancels_at: soon })).text()).not.toContain("match.auto_canceling");
    }
    expect(render(match({ status: "WaitingForCheckIn", cancels_at: soon })).text()).toContain("match.auto_canceling");
  });

  it("says vs before there is a score", () => {
    const w = render(match({ status: "Scheduled", match_maps: [] }));
    expect(w.text()).toContain("common.vs");
  });
});
