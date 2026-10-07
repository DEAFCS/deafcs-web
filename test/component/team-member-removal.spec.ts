import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

// The real TeamMember: which removal/role actions it offers and what it does
// with the API's answer. The database triggers stay the authority on the last
// Admin (see hasura/triggers/team_roster.sql); this is the UI in front of them.
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("~/components/PlayerDisplay.vue", () => ({ default: { name: "PlayerDisplay", template: "<span />" } }));

import TeamMember from "../../components/teams/TeamMember.vue";

const mutate = vi.fn();
let me: any;

function mountMember(over: { team?: any; member?: any; isLastAdmin?: boolean; isCaptain?: boolean } = {}) {
  return shallowMount(TeamMember as any, {
    props: {
      team: { id: "team-1", can_remove: true, can_change_role: true, can_invite: true, ...over.team },
      member: {
        role: "Member",
        status: "Starter",
        coach: false,
        team_id: "team-1",
        player: { steam_id: "20", name: "Player Twenty", avatar_url: null },
        ...over.member,
      },
      roles: [{ value: "Admin", description: "" }, { value: "Member", description: "" }],
      isInvite: false,
      isLastAdmin: over.isLastAdmin ?? false,
      isCaptain: over.isCaptain ?? false,
    },
    global: {
      config: { globalProperties: { $t: (k: string) => k, $apollo: { mutate } } as any },
    },
  });
}

beforeEach(() => {
  me = { steam_id: "10", role: "verified_user" };
  vi.stubGlobal("useAuthStore", () => ({ me, isRoleAbove: () => false }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  mutate.mockReset();
  toast.mockClear();
});

describe("who can be removed", () => {
  it("a site administrator uses the server's roster permissions, not a client bypass", () => {
    me = { steam_id: "10", role: "administrator" };
    expect((mountMember().vm as any).canRemoveMember).toBe(true);
    expect((mountMember({ isCaptain: true }).vm as any).canRemoveMember).toBe(true);
    expect((mountMember({ team: { can_remove: false, can_change_role: false } }).vm as any).canRemoveMember).toBe(false);
  });
  it("an admin can remove an ordinary player (starter, substitute or benched)", () => {
    for (const status of ["Starter", "Substitute", "Benched"]) {
      const vm = mountMember({ member: { status } }).vm as any;
      expect(vm.canRemoveMember, status).toBe(true);
      expect(vm.removeBlockedAsLastAdmin).toBe(false);
    }
  });

  it("an admin can remove the captain when the captain is not the last Admin", () => {
    const vm = mountMember({ isCaptain: true, member: { role: "Member" } }).vm as any;
    expect(vm.canRemoveMember).toBe(true);
    const adminCaptain = mountMember({ isCaptain: true, member: { role: "Admin" }, isLastAdmin: false }).vm as any;
    expect(adminCaptain.canRemoveMember).toBe(true);
  });

  it("a coach follows the same can_remove rule as everyone else", () => {
    const vm = mountMember({ member: { coach: true, status: "Benched" } }).vm as any;
    expect(vm.canRemoveMember).toBe(true);
  });

  it("the last Admin cannot be removed, and the menu says why", () => {
    const wrapper = mountMember({ isCaptain: true, member: { role: "Admin" }, isLastAdmin: true });
    const vm = wrapper.vm as any;
    expect(vm.canRemoveMember).toBe(false);
    expect(vm.removeBlockedAsLastAdmin).toBe(true);
    // The menu still opens for this member (it carries the blocked reason).
    expect(vm.showActionMenu).toBe(true);
  });

  it("someone who may not remove people is not offered removal at all", () => {
    const vm = mountMember({ team: { can_remove: false, can_change_role: false } }).vm as any;
    expect(vm.canRemoveMember).toBe(false);
    expect(vm.removeBlockedAsLastAdmin).toBe(false);
    expect(vm.showActionMenu).toBe(false);
  });

  it("nobody removes themselves from this menu (leaving has its own guarded path)", () => {
    me = { steam_id: "20" };
    const vm = mountMember().vm as any;
    expect(vm.canRemoveMember).toBe(false);
    expect(vm.removeBlockedAsLastAdmin).toBe(false);
  });
});

describe("safe roster status and coach changes", () => {
  it.each(["status", "coach"])("reports a null %s update as a permission failure", async (action) => {
    mutate.mockResolvedValue({ data: { update_team_roster_by_pk: null } });
    const vm = mountMember().vm as any;
    if (action === "status") await vm.updateMemberStatus("Benched");
    else await vm.toggleCoach();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      variant: "destructive", description: "team.admin.change_not_permitted",
    }));
    expect(vm.updatingStatus).toBe(false);
  });

  it("surfaces a rejected coach update", async () => {
    mutate.mockRejectedValue(new Error("Permission denied"));
    await (mountMember().vm as any).toggleCoach();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "team.admin.operation_failed" }));
  });
});

describe("what happens when removal is attempted", () => {
  it("removes through the same mutation and stays quiet on success", async () => {
    mutate.mockResolvedValue({ data: { delete_team_roster_by_pk: { __typename: "team_roster" } } });
    const vm = mountMember().vm as any;
    await vm.removeMember();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it("tells the admin when the API silently removed nothing (permission filter)", async () => {
    // Hasura returns null for *_by_pk when the row is hidden by permissions.
    mutate.mockResolvedValue({ data: { delete_team_roster_by_pk: null } });
    const vm = mountMember().vm as any;
    await vm.removeMember();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: "team.admin.remove_not_permitted" }),
    );
  });

  it("shows the database's last-Admin refusal, not a generic failure", async () => {
    mutate.mockRejectedValue(new Error("You are the last team Admin. Assign another Admin before changing your role or leaving the team."));
    const vm = mountMember({ member: { role: "Admin" } }).vm as any;
    await vm.removeMember();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "team.admin.last_admin" }),
    );
  });

  it("surfaces any other backend rejection too", async () => {
    mutate.mockRejectedValue(new Error("You are not authorized to manage this team roster."));
    const vm = mountMember().vm as any;
    await vm.removeMember();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "team.admin.operation_failed" }),
    );
  });
});

describe("demoting the last Admin", () => {
  it("is blocked before any request is sent", () => {
    const vm = mountMember({ member: { role: "Admin" }, isLastAdmin: true }).vm as any;
    vm.requestRoleChange("Member");
    expect(mutate).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "team.admin.last_admin" }),
    );
  });

  it("is allowed for an Admin when another Admin remains", async () => {
    mutate.mockResolvedValue({ data: { update_team_roster_by_pk: { __typename: "team_roster" } } });
    const vm = mountMember({ member: { role: "Admin" }, isLastAdmin: false }).vm as any;
    vm.requestRoleChange("Member");
    await Promise.resolve();
    await Promise.resolve();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it("reports a role change the API silently ignored", async () => {
    mutate.mockResolvedValue({ data: { update_team_roster_by_pk: null } });
    const vm = mountMember({ member: { role: "Member" } }).vm as any;
    await vm.publishRole("Admin");
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: "team.admin.change_not_permitted" }),
    );
  });
});
