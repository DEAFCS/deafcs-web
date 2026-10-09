import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

vi.mock("~/components/PlayerDisplay.vue", async () => ({
  default: (await import("./fixtures/playerDisplayStub")).PlayerDisplayStub,
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

import MatchStartingLineup from "../../components/match/MatchStartingLineup.vue";

const t = (key: string, args?: Record<string, unknown>) =>
  args && Object.keys(args).length ? `${key}:${JSON.stringify(args)}` : key;

const auth = { me: null as null | { steam_id: string } };
const apollo = {
  query: vi.fn(),
  mutate: vi.fn(),
};

const rosterRow = (steam_id: string, role = "Member") => ({
  player_steam_id: steam_id,
  role,
  player: { steam_id, name: `P${steam_id}` },
});

// Team 1 has four on the roster for a 2v2, team 2 exactly two.
const rosters = {
  team_1: {
    id: "tt1",
    name: "Alpha",
    captain_steam_id: "11",
    owner_steam_id: "11",
    roster: [
      rosterRow("11", "Admin"),
      rosterRow("12"),
      rosterRow("13"),
      rosterRow("14"),
    ],
  },
  team_2: {
    id: "tt2",
    name: "Bravo",
    captain_steam_id: "21",
    owner_steam_id: "21",
    roster: [rosterRow("21", "Admin"), rosterRow("22")],
  },
};

const seat = (steam_id: string) => ({ steam_id });

const match = (overrides: Record<string, any> = {}) => ({
  id: "m1",
  status: "WaitingForCheckIn",
  is_tournament_match: true,
  can_start: false,
  min_players_per_lineup: 2,
  tournament_brackets: [{ id: "b1" }],
  lineup_1: { id: "L1", name: "Alpha", lineup_players: [seat("11"), seat("12")] },
  lineup_2: { id: "L2", name: "Bravo", lineup_players: [seat("21"), seat("22")] },
  ...overrides,
});

// Dialog parts render inline so the dialog content is reachable in the test.
const stubs = {
  Dialog: { props: ["open"], template: '<div v-if="open"><slot /></div>' },
  DialogContent: { template: "<div><slot /></div>" },
  DialogHeader: { template: "<div><slot /></div>" },
  DialogTitle: { template: "<div><slot /></div>" },
  DialogDescription: { template: "<div><slot /></div>" },
  DialogFooter: { template: "<div><slot /></div>" },
  Checkbox: {
    props: ["modelValue", "disabled"],
    emits: ["update:modelValue"],
    template:
      '<button type="button" class="cb" :data-checked="modelValue" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)" />',
  },
};

const mountPanel = async (m: any) => {
  const wrapper = mount(MatchStartingLineup, {
    props: { match: m },
    global: {
      config: { globalProperties: { $t: t, $apollo: apollo } as any },
      stubs,
    },
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  auth.me = null;
  apollo.query.mockReset().mockResolvedValue({
    data: { tournament_brackets_by_pk: rosters },
  });
  apollo.mutate
    .mockReset()
    .mockResolvedValue({ data: { setMatchStartingLineup: { success: true } } });
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("match starting lineup panel", () => {
  it("asks a team with substitutes to confirm, and says so", async () => {
    auth.me = { steam_id: "11" };
    apollo.query.mockResolvedValue({
      data: {
        tournament_brackets_by_pk: {
          ...rosters,
          match: {
            lineup_1: { id: "L1", needs_starting_lineup_confirmation: true },
            lineup_2: { id: "L2", needs_starting_lineup_confirmation: false },
          },
        },
      },
    });
    const wrapper = await mountPanel(match());
    expect(
      wrapper.get('[data-testid="starting-lineup-needs-confirmation"]').text(),
    ).toContain("match.starting_lineup.needs_confirmation");
    expect(wrapper.get('[data-testid="select-starting-lineup"]').text()).toContain(
      "match.starting_lineup.confirm",
    );
  });

  it("once confirmed the button offers to change the lineup instead", async () => {
    auth.me = { steam_id: "11" };
    const wrapper = await mountPanel(match());
    expect(
      wrapper.find('[data-testid="starting-lineup-needs-confirmation"]').exists(),
    ).toBe(false);
    expect(wrapper.get('[data-testid="select-starting-lineup"]').text()).toContain(
      "match.starting_lineup.select",
    );
  });

  it("shows who is Active and who is a Substitute for this match", async () => {
    const wrapper = await mountPanel(match());
    const team1 = wrapper.get('[data-testid="starting-lineup-team-1"]');
    const active = team1
      .findAll('[data-active="true"]')
      .map((li) => li.attributes("data-testid"));
    const subs = team1
      .findAll('[data-active="false"]')
      .map((li) => li.attributes("data-testid"));
    expect(active).toEqual([
      "starting-lineup-player-11",
      "starting-lineup-player-12",
    ]);
    expect(subs).toEqual([
      "starting-lineup-player-13",
      "starting-lineup-player-14",
    ]);
    expect(team1.text()).toContain("match.starting_lineup.substitute");
  });

  it("shows nothing for a team whose roster is exactly the starting size", async () => {
    const wrapper = await mountPanel(match());
    expect(wrapper.find('[data-testid="starting-lineup-team-2"]').exists()).toBe(
      false,
    );
  });

  it("offers the choice to the team captain but not to an ordinary member", async () => {
    auth.me = { steam_id: "11" };
    let wrapper = await mountPanel(match());
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(
      true,
    );

    auth.me = { steam_id: "13" };
    wrapper = await mountPanel(match());
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(
      false,
    );
  });

  it("offers it to an organizer who can start the match", async () => {
    auth.me = { steam_id: "999" };
    const wrapper = await mountPanel(match({ can_start: true }));
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(
      true,
    );
  });

  it("does not offer it once the match has started", async () => {
    auth.me = { steam_id: "11" };
    const wrapper = await mountPanel(match({ status: "Live" }));
    expect(wrapper.find('[data-testid="select-starting-lineup"]').exists()).toBe(
      false,
    );
    // The Active / Substitute split is still shown.
    expect(wrapper.find('[data-testid="starting-lineup-team-1"]').exists()).toBe(
      true,
    );
  });

  it("saves only an exact selection, and sends it to the API", async () => {
    auth.me = { steam_id: "11" };
    const wrapper = await mountPanel(match());
    await wrapper.get('[data-testid="select-starting-lineup"]').trigger("click");

    const boxes = wrapper.findAll("button.cb");
    expect(boxes).toHaveLength(4);
    // The captain is only the default pick: they may sit the match out.
    expect(boxes[0].attributes("disabled")).toBeUndefined();
    expect(boxes[0].attributes("data-checked")).toBe("true");

    const save = wrapper
      .findAll("button")
      .find((b) => b.text() === "match.starting_lineup.save")!;
    expect(save.attributes("disabled")).toBeUndefined();

    // Untick 12: one short of the starting size, saving is off.
    await boxes[1].trigger("click");
    expect(save.attributes("disabled")).toBeDefined();
    // Once two are selected nothing else can be ticked.
    await boxes[2].trigger("click");
    expect(save.attributes("disabled")).toBeUndefined();
    expect(boxes[3].attributes("disabled")).toBeDefined();

    await save.trigger("click");
    await flushPromises();

    expect(apollo.mutate).toHaveBeenCalledTimes(1);
    const document = JSON.stringify(apollo.mutate.mock.calls[0][0].mutation);
    expect(document).toContain("setMatchStartingLineup");
    expect(document).toContain("L1");
    expect(document).toContain("13");
  });
});
