import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";

// The real TeamStartingFive and the real TeamMembers (grouping, counts,
// coach handling). Only leaves that need stores/GraphQL are replaced: the
// player display, the per-member row (its role guards have their own source
// tests) and the Apollo client, which feeds the roster subscription.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: any) =>
      values !== undefined ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));
vi.mock("~/components/PlayerDisplay.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      name: "PlayerDisplay",
      props: ["player", "linkable", "avatarOverride", "allowRosterImage"],
      setup: (props, { slots }) => () =>
        h("span", { "data-testid": "player", "data-steam": props.player?.steam_id }, [
          props.player?.name,
          slots["name-postfix"]?.(),
        ]),
    }),
  };
});
vi.mock("~/components/teams/TeamMember.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      name: "TeamMember",
      props: ["team", "member", "roles", "isLastAdmin", "isCaptain", "isInvite", "matchType"],
      setup: (props) => () =>
        h("div", {
          "data-testid": "roster-member",
          "data-steam": props.member?.player?.steam_id,
          "data-role": props.member?.role,
          "data-last-admin": String(!!props.isLastAdmin),
        }),
    }),
  };
});

const roster = [
  member("1", "Admin", "Starter", false, "Captain One"),
  member("2", "Member", "Starter", false, "Two"),
  member("3", "Member", "Starter", false, "Three"),
  member("4", "Member", "Starter", false, "Four"),
  member("5", "Member", "Starter", false, "Five"),
  member("6", "Member", "Substitute", false, "Sub Six"),
  member("7", "Member", "Benched", false, "Bench Seven"),
  // A coach is a coach whatever status the row carries.
  member("8", "Admin", "Starter", true, "Coach Eight"),
];
function member(id: string, role: string, status: string, coach: boolean, name: string) {
  return { role, status, coach, team_id: "team-1", roster_image_url: null, player: { steam_id: id, name, role: "verified_user" } };
}

const mutate = vi.fn();
const apolloMutate = vi.fn();
const subscribe = vi.fn(({ query }: any) => {
  const field = query.definitions[0].selectionSet.selections[0].name.value;
  return {
    subscribe: (handlers: any) => {
      handlers.next({ data: field === "team_roster" ? { team_roster: roster } : { team_invites: [] } });
      return { unsubscribe: vi.fn() };
    },
  };
});
vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({ client: { subscribe, mutate } }),
}));

import TeamStartingFive from "../../components/team/TeamStartingFive.vue";
import TeamMembers from "../../components/teams/TeamMembers.vue";

const team = { id: "team-1", can_invite: false, can_change_role: false, captain_steam_id: "1", owner_steam_id: "1" };

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  vi.stubGlobal("useApplicationSettingsStore", () => ({ linkedAccountsEnabled: false, faceitEnabled: false }));
  vi.stubGlobal("useAuthStore", () => ({ me: null, isRoleAbove: () => false }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  mutate.mockClear();
  apolloMutate.mockClear();
});

function mountFive() {
  return mount(TeamStartingFive, {
    props: { team },
    attachTo: document.body,
    global: {
      config: { globalProperties: { $t: (k: string, v?: any) => (v !== undefined ? `${k}:${JSON.stringify(v)}` : k), $apollo: { mutate: apolloMutate } } as any },
      stubs: { NuxtLink: { template: "<a><slot /></a>" } },
    },
  });
}

// What TeamMembers' own apollo subscription would deliver.
async function feedFullRoster(wrapper: any) {
  const members = wrapper.findComponent(TeamMembers);
  expect(members.exists()).toBe(true);
  // TeamMembers mixes <script setup> with an Options script whose apollo
  // subscription fills `team`; with no Apollo plugin in the test, deliver what
  // that subscription would, on the instance's own data.
  const data = (members.vm as any).$.data;
  data.team = { ...team, roster };
  data.roles = [{ value: "Admin" }, { value: "Member" }];
  data.team_invites = [];
  await nextTick();
  return members;
}

describe("Starting Five -> Full roster -> Starting Five", () => {
  it("shows the five, with the captain marked and a coach kept out of the slots", async () => {
    const wrapper = mountFive();
    await flushPromises();
    const text = wrapper.text();
    for (const name of ["Captain One", "Two", "Three", "Four", "Five"]) expect(text).toContain(name);
    // Not in the five: substitute, bench, and the coach (the status says Starter).
    for (const name of ["Sub Six", "Bench Seven", "Coach Eight"]) expect(text).not.toContain(name);
    expect(text).toContain("team.roles.captain");
    expect(text).toContain("team.starting_five.substitutes:1");
    expect(text).toContain("team.starting_five.bench");
    expect(text).toContain("team.starting_five.coaches:1");
    expect(wrapper.findAll('[data-testid="roster-member"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it("swaps to the real full roster, then back, without duplicating or mutating anything", async () => {
    const wrapper = mountFive();
    await flushPromises();

    // -> Full roster
    await wrapper.get("[data-roster-toggle]").trigger("click");
    await flushPromises();
    expect(wrapper.get("section").attributes("aria-label")).toBe("team.starting_five.full_roster");
    expect(wrapper.text()).not.toContain("team.starting_five.title");
    const members = await feedFullRoster(wrapper);

    // Every player once, grouped the way DEAFCS groups them.
    const rows = wrapper.findAll('[data-testid="roster-member"]');
    expect(rows.map((r) => r.attributes("data-steam")).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(new Set(rows.map((r) => r.attributes("data-steam"))).size).toBe(rows.length);
    const groups = members.findAll("section").map((section) => ({
      heading: section.get("h3").text(),
      ids: section.findAll('[data-testid="roster-member"]').map((r) => r.attributes("data-steam")),
    }));
    const byHeading = Object.fromEntries(groups.map((g) => [g.heading, g.ids]));
    expect(byHeading["team.members.starters"]).toEqual(["1", "2", "3", "4", "5"]);
    expect(byHeading["team.members.substitutes"]).toEqual(["6"]);
    expect(byHeading["team.members.bench"]).toEqual(["7"]);
    // The coach is under Coaches, not among the starters.
    const coachGroup = groups.find((g) => g.ids.includes("8"));
    expect(coachGroup?.heading).toBe("common.coaches");
    expect(byHeading["team.members.starters"]).not.toContain("8");
    // Two Admins: neither is the last one.
    expect(rows.filter((r) => r.attributes("data-role") === "Admin").every((r) => r.attributes("data-last-admin") === "false")).toBe(true);

    // -> Starting Five again
    await wrapper.get("[data-roster-toggle]").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent(TeamMembers).exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="roster-member"]')).toHaveLength(0);
    expect(wrapper.text()).toContain("Captain One");
    expect(wrapper.text()).not.toContain("Coach Eight");

    // Presentation only: switching views never wrote anything.
    expect(mutate).not.toHaveBeenCalled();
    expect(apolloMutate).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
