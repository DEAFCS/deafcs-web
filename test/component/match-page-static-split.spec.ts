import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { defineComponent, h, nextTick, reactive } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from "@apollo/client/core";
import { print } from "graphql";
import { $, order_by, e_match_status_enum } from "../../generated/zeus";
import { typedGql } from "../../generated/zeus/typedDocumentNode";
import { mapFields } from "../../graphql/mapGraphql";
import { matchLineups } from "../../graphql/matchLineupsGraphql";
import { playerFields } from "../../graphql/playerFields";
import { matchOptionsFields } from "../../graphql/matchOptionsFields";
import { eloFields } from "../../graphql/eloFields";

// The match page splits the match into a live subscription (`matchLive`) and a
// one-time query (`matchStatic`) for the viewer's membership/permission fields
// and the organizer record -- each a database function the subscription used
// to re-run on every tick for every viewer (same split as 5Stack upstream).
// `requested_organizer` is no longer requested anywhere: nothing reads it and
// it scanned the whole notifications table.

const apolloRequire = createRequire(path.resolve(__dirname, "../../node_modules/@nuxtjs/apollo/package.json"));
const { createApolloProvider } = apolloRequire("@vue/apollo-option");

const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.resolve(root, p), "utf8");

// Load the real Options block (same harness as guest-match-page.spec.ts).
const source = read("pages/matches/[id]/index.vue");
const script = parse(source).descriptor.script!.content;
const ast = ts.createSourceFile("match.ts", script, ts.ScriptTarget.Latest, true);
let body = script;
for (const node of [...ast.statements].reverse()) {
  if (ts.isImportDeclaration(node)) body = body.slice(0, node.pos) + body.slice(node.end);
}
const compiled = ts.transpileModule(body, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports: any = {};
const auth = reactive<{ me: { steam_id: string } | null }>({ me: null });
const route = reactive({ params: { id: "11111111-1111-1111-1111-111111111111" } });
const otherId = "22222222-2222-2222-2222-222222222222";
const context = { value: null as any };
new Function("exports", "$", "order_by", "e_match_status_enum", "typedGql", "mapFields", "matchLineups", "playerFields", "matchOptionsFields", "eloFields", "useAuthStore", "useMatchContext", "navigateTo", compiled)(
  exports, $, order_by, e_match_status_enum, typedGql, mapFields, matchLineups, playerFields, matchOptionsFields, eloFields,
  () => auth, () => context, vi.fn(),
);
const page = exports.default;

const liveQuery = print(page.apollo.$subscribe.matches_by_pk.query);
const staticQuery = print(page.apollo.matchStatic.query);
// Top-level selection of matches_by_pk only (nested lineups have their own
// is_organizer-like fields, e.g. draft_games.is_organizer).
const topLevelFields = (query: string) => {
  const start = query.indexOf("matches_by_pk");
  const open = query.indexOf("{", start);
  let depth = 0;
  const fields: string[] = [];
  let token = "";
  for (let i = open; i < query.length; i++) {
    const ch = query[i];
    if (ch === "{") {
      if (depth === 1 && token.trim()) fields.push(token.trim().split(/[\s(:]/)[0]);
      depth++;
      token = "";
      continue;
    }
    if (ch === "}") {
      if (depth === 1 && token.trim()) fields.push(token.trim().split(/[\s(:]/)[0]);
      depth--;
      token = "";
      if (depth === 0) break;
      continue;
    }
    if (depth === 1 && /\s/.test(ch)) {
      if (token.trim()) fields.push(token.trim().split(/[\s(:]/)[0]);
      token = "";
      continue;
    }
    if (depth === 1) token += ch;
  }
  return new Set(fields.filter(Boolean));
};
const MOVED = [
  "is_coach",
  "is_captain",
  "is_in_lineup",
  "is_organizer",
  "can_schedule",
  "can_assign_server",
  "can_stream_live",
  "organizer",
];

describe("query shapes", () => {
  it("the live subscription no longer carries the per-viewer permission fields or requested_organizer", () => {
    const live = topLevelFields(liveQuery);
    for (const field of [...MOVED, "requested_organizer"]) {
      expect(live.has(field), field).toBe(false);
    }
  });

  it("everything live updates need stays in the subscription", () => {
    const live = topLevelFields(liveQuery);
    for (const field of [
      "status",
      "can_start",
      "can_check_in",
      "organizer_steam_id",
      "server_id",
      "is_server_online",
      "connection_string",
      "match_maps",
      "lineup_1",
      "lineup_2",
      "elo_changes",
      "streams",
      "tournament_brackets",
      "is_tournament_match",
      "min_players_per_lineup",
      "max_players_per_lineup",
      "map_veto_type",
      "map_veto_picking_lineup_id",
      "region_veto_picks",
      "draft_games",
      "cancels_at",
      "label",
    ]) {
      expect(live.has(field), field).toBe(true);
    }
    // Rounds, kills and assists (scoreboard, statistics) are unchanged.
    expect(liveQuery).toMatch(/rounds\s*\(/);
    expect(liveQuery).toMatch(/kills\s*\(/);
    expect(liveQuery).toContain("assists");
    expect(liveQuery.startsWith("subscription")).toBe(true);
  });

  it("the moved fields come from a one-time query, not another subscription", () => {
    expect(staticQuery.startsWith("query")).toBe(true);
    const fields = topLevelFields(staticQuery);
    for (const field of ["id", ...MOVED]) {
      expect(fields.has(field), field).toBe(true);
    }
    expect(fields.has("requested_organizer")).toBe(false);
    expect(page.apollo.$subscribe.matchStatic).toBeUndefined();
  });

  it("never serves another account's cached permissions (network-only)", () => {
    // The Apollo cache is not cleared on login/logout.
    expect(page.apollo.matchStatic.fetchPolicy).toBe("network-only");
  });

  it("requested_organizer has no consumer and is no longer requested by the web app", () => {
    expect(source).not.toMatch(/requested_organizer:\s*true/);
    expect(read("stores/DraftGamesStore.ts")).not.toMatch(/requested_organizer:\s*true/);
  });
});

describe("merging the two halves", () => {
  const compute = (matchLive: any, matchStatic: any) => {
    const ctx: any = { matchLive, matchStatic };
    ctx.currentMatchStatic = page.computed.currentMatchStatic.call(ctx);
    return page.computed.match.call(ctx);
  };

  it("passes through 'not loaded yet' and 'gone' from the subscription", () => {
    expect(compute(undefined, { id: route.params.id })).toBeUndefined();
    expect(compute(null, { id: route.params.id })).toBeNull();
  });

  it("shows live data before the static half lands, then adds the permission fields", () => {
    const live = { id: route.params.id, status: "Live" };
    expect(compute(live, undefined)).toEqual(live);
    expect(compute(live, { id: route.params.id, is_organizer: true })).toEqual({
      id: route.params.id,
      status: "Live",
      is_organizer: true,
    });
  });

  it("never applies another match's permissions after navigating", () => {
    const merged = compute(
      { id: otherId, status: "Live" },
      { id: route.params.id, is_organizer: true, is_in_lineup: true },
    );
    expect(merged.is_organizer).toBeUndefined();
    expect(merged.is_in_lineup).toBeUndefined();
  });

  it("automatic POV streams wait for the viewer's own membership to be known", () => {
    const ctx: any = {
      currentMatchStatic: null,
      match: { id: route.params.id, status: "Live" },
    };
    expect(page.computed.autoStreamsKey.call(ctx)).toBeNull();
  });
});

describe("refresh triggers", () => {
  const live = (overrides: Record<string, any> = {}) => ({
    id: route.params.id,
    status: "Live",
    server_id: "srv-1",
    organizer_steam_id: "100",
    lineup_1: {
      id: "l1",
      coach: null,
      captain: { player: { steam_id: "1" } },
      lineup_players: [{ steam_id: "1" }, { steam_id: "2" }],
    },
    lineup_2: {
      id: "l2",
      coach: { steam_id: "9" },
      captain: { player: { steam_id: "3" } },
      lineup_players: [{ steam_id: "3" }, { steam_id: "4" }],
    },
    ...overrides,
  });
  const key = (matchLive: any) => {
    const ctx: any = { matchLive };
    ctx.matchLineupMembershipKey = page.computed.matchLineupMembershipKey.call(ctx);
    return page.computed.matchStaticRefreshKey.call(ctx);
  };
  const refetches = (from: any, to: any) => {
    const ctx = { refetchMatchStatic: vi.fn() };
    page.watch.matchStaticRefreshKey.call(ctx, key(to), key(from));
    return ctx.refetchMatchStatic.mock.calls.length;
  };

  beforeEach(() => {
    auth.me = { steam_id: "1" };
  });

  it("a live tick that changes nothing relevant does not refetch (finished matches stay quiet)", () => {
    expect(refetches(live({ status: "Finished" }), live({ status: "Finished" }))).toBe(0);
    expect(refetches(live(), live({ cancels_at: "2026-10-10T20:00:00Z" }))).toBe(0);
  });

  it("refetches once on a status transition (incl. Captain Pick -> veto -> live -> finished/canceled)", () => {
    expect(refetches(live({ status: "PickingPlayers" }), live({ status: "Veto" }))).toBe(1);
    expect(refetches(live({ status: "Veto" }), live({ status: "Live" }))).toBe(1);
    expect(refetches(live({ status: "Live" }), live({ status: "Finished" }))).toBe(1);
    expect(refetches(live({ status: "WaitingForCheckIn" }), live({ status: "Canceled" }))).toBe(1);
  });

  it("refetches on server assignment and organizer reassignment", () => {
    expect(refetches(live({ server_id: null }), live({ server_id: "srv-2" }))).toBe(1);
    expect(refetches(live(), live({ organizer_steam_id: "200" }))).toBe(1);
  });

  it("refetches when lineup membership changes (player, captain or coach)", () => {
    const base = live();
    const joined = live();
    joined.lineup_1 = { ...base.lineup_1, lineup_players: [...base.lineup_1.lineup_players, { steam_id: "5" }] };
    expect(refetches(base, joined)).toBe(1);
    const newCaptain = live();
    newCaptain.lineup_2 = { ...base.lineup_2, captain: { player: { steam_id: "4" } } };
    expect(refetches(base, newCaptain)).toBe(1);
    const newCoach = live();
    newCoach.lineup_2 = { ...base.lineup_2, coach: { steam_id: "8" } };
    expect(refetches(base, newCoach)).toBe(1);
  });

  it("several changes in the same tick refetch only once", () => {
    expect(
      refetches(live(), live({ status: "Live", server_id: "srv-9", organizer_steam_id: "300" })),
    ).toBe(1);
  });

  it("refetches when the viewer logs in, out or switches account", () => {
    const ctx = { refetchMatchStatic: vi.fn() };
    auth.me = null;
    const before = key(live());
    auth.me = { steam_id: "1" };
    page.watch.matchStaticRefreshKey.call(ctx, key(live()), before);
    expect(ctx.refetchMatchStatic).toHaveBeenCalledTimes(1);
  });

  it("does not refetch for a different match: the query variables already changed", () => {
    expect(refetches(live(), live({ id: otherId }))).toBe(0);
  });
});

describe("mounted: one live subscription, one-time permission query", () => {
  let wrapper: VueWrapper<any> | undefined;
  let liveObserver: any;
  let counts: { live: number; static: number };

  const liveMatch = (status = "Live", id = route.params.id) => ({
    id,
    status,
    server_id: "srv-1",
    organizer_steam_id: "100",
    options: {},
    lineup_1: { id: "l1", name: "Team A", lineup_players: [] },
    lineup_2: { id: "l2", name: "Team B", lineup_players: [] },
  });
  const tick = async () => {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await nextTick();
  };

  const mountPage = () => {
    counts = { live: 0, static: 0 };
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: new ApolloLink((operation) => new Observable((observer) => {
        const query = print(operation.query);
        if (query.startsWith("subscription") && query.includes("matches_by_pk")) {
          counts.live++;
          liveObserver = observer;
          observer.next({ data: { matches_by_pk: liveMatch("Live", operation.variables.matchId) } });
          return () => {};
        }
        if (query.startsWith("query") && query.includes("matches_by_pk")) {
          counts.static++;
          observer.next({
            data: {
              matches_by_pk: {
                id: operation.variables.matchId,
                is_coach: false,
                is_captain: false,
                is_in_lineup: false,
                is_organizer: true,
                can_schedule: false,
                can_assign_server: false,
                can_stream_live: false,
                organizer: null,
              },
            },
          });
          observer.complete();
          return () => {};
        }
        return () => {};
      })),
    });
    wrapper = mount(defineComponent({
      ...page,
      apollo: {
        $subscribe: { matches_by_pk: { ...page.apollo.$subscribe.matches_by_pk, fetchPolicy: "no-cache" } },
        matchStatic: { ...page.apollo.matchStatic },
      },
      created() {}, unmounted() {}, provide() { return {}; },
      watch: { matchStaticRefreshKey: page.watch.matchStaticRefreshKey },
      render() { return h("div", this.match?.lineup_1?.name); },
    }), {
      global: {
        plugins: [createApolloProvider({ defaultClient: client })],
        mocks: { $route: route, $t: (k: string) => k },
      },
    });
  };

  beforeEach(() => {
    auth.me = null;
    route.params.id = "11111111-1111-1111-1111-111111111111";
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("renders from the live result and merges the permission query, each fetched once", async () => {
    mountPage();
    await tick();
    expect(wrapper!.text()).toBe("Team A");
    expect(counts).toEqual({ live: 1, static: 1 });
    expect(wrapper!.vm.match.is_organizer).toBe(true);
    expect(wrapper!.vm.match.status).toBe("Live");
  });

  it("repeated live ticks do not refetch permissions; a status change does, once", async () => {
    mountPage();
    await tick();
    for (let i = 0; i < 5; i++) {
      liveObserver.next({ data: { matches_by_pk: liveMatch("Live") } });
      await tick();
    }
    expect(counts.static).toBe(1);
    liveObserver.next({ data: { matches_by_pk: liveMatch("Finished") } });
    await tick();
    expect(counts.static).toBe(2);
    expect(counts.live).toBe(1);
  });

  it("navigating to another match refetches both halves once, and drops the old permissions", async () => {
    mountPage();
    await tick();
    route.params.id = otherId;
    await tick();
    expect(counts.live).toBe(2);
    expect(counts.static).toBe(2);
    expect(wrapper!.vm.match.id).toBe(otherId);
  });
});
