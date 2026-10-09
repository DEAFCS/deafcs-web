import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("~/components/PlayerDisplay.vue", async () => ({
  default: (await import("./fixtures/playerDisplayStub")).PlayerDisplayStub,
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

import MatchStartingLineup from "../../components/match/MatchStartingLineup.vue";

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(/\r\n/g, "\n");

const t = (key: string, args?: Record<string, unknown>) =>
  args && Object.keys(args).length ? `${key}:${JSON.stringify(args)}` : key;

const auth = { me: null as null | { steam_id: string } };
const apollo = { query: vi.fn(), mutate: vi.fn() };

const row = (steam_id: string, role = "Member") => ({
  player_steam_id: steam_id,
  role,
  player: { steam_id, name: `P${steam_id}` },
});
const roster = (ids: string[]) => ids.map((id, i) => row(id, i === 0 ? "Admin" : "Member"));
const seat = (steam_id: string) => ({ steam_id });

const match = (size: number, team1: string[], active1: string[], overrides: Record<string, any> = {}) => ({
  id: "m1",
  status: "WaitingForCheckIn",
  is_tournament_match: true,
  can_start: false,
  min_players_per_lineup: size,
  tournament_brackets: [{ id: "b1" }],
  lineup_1: { id: "L1", name: "Alpha", lineup_players: active1.map(seat) },
  lineup_2: { id: "L2", name: "Bravo", lineup_players: ["a", "b"].map(seat) },
  ...overrides,
  _team1: team1,
});

const stubs = {
  Dialog: { props: ["open"], template: '<div v-if="open"><slot /></div>' },
  DialogContent: { template: "<div><slot /></div>" },
  DialogHeader: { template: "<div><slot /></div>" },
  DialogTitle: { template: "<div><slot /></div>" },
  DialogDescription: { template: "<div><slot /></div>" },
  DialogFooter: { template: "<div><slot /></div>" },
  Checkbox: { template: "<button class=\"cb\" />" },
};

const mountPanel = async (m: any, team1: string[], captain = "11") => {
  apollo.query.mockResolvedValue({
    data: {
      tournament_brackets_by_pk: {
        team_1: { id: "tt1", name: "Alpha", captain_steam_id: captain, owner_steam_id: captain, roster: roster(team1) },
        team_2: { id: "tt2", name: "Bravo", captain_steam_id: "a", owner_steam_id: "a", roster: roster(["a", "b"]) },
        match: {
          lineup_1: { id: "L1", needs_starting_lineup_confirmation: true },
          lineup_2: { id: "L2", needs_starting_lineup_confirmation: false },
        },
      },
    },
  });
  const wrapper = mount(MatchStartingLineup, {
    props: { match: m },
    global: { config: { globalProperties: { $t: t, $apollo: apollo } as any }, stubs },
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  auth.me = null;
  apollo.query.mockReset();
  apollo.mutate.mockReset().mockResolvedValue({ data: {} });
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe("starting lineup panel layout", () => {
  it("is one full-width panel with a title, not a narrow card", async () => {
    auth.me = { steam_id: "11" };
    const wrapper = await mountPanel(match(2, ["11", "12", "13", "14"], ["11", "12"]), ["11", "12", "13", "14"]);
    const panel = wrapper.get('[data-testid="starting-lineup"]');
    expect(panel.classes()).toEqual(expect.arrayContaining(["rounded-xl", "p-4"]));
    expect(panel.classes()).not.toContain("max-w-md");
    expect(panel.get('[data-testid="starting-lineup-title"]').text()).toBe("match.starting_lineup.title");
    expect(panel.get('[data-testid="select-starting-lineup"]').text()).toContain("match.starting_lineup.confirm");
  });

  it("a Wingman roster of four sits in a responsive grid (one row when wide), with Active and Substitute badges", async () => {
    const wrapper = await mountPanel(match(2, ["11", "12", "13", "14"], ["11", "12"]), ["11", "12", "13", "14"]);
    const grid = wrapper.get('[data-testid="starting-lineup-team-1"] [data-testid="starting-lineup-players"]');
    expect(grid.classes().join(" ")).toContain("grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))");
    expect(grid.classes()).not.toContain("flex-col");
    expect(grid.findAll("li")).toHaveLength(4);
    const active = grid.findAll('[data-active="true"]');
    const subs = grid.findAll('[data-active="false"]');
    expect(active).toHaveLength(2);
    expect(subs).toHaveLength(2);
    expect(active[0].text()).toContain("match.starting_lineup.active");
    expect(subs[0].text()).toContain("match.starting_lineup.substitute");
  });

  it("a Competitive roster with substitutes wraps naturally in the same grid", async () => {
    const ids = ["11", "12", "13", "14", "15", "16", "17"];
    const wrapper = await mountPanel(match(5, ids, ids.slice(0, 5)), ids);
    const grid = wrapper.get('[data-testid="starting-lineup-team-1"] [data-testid="starting-lineup-players"]');
    expect(grid.findAll("li")).toHaveLength(7);
    expect(grid.findAll('[data-active="true"]')).toHaveLength(5);
    expect(grid.findAll('[data-active="false"]')).toHaveLength(2);
    expect(grid.classes().join(" ")).toContain("auto-fill");
  });

  it("changes no rule or permission: the same hints decide who is offered the choice", async () => {
    const ids = ["11", "12", "13", "14"];
    auth.me = { steam_id: "13" };
    let wrapper = await mountPanel(match(2, ids, ["11", "12"]), ids);
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(false);
    auth.me = { steam_id: "11" };
    wrapper = await mountPanel(match(2, ids, ["11", "12"]), ids);
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(true);
    wrapper = await mountPanel(match(2, ids, ["11", "12"], { status: "Live" }), ids);
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(false);
  });
});

describe("starting lineup placement", () => {
  it("sits under both team panels in the Overview, not inside the narrow middle stage", () => {
    const overview = read("components/match/overview/MatchOverview.vue");
    const checkIn = read("components/match/overview/OverviewCheckIn.vue");
    expect(checkIn).not.toContain("MatchStartingLineup");
    const teamsGrid = overview.indexOf('v-for="team in teams"');
    const panel = overview.indexOf("<MatchStartingLineup");
    expect(teamsGrid).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(teamsGrid);
    // After the grid that holds the stage and both team panels, still in the section.
    expect(overview.slice(teamsGrid, panel)).toContain("</div>\n    </div>");
    expect(overview).toContain("stage === 'check-in' && match.is_tournament_match");
  });
});

describe("matches table status", () => {
  it("the Result cell is clipped and the status wraps inside it instead of spilling into Map", () => {
    const rowSource = read("components/player/PlayerMatchRow.vue");
    expect(rowSource.match(/result-cell flex min-w-0 overflow-hidden flex-col justify-center gap-(1|0\.5)/g)).toHaveLength(2);
    expect(rowSource.match(/class="result-status self-start"/g)).toHaveLength(2);
    expect(rowSource).toMatch(/\.result-cell :deep\(\.result-status\) \{[^}]*max-width: 100%;[^}]*white-space: normal;/);
    // The column track itself did not change (header and rows stay aligned).
    expect(rowSource).toContain("grid-cols-[2.5rem_5rem_6.75rem_8.5rem_minmax(4.5rem,1fr)");
    expect(read("components/player/PlayerMatchesTable.vue")).toContain("grid-cols-[2.5rem_5rem_6.75rem_8.5rem_minmax(4.5rem,1fr)");
  });
});

describe("map veto notifications and CT/T size", () => {
  it("the corner veto notification stays, the orange action popup for a veto is gone", () => {
    const corner = read("composables/useOffPageToasts.ts");
    expect(corner).toContain("matchmaking.toasts.your_veto_title");
    expect(corner).toContain("can_pick_map_veto");
    const actions = read("utilities/matchActionToasts.ts");
    expect(actions).not.toContain('add("map_veto")');
    expect(actions).not.toContain('add("region_veto")');
    expect(actions).toContain('export type MatchActionKind = "check_in";');
  });

  it("CT/T is a single row whatever the pool size", () => {
    const veto = read("components/match/overview/OverviewVeto.vue");
    expect(veto).toContain('aspectRatio: "4 / 1"');
    expect(veto).not.toMatch(/Math\.ceil\(this\.mapRows\.length \/ 3\)/);
    // Two wide choices, side by side.
    expect(veto).toContain("grid min-h-0 flex-1 grid-cols-2");
    // The map grid still wraps as before.
    expect(veto).toContain("w-[calc((100%_-_0.5rem)/2)]");
    expect(veto).toContain("sm:w-[calc((100%_-_1rem)/3)]");
  });
});
