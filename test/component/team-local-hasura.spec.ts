import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, shallowMount } from "@vue/test-utils";
import { print } from "graphql";
import { InMemoryCache } from "@apollo/client/core";

const state = vi.hoisted(() => ({ fixture: JSON.parse(process.env.DEAFCS_TEAM_LOCAL_FIXTURE || "null"), role: "administrator", user: "" }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string, args?: any) => args?.date ? `Founded ${args.date}` : key, locale: { value: "en" } }) }));
vi.mock("#app", () => ({ tryUseNuxtApp: () => null, useRoute: () => ({ params: {}, query: {} }), useRouter: () => ({ resolve: () => ({ href: "" }) }) }));
vi.mock("@vue/apollo-composable", () => ({ useApolloClient: () => ({ client: { query: (options: any) => graphql(print(options.query), options.variables) } }) }));

import TeamPage from "../../pages/teams/[id].vue";
import TeamMember from "../../components/teams/TeamMember.vue";
import TeamHero from "../../components/team/TeamHero.vue";
import { lastDirectoryResults, lastYourTeams } from "../../utilities/teamsListCache";

async function graphql(query: string, variables?: any) {
  const f = state.fixture;
  if (!f || !/^(localhost|127\.0\.0\.1)$/.test(new URL(f.endpoint).hostname)) throw new Error("Disposable localhost fixture required");
  const response = await fetch(`${f.endpoint}/v1/graphql`, {
    method: "POST", headers: { "content-type": "application/json", "x-hasura-admin-secret": "metadata-test", "x-hasura-role": state.role, "x-hasura-user-id": state.user },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (body.errors) throw new Error(body.errors.map((error: any) => error.message).join("; "));
  return body;
}
function as(role: string, steam: string) {
  state.role = role; state.user = steam;
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: steam, role }, isRoleAbove: () => false }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
}
async function team(id: string) {
  return (await graphql("query($id: uuid!) { teams_by_pk(id: $id) { id name short_name owner_steam_id captain_steam_id created_at can_remove can_change_role roster { role status coach player { steam_id name avatar_url } } } }", { id })).data.teams_by_pk;
}
async function remove(id: string, steam: string, last = false) {
  const value = await team(id);
  const member = { ...value.roster.find((row: any) => String(row.player.steam_id) === steam), team_id: id };
  const wrapper = shallowMount(TeamMember as any, { props: { team: value, member, isInvite: false, isCaptain: String(value.captain_steam_id) === steam, isLastAdmin: last }, global: { config: { globalProperties: { $t: (key: string) => key, $apollo: { mutate: ({ mutation }: any) => graphql(print(mutation)) } } } } });
  return wrapper;
}
async function deleteTeam(value: any) {
  const push = vi.fn();
  const cache = new InMemoryCache({ typePolicies: { teams: { keyFields: ["id"] } } });
  cache.writeFragment({ id: cache.identify({ __typename: "teams", id: value.id }), fragment: (await import("graphql-tag")).default`fragment LocalTeam on teams { id name }`, data: { __typename: "teams", id: value.id, name: value.name } });
  lastDirectoryResults.set("local", { teams: [value], total: 1 });
  lastYourTeams.set(state.user, [value]);
  const ctx: any = { deleting: false, $route: { params: { id: value.id } }, $router: { push }, $t: (key: string) => key, $apollo: { mutate: ({ mutation }: any) => graphql(print(mutation)), provider: { defaultClient: { cache } } } };
  await (TeamPage as any).methods.deleteTeam.call(ctx);
  return { push, cache };
}
afterEach(() => { toast.mockClear(); vi.unstubAllGlobals(); });

