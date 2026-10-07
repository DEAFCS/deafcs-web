import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

// Regression: a deleted team kept showing in the Teams list. The page's real
// deleteTeam() runs against a mock "database"; the real TeamsDirectory is
// mounted before and after, the way /teams is when you navigate back to it.
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: any) => (values !== undefined ? `${key}:${JSON.stringify(values)}` : key),
    locale: { value: "en" },
  }),
}));
vi.mock("#app", () => ({
  tryUseNuxtApp: () => null,
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ resolve: () => ({ href: "" }), push: () => {} }),
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: null, isRoleAbove: () => false }),
}));
const toast = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ toast }));

const db = vi.hoisted(() => ({
  teams: [] as any[],
  queries: [] as any[],
  // While set, the teams query waits: the page shows only what it remembered.
  hold: null as null | Promise<void>,
}));

vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({
    client: {
      subscribe: () => ({
        subscribe: (handlers: any) => {
          handlers.next({ data: { award_recipients: [], matches: [] } });
          return { unsubscribe: vi.fn() };
        },
      }),
      query: async ({ query, variables }: any) => {
        const text = JSON.stringify(query);
        if (text.includes("SchemaTypeFields")) {
          return { data: { __type: { fields: [{ name: "last_match_at" }] } } };
        }
        if (text.includes('"teams"')) {
          db.queries.push(variables);
          if (db.hold) await db.hold;
          // A tiny version of the server's where: name / short_name search.
          const clause = variables.where?._and?.find((c: any) => c._or)?._or?.[0]?.name?._ilike as string | undefined;
          const needle = clause?.replace(/%/g, "").toLowerCase();
          const rows = needle ? db.teams.filter((t) => t.name.toLowerCase().includes(needle)) : db.teams;
          return { data: { teams: rows, teams_aggregate: { aggregate: { count: rows.length } } } };
        }
        return { data: {} };
      },
    },
  }),
}));

import TeamsDirectory from "../../components/teams/TeamsDirectory.vue";
import TeamPage from "../../pages/teams/[id].vue";
import {
  forgetDeletedTeam,
  lastDirectoryResults,
  lastYourTeams,
} from "../../utilities/teamsListCache";

const team = (id: string, name: string) => ({
  id,
  name,
  short_name: name.slice(0, 3).toUpperCase(),
  avatar_url: null,
  is_organization: false,
  ranks: { avg_elo: 1500 },
  roster: [],
  recent_results: [],
  last_match_at: null,
});

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  vi.stubGlobal("useRouter", () => ({ push: vi.fn() }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  db.teams = [team("team-a", "Keeper Team"), team("team-b", "Doomed Team")];
  db.queries = [];
  db.hold = null;
  lastDirectoryResults.clear();
  lastYourTeams.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  toast.mockClear();
});

const mountOpts = {
  attachTo: document.body,
  global: {
    config: { globalProperties: { $t: (k: string, v?: any) => (v !== undefined ? `${k}:${JSON.stringify(v)}` : k) } as any },
    stubs: { NuxtLink: { props: ["to"], template: "<a><slot /></a>" } },
  },
};
async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 450));
  }
  await flushPromises();
}

// Hold the teams query until released, to look at the first frame honestly.
function holdFetches() {
  let release!: () => void;
  db.hold = new Promise<void>((resolve) => (release = resolve));
  return () => {
    db.hold = null;
    release();
  };
}

// The page's real deleteTeam(), with the mutation wired to the mock database.
function runDeleteTeam(id: string, mutateResult: (id: string) => any) {
  const push = vi.fn();
  const cache = {
    identify: ({ __typename, id: itemId }: any) => `${__typename}:${itemId}`,
    evict: vi.fn(() => true),
    gc: vi.fn(),
  };
  const ctx: any = {
    deleting: false,
    $route: { params: { id } },
    $router: { push },
    $t: (k: string) => k,
    $apollo: { mutate: vi.fn(async () => ({ data: mutateResult(id) })), provider: { defaultClient: { cache } } },
  };
  const result = (TeamPage as any).methods.deleteTeam.call(ctx).then(() => ({ push, cache, ctx }));
  return result;
}

