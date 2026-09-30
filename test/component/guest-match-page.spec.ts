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

// Resolve Nuxt's existing Apollo provider dependency, whether hoisted or nested.
const apolloRequire = createRequire(path.resolve(__dirname, "../../node_modules/@nuxtjs/apollo/package.json"));
const { createApolloProvider } = apolloRequire("@vue/apollo-option");

// Load the real Options block without mounting the page's unrelated children
// or setup subscriptions. Apollo, queries, watchers and camera gates are real.
const source = readFileSync(path.resolve(__dirname, "../../pages/matches/[id]/index.vue"), "utf8");
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
const secondId = "22222222-2222-2222-2222-222222222222";
const context = { value: null as any };
new Function("exports", "$", "order_by", "e_match_status_enum", "typedGql", "mapFields", "matchLineups", "playerFields", "matchOptionsFields", "eloFields", "useAuthStore", "useMatchContext", "navigateTo", compiled)(
  exports, $, order_by, e_match_status_enum, typedGql, mapFields, matchLineups, playerFields, matchOptionsFields, eloFields,
  () => auth, () => context, vi.fn(),
);
const page = exports.default;
let wrapper: VueWrapper<any>;
let client: ApolloClient<any>;
let operations: Array<{ private: boolean; variables: any; observer: any; active: boolean; query: string }>;
const tick = async () => { await nextTick(); await new Promise((resolve) => setTimeout(resolve, 10)); await nextTick(); };
const privateOps = () => operations.filter((op) => op.private);
const currentPrivate = () => privateOps().filter((op) => op.active).at(-1)!;
const requested = (op = currentPrivate(), value: string | null = "2026-09-30T12:00:00Z") => {
  op.observer.next({ data: { match_camera_tokens: [{ requested_at: value }] } });
};
const match = (status = "Live", cameraRequired = false) => ({
  id: route.params.id, status, options: { camera_required: cameraRequired },
  is_in_lineup: false, is_organizer: false, is_coach: false,
  lineup_1: { name: "Team A", is_on_lineup: !!auth.me },
  lineup_2: { name: "Team B", is_on_lineup: false },
});
const mountPage = () => {
  client = new ApolloClient({
    cache: new InMemoryCache(),
    link: new ApolloLink((operation) => new Observable((observer) => {
      const query = print(operation.query);
      const op = { private: query.includes("match_camera_tokens"), variables: operation.variables, observer, active: true, query };
      operations.push(op);
      if (!op.private) observer.next({ data: { matches_by_pk: match("PickingPlayers") } });
      return () => { op.active = false; };
    })),
  });
  wrapper = mount(defineComponent({
    ...page,
    apollo: {
      $subscribe: Object.fromEntries(Object.entries(page.apollo.$subscribe).map(([key, options]: any) => [key, { ...options, fetchPolicy: "no-cache" }])),
    },
    created() {}, unmounted() {}, provide() { return {}; },
    watch: { cameraRequestScope: page.watch.cameraRequestScope },
    render() { return h("div", this.match?.lineup_1?.name); },
  }), {
    global: {
      plugins: [createApolloProvider({ defaultClient: client })],
      mocks: { $route: route, $t: (key: string) => key },
    },
  });
};

beforeEach(() => {
  auth.me = null;
  route.params.id = "11111111-1111-1111-1111-111111111111";
  operations = [];
});
afterEach(() => {
  wrapper?.unmount();
  client?.stop();
});