// Normally skipped: run via test/integration/team-web-hasura.config.cjs, which
// starts disposable containers and supplies fixture ids, not production auth.
describe.skipIf(!state.fixture)("WEB with real local Hasura", () => {
  it("site-admin delete uses the actual mutation and clears real Apollo/list caches", async () => {
    as("administrator", state.fixture.siteAdmin);
    const value = await team(state.fixture.adminDelete.id);
    expect((TeamPage as any).computed.canDeleteTeam.call({ isTeamOwner: false, isAdmin: true })).toBe(true);
    const { push, cache } = await deleteTeam(value);
    expect(push).toHaveBeenCalledWith("/teams");
    expect(await team(value.id)).toBeNull();
    expect(Object.values(cache.extract()).some((row: any) => row.id === value.id)).toBe(false);
    expect(lastDirectoryResults.size).toBe(0); expect(lastYourTeams.size).toBe(0);
  });
  it("owner can delete, but an unrelated user cannot delete or remove", async () => {
    as("user", state.fixture.stranger);
    expect((TeamPage as any).computed.canDeleteTeam.call({ isTeamOwner: false, isAdmin: false })).toBe(false);
    const value = await team(state.fixture.ownerDelete.id);
    expect((await deleteTeam(value)).push).not.toHaveBeenCalled();
    expect(await team(value.id)).not.toBeNull();
    const wrapper = await remove(state.fixture.roster.id, state.fixture.ordinary);
    expect((wrapper.vm as any).canRemoveMember).toBe(false);
    await (wrapper.vm as any).removeMember();
    expect(toast).toHaveBeenCalled(); wrapper.unmount();
    as("user", state.fixture.ownerDelete.owner);
    expect((await deleteTeam(await team(value.id))).push).toHaveBeenCalledWith("/teams");
    expect(await team(value.id)).toBeNull();
  });
  it("site-admin removes ordinary player/coach/captain, with server captain refresh", async () => {
    as("administrator", state.fixture.siteAdmin);
    for (const steam of [state.fixture.ordinary, state.fixture.coach, state.fixture.captain]) {
      const wrapper = await remove(state.fixture.roster.id, steam);
      expect((wrapper.vm as any).canRemoveMember).toBe(true);
      await (wrapper.vm as any).removeMember();
      expect(toast).not.toHaveBeenCalled(); wrapper.unmount();
      expect((await team(state.fixture.roster.id)).roster.some((row: any) => String(row.player.steam_id) === steam)).toBe(false);
    }
    expect(String((await team(state.fixture.roster.id)).captain_steam_id)).toBe(state.fixture.roster.owner);
  });
  it("last Admin is blocked by both the UI and the actual database trigger", async () => {
    as("administrator", state.fixture.siteAdmin);
    const wrapper = await remove(state.fixture.lastAdmin.id, state.fixture.lastAdmin.owner, true);
    const vm = wrapper.vm as any;
    expect(vm.canRemoveMember).toBe(false); expect(vm.removeBlockedAsLastAdmin).toBe(true);
    vm.requestRoleChange("Member");
    await vm.removeMember();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "team.admin.last_admin" }));
    expect((await team(state.fixture.lastAdmin.id)).roster[0].role).toBe("Admin");
    wrapper.unmount();
  });
  it("real new-team date renders Founded, real NULL legacy date is omitted", async () => {
    as("administrator", state.fixture.siteAdmin);
    for (const id of [state.fixture.roster.id, state.fixture.legacy.id]) {
      const value = await team(id);
      const wrapper = mount(TeamHero, { props: { team: value, awards: [], matchesCount: 0 }, global: { config: { globalProperties: { $t: (key: string, args?: any) => args?.date ? `Founded ${args.date}` : key } } } });
      for (let i = 0; i < 10; i++) { await new Promise(resolve => setTimeout(resolve, 30)); await flushPromises(); }
      if (value.created_at) expect(wrapper.text()).toContain(`Founded ${new Date(value.created_at).toLocaleDateString("en", { month: "short", year: "numeric" })}`);
      else expect(wrapper.text()).not.toContain("Founded");
      expect(wrapper.text()).not.toContain("team.roles.captain"); wrapper.unmount();
    }
  });
});
