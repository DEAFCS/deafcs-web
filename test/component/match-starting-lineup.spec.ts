import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("~/components/PlayerDisplay.vue", async () => ({
  default: (await import("./fixtures/playerDisplayStub")).PlayerDisplayStub,
}));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

import OverviewCheckIn from "../../components/match/overview/OverviewCheckIn.vue";

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8").replace(/\r\n/g, "\n");

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
const apollo = { query: vi.fn(), mutate: vi.fn() };

const ids = (prefix: number, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
const rosterRow = (steam_id: string, i: number) => ({
  player_steam_id: steam_id,
  role: i === 0 ? "Admin" : "Member",
  player: { steam_id, name: `P${steam_id}` },
});
const seat = (steam_id: string, checked_in = false, captain = false) => ({
  steam_id,
  checked_in,
  captain,
  player: { steam_id, name: `P${steam_id}` },
});

type Options = {
  size?: number;
  roster1?: number;
  roster2?: number;
  setting?: "Players" | "Captains" | "Admin";
  ready1?: boolean;
  ready2?: boolean;
  status?: string;
  can_check_in?: boolean;
  can_start?: boolean;
};

// Team 1 players are 11..1n, team 2 players are 21..2n; the first of each is
// the captain. The active lineup is the first `size` of the roster.
const build = (o: Options = {}) => {
  const size = o.size ?? 2;
  const r1 = ids(1, o.roster1 ?? size);
  const r2 = ids(2, o.roster2 ?? size);
  const lineup = (team: number, roster: string[], ready: boolean) => ({
    id: `L${team}`,
    name: team === 1 ? "Alpha" : "Bravo",
    is_ready: ready,
    lineup_players: roster
      .slice(0, size)
      .map((id, i) => seat(id, ready, i === 0)),
  });
  const match = {
    id: "m1",
    status: o.status ?? "WaitingForCheckIn",
    is_tournament_match: true,
    min_players_per_lineup: size,
    cancels_at: "2026-10-01T20:09:00.000Z",
    can_check_in: o.can_check_in ?? true,
    can_start: o.can_start ?? false,
    tournament_brackets: [{ id: "b1" }],
    lineup_1_id: "L1",
    lineup_2_id: "L2",
    options: { type: size === 2 ? "Wingman" : "Competitive", check_in_setting: o.setting ?? "Captains", best_of: 1, map_pool: { maps: [] } },
    lineup_1: lineup(1, r1, !!o.ready1),
    lineup_2: lineup(2, r2, !!o.ready2),
    match_maps: [],
  };
  apollo.query.mockResolvedValue({
    data: {
      tournament_brackets_by_pk: {
        team_1: { id: "tt1", name: "Alpha", captain_steam_id: r1[0], owner_steam_id: r1[0], roster: r1.map(rosterRow) },
        team_2: { id: "tt2", name: "Bravo", captain_steam_id: r2[0], owner_steam_id: r2[0], roster: r2.map(rosterRow) },
      },
    },
  });
  return match;
};

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

const mountCheckIn = async (match: any, as: string | null, role: string | null = null) => {
  auth.me = as ? { steam_id: as } : null;
  auth.role = role;
  const wrapper = mount(OverviewCheckIn, {
    props: { match },
    global: {
      config: { globalProperties: { $t: t, $apollo: apollo } as any },
      stubs,
    },
  });
  await flushPromises();
  return wrapper;
};

const team = (wrapper: any, n: 1 | 2) => wrapper.get(`[data-testid="check-in-team-${n}"]`);
const edit = (wrapper: any, n: 1 | 2) => team(wrapper, n).find('[data-testid="select-starting-lineup"]');
const action = (wrapper: any, n: 1 | 2) =>
  team(wrapper, n).findAll("button").filter((b: any) => b.text() !== "match.starting_lineup.edit");

beforeEach(() => {
  auth.me = null;
  auth.role = null;
  apollo.query.mockReset();
  apollo.mutate.mockReset().mockResolvedValue({ data: { setMatchStartingLineup: { success: true }, checkIntoMatch: { success: true } } });
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("team check-in with and without substitutes", () => {
  it("Wingman roster of 2: no Edit Lineup and a normal check-in", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, setting: "Players" }), "11");
    expect(edit(wrapper, 1).exists()).toBe(false);
    const buttons = action(wrapper, 1);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain("match.check_in.check_in");
    expect(buttons[0].text()).not.toContain("confirm_lineup");
  });

  it("Wingman roster of 4: Edit Lineup, and check-in is visible at once as Confirm Lineup", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4 }), "11");
    expect(edit(wrapper, 1).text()).toContain("match.starting_lineup.edit");
    const buttons = action(wrapper, 1);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain("match.starting_lineup.confirm_lineup");
    // No separate Confirm Starting Lineup step or explanation any more.
    expect(wrapper.text()).not.toContain("match.starting_lineup.confirm\"");
    expect(wrapper.find('[data-testid="starting-lineup-needs-confirmation"]').exists()).toBe(false);
    // Clicking it is the check-in (the API confirms the lineup with it).
    await buttons[0].trigger("click");
    await flushPromises();
    expect(apollo.mutate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(apollo.mutate.mock.calls[0][0].mutation)).toContain("checkIntoMatch");
  });

  it("5v5 roster of 5: no Edit Lineup; roster of 6 or 7: Edit Lineup and Confirm Lineup", async () => {
    let wrapper = await mountCheckIn(build({ size: 5, roster1: 5 }), "11");
    expect(edit(wrapper, 1).exists()).toBe(false);
    for (const count of [6, 7]) {
      wrapper = await mountCheckIn(build({ size: 5, roster1: count }), "11");
      expect(edit(wrapper, 1).exists()).toBe(true);
      expect(action(wrapper, 1)[0].text()).toContain("match.starting_lineup.confirm_lineup");
    }
  });

  it("the Edit Lineup size rule follows the match size, not a hardcoded number", async () => {
    // 4 players is a roster with substitutes for a 2v2 and exactly a full 5v5 team minus one.
    expect(edit(await mountCheckIn(build({ size: 2, roster1: 4 }), "11"), 1).exists()).toBe(true);
    expect(edit(await mountCheckIn(build({ size: 5, roster1: 4 }), "11"), 1).exists()).toBe(false);
  });

  it("after the team has checked in only READY is left", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4, ready1: true }), "11");
    const card = team(wrapper, 1);
    expect(card.attributes("data-ready")).toBe("true");
    expect(card.text()).toContain("match.lifecycle.ready");
    expect(edit(wrapper, 1).exists()).toBe(false);
    expect(card.findAll("button")).toHaveLength(0);
    expect(card.text()).not.toContain("match.starting_lineup");
  });

  it("each team shows its own controls in its own row (no separate full-width panel)", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4, roster2: 3 }), "11");
    expect(team(wrapper, 1).find('[data-testid="overview-starting-lineup"]').exists()).toBe(true);
    expect(team(wrapper, 2).find('[data-testid="overview-starting-lineup"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="starting-lineup"]').exists()).toBe(false);
    expect(read("components/match/overview/MatchOverview.vue")).not.toContain("MatchStartingLineup");
  });
});

