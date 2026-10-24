// Ported from 5Stack WEB 1dd30cc2 tests/pages/bans.spec.ts; MIT Copyright (c) 2025 5Stack.gg; see LICENSE.
// DEAFCS: /bans is for moderators and above, so the upstream cases run as a
// moderator and the guest/player cases check that nothing is asked or shown.
// Mounted with @vue/test-utils and a stubbed auth store instead of Nuxt's
// mountSuspended.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";

vi.mock("#app", () => ({
  tryUseNuxtApp: () => ({ $i18n: { locale: { value: "en" } } }),
}));

const schema = vi.hoisted(() => ({ available: true, kindDates: false }));
const query = vi.hoisted(() => vi.fn());
vi.mock("@vue/apollo-composable", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useApolloClient: () => ({ client: { query, mutate: vi.fn() } }),
}));
vi.mock("~/utilities/schemaHasType", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  schemaHasType: vi.fn(async () => schema.available),
  schemaHasField: vi.fn(async () => schema.kindDates),
}));

const auth = vi.hoisted(() => ({ store: null as any }));
vi.mock("~/stores/AuthStore", async () => {
  const { reactive } = await import("vue");
  const roles = [
    "user",
    "verified_user",
    "streamer",
    "moderator",
    "match_organizer",
    "tournament_organizer",
    "administrator",
  ];
  auth.store = reactive({
    me: undefined as any,
    isRoleAbove(role: string) {
      if (!auth.store.me) return false;
      return roles.indexOf(auth.store.me.role) >= roles.indexOf(role);
    },
  });
  return { useAuthStore: () => auth.store };
});
vi.mock("~/components/PlayerDisplay.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["player"],
      setup: (props) => () => h("span", props.player?.name),
    }),
  };
});
vi.mock("~/components/TimeAgo.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["date"],
      setup: (props) => () => h("time", props.date),
    }),
  };
});
vi.mock("~/components/bans/BanRecordSheet.vue", async () => {
  const { defineComponent } = await import("vue");
  return { default: defineComponent({ render: () => null }) };
});

vi.stubGlobal("definePageMeta", vi.fn());

import BansPage from "~/pages/bans.vue";

const DAY = 24 * 60 * 60 * 1000;

const row = {
  steam_id: "76561198000000002",
  banned_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  banned_at_source: "5stack",
  steam_banned_on: null,
  vac_ban_count: 0,
  game_ban_count: 0,
  sanction_id: "s1",
  sanction_kind: "staff",
  banned_here: true,
  first_match_at: new Date(Date.now() - 300 * DAY).toISOString(),
  last_match_at: new Date(Date.now() - DAY).toISOString(),
  last_match_map: "de_mirage",
  matches_played: 188,
  matches_since_steam_ban: null,
  arrived_banned: false,
  shared_matches: [],
  player: {
    steam_id: "76561198000000002",
    name: "xX_Kowalczyk_The_Unbannable_Xx",
    role: "user",
  },
  sanction: {
    id: "s1",
    reason: "Cheating: aimlock confirmed",
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    remove_sanction_date: null,
    sanctioned_by: { steam_id: "1", name: "Luke" },
  },
};

function rootField(query: any): string | undefined {
  return query.definitions[0]?.selectionSet?.selections[0]?.name?.value;
}

let mounted: { unmount: () => void } | null = null;
let calls: any[] = [];

async function mountPage({
  role,
  rows = [row],
}: { role?: string; rows?: any[] } = {}) {
  auth.store.me = role
    ? ({ steam_id: "76561198000000001", role } as any)
    : undefined;
  calls = [];
  query.mockImplementation(async (options: any) => {
    calls.push(options);
    if (rootField(options.query) === "recently_banned_players") {
      return {
        data: {
          recently_banned_players: rows,
          recently_banned_players_aggregate: {
            aggregate: { count: rows.length },
          },
        },
      };
    }
    return {
      data: { recently_banned_players_aggregate: { aggregate: { count: 2 } } },
    };
  });
  const wrapper = mount(BansPage, {
    global: {
      plugins: [
        createI18n({ legacy: false, locale: "en", messages: { en: en as any } }),
      ],
      stubs: { NuxtLink: { template: "<a><slot /></a>" } },
    },
  });
  mounted = wrapper;
  await flushPromises();
  await new Promise((resolve) => setTimeout(resolve, 400));
  await flushPromises();
  return wrapper;
}

const listCalls = () =>
  calls.filter((call) => rootField(call.query) === "recently_banned_players");

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  schema.available = true;
  schema.kindDates = false;
  auth.store.me = undefined;
  query.mockReset();
});

describe("/bans", () => {
  it("lists recent bans with the default window and every kind", async () => {
    const wrapper = await mountPage({ role: "moderator" });

    expect(wrapper.text()).toContain("xX_Kowalczyk_The_Unbannable_Xx");
    expect(wrapper.text()).toContain("1 player banned in the last 30 days");
    const [first] = listCalls();
    expect(first.variables.args).toMatchObject({
      _window_days: 30,
      _status: "any",
    });
    expect(first.variables.args).not.toHaveProperty("_kinds");
    expect(first.variables.order_by).toEqual([
      { banned_at: "desc" },
      { steam_id: "asc" },
    ]);
    expect(first.context).toEqual({ optional: true });
  });

  it("asks for each kind's Steam day only once the api serves it", async () => {
    const asked = () =>
      listCalls()[0].query.loc.source.body.includes("vac_banned_on");

    await mountPage({ role: "moderator" });
    expect(asked()).toBe(false);
    mounted?.unmount();

    schema.kindDates = true;
    await mountPage({ role: "moderator" });
    expect(asked()).toBe(true);
  });

  it("narrows to Steam kinds from the source switch", async () => {
    const wrapper = await mountPage({ role: "moderator" });
    const steam = wrapper
      .findAll("button")
      .find((button) => button.text() === "Steam");
    await steam!.trigger("click");
    await flushPromises();

    expect(listCalls().at(-1)!.variables.args._kinds).toBe("{vac,game}");
  });

  it("labels the site's own bans DEAFCS", async () => {
    const wrapper = await mountPage({ role: "moderator" });
    const labels = wrapper.findAll("button").map((button) => button.text());
    expect(labels).toContain("DEAFCS");
    expect(wrapper.text()).not.toContain("5Stack");
  });

  it("points moderators at Steam-banned players who can still play", async () => {
    const wrapper = await mountPage({ role: "administrator" });

    expect(wrapper.text()).toContain(
      "2 Steam-banned players can still play here",
    );
    const gaps = calls.find(
      (call) => rootField(call.query) === "recently_banned_players_aggregate",
    );
    expect(gaps.variables.args).toEqual({
      _window_days: 30,
      _status: "not_banned_here",
    });
  });

  it("shows the empty page and asks nothing when the api lacks the view", async () => {
    schema.available = false;
    const wrapper = await mountPage({ role: "moderator" });

    expect(listCalls()).toHaveLength(0);
    expect(wrapper.text()).toContain("No one has been banned recently");
  });

  it.each([
    { title: "a guest", role: undefined },
    { title: "a player", role: "user" },
    { title: "a streamer", role: "streamer" },
  ])("shows and asks nothing for $title", async ({ role }) => {
    const wrapper = await mountPage({ role });

    expect(query).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("xX_Kowalczyk_The_Unbannable_Xx");
    expect(wrapper.find("#bans-search").exists()).toBe(false);
  });

  it("sits behind the moderator middleware", () => {
    const source = readFileSync(path.resolve("pages/bans.vue"), "utf8");
    expect(source).toContain('definePageMeta({ middleware: "moderator" })');
  });
});