describe("guest-safe match page and private camera requests", () => {
  it("loads a guest's PickingPlayers match through the public query without camera permission", async () => {
    mountPage();
    await tick();
    const publicOp = operations.find((op) => !op.private)!;
    expect(publicOp.query).toContain("matches_by_pk");
    expect(publicOp.query).not.toMatch(/camera_tokens|requested_at/);
    expect(publicOp.query).toContain("match_maps");
    expect(publicOp.query).toContain("lineup_1");
    expect(publicOp.query).toContain("draft_games");
    expect(privateOps()).toHaveLength(0);
    expect(wrapper.text()).toContain("Team A");
    expect(wrapper.vm.statusTier).toBe("veto");
    expect(wrapper.vm.canJoinLobby).toBe(false);
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(false);
    expect(wrapper.vm.showCameraOverlay).toBe(false);
  });

  it("subscribes only to requested_at for the authenticated viewer and current match", async () => {
    auth.me = { steam_id: "123" };
    mountPage();
    await tick();
    expect(privateOps()).toHaveLength(1);
    expect(currentPrivate().variables).toEqual({ matchId: route.params.id, steamId: "123" });
    const query = page.apollo.$subscribe.cameraRequest.query;
    const field = query.definitions[0].selectionSet.selections[0];
    expect(field.selectionSet.selections.map((s: any) => s.name.value)).toEqual(["requested_at"]);
    expect(currentPrivate().query).toContain("match_id: {_eq: $matchId}");
    expect(currentPrivate().query).toContain("steam_id: {_eq: $steamId}");
  });

  it("updates spot checks live, while the overlay stays mounted across readiness changes", async () => {
    auth.me = { steam_id: "123" };
    mountPage();
    await tick();
    wrapper.vm.match = match("WaitingForCheckIn");
    expect(wrapper.vm.showCameraOverlay).toBe(false);
    requested();
    await tick();
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(true);
    expect(wrapper.vm.showCameraOverlay).toBe(true);
    wrapper.vm.cameraReady = true;
    expect(wrapper.vm.showCameraOverlay).toBe(true);
    wrapper.vm.cameraReady = false;
    expect(wrapper.vm.showCameraOverlay).toBe(true);
    requested(currentPrivate(), null);
    await tick();
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(false);
    expect(wrapper.vm.showCameraOverlay).toBe(false);
  });

  it("clears synchronously on navigation and ignores the old match's updates", async () => {
    auth.me = { steam_id: "123" };
    mountPage();
    await tick();
    const previous = currentPrivate();
    requested(previous);
    await tick();
    route.params.id = secondId;
    expect(wrapper.vm.cameraTokenRequestedAt).toBeNull();
    requested(previous);
    expect(wrapper.vm.cameraTokenRequestedAt).toBeNull();
    await tick();
    expect(previous.active).toBe(false);
    expect(currentPrivate().variables.matchId).toBe(secondId);
    requested(previous);
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(false);
    requested();
    await tick();
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(true);
  });

  it("clears and stops on sign-out, ignores stale player flags, and resumes on sign-in", async () => {
    auth.me = { steam_id: "123" };
    mountPage();
    await tick();
    wrapper.vm.match = match();
    const previous = currentPrivate();
    requested(previous);
    await tick();
    auth.me = null;
    expect(wrapper.vm.cameraTokenRequestedAt).toBeNull();
    requested(previous);
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(false);
    expect(wrapper.vm.showCameraOverlay).toBe(false);
    await tick();
    expect(previous.active).toBe(false);
    auth.me = { steam_id: "456" };
    await tick();
    expect(currentPrivate().variables.steamId).toBe("456");
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(false);
    requested();
    await tick();
    expect(wrapper.vm.cameraSpotCheckRequested).toBe(true);
  });

  it("clears on account switches even when the match stays the same", async () => {
    auth.me = { steam_id: "123" };
    mountPage();
    await tick();
    const previous = currentPrivate();
    requested(previous);
    await tick();
    auth.me = { steam_id: "456" };
    expect(wrapper.vm.cameraTokenRequestedAt).toBeNull();
    requested(previous);
    expect(wrapper.vm.cameraTokenRequestedAt).toBeNull();
    await tick();
    expect(previous.active).toBe(false);
    expect(currentPrivate().variables.steamId).toBe("456");
  });

  it("preserves match-wide camera_required and its existing status window", async () => {
    auth.me = { steam_id: "123" };
    mountPage();
    await tick();
    for (const status of ["Veto", "Live", "WaitingForServer"]) {
      wrapper.vm.match = match(status, true);
      expect(wrapper.vm.cameraSpotCheckRequested).toBe(false);
      expect(wrapper.vm.showCameraOverlay).toBe(true);
    }
    for (const status of ["PickingPlayers", "WaitingForCheckIn", "Finished"]) {
      wrapper.vm.match = match(status, true);
      expect(wrapper.vm.showCameraOverlay).toBe(false);
    }
    wrapper.vm.match = { ...match("Live", true), lineup_1: { is_on_lineup: false } };
    expect(wrapper.vm.showCameraOverlay).toBe(false);
  });
});
