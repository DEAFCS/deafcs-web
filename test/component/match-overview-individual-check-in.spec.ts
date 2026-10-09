import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";

vi.mock("~/components/PlayerDisplay.vue", async () => ({
  default: (await import("./fixtures/playerDisplayStub")).PlayerDisplayStub,
}));
// The real team card (with its footer slot); only its player rows are simplified.
vi.mock("~/components/draft-games/DraftPlayerCard.vue", () => ({
  default: defineComponent({
    props: { member: null, checkedIn: null },
    setup: (props) => () =>
      h("div", {
        class: "member",
        "data-steam": props.member.steam_id,
        "data-checked-in": String(props.checkedIn),
      }),
  }),
}));
vi.mock("~/components/draft-games/DraftOpenSlot.vue", () => ({ default: { template: "<div />" } }));
vi.mock("~/components/match/MatchRegionVeto.vue", () => ({
  default: { name: "MatchRegionVeto", template: `<div />` },
}));
const sounds = { playMatchFoundSound: vi.fn(), playTickSound: vi.fn(), playCountdownSound: vi.fn() };
vi.mock("~/composables/useSound", () => ({ useSound: () => sounds }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

import MatchOverview from "../../components/match/overview/MatchOverview.vue";

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

const stubs = {
  Label: { template: "<label><slot /></label>" },
  Switch: true,
  Dialog: { props: ["open"], template: '<div v-if="open"><slot /></div>' },
  DialogContent: { template: "<div><slot /></div>" },
  DialogHeader: { template: "<div><slot /></div>" },
  DialogTitle: { template: "<div><slot /></div>" },
  DialogDescription: { template: "<div><slot /></div>" },
  DialogFooter: { template: "<div><slot /></div>" },
  Checkbox: true,
};

const ids = (prefix: number, count: number) => Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
const seat = (steam_id: string, checked_in: boolean, captain: boolean) => ({
  steam_id,
  checked_in,
  captain,
  player: { steam_id, name: `P${steam_id}` },
});

type Options = {
  setting?: "Players" | "Captains" | "Admin";
  size?: number;
  roster1?: number;
  roster2?: number;
  ready1?: boolean;
  ready2?: boolean;
  checkedIn?: string[];
  tournament?: boolean;
};

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
      .map((id, i) => seat(id, ready || (o.checkedIn ?? []).includes(id), i === 0)),
  });
  apollo.query.mockResolvedValue({
    data: {
      tournament_brackets_by_pk: {
        team_1: { id: "tt1", name: "Alpha", captain_steam_id: r1[0], owner_steam_id: r1[0], roster: r1.map((id, i) => ({ player_steam_id: id, role: i === 0 ? "Admin" : "Member", player: { steam_id: id, name: `P${id}` } })) },
        team_2: { id: "tt2", name: "Bravo", captain_steam_id: r2[0], owner_steam_id: r2[0], roster: r2.map((id, i) => ({ player_steam_id: id, role: i === 0 ? "Admin" : "Member", player: { steam_id: id, name: `P${id}` } })) },
      },
    },
  });
  return {
    id: "m1",
    status: "WaitingForCheckIn",
    source: "5stack",
    is_tournament_match: o.tournament ?? true,
    min_players_per_lineup: size,
    cancels_at: "2026-10-01T20:09:00.000Z",
    can_check_in: true,
    can_start: false,
    lineup_1_id: "L1",
    lineup_2_id: "L2",
    tournament_brackets: [{ id: "b1" }],
    options: { type: size === 2 ? "Wingman" : "Competitive", check_in_setting: o.setting ?? "Players", best_of: 1, map_pool: { maps: [] } },
    lineup_1: lineup(1, r1, !!o.ready1),
    lineup_2: lineup(2, r2, !!o.ready2),
    match_maps: [],
  };
};

const mountOverview = async (match: any, as: string | null, role: string | null = null) => {
  auth.me = as ? { steam_id: as } : null;
  auth.role = role;
  const wrapper = mount(MatchOverview, {
    props: { match, stage: "check-in" },
    global: { config: { globalProperties: { $t: t, $apollo: apollo } as any }, stubs },
  });
  await flushPromises();
  return wrapper;
};

const card = (wrapper: any, n: 1 | 2) => wrapper.get(`[data-testid="overview-team-${n}"]`);
const editIn = (wrapper: any, n: 1 | 2) => card(wrapper, n).find('[data-testid="select-starting-lineup"]');
const middle = (wrapper: any) => wrapper.get('[data-testid="overview-middle"]');