describe("who can edit a lineup", () => {
  it("a site administrator can edit both teams before they check in, without being on either", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4, roster2: 4 }), "999", "administrator");
    expect(edit(wrapper, 1).exists()).toBe(true);
    expect(edit(wrapper, 2).exists()).toBe(true);
    // Not seated, so no check-in button of their own.
    expect(action(wrapper, 1)).toHaveLength(0);
    expect(action(wrapper, 2)).toHaveLength(0);
  });

  it("a team captain edits their own team but not the opponent", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4, roster2: 4 }), "11");
    expect(edit(wrapper, 1).exists()).toBe(true);
    expect(edit(wrapper, 2).exists()).toBe(false);
  });

  it("an ordinary player, or a lineup after the match started, gets no Edit Lineup", async () => {
    expect(edit(await mountCheckIn(build({ size: 2, roster1: 4 }), "13"), 1).exists()).toBe(false);
    expect(edit(await mountCheckIn(build({ size: 2, roster1: 4, status: "Live" }), "11"), 1).exists()).toBe(false);
  });

  it("an organizer who can start the match can edit", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4, can_start: true }), "999");
    expect(edit(wrapper, 1).exists()).toBe(true);
  });

  it("a team member without can_check_in sees no check-in button", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4, can_check_in: false }), "13");
    expect(action(wrapper, 1)).toHaveLength(0);
  });
});

describe("editing the active lineup", () => {
  it("saves only an exact selection, and sends it to the API", async () => {
    const wrapper = await mountCheckIn(build({ size: 2, roster1: 4 }), "11");
    await edit(wrapper, 1).trigger("click");

    const boxes = wrapper.findAll("button.cb");
    expect(boxes).toHaveLength(4);
    // The captain is only the default pick: they may sit the match out.
    expect(boxes[0].attributes("disabled")).toBeUndefined();
    expect(boxes[0].attributes("data-checked")).toBe("true");

    const save = wrapper.findAll("button").find((b) => b.text() === "match.starting_lineup.save")!;
    expect(save.attributes("disabled")).toBeUndefined();

    // Untick 12: one short of the starting size, so saving is off.
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
