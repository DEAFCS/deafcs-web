import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The manual tournament MVP panel: organizers choose one MVP once the
// tournament has finished, from players who played. The list is neutral:
// alphabetical as the API sends it, stats for guidance only, nothing ranked,
// highlighted or recommended.
const client = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@vue/apollo-composable", () => ({ useApolloClient: () => ({ client }) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/components/ui/toast", () => ({ toast }));
vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));

import TournamentMvpChooser from "../../components/tournament/TournamentMvpChooser.vue";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

const candidates = [
  // Alphabetical, deliberately NOT in rating order.
  { player_steam_id: "11", player_name: "Alpha", tournament_team_id: "t1", team_name: "Red", matches_played: 3, rating: 0.71, kills: 30, deaths: 40, assists: 5 },
  { player_steam_id: "12", player_name: "Bravo", tournament_team_id: "t2", team_name: "Blue", matches_played: 1, rating: 1.9, kills: 25, deaths: 9, assists: 2 },
  { player_steam_id: "13", player_name: "Charlie", tournament_team_id: "t1", team_name: "Red", matches_played: 3, rating: 1.1, kills: 41, deaths: 30, assists: 9 },
];

const dialogStubs = {
  Dialog: { template: "<div><slot /></div>", props: ["open"] },
  DialogContent: { template: "<div><slot /></div>" },
  DialogHeader: { template: "<div><slot /></div>" },
  DialogTitle: { template: "<div><slot /></div>" },
  DialogDescription: { template: "<div><slot /></div>" },
  DialogFooter: { template: "<div><slot /></div>" },
};

function mountChooser(props: Record<string, unknown> = {}) {
  return mount(TournamentMvpChooser as any, {
    props: {
      tournamentId: "t",
      matchType: "Competitive",
      minPlayersPerLineup: 5,
      finished: true,
      ...props,
    },
    global: {
      stubs: dialogStubs,
      config: { globalProperties: { $t: (key: string, params?: any) => (params?.player ? `${key}:${params.player}` : key) } as any },
    },
  });
}

let currentMvp: any[] = [];

beforeEach(() => {
  client.query.mockReset();
  client.mutate.mockReset();
  toast.mockClear();
  currentMvp = [];
  client.query.mockImplementation(async ({ variables, query }: any) => {
    const text = query.loc.source.body as string;
    if (text.includes("tournamentMvpCandidates")) {
      return { data: { tournamentMvpCandidates: candidates } };
    }
    return { data: { award_recipients: currentMvp } };
  });
  client.mutate.mockResolvedValue({ data: { setTournamentMvp: { success: true } } });
});

describe("where the panel appears", () => {
  it("is hidden for a tournament that is not 5v5", async () => {
    const w = mountChooser({ matchType: "Wingman", minPlayersPerLineup: 2 });
    await flushPromises();
    expect(w.find('[data-testid="tournament-mvp-chooser"]').exists()).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });

  it("before the tournament has finished it only says so", async () => {
    const w = mountChooser({ finished: false });
    await flushPromises();
    expect(w.find('[data-testid="tournament-mvp-not-finished"]').exists()).toBe(true);
    expect(w.find('[data-testid="tournament-mvp-choose"]').exists()).toBe(false);
  });

  it("once finished it offers to choose, with no MVP yet", async () => {
    const w = mountChooser();
    await flushPromises();
    expect(w.find('[data-testid="tournament-mvp-choose"]').text()).toBe("tournament.mvp.choose");
    expect(w.find('[data-testid="tournament-mvp-clear"]').exists()).toBe(false);
  });

  it("is mounted in Manage only for the tournament's organizers", () => {
    const manage = read("components/tournament/TournamentManage.vue");
    expect(manage).toMatch(/<TournamentMvpChooser\s+v-if="tournament\.is_organizer"/);
  });
});