beforeEach(() => {
  auth.me = null;
  auth.role = null;
  apollo.query.mockReset();
  apollo.mutate.mockReset().mockResolvedValue({ data: {} });
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({ eloForPlayer: () => 0 }));
  vi.stubGlobal("useMatchmakingStore", () => ({ joinedMatchmakingQueues: {}, getRegionlatencyResult: () => undefined }));
  vi.stubGlobal("useApplicationSettingsStore", () => ({ settings: [], availableRegions: [] }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => vi.unstubAllGlobals());

describe("every-player check-in overview", () => {
  it("the middle is one row per team (name and progress), with no player names or lists", async () => {
    const wrapper = await mountOverview(build({ size: 2, checkedIn: ["11"] }), "11");
    const mid = middle(wrapper);
    expect(mid.find('[data-testid="check-in-players"]').exists()).toBe(false);
    expect(mid.find('[data-testid^="check-in-player-"]').exists()).toBe(false);
    const rows = mid.findAll('[data-testid="check-in-teams"] > li');
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.text())).toEqual(["Alpha1 / 2", "Bravo0 / 2"]);
    expect(mid.text()).not.toContain("P11");
    expect(mid.text()).not.toContain("P12");
  });

  it("a row shows X / required (Wingman 0/2, 1/2; 5v5 0/5, 3/5) and READY when complete", async () => {
    let wrapper = await mountOverview(build({ size: 2, checkedIn: ["11"] }), "11");
    expect(middle(wrapper).get('[data-testid="check-in-progress-1"]').text()).toBe("1 / 2");
    expect(middle(wrapper).get('[data-testid="check-in-progress-2"]').text()).toBe("0 / 2");
    wrapper = await mountOverview(build({ size: 5, checkedIn: ["11", "12", "13"] }), "11");
    expect(middle(wrapper).get('[data-testid="check-in-progress-1"]').text()).toBe("3 / 5");
    expect(middle(wrapper).get('[data-testid="check-in-progress-2"]').text()).toBe("0 / 5");
    // Complete teams read READY, never 5 / 5 or 2 / 2.
    wrapper = await mountOverview(build({ size: 5, ready1: true }), "11");
    expect(middle(wrapper).get('[data-testid="check-in-progress-1"]').text()).toBe("match.lifecycle.ready");
    wrapper = await mountOverview(build({ size: 2, ready1: true, ready2: true }), "11");
    expect(middle(wrapper).get('[data-testid="check-in-progress-1"]').text()).toBe("match.lifecycle.ready");
    expect(middle(wrapper).get('[data-testid="check-in-progress-2"]').text()).toBe("match.lifecycle.ready");
    expect(middle(wrapper).text()).not.toMatch(/2 \/ 2|5 \/ 5/);
  });

  it("substitutes are not counted: the required number is the match size", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 4, checkedIn: ["11"] }), "11");
    expect(middle(wrapper).get('[data-testid="check-in-progress-1"]').text()).toBe("1 / 2");
  });

  it("the Check In button and the overall message are centered in the middle", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 4, checkedIn: ["12"] }), "11");
    const controls = middle(wrapper).get('[data-testid="overview-team-check-in"]');
    expect(controls.classes()).toEqual(expect.arrayContaining(["w-full", "justify-center"]));
    expect(controls.classes()).not.toContain("justify-end");
    expect(controls.text()).toContain("match.check_in.check_in");
    expect(controls.text()).not.toContain("confirm_lineup");
    // Once checked in the overall message is centered too.
    const done = await mountOverview(build({ size: 2, checkedIn: ["11"] }), "11");
    const status = done.get('[data-testid="overview-team-check-in"] .text-center');
    expect(status.text()).toContain("match.check_in.checked_in_description");
  });

  it("keeps the overall progress message and the team cards' player readiness", async () => {
    const wrapper = await mountOverview(build({ size: 2, checkedIn: ["11"] }), "11");
    expect(middle(wrapper).text()).toContain("match.check_in.checked_in_description");
    expect(middle(wrapper).text()).toContain('"checked":1');
    expect(middle(wrapper).text()).toContain('"required":4');
    const members = card(wrapper, 1).findAll(".member");
    expect(members.map((m: any) => [m.attributes("data-steam"), m.attributes("data-checked-in")])).toEqual([
      ["11", "true"],
      ["12", "false"],
    ]);
  });

  it("the real check-in action stays in the middle and is unchanged", async () => {
    const wrapper = await mountOverview(build({ size: 2 }), "12");
    const button = middle(wrapper).get("button");
    expect(button.text()).toContain("match.check_in.check_in");
    await button.trigger("click");
    expect(JSON.stringify(apollo.mutate.mock.calls[0][0].mutation)).toContain("checkIntoMatch");
  });

  it("a team with substitutes checks in with Confirm Lineup, one without keeps Check In", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 4 }), "11");
    expect(middle(wrapper).get("button").text()).toContain("match.check_in.check_in");
    const plain = await mountOverview(build({ size: 2 }), "11");
    expect(middle(plain).get("button").text()).toContain("match.check_in.check_in");
    expect(editIn(plain, 1).exists()).toBe(false);
  });

  it("Edit Lineup sits inside the team card, directly after its player list", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 4 }), "11");
    const edit = editIn(wrapper, 1);
    expect(edit.exists()).toBe(true);
    expect(edit.text()).toContain("match.starting_lineup.edit");
    // Not in the middle panel.
    expect(middle(wrapper).find('[data-testid="select-starting-lineup"]').exists()).toBe(false);
    // After the last player row of that card.
    const members = card(wrapper, 1).findAll(".member");
    const last = members[members.length - 1].element;
    expect(last.compareDocumentPosition(edit.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no Edit Lineup without substitutes", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 2, roster2: 2 }), "11", "administrator");
    expect(editIn(wrapper, 1).exists()).toBe(false);
    expect(editIn(wrapper, 2).exists()).toBe(false);
  });

  it("Edit Lineup is gone once that team is fully READY", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 4, roster2: 4, ready1: true }), "999", "administrator");
    expect(editIn(wrapper, 1).exists()).toBe(false);
    // The other team, not yet ready, still has it.
    expect(editIn(wrapper, 2).exists()).toBe(true);
    expect(card(wrapper, 1).text()).not.toContain("match.starting_lineup");
  });

  it("a normal user edits only their own team, a site admin either team", async () => {
    const both = build({ size: 2, roster1: 4, roster2: 4 });
    let wrapper = await mountOverview(both, "11");
    expect(editIn(wrapper, 1).exists()).toBe(true);
    expect(editIn(wrapper, 2).exists()).toBe(false);
    wrapper = await mountOverview(build({ size: 2, roster1: 4, roster2: 4 }), "21");
    expect(editIn(wrapper, 1).exists()).toBe(false);
    expect(editIn(wrapper, 2).exists()).toBe(true);
    wrapper = await mountOverview(build({ size: 2, roster1: 4, roster2: 4 }), "12");
    expect(editIn(wrapper, 1).exists()).toBe(false);
    expect(editIn(wrapper, 2).exists()).toBe(false);
    wrapper = await mountOverview(build({ size: 2, roster1: 4, roster2: 4 }), "999", "administrator");
    expect(editIn(wrapper, 1).exists()).toBe(true);
    expect(editIn(wrapper, 2).exists()).toBe(true);
  });

  it("5v5: roster 5 has no Edit Lineup, roster 6 does", async () => {
    expect(editIn(await mountOverview(build({ size: 5, roster1: 5 }), "11"), 1).exists()).toBe(false);
    expect(editIn(await mountOverview(build({ size: 5, roster1: 6 }), "11"), 1).exists()).toBe(true);
  });

  it("a non-tournament match keeps its single check-in and no lineup control", async () => {
    const wrapper = await mountOverview(build({ size: 2, roster1: 4, tournament: false }), "11", "administrator");
    expect(editIn(wrapper, 1).exists()).toBe(false);
    expect(middle(wrapper).get("button").text()).toContain("match.check_in.check_in");
  });
});

