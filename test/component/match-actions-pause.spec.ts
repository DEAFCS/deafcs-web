import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import gql from "graphql-tag";
import { print } from "graphql";
import { e_match_map_status_enum, e_match_status_enum, e_player_roles_enum } from "../../generated/zeus";
import { generateMutation, generateSubscription } from "../../graphql/graphqlGen";

// MatchActions' real Options block (imports stripped, as the other match
// action specs do): who gets Pause/Resume, and that it goes through the
// setMatchPaused action rather than the RCON console.
const file = path.resolve(__dirname, "../../components/match/MatchActions.vue");
const descriptor = parse(readFileSync(file, "utf8")).descriptor;
const script = descriptor.script!.content;
const template = descriptor.template!.content;
const ast = ts.createSourceFile("actions.ts", script, ts.ScriptTarget.Latest, true);
let body = script;
for (const node of [...ast.statements].reverse()) {
  if (ts.isImportDeclaration(node)) body = body.slice(0, node.pos) + body.slice(node.end);
}

const ROLES = ["user", "verified_user", "streamer", "moderator", "match_organizer", "tournament_organizer", "administrator"];
const auth = {
  me: null as null | { steam_id: string; role: string },
  isRoleAbove(role: string) {
    return !!this.me && ROLES.indexOf(this.me.role) >= ROLES.indexOf(role);
  },
};
const toast = vi.fn();
const exportsObj: any = {};
new Function(
  "exports", "useAuthStore", "e_player_roles_enum", "e_match_status_enum", "e_match_map_status_enum", "generateSubscription", "generateMutation", "gql", "toast",
  "useGpuPoolStatusStore", "useStreamerStore", "cameraAdminGridUrl",
  ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
)(
  exportsObj, () => auth, e_player_roles_enum, e_match_status_enum, e_match_map_status_enum, generateSubscription, generateMutation, gql, toast,
  () => ({}), () => ({}), () => "",
);
const component = exportsObj.default;

function view(role: string, match: Record<string, any>) {
  auth.me = { steam_id: "900", role };
  const ctx: any = {
    match: { id: "m1", status: e_match_status_enum.Live, ...match },
    $t: (key: string) => key,
    $apollo: { mutate: vi.fn(async () => ({})) },
  };
  for (const [name, fn] of Object.entries<any>(component.computed)) {
    Object.defineProperty(ctx, name, { get: () => fn.call(ctx), enumerable: true });
  }
  for (const [name, fn] of Object.entries<any>(component.methods)) {
    ctx[name] = fn.bind(ctx);
  }
  return ctx;
}

const onMap = (status: string) => ({ match_maps: [{ is_current_map: true, status }] });

describe("Pause and Resume in the match actions", () => {
  beforeEach(() => toast.mockClear());

  // is_organizer is true for match organizers on every match and for
  // tournament organizers on their own tournaments' (is_match_organizer).
  it.each(["match_organizer", "tournament_organizer", "administrator", "user"])(
    "shows it to a %s who organizes the match",
    (role) => {
      expect(view(role, { is_organizer: true, is_in_lineup: false, ...onMap("Live") }).canPauseResume).toBe(true);
    },
  );

  it.each(ROLES)("hides it from a %s who doesn't organize the match", (role) => {
    expect(view(role, { is_organizer: false, is_in_lineup: false, ...onMap("Live") }).canPauseResume).toBe(false);
  });

  // DEAFCS: match organizers and up keep it while playing; below them, a
  // player who organizes their own match doesn't (the API's rule).
  it.each(["user", "moderator"])("hides it from a %s organizer playing in the match", (role) => {
    expect(view(role, { is_organizer: true, is_in_lineup: true, ...onMap("Live") }).canPauseResume).toBe(false);
  });

  it.each(["match_organizer", "tournament_organizer", "administrator"])(
    "still shows it to a %s playing in the match",
    (role) => {
      expect(view(role, { is_organizer: true, is_in_lineup: true, ...onMap("Live") }).canPauseResume).toBe(true);
    },
  );

  it.each([
    ["Live", true],
    ["Overtime", true],
    ["Paused", true],
    ["Warmup", false],
    ["Knife", false],
    ["Finished", false],
  ])("on a %s map: %s", (status, shown) => {
    expect(view("match_organizer", { is_organizer: true, is_in_lineup: false, ...onMap(status) }).canPauseResume).toBe(shown);
  });

  it.each([
    ["Live", true, "match.actions.match_paused"],
    ["Paused", false, "match.actions.match_resumed"],
  ])("on a %s map asks the API to set paused=%s", async (status, paused, title) => {
    const vm = view("match_organizer", { is_organizer: true, is_in_lineup: false, ...onMap(status) });

    await vm.togglePause();

    expect(vm.$apollo.mutate).toHaveBeenCalledTimes(1);
    const [{ mutation, variables }] = vm.$apollo.mutate.mock.calls[0];
    expect(print(mutation)).toContain("setMatchPaused(match_id: $match_id, paused: $paused)");
    expect(variables).toEqual({ match_id: "m1", paused });
    expect(toast).toHaveBeenCalledWith({ title });
  });

  it("shows the API's refusal", async () => {
    const vm = view("match_organizer", { is_organizer: true, is_in_lineup: false, ...onMap("Live") });
    vm.$apollo.mutate.mockRejectedValueOnce(new Error("organizers on one of the teams can't pause or resume the match"));

    await vm.togglePause();

    expect(toast).toHaveBeenCalledWith({
      variant: "destructive",
      title: "common.error",
      description: "organizers on one of the teams can't pause or resume the match",
    });
  });

  it("no longer talks to the RCON console", () => {
    expect(script).not.toMatch(/socket|rconUuid|resolveRconCommand|RconAction/);
    expect(template).toMatch(/v-if="canPauseResume"/);
  });
});
