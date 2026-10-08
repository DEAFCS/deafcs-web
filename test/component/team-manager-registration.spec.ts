import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

// Who may enter a team in a tournament (TeamSearch's join selector), how the
// team page labels owner / admin / captain, and the plain-language errors the
// join form shows. The database and Hasura stay the authority on permission
// (api-deafcs test/tournament-manager-registration.spec.ts); this is the UI
// in front of them.
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));
vi.mock("~/components/PlayerDisplay.vue", () => ({
  default: {
    name: "PlayerDisplay",
    template: "<span><slot name='name-postfix' /></span>",
  },
}));

import TeamSearch from "../../components/teams/TeamSearch.vue";
import TeamMember from "../../components/teams/TeamMember.vue";
import { tournamentRegistrationErrorKey } from "../../utilities/tournamentRegistrationErrors";

let me: any;

beforeEach(() => {
  me = { steam_id: "10", role: "verified_user", teams: [] };
  vi.stubGlobal("useAuthStore", () => ({ me, isRoleAbove: () => false }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  vi.stubGlobal("useVisualViewport", () => ({ height: { value: 800 } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mountSearch() {
  return shallowMount(TeamSearch as any, {
    props: { label: "Team", tournamentJoinSelector: true, myTeams: true, isAdmin: true },
    global: {
      config: { globalProperties: { $t: (k: string) => k, $apollo: { query: vi.fn() } } as any },
      stubs: { Popover: true, Drawer: true },
    },
  });
}

const team = (over: Record<string, unknown>) => ({
  id: "t1",
  name: "Team",
  short_name: "T",
  owner_steam_id: "99",
  captain_steam_id: "98",
  role: "Member",
  ...over,
});

describe("tournament join selector: who may enter a team", () => {
  it.each([
    ["owner", { owner_steam_id: "10", role: "Admin" }, true, "team.search.owner"],
    ["team Admin", { role: "Admin" }, true, "team.search.admin"],
    ["captain", { captain_steam_id: "10" }, true, "team.search.captain"],
    ["Member", { role: "Member" }, false, "team.search.ineligible_short"],
    ["Invite", { role: "Invite" }, false, "team.search.ineligible_short"],
  ])("%s", (_who, over, allowed, label) => {
    const vm = mountSearch().vm as any;
    const t = team(over);
    expect(vm.canSelectTeam(t)).toBe(allowed);
    expect(vm.teamEligibilityLabel(t)).toBe(label);
    expect(vm.teamDisabledReason(t) === "").toBe(allowed);
  });

  it("an owner who is also an Admin is labelled Owner, not Admin", () => {
    const vm = mountSearch().vm as any;
    expect(vm.teamEligibilityLabel(team({ owner_steam_id: "10", role: "Admin" }))).toBe(
      "team.search.owner",
    );
  });
});

function mountMember(member: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return shallowMount(TeamMember as any, {
    props: {
      team: { id: "team-1", owner_steam_id: "10", can_change_role: false, ...over },
      member: {
        role: "Member",
        status: "Starter",
        coach: false,
        player: { steam_id: "20", name: "P", avatar_url: null },
        ...member,
      },
      roles: [],
      isInvite: false,
      isCaptain: (over as any).isCaptain ?? false,
    },
    global: {
      config: { globalProperties: { $t: (k: string) => k, $apollo: { mutate: vi.fn() } } as any },
      stubs: { PlayerDisplay: { template: "<span><slot name='name-postfix' /></span>" } },
    },
  });
}

describe("team page role labels", () => {
  it("the actual owner shows Owner, not Admin", () => {
    const w = mountMember({ role: "Admin", player: { steam_id: "10", name: "O", avatar_url: null } });
    expect((w.vm as any).roleLabel).toBe("team.roles.owner");
    expect(w.text()).toContain("team.roles.owner");
    expect(w.text()).not.toContain("Admin");
  });

  it("another team Admin shows Admin", () => {
    const w = mountMember({ role: "Admin" });
    expect((w.vm as any).roleLabel).toBe("Admin");
    expect(w.text()).toContain("Admin");
  });

  it("a plain Member shows Member", () => {
    expect((mountMember({ role: "Member" }).vm as any).roleLabel).toBe("Member");
  });

  it("an owner who is also captain shows both badges", () => {
    const w = mountMember(
      { role: "Admin", player: { steam_id: "10", name: "O", avatar_url: null } },
      { isCaptain: true },
    );
    expect(w.text()).toContain("team.roles.owner");
    expect(w.text()).toContain("team.roles.captain");
  });

  it("the captain badge stays separate for a non-owner admin", () => {
    const w = mountMember({ role: "Admin" }, { isCaptain: true });
    expect(w.text()).toContain("Admin");
    expect(w.text()).toContain("team.roles.captain");
    expect(w.text()).not.toContain("team.roles.owner");
  });
});

describe("registration errors", () => {
  it("explains a team that is already registered", () => {
    expect(
      tournamentRegistrationErrorKey({
        message:
          'Uniqueness violation. duplicate key value violates unique constraint "tournament_teams_tournament_id_team_id_key"',
      }),
    ).toBe("tournament.join.error_team_already_registered");
  });

  it("explains a player who is already on another roster", () => {
    expect(
      tournamentRegistrationErrorKey({
        message:
          'Uniqueness violation. duplicate key value violates unique constraint "tournament_roster_pkey"',
      }),
    ).toBe("tournament.join.error_player_already_registered");
  });

  it("explains a missing permission only for the team registration", () => {
    const message = "check constraint of an insert/update permission has failed";
    expect(
      tournamentRegistrationErrorKey({
        message,
        extensions: { path: "$.selectionSet.insert_tournament_teams_one.args.object" },
      }),
    ).toBe("tournament.join.error_no_permission");
    expect(
      tournamentRegistrationErrorKey({
        message,
        extensions: { path: "$.selectionSet.insert_friends_one.args.object" },
      }),
    ).toBeNull();
  });

  it("leaves unrelated errors alone", () => {
    expect(tournamentRegistrationErrorKey({ message: "something else" })).toBeNull();
  });
});

// TeamMember can only label the owner if the roster's own subscription loads
// owner_steam_id (TeamMembers fetches its team separately from the team page).
describe("team roster data", () => {
  it("the roster subscription selects the owner next to the captain", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "../../components/teams/TeamMembers.vue"),
      "utf8",
    );
    const block = source.slice(source.indexOf("teams_by_pk: {"));
    const selection = block.slice(0, block.indexOf("variables:"));
    expect(selection).toContain("owner_steam_id: true");
    expect(selection).toContain("captain_steam_id: true");
  });
});
