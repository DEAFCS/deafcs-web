import { beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

const queries: Array<(doc: any) => any> = [];
vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({
    client: {
      query: vi.fn(async ({ query }: any) => {
        const name = query.definitions[0].name.value;
        if (name === "TournamentRewardsAwardDefinitions") {
          return {
            data: {
              awards: [
                { id: "gold", name: "Champion", tier: "gold", system_key: "tournament_gold", archived_at: null },
                { id: "silver", name: "Runner-up", tier: "silver", system_key: "tournament_silver", archived_at: null },
                { id: "bronze", name: "Third", tier: "bronze", system_key: "tournament_bronze", archived_at: null },
                { id: "mvp", name: "Tournament MVP", tier: "mvp", system_key: "tournament_mvp", archived_at: null },
              ],
            },
          };
        }
        return { data: { tournament_award_slots: [] } };
      }),
    },
  }),
}));

import { getRouteTabValue } from "../../composables/useRouteTab";
import TournamentPrizes from "../../components/tournament/TournamentPrizes.vue";
import TournamentRewards from "../../components/tournament/TournamentRewards.vue";

void queries;
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(/\r\n/g, "\n");

const t = (key: string) => key;
const prizes = [
  { id: "1", place: "1st", prize: "$500" },
  { id: "2", place: "2nd", prize: "$300" },
  { id: "3", place: "3rd", prize: "$100" },
  { id: "4", place: "4th", prize: "$50" },
];