describe("choosing", () => {
  it("lists candidates in the order the API sends them, with guidance stats and no recommendation", async () => {
    const w = mountChooser();
    await flushPromises();
    await (w.vm as any).openChoose();
    await flushPromises();

    const rows = w.findAll('[data-testid="tournament-mvp-candidate"]');
    expect(rows.map((r) => r.find("td:nth-child(2)").text())).toEqual(["Alpha", "Bravo", "Charlie"]);

    const first = rows[0].text();
    expect(first).toContain("Red");
    expect(first).toContain("3");
    expect(first).toContain("0.71");
    expect(first).toContain("30");
    expect(first).toContain("40");
    expect(first).toContain("5");

    // Nothing is pre-selected, highlighted or marked as recommended.
    expect(w.findAll('input[type="radio"]').some((r) => (r.element as HTMLInputElement).checked)).toBe(false);
    expect(w.html().toLowerCase()).not.toContain("recommend");
    expect(w.html().toLowerCase()).not.toContain("best");
    expect(w.find('[data-testid="tournament-mvp-continue"]').attributes("disabled")).toBeDefined();
  });

  it("needs a selection and a confirmation before anything is saved", async () => {
    const w = mountChooser();
    await flushPromises();
    await (w.vm as any).openChoose();
    await flushPromises();

    await w.findAll('[data-testid="tournament-mvp-candidate"]')[1].trigger("click");
    await w.find('[data-testid="tournament-mvp-continue"]').trigger("click");
    expect(w.find('[data-testid="tournament-mvp-confirm"]').text()).toContain("Bravo");
    expect(client.mutate).not.toHaveBeenCalled();

    await w.find("textarea").setValue("  Held the team together  ");
    await w.find('[data-testid="tournament-mvp-confirm-button"]').trigger("click");
    await flushPromises();

    expect(client.mutate).toHaveBeenCalledTimes(1);
    expect(client.mutate.mock.calls[0][0].variables).toEqual({
      tournamentId: "t",
      playerSteamId: "12",
      note: "Held the team together",
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "tournament.mvp.saved" }));
  });

  it("shows the API's message when a rule rejects the choice", async () => {
    client.mutate.mockRejectedValue(new Error("This player did not play in this tournament"));
    const w = mountChooser();
    await flushPromises();
    await (w.vm as any).openChoose();
    await flushPromises();
    await w.findAll('[data-testid="tournament-mvp-candidate"]')[0].trigger("click");
    await w.find('[data-testid="tournament-mvp-continue"]').trigger("click");
    await w.find('[data-testid="tournament-mvp-confirm-button"]').trigger("click");
    await flushPromises();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: "This player did not play in this tournament" }),
    );
  });
});

describe("changing and clearing", () => {
  beforeEach(() => {
    currentMvp = [
      {
        id: "r1",
        player_steam_id: "12",
        recipient_note: null,
        player: { steam_id: "12", name: "Bravo" },
        tournament_team: { id: "t2", name: null, team: { id: "x", name: "Blue" } },
      },
    ];
  });

  it("shows the current MVP with change and clear", async () => {
    const w = mountChooser();
    await flushPromises();
    const text = w.find('[data-testid="tournament-mvp-current"]').text();
    expect(text).toContain("Bravo");
    expect(text).toContain("Blue");
    expect(w.find('[data-testid="tournament-mvp-choose"]').text()).toBe("tournament.mvp.change");
    expect(w.find('[data-testid="tournament-mvp-clear"]').exists()).toBe(true);
  });

  it("opening Change starts from the current MVP selected", async () => {
    const w = mountChooser();
    await flushPromises();
    await (w.vm as any).openChoose();
    await flushPromises();
    const checked = w.findAll('input[type="radio"]').filter((r) => (r.element as HTMLInputElement).checked);
    expect(checked).toHaveLength(1);
    expect(checked[0].attributes("aria-label")).toBe("Bravo");
  });

  it("clearing asks for confirmation, sends the note and reloads", async () => {
    client.mutate.mockImplementation(async () => {
      currentMvp = [];
      return { data: { clearTournamentMvp: { success: true } } };
    });
    const w = mountChooser();
    await flushPromises();

    await w.find('[data-testid="tournament-mvp-clear"]').trigger("click");
    expect(client.mutate).not.toHaveBeenCalled();
    await w.findAll("textarea")[0].setValue("Chosen by mistake");
    await w.find('[data-testid="tournament-mvp-clear-confirm"]').trigger("click");
    await flushPromises();

    expect(client.mutate.mock.calls[0][0].variables).toEqual({
      tournamentId: "t",
      note: "Chosen by mistake",
    });
    expect(w.find('[data-testid="tournament-mvp-clear"]').exists()).toBe(false);
    expect(w.find('[data-testid="tournament-mvp-choose"]').text()).toBe("tournament.mvp.choose");
  });
});

describe("the results page and profiles", () => {
  const results = read("components/tournament/TournamentResults.vue");

  it("shows the occurrence that still has an active MVP as placement 0", async () => {
    const { default: Results } = await import("../../components/tournament/TournamentResults.vue");
    const mvp = (Results as any).computed.mvp;
    const recipient = {
      player_steam_id: "12",
      player: { name: "Bravo" },
      tournament_team: { name: "Blue" },
      tournament_team_id: "t2",
    };
    expect(mvp.call({ awardOccurrences: [] })).toBeNull();
    expect(mvp.call({ awardOccurrences: [{ placement: 0, recipients: [] }] })).toBeNull();
    const shown = mvp.call({
      awardOccurrences: [
        { placement: 0, recipients: [] },
        { placement: 1, recipients: [recipient] },
        { placement: 0, recipients: [recipient] },
      ],
    });
    expect(shown.player_steam_id).toBe("12");
    expect(shown.tournament_team_id).toBe("t2");
  }, 60_000);

  it("never loads revoked recipients on the results page, player profile or team page", () => {
    expect(results).toContain("{ where: { revoked_at: { _is_null: true } } }");
    expect(read("pages/players/[id].vue")).toContain("revoked_at: { _is_null: true }");
    expect(read("pages/teams/[id].vue")).toContain("revoked_at: { _is_null: true }");
  });
});