describe("captain and admin check-in overview", () => {
  it("keeps the middle team presentation, with Edit Lineup in the check-in row and none in the cards", async () => {
    const wrapper = await mountOverview(build({ setting: "Captains", size: 2, roster1: 4 }), "11");
    const mid = middle(wrapper);
    expect(mid.findAll('[data-testid="check-in-teams"] > li')).toHaveLength(2);
    expect(mid.get('[data-testid="check-in-team-1"]').find('[data-testid="select-starting-lineup"]').exists()).toBe(true);
    expect(mid.get('[data-testid="check-in-team-1"]').text()).toContain("match.lifecycle.check_in_team");
    expect(editIn(wrapper, 1).exists()).toBe(false);
  });

  it("admin mode keeps its presentation and the admin note", async () => {
    const wrapper = await mountOverview(build({ setting: "Admin", size: 2 }), "11");
    expect(middle(wrapper).findAll('[data-testid="check-in-teams"] > li')).toHaveLength(2);
    expect(middle(wrapper).find('[data-testid="check-in-admin"]').exists()).toBe(true);
  });

  it("a READY team shows only READY in its row", async () => {
    const wrapper = await mountOverview(build({ setting: "Captains", size: 2, roster1: 4, ready1: true }), "11");
    const row = middle(wrapper).get('[data-testid="check-in-team-1"]');
    expect(row.text()).toContain("match.lifecycle.ready");
    expect(row.findAll("button")).toHaveLength(0);
  });
});