describe("deleting a team", { timeout: 60000 }, () => {
  it.each([[true, false, true], [false, true, true], [false, false, false]])(
    "Delete visibility: owner %s, site administrator %s -> %s",
    (isTeamOwner, isAdmin, visible) => {
      expect((TeamPage as any).computed.canDeleteTeam.call({ isTeamOwner, isAdmin })).toBe(visible);
      const source = readFileSync(path.resolve(__dirname, "../../pages/teams/[id].vue"), "utf8");
      expect(source).toContain('v-if="canDeleteTeam"');
    },
  );
  it("shows the stale card without the fix, and never again with it", async () => {
    // Visit /teams: both teams show and the directory remembers them.
    const first = mount(TeamsDirectory, { props: { showCreate: false }, ...mountOpts });
    await settle();
    expect(first.text()).toContain("Doomed Team");
    expect(lastDirectoryResults.size).toBeGreaterThan(0);
    first.unmount();

    // The team is deleted in the database, but nothing told the list cache.
    db.teams = db.teams.filter((t) => t.id !== "team-b");
    let release = holdFetches();
    const stale = mount(TeamsDirectory, { props: { showCreate: false }, ...mountOpts });
    await flushPromises();
    // The bug: the remembered rows seed the page before the fresh answer lands.
    expect(stale.text()).toContain("Doomed Team");
    release();
    stale.unmount();

    // The real flow: delete from the team page. It forgets the team everywhere.
    db.teams = [team("team-a", "Keeper Team"), team("team-b", "Doomed Team")];
    const warm = mount(TeamsDirectory, { props: { showCreate: false }, ...mountOpts });
    await settle();
    warm.unmount();
    const { push, cache } = await runDeleteTeam("team-b", (id) => {
      db.teams = db.teams.filter((t) => t.id !== id);
      return { delete_teams_by_pk: { id } };
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/teams");
    expect(cache.evict).toHaveBeenCalledWith({ id: "teams:team-b" });
    expect(lastDirectoryResults.size).toBe(0);

    // Navigate to /teams: the card is not there, not even for a first frame.
    release = holdFetches();
    const after = mount(TeamsDirectory, { props: { showCreate: false }, ...mountOpts });
    await flushPromises();
    expect(after.text()).not.toContain("Doomed Team");
    release();
    await settle();
    expect(after.text()).toContain("Keeper Team");
    expect(after.text()).not.toContain("Doomed Team");

    // Searching for it finds nothing.
    (after.vm as any).search = "doomed";
    await settle();
    expect(after.text()).not.toContain("Doomed Team");
    expect(db.queries.at(-1).where._and[0]._or[0].name._ilike).toBe("%doomed%");
    after.unmount();

    // Back/Forward onto /teams remounts it: still no deleted card.
    release = holdFetches();
    const back = mount(TeamsDirectory, { props: { showCreate: false }, ...mountOpts });
    await flushPromises();
    expect(back.text()).not.toContain("Doomed Team");
    release();
    await settle();
    expect(back.text()).not.toContain("Doomed Team");
    back.unmount();
  });

  it("does not claim success when the API deleted nothing (permission filter)", async () => {
    const { push, cache, ctx } = await runDeleteTeam("team-b", () => ({ delete_teams_by_pk: null }));
    expect(push).not.toHaveBeenCalled();
    expect(cache.evict).not.toHaveBeenCalled();
    expect(ctx.deleting).toBe(false);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: "team.admin.delete_not_permitted" }),
    );
  });

  it("stays on the page and explains when records still depend on the team", async () => {
    const push = vi.fn();
    const ctx: any = {
      deleting: false,
      $route: { params: { id: "team-b" } },
      $router: { push },
      $t: (k: string) => k,
      $apollo: {
        mutate: vi.fn(async () => {
          throw new Error('update or delete on table "teams" violates foreign key constraint "award_recipients_team_id_fkey"');
        }),
        provider: { defaultClient: { cache: { identify: vi.fn(), evict: vi.fn(), gc: vi.fn() } } },
      },
    };
    await (TeamPage as any).methods.deleteTeam.call(ctx);
    expect(push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "team.admin.delete_blocked" }));
  });

  it("forgetDeletedTeam clears every remembered list and evicts the Apollo entry", () => {
    lastDirectoryResults.set("k", { teams: [{ id: "team-b" }], total: 1 });
    lastYourTeams.set("steam", [{ id: "team-b" }]);
    const cache = { identify: vi.fn(() => "teams:team-b"), evict: vi.fn(() => true), gc: vi.fn() };
    forgetDeletedTeam("team-b", cache as any);
    expect(lastDirectoryResults.size).toBe(0);
    expect(lastYourTeams.size).toBe(0);
    expect(cache.evict).toHaveBeenCalledWith({ id: "teams:team-b" });
    expect(cache.gc).toHaveBeenCalled();
  });
});

describe("the team page after the team is gone", () => {
  it("answers a direct URL to a deleted team with a not-found state, not a blank page", async () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../pages/teams/[id].vue"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    // teamLoaded flips when the subscription answers, even with null.
    expect(source).toMatch(/this\.team = data\.teams_by_pk;\s*this\.teamLoaded = true;/);
    expect(source).toContain('v-if="teamLoaded && !team && !deleting"');
    expect(source).toContain("team.not_found.title");
    expect(source).toMatch(/<NuxtLink to="\/teams">/);
  });
});
