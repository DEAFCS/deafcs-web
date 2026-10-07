import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";

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

const h = vi.hoisted(() => ({
  schemaFields: ["created_at"] as string[],
  createdAt: "2025-11-14T10:00:00Z" as string | null,
  roster: [{ player_steam_id: "1" }, { player_steam_id: "2" }] as any[],
  clips: [] as any[],
  clipQueue: [] as any[],
  subscriptions: 0,
}));

// The real helper caches its introspection answer per type for the session, so
// the API's support for teams.created_at is controlled here instead.
vi.mock("~/utilities/schemaHasType", () => ({
  schemaHasType: async () => true,
  schemaHasField: async (_client: any, _type: string, field: string) => h.schemaFields.includes(field),
}));

vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({
    client: {
      query: async ({ query }: any) => {
        const text = JSON.stringify(query);
        if (text.includes("SchemaTypeFields")) return { data: { __type: { fields: h.schemaFields.map((name) => ({ name })) } } };
        if (text.includes("TeamCreatedAt")) return { data: { teams_by_pk: { id: "team-1", created_at: h.createdAt } } };
        return { data: {} };
      },
    },
  }),
}));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    query: async () => ({ data: { team_roster: h.roster } }),
    subscribe: () => ({
      subscribe: (handlers: any) => {
        h.subscriptions += 1;
        handlers.next({ data: { match_clips: h.clips } });
        return { unsubscribe: vi.fn() };
      },
    }),
  }),
}));
vi.mock("~/composables/useClipModal", () => ({
  useClipModal: () => ({
    setClipQueue: (queue: any[], scope: string) => h.clipQueue.push({ queue, scope }),
    clearClipQueue: vi.fn(),
  }),
}));
vi.mock("~/components/clips/ClipTile.vue", () => ({
  default: {
    name: "ClipTile",
    props: ["clip", "queue", "queueScope", "variant"],
    template: `<div data-testid="clip-tile" :data-clip="clip.id" :data-scope="queueScope" :data-queue="queue.length" />`,
  },
}));

import TeamHero from "../../components/team/TeamHero.vue";
import TeamHighlights from "../../components/team/TeamHighlights.vue";

const read = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const team = {
  id: "team-1",
  name: "Samurai",
  short_name: "SAM",
  avatar_url: null,
  ranks: null,
  reputation: null,
  roster: new Array(8).fill({ player: { steam_id: "1" } }),
  captain: { steam_id: "7", name: "Captain Bod" },
  owner: { steam_id: "7", name: "Captain Bod" },
};

beforeEach(() => {
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  h.schemaFields = ["created_at"];
  h.createdAt = "2025-11-14T10:00:00Z";
  h.clips = [];
  h.clipQueue = [];
  h.subscriptions = 0;
});
afterEach(() => vi.unstubAllGlobals());

const opts = {
  attachTo: document.body,
  global: {
    config: { globalProperties: { $t: (k: string, v?: any) => (v !== undefined ? `${k}:${JSON.stringify(v)}` : k) } as any },
  },
};

describe("team hero follows current 5Stack", () => {
  it("summarizes players, matches and Founded, with no captain line", async () => {
    const wrapper = mount(TeamHero, { props: { team, awards: [], matchesCount: 14 }, ...opts });
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain("Samurai");
    expect(text).toContain("SAM");
    expect(text).toContain("team.pulse.hero.players:8");
    expect(text).toContain("team.pulse.hero.matches:14");
    expect(text).toMatch(/team\.pulse\.hero\.founded:\{"date":"Nov 2025"\}/);
    // The captain lives in the Starting Five and the roster now, not here.
    expect(text).not.toContain("Captain Bod");
    expect(text).not.toContain("team.roles.captain");
    expect(wrapper.find('[data-testid="player-link"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("omits Founded when the API has no created_at, or the team has none", async () => {
    h.schemaFields = []; // today's DEAFCS API: teams has no created_at column
    let wrapper = mount(TeamHero, { props: { team, awards: [], matchesCount: 3 }, ...opts });
    await flushPromises();
    expect(wrapper.text()).not.toContain("founded");
    wrapper.unmount();

    h.schemaFields = ["created_at"];
    h.createdAt = null; // an older team without a date: nothing is invented
    wrapper = mount(TeamHero, { props: { team, awards: [], matchesCount: 3 }, ...opts });
    await flushPromises();
    expect(wrapper.text()).not.toContain("founded");
    expect(wrapper.text()).toContain("team.pulse.hero.matches:3");
    wrapper.unmount();
  });

  it("keeps 5Stack's compact header sizing", () => {
    const hero = read("components/team/TeamHero.vue");
    expect(hero).toContain("rounded-lg border border-border px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-5 sm:px-6 sm:py-5");
    expect(hero).toContain("size-16 shrink-0");
    expect(hero).toContain("sm:size-[5.5rem]");
    expect(hero).toContain("text-[clamp(1.5rem,2.6vw,2rem)]");
  });
});

describe("team highlights use the shared modern ClipTile", () => {
  const clip = (id: string) => ({ id, title: id, duration_ms: 5000, target: { name: "P" }, match_map: { match: { id: "m1" } } });

  it("renders each public clip as a ClipTile with the team's playlist scope", async () => {
    h.clips = [clip("a"), clip("b"), clip("c")];
    const wrapper = mount(TeamHighlights, { props: { teamId: "team-1" }, ...opts });
    await flushPromises();
    const tiles = wrapper.findAll('[data-testid="clip-tile"]');
    expect(tiles.map((t) => t.attributes("data-clip"))).toEqual(["a", "b", "c"]);
    expect(tiles.every((t) => t.attributes("data-scope") === "team-highlights:team-1")).toBe(true);
    expect(tiles.every((t) => t.attributes("data-queue") === "3")).toBe(true);
    // The modal's playlist is seeded from the same list.
    expect(h.clipQueue.at(-1)?.scope).toBe("team-highlights:team-1");
    expect(h.clipQueue.at(-1)?.queue).toHaveLength(3);
    wrapper.unmount();
  });

  it("is the same tile /watch, /highlights and the player profile use; the old card is gone", () => {
    const source = read("components/team/TeamHighlights.vue");
    expect(source).toContain('import ClipTile from "~/components/clips/ClipTile.vue"');
    expect(source).not.toMatch(/HighlightCard/);
    expect(source).toContain("topPlayOrderBy");
    expect(read("components/watch/WatchHighlights.vue")).toContain("~/components/clips/ClipTile.vue");
    expect(read("components/clips/PlayerHighlights.vue")).toContain("~/components/clips/ClipTile.vue");
  });
});
