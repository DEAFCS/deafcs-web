import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { e_player_roles_enum } from "../../generated/zeus";
import { generateSubscription } from "../../graphql/graphqlGen";

// MatchActions' real Options block (imports stripped, the identifiers the
// render-summary code uses supplied), as the match page specs do. Only the
// clip_render_jobs summary subscription is exercised here.
const source = readFileSync(path.resolve(__dirname, "../../components/match/MatchActions.vue"), "utf8");
const script = parse(source).descriptor.script!.content;
const ast = ts.createSourceFile("actions.ts", script, ts.ScriptTarget.Latest, true);
let body = script;
for (const node of [...ast.statements].reverse()) {
  if (ts.isImportDeclaration(node)) body = body.slice(0, node.pos) + body.slice(node.end);
}

// Same order as AuthStore's roleOrder.
const ROLES = ["user", "verified_user", "streamer", "moderator", "match_organizer", "tournament_organizer", "administrator"];
const auth = {
  me: null as null | { steam_id: string; role: string },
  isRoleAbove(role: string) {
    return !!this.me && ROLES.indexOf(this.me.role) >= ROLES.indexOf(role);
  },
};
const exportsObj: any = {};
new Function(
  "exports", "useAuthStore", "e_player_roles_enum", "generateSubscription", "generateMutation", "gql", "toast",
  "socket", "uuidv4", "useGpuPoolStatusStore", "useStreamerStore", "useApplicationSettingsStore", "cameraAdminGridUrl",
  ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
)(
  exportsObj, () => auth, e_player_roles_enum, generateSubscription, () => ({}), () => ({}), vi.fn(),
  { on: vi.fn(), removeListener: vi.fn() }, () => "uuid", () => ({}), () => ({}), () => ({ settings: [] }), () => "",
);
const component = exportsObj.default;

// A component instance with just what the render summary needs, wired the
// way Vue would: computed getters, the immediate watcher, beforeUnmount.
const makeInstance = (match: any) => {
  const opened: Array<{ query: string; unsubscribe: ReturnType<typeof vi.fn> }> = [];
  const ctx: any = {
    match,
    renderSummary: [{ match_map_id: "stale", in_flight: 1, paused: 0 }],
    renderSummarySub: undefined,
    onRconResponse: () => {},
    $apollo: {
      subscribe: ({ query }: any) => ({
        subscribe: ({ next }: any) => {
          const entry = { query: JSON.stringify(query), unsubscribe: vi.fn(), next };
          opened.push(entry);
          return entry;
        },
      }),
    },
  };
  for (const name of ["canSelectRenderJobs", "renderSummaryScope"]) {
    Object.defineProperty(ctx, name, { get: () => component.computed[name].call(ctx) });
  }
  ctx.subscribeRenderSummary = component.methods.subscribeRenderSummary.bind(ctx);
  let scope = ctx.renderSummaryScope;
  // Vue's watcher: the immediate run, then a run whenever the scope changes.
  const watcher = component.watch.renderSummaryScope;
  watcher.handler.call(ctx);
  const sync = () => {
    if (ctx.renderSummaryScope !== scope) {
      scope = ctx.renderSummaryScope;
      watcher.handler.call(ctx);
    }
  };
  return { ctx, opened, sync };
};

const match = (id = "m1") => ({ id, match_maps: [{ id: `${id}-map1` }, { id: `${id}-map2` }] });
const isRenderJobs = (q: string) => q.includes("clip_render_jobs");

describe("MatchActions clip_render_jobs summary subscription", () => {
  it("subscribes through the guarded watcher only (no unconditional created() subscribe)", () => {
    expect(component.watch.renderSummaryScope.immediate).toBe(true);
    expect(component.created.toString()).not.toContain("subscribeRenderSummary");
  });

  it("guest: no clip_render_jobs subscription at all", () => {
    auth.me = null;
    const { ctx, opened } = makeInstance(match());
    expect(opened).toHaveLength(0);
    expect(ctx.renderSummary).toEqual([]);
  });

  it.each(ROLES)("signed-in %s (Hasura role with select, own or inherited): subscribes exactly as before", (role) => {
    auth.me = { steam_id: "11", role };
    const { opened } = makeInstance(match());
    expect(opened).toHaveLength(1);
    expect(isRenderJobs(opened[0].query)).toBe(true);
    expect(opened[0].query).toContain("m1-map1");
    expect(opened[0].query).toContain("m1-map2");
  });

  it("a role without the player role order (no select permission) never subscribes", () => {
    auth.me = { steam_id: "11", role: "guest" };
    const { opened } = makeInstance(match());
    expect(opened).toHaveLength(0);
  });

  it("sign-out cleans the subscription up; signing back in starts it again", () => {
    auth.me = { steam_id: "11", role: "user" };
    const { ctx, opened, sync } = makeInstance(match());
    expect(opened).toHaveLength(1);
    auth.me = null;
    sync();
    expect(opened[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(1);
    expect(ctx.renderSummary).toEqual([]);
    auth.me = { steam_id: "11", role: "administrator" };
    sync();
    expect(opened).toHaveLength(2);
    expect(isRenderJobs(opened[1].query)).toBe(true);
  });

  it("a guest who signs in on the page starts it; a role change between permitted roles keeps it", () => {
    auth.me = null;
    const { opened, sync } = makeInstance(match());
    expect(opened).toHaveLength(0);
    auth.me = { steam_id: "11", role: "user" };
    sync();
    expect(opened).toHaveLength(1);
    auth.me = { steam_id: "11", role: "moderator" };
    sync();
    expect(opened).toHaveLength(1);
    expect(opened[0].unsubscribe).not.toHaveBeenCalled();
  });

  it("a new match re-subscribes for its maps; unmount still cleans up", () => {
    auth.me = { steam_id: "11", role: "user" };
    const { ctx, opened, sync } = makeInstance(match("m1"));
    ctx.match = match("m2");
    sync();
    expect(opened[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(opened).toHaveLength(2);
    expect(opened[1].query).toContain("m2-map1");
    component.beforeUnmount.call(ctx);
    expect(opened[1].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("no maps yet: nothing to watch, as before", () => {
    auth.me = { steam_id: "11", role: "user" };
    const { opened } = makeInstance({ id: "m1", match_maps: [] });
    expect(opened).toHaveLength(0);
  });
});
