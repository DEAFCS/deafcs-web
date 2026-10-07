import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, shallowMount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { readFileSync } from "node:fs";
import { print } from "graphql";
import { scoreboardFixture } from "./fixtures/matchScoreboard";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
// Leaf rendering substitute: keep the actual context providers, sorting,
// tab activation and narrowed data. Full lineup tables are tested separately.
async function lineupStub() {
  const { defineComponent, h } = await import("vue");
  const { useCurrentUserRow } = await import("~/composables/useCurrentUserRow");
  const { useTableSort } = await import("~/composables/useTableSort");
  return { default: defineComponent({
    props: ["lineup", "combineWith", "hideMember"],
    setup(props) {
      const { rowClass } = useCurrentUserRow();
      const { sortRows } = useTableSort("kills");
      return () => h("table", { "data-testid": "lineup-table" }, [
        h("thead", [h("tr", [h("th", "Kills")])]),
        h("tbody", [props.lineup, props.combineWith].filter(Boolean).flatMap((lineup: any) => [
          h("tr", { "data-team": lineup.name }, [h("td", lineup.name)]),
          ...sortRows(lineup.lineup_players, { kills: (p: any) => p.player.match_stats?.[0]?.kills }).map((p: any) =>
            h("tr", { "data-player": p.steam_id, class: rowClass(p) }, [h("td", String((p.player.match_stats ?? p.player.match_map_stats)?.[0]?.kills ?? "?"))])),
        ])),
      ]);
    },
  }) };
}
vi.mock("~/components/match/LineupOverview.vue", () => lineupStub());
vi.mock("~/components/match/LineupUtility.vue", () => lineupStub());
vi.mock("~/components/match/LineupTradeStats.vue", () => lineupStub());
vi.mock("~/components/match/LineupAimStats.vue", () => lineupStub());
vi.mock("~/components/EloChangeBadge.vue", () => ({ default: { props: ["eloChange"], template: '<span data-testid="elo">{{ eloChange.elo_change }}</span>' } }));
vi.mock("~/components/PlayerPremierRank.vue", () => ({ default: { template: "<span />" } }));
vi.mock("~/components/PlayerSkillGroupRank.vue", () => ({ default: { template: "<span />" } }));
import PlayerMatchScoreboard from "../../components/player/PlayerMatchScoreboard.vue";
import PlayerMatchRow from "../../components/player/PlayerMatchRow.vue";