describe("Overview order", () => {
  const detail = read("components/tournament/TournamentDetail.vue");
  const overview = detail.slice(
    detail.indexOf('<TabsContent value="overview">'),
    detail.indexOf('<TabsContent value="bracket">'),
  );
  const at = (needle: string) => {
    const index = overview.indexOf(needle);
    expect(index, needle).toBeGreaterThan(-1);
    return index;
  };

  it("starts with the info bar", () => {
    expect(at("<TournamentStatRibbon")).toBeLessThan(at("<TournamentResults"));
    expect(at("<TournamentStatRibbon")).toBeLessThan(at("<TournamentRewards"));
  });

  it("before and during the tournament: awards, then prize money directly under them, then progress", () => {
    const rewards = at("<TournamentRewards");
    const money = overview.indexOf("<TournamentPrizes", rewards);
    expect(money).toBeGreaterThan(rewards);
    expect(overview.slice(rewards, money)).not.toContain("<TournamentProgress");
    expect(at("<TournamentProgress")).toBeGreaterThan(money);
    // Money only when configured: no empty section.
    expect(overview.slice(money - 40, money + 60)).toContain('v-if="hasPrizes"');
    expect(detail).toMatch(/hasPrizes\(\) \{\s+return \(this\.tournament\?\.prizes\?\.length \?\? 0\) > 0;/);
    // The awards are not shown in the finished presentation.
    expect(overview).toMatch(/<TournamentResults\s+v-if="tournament\.status === e_tournament_status_enum\.Finished"/);
    expect(overview).toContain("<template v-else>");
  });

  it("finished: the results (podium and MVP) carry the prize money, which sits before the standings", () => {
    const results = read("components/tournament/TournamentResults.vue");
    const podium = results.indexOf('data-testid="tournament-results-podium"');
    const slot = results.indexOf('<slot name="prizes" />');
    const standings = results.indexOf('<template v-if="showStandings">', slot);
    expect(podium).toBeGreaterThan(-1);
    expect(slot).toBeGreaterThan(podium);
    expect(standings).toBeGreaterThan(slot);
    expect(overview).toContain("<template #prizes>");
    expect(overview).toContain(':show-matches="false"');
    expect(overview).toContain(':show-standings="true"');
  });

  it("ends with About | Match Setup, About only when there is a description", () => {
    const bottom = overview.slice(overview.indexOf('data-testid="tournament-overview-bottom"') - 200);
    expect(bottom.indexOf("tournament-overview-about")).toBeLessThan(bottom.indexOf("tournament-overview-match-setup"));
    expect(bottom).toContain(":class=\"hasDescription ? 'xl:grid-cols-2' : ''\"");
    expect(bottom).toContain('v-if="hasDescription"');
    expect(detail).toMatch(/hasDescription\(\) \{\s+return !!String\(this\.tournament\?\.description \?\? ""\)\.trim\(\);/);
    // Stacks below xl: the two-column class is the only layout class, so the
    // grid is a single column on phones and tablets.
    expect(bottom.replace("xl:grid-cols-2", "")).not.toContain("grid-cols-2");
  });

  it("does not repeat Match Setup, placement or prizes in the Overview", () => {
    for (const component of ["<TournamentMatchSetup", "<TournamentPrizes", "<TournamentRewards", "<TournamentResults"]) {
      const count = overview.split(component).length - 1;
      expect(count, component).toBeLessThanOrEqual(2);
    }
    expect(overview.split("<TournamentMatchSetup").length - 1).toBe(1);
    // The old standalone rules link block is gone from the Overview itself.
    expect(overview).not.toContain("tournament_rules_hint");
  });
});

describe("Standings navigation", () => {
  const detail = read("components/tournament/TournamentDetail.vue");

  it("the public Standings tab is gone", () => {
    expect(detail).not.toContain('value="standings"');
    expect(detail).not.toContain('tabs.push("standings")');
    expect(detail).not.toContain("standings: this.$t(");
    expect(detail).toContain('tabs.push("stats")');
  });

  it("an old ?tab=standings link falls back to the Overview", () => {
    const tabs = ["overview", "bracket", "matches", "teams", "stats"];
    expect(getRouteTabValue({ query: { tab: "standings" } } as any, tabs, "overview")).toBe("overview");
    expect(getRouteTabValue({ query: { tab: "stats" } } as any, tabs, "overview")).toBe("stats");
  });

  it("the standings components stay in place for the Overview, the bracket and management", () => {
    expect(read("components/tournament/TournamentResults.vue")).toContain("<StageStandings");
    expect(read("components/tournament/StageStandings.vue")).toContain("<script");
  });
});

describe("Prize money", () => {
  it("renders the podium and the payout rows when configured", () => {
    const wrapper = mount(TournamentPrizes, {
      props: { prizes },
      global: { mocks: { $t: t }, stubs: { Card: { template: "<div v-bind='$attrs'><slot /></div>" } } },
    });
    expect(wrapper.find('[data-testid="tournament-prize-money"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("$500");
    expect(wrapper.text()).toContain("$50");
  });

  it("renders nothing without prize money", () => {
    const wrapper = mount(TournamentPrizes, {
      props: { prizes: [] },
      global: { mocks: { $t: t }, stubs: { Card: { template: "<div v-bind='$attrs'><slot /></div>" } } },
    });
    expect(wrapper.find('[data-testid="tournament-prize-money"]').exists()).toBe(false);
  });
});

describe("Tournament Awards (before and during the tournament)", () => {
  const mountRewards = async (props: Record<string, any>) => {
    const wrapper = mount(TournamentRewards, {
      props: { tournamentId: "t1", awardsEnabled: true, matchType: "Competitive", minPlayersPerLineup: 5, ...props },
      global: {
        mocks: { $t: t },
        stubs: {
          Card: { template: "<div v-bind='$attrs'><slot /></div>" },
          AwardArtwork: { props: ["award"], template: "<span class='art' :data-award='award.id' />" },
        },
      },
    });
    await flushPromises();
    return wrapper;
  };

  it("shows the configured placement awards and the MVP, and no prize money", async () => {
    const wrapper = await mountRewards({});
    const awards = wrapper.findAll(".art").map((a) => a.attributes("data-award"));
    expect(awards).toEqual(expect.arrayContaining(["gold", "silver", "bronze", "mvp"]));
    expect(wrapper.find('[data-testid="tournament-awards-placements"]').exists()).toBe(true);
    expect(wrapper.text()).not.toMatch(/\$\d/);
    expect(read("components/tournament/TournamentRewards.vue")).not.toMatch(/prizes\b/);
  });

  it("the MVP award is shown for 5v5 only", async () => {
    const wrapper = await mountRewards({ matchType: "Wingman", minPlayersPerLineup: 2 });
    const awards = wrapper.findAll(".art").map((a) => a.attributes("data-award"));
    expect(awards).not.toContain("mvp");
    expect(awards).toEqual(expect.arrayContaining(["gold", "silver", "bronze"]));
  });

  it("renders nothing when awards are off for the tournament", async () => {
    const wrapper = await mountRewards({ awardsEnabled: false });
    expect(wrapper.find('[data-testid="tournament-awards"]').exists()).toBe(false);
  });
});

describe("MVP stays the manually selected one", () => {
  const results = read("components/tournament/TournamentResults.vue");

  it("the finished presentation reads the placement-0 award recipient, never a stats ranking", () => {
    const block = results.slice(results.indexOf("    mvp() {"), results.indexOf("    mvpTeamName() {"));
    expect(block).toContain("o.placement === 0");
    expect(block).toContain("recipients");
    expect(block).not.toMatch(/sort\(|reduce\(|kdr|kills|rating/i);
  });
});

describe("Match setup in the Overview", () => {
  it("shows the map pool through MatchOptionsDisplay and keeps Show Advanced Settings next to Tournament Rules", () => {
    const display = read("components/match/MatchOptionsDisplay.vue");
    expect(display).toContain('<slot name="actions" />');
    expect(display).toContain("match.options.advanced_settings");
    expect(display).toContain("<MiniMapDisplay");
    const setup = read("components/tournament/TournamentMatchSetup.vue");
    expect(setup).toContain("#actions");
    expect(setup).toContain("/tournament-rules");
  });
});

describe("finished podium comes from the final placement, not from awards", () => {
  const stages = (results: any[]) => [
    { order: 1, type: "RoundRobin", results: [{ placement: 1, rank: 1, tournament_team_id: "x", team: { name: "Group only" } }] },
    { order: 2, type: "SingleElimination", results },
  ];
  const row = (placement: number, id: string, name: string, extra: Record<string, any> = {}) => ({
    placement,
    rank: placement,
    tournament_team_id: id,
    team: {
      id,
      name,
      team: { id: `real-${id}`, name },
      roster: [{ player_steam_id: `${id}1`, player: { steam_id: `${id}1`, name: `${name} P1` } }],
    },
    ...extra,
  });

  // The first import of the results component is slow in a full run.
  beforeAll(async () => {
    await import("../../components/tournament/TournamentResults.vue");
  }, 60_000);

  const load = async () => {
    const { default: Results } = await import("../../components/tournament/TournamentResults.vue");
    const options = Results as any;
    const context = (tournament: any, awardOccurrences: any[] = []) => ({
      tournament,
      awardOccurrences,
      isFinished: tournament.status === "Finished",
      finalStageType: "SingleElimination",
      displayTeamName: options.methods.displayTeamName,
    });
    return { options, context };
  };

  it("Finished + awards disabled + valid final placements: the three placed teams are on the podium", async () => {
    const { options, context } = await load();
    const tournament = {
      id: "t1",
      status: "Finished",
      trophies_enabled: false,
      stages: stages([row(2, "b", "Bravo"), row(1, "a", "Alpha"), row(3, "c", "Charlie"), row(4, "d", "Delta")]),
    };
    const ctx = context(tournament, []);
    const podium = options.computed.podium.call(ctx);
    expect(podium.map((e: any) => [e.placement, e.teamName])).toEqual([
      [1, "Alpha"],
      [2, "Bravo"],
      [3, "Charlie"],
    ]);
    expect(podium[0].players.map((p: any) => p.name)).toEqual(["Alpha P1"]);
    // The final stage decides it, not an earlier group stage.
    expect(podium.map((e: any) => e.teamName)).not.toContain("Group only");
    // No award was granted, so there is no award artwork, and no MVP is invented.
    expect(options.methods.hasAwardFor.call(ctx, 1)).toBe(false);
    expect(options.computed.mvp.call(ctx)).toBeNull();
  });

  it("with awards granted the same podium carries the existing award artwork", async () => {
    const { options, context } = await load();
    const tournament = { id: "t1", status: "Finished", stages: stages([row(1, "a", "Alpha"), row(2, "b", "Bravo"), row(3, "c", "Charlie")]) };
    const ctx = context(tournament, [{ placement: 1, recipients: [] }, { placement: 2, recipients: [] }]);
    expect(options.computed.podium.call(ctx)).toHaveLength(3);
    expect(options.methods.hasAwardFor.call(ctx, 1)).toBe(true);
    expect(options.methods.hasAwardFor.call(ctx, 3)).toBe(false);
  });

  it("a shared third place shows both teams", async () => {
    const { options, context } = await load();
    const tournament = {
      id: "t1",
      status: "Finished",
      stages: stages([row(1, "a", "Alpha"), row(2, "b", "Bravo"), row(3, "c", "Charlie", { rank: 3 }), row(3, "d", "Delta", { rank: 4 })]),
    };
    const podium = options.computed.podium.call(context(tournament));
    expect(podium.map((e: any) => e.teamName)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
  });

  it("never shows a provisional placement before the tournament is finished", async () => {
    const { options, context } = await load();
    for (const status of ["Live", "Paused", "RegistrationClosed"]) {
      const tournament = { id: "t1", status, stages: stages([row(1, "a", "Alpha"), row(2, "b", "Bravo"), row(3, "c", "Charlie")]) };
      expect(options.computed.podium.call(context(tournament))).toEqual([]);
    }
  });

  it("the podium block does not depend on awards; artwork is the only award-dependent part", () => {
    const results = read("components/tournament/TournamentResults.vue");
    const section = results.slice(results.indexOf('data-testid="tournament-results-podium"') - 120, results.indexOf('data-testid="tournament-results-podium"'));
    expect(section).toContain("isFinished && (podium.length || mvp)");
    expect(section).not.toMatch(/award|trophies_enabled/i);
    expect(results).toContain('v-if="hasAwardFor(entry.placement)"');
  });

  it("the MVP is still only the manually selected recipient: a podium without one shows no MVP", async () => {
    const { options, context } = await load();
    const tournament = { id: "t1", status: "Finished", stages: stages([row(1, "a", "Alpha")]) };
    expect(options.computed.mvp.call(context(tournament, [{ placement: 1, recipients: [{ player_steam_id: "a1" }] }]))).toBeNull();
  });
});