const wrappers: ReturnType<typeof mount>[] = [];
function render(extra: Record<string, any> = {}) {
  const wrapper = mount(PlayerMatchScoreboard, {
    props: { match: scoreboardFixture(), focusSteamId: null, loading: false, activeTab: "overview", selectedMapId: null, clipsCount: 0, typeLabel: "Competitive", sourceLabel: "DEAFCS", ...extra },
    global: { config: { globalProperties: { $t: (k: string) => k } }, stubs: {
      NuxtLink: defineComponent({ props: ["to"], setup: (p, { slots }) => () => h("a", { href: p.to }, slots.default?.()) }),
    } },
  });
  wrappers.push(wrapper);
  return wrapper;
}
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared match expansion", () => {
  it("neutral full stats show both teams without highlighting the viewer", () => {
    const w = render();
    expect(w.findAll("[data-team]").map(x => x.attributes("data-team"))).toEqual(["Alpha", "Beta"]);
    expect(w.findAll("[data-player]")).toHaveLength(4);
    expect(w.findAll("[data-player]").every(x => !x.classes().length)).toBe(true);
    expect(w.get('a').attributes("href")).toBe("/matches/fixture-match");
    expect(w.text()).toContain("Ancient");
    expect(w.text()).toContain("BO1");
  });
  it("focus team first, focus pinned above higher kills, ELO retained", () => {
    const w = render({ focusSteamId: "22", eloChange: { elo_change: 12 } });
    expect(w.findAll("[data-team]").map(x => x.attributes("data-team"))).toEqual(["Beta", "Alpha"]);
    expect(w.findAll("[data-player]").map(x => x.attributes("data-player"))).toEqual(["22", "21", "11", "12"]);
    expect(w.get('[data-player="22"]').classes().join(" ")).toContain("tac-amber");
    expect(w.get('[data-testid="elo"]').text()).toBe("12");
  });
  it.each([null, "22"])("no stats stays compact with unknown result and navigation (focus %s)", focusSteamId => {
    const w = render({ match: scoreboardFixture(false), focusSteamId });
    expect(w.findAll("table")).toHaveLength(0);
    expect(w.get('[data-testid="scoreboard-no-stats"]').classes()).toContain("py-3");
    expect(w.text()).toContain("?");
    expect(w.html()).not.toMatch(/min-h-|h-\[\d{3}px\]/);
    expect(w.get("a").attributes("href")).toBe("/matches/fixture-match");
  });
  it("BO3 chips use custom labels, unplayed maps disabled, selection narrows stats", async () => {
    const w = render({ match: scoreboardFixture(true, 3) });
    expect(w.text()).toContain("BO3");
    expect(w.text()).toContain("Mini Dust2");
    const chips = w.findAll("button");
    expect(chips.find(x => x.text().includes("Mini Dust2"))?.attributes("disabled")).toBeDefined();
    await chips.find(x => x.text().includes("Ancient"))!.trigger("click");
    expect(w.emitted("update:selected-map-id")?.[0]).toEqual(["ancient"]);
    await w.setProps({ selectedMapId: "ancient" });
    expect(w.get('[data-player="11"]').text()).toBe("31");
    await w.findAll("button").find(x => x.text().includes("all_maps"))!.trigger("click");
    expect(w.emitted("update:selected-map-id")?.at(-1)).toEqual([null]);
    await w.setProps({ selectedMapId: null });
    expect(w.get('[data-player="11"]').text()).toBe("30");
    expect(w.props("match").lineup_1.lineup_players[0].player.match_map_hltv).toHaveLength(1);
  });
  it("mobile focus shows just the player, optional full lobby; neutral keeps both", async () => {
    const w = render({ compact: true, focusSteamId: "22" });
    expect(w.findAll("[data-player]").map(x => x.attributes("data-player"))).toEqual(["22"]);
    await w.get('button[aria-expanded]').trigger("click");
    expect(w.findAll("[data-player]")).toHaveLength(5);
    await w.setProps({ focusSteamId: null });
    expect(w.findAll("[data-player]")).toHaveLength(4);
  });
  it("switches all four tabs and emits Highlights without changing navigation", async () => {
    const w = render({ clipsCount: 2 });
    for (const tab of ["utility", "trades", "aim"]) {
      await w.get(`[role="tab"][data-state="inactive"][id$="-${tab}"]`).trigger("mousedown", { button: 0, ctrlKey: false });
      expect(w.emitted("update:active-tab")?.at(-1)).toEqual([tab]);
      await w.setProps({ activeTab: tab });
      expect(w.findAll("[data-player]")).toHaveLength(4);
    }
    await w.findAll("button").find(x => x.text().includes("common.highlights"))!.trigger("click");
    expect(w.emitted("open-clips")).toHaveLength(1);
  });
  it("delays skeleton 200ms and holds visible skeleton at least 350ms", async () => {
    vi.useFakeTimers();
    const w = render({ loading: true });
    expect(w.get('[aria-busy]').classes()).toContain("opacity-0");
    await vi.advanceTimersByTimeAsync(200);
    expect(w.get('[aria-busy]').classes()).toContain("opacity-100");
    await w.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(349);
    expect(w.find('[aria-busy]').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(w.find('[aria-busy]').exists()).toBe(false);
  });
  it("fast fetches do not flash or hold a skeleton", async () => {
    vi.useFakeTimers();
    const w = render({ loading: true });
    await vi.advanceTimersByTimeAsync(50);
    await w.setProps({ loading: false });
    expect(w.find('[aria-busy]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(w.find('[aria-busy]').exists()).toBe(false);
  });
  it("both contexts retain one shared row expansion, existing table pagination untouched", () => {
    const read = (file: string) => readFileSync(file, "utf8");
    const row = read("components/player/PlayerMatchRow.vue");
    expect(row).toContain("<PlayerMatchScoreboard");
    expect(row).toContain(':focus-steam-id="neutral ? null : playerSteamId"');
    expect(row).not.toContain("MatchPlayerDetailsPanel");
    expect(row).not.toContain("MatchOverviewDrawer");
    expect(read("components/tournament/TournamentMatches.vue")).toContain("<PlayerMatchesTable");
    expect(read("components/player/PlayerMatchesTable.vue")).toContain("<PlayerMatchRow");
  });
  it.each([[true, true], [true, false], [false, true], [false, false]])("row expands lazily through shared scoreboard (neutral %s, stats %s)", async (neutral, stats) => {
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "fixture.invalid" } }));
    const match = scoreboardFixture(stats);
    const query = vi.fn().mockResolvedValue({ data: { matches_by_pk: match } });
    const w = shallowMount(PlayerMatchRow, {
      props: { match, neutral, player: neutral ? null : { steam_id: "22" } },
      global: { config: { globalProperties: { $t: (k: string) => k, $apollo: { query } } }, stubs: { NuxtLink: true } },
    });
    wrappers.push(w);
    expect(query).not.toHaveBeenCalled();
    await w.get('button[aria-expanded]').trigger("click");
    await flushPromises();
    const panel = w.getComponent(PlayerMatchScoreboard);
    expect(panel.props("focusSteamId")).toBe(neutral ? null : "22");
    expect(panel.props("match").lineup_2.lineup_players).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(1);
    await w.get('button[aria-expanded]').trigger("click");
    await w.get('button[aria-expanded]').trigger("click");
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("neutral Highlights fetch stays match-scoped and public-only", async () => {
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "fixture.invalid" } }));
    const match: any = scoreboardFixture();
    match.match_maps[0].public_clips_count = 1;
    const query = vi.fn().mockResolvedValue({ data: { matches_by_pk: match, match_clips: [] } });
    const w = shallowMount(PlayerMatchRow, {
      props: { match, neutral: true },
      global: { config: { globalProperties: { $t: (k: string) => k, $apollo: { query } } }, stubs: { NuxtLink: true } },
    });
    wrappers.push(w);
    await w.get('button[aria-expanded]').trigger("click");
    await flushPromises();
    const clipRequest = query.mock.calls.map(([request]) => request).find(request => print(request.query).includes("match_clips("));
    expect(clipRequest).toBeDefined();
    expect(print(clipRequest.query)).toContain('visibility: {_eq: public}');
    expect(print(clipRequest.query)).toContain('match_map: {match_id: {_eq: $matchId}}');
    expect(clipRequest.variables).toEqual({ matchId: "fixture-match" });
  });
});
