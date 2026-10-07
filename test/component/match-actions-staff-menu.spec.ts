import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { e_match_status_enum, e_player_roles_enum } from "../../generated/zeus";
import { generateMutation, generateSubscription } from "../../graphql/graphqlGen";

// MatchActions' real Options block (imports stripped, as the other match
// action specs do): whether the "..." menu is reachable for each viewer.
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
const exportsObj: any = {};
new Function(
  "exports", "useAuthStore", "e_player_roles_enum", "e_match_status_enum", "generateSubscription", "generateMutation", "gql", "toast",
  "socket", "uuidv4", "useGpuPoolStatusStore", "useStreamerStore", "useApplicationSettingsStore", "cameraAdminGridUrl",
  ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
)(
  exportsObj, () => auth, e_player_roles_enum, e_match_status_enum, generateSubscription, generateMutation, () => ({}), vi.fn(),
  { on: vi.fn(), removeListener: vi.fn() }, () => "uuid", () => ({}), () => ({}), () => ({ settings: [] }), () => "",
);
const component = exportsObj.default;

// A stand-in instance whose computed properties are live getters, so canAct
// resolves canViewChatLog, canCancelMatch and the rest exactly as Vue would.
function view(role: string | null, match: Record<string, any>) {
  auth.me = role ? { steam_id: "900", role } : null;
  const ctx: any = { match: { id: "m1", ...match } };
  for (const [name, fn] of Object.entries<any>(component.computed)) {
    Object.defineProperty(ctx, name, { get: () => fn.call(ctx), enumerable: true });
  }
  return ctx;
}
// Not a player, not an organizer: only the viewer's own role can open the menu.
const stranger = { is_in_lineup: false, is_organizer: false, match_maps: [] };
const ENDED = ["Finished", "Forfeit", "Surrendered", "Tie", "Canceled"];
const ACTIVE = ["Live", "Scheduled", "WaitingForCheckIn", "WaitingForServer", "Veto", "PickingPlayers", "Setup"];

describe("the match '...' menu is reachable for staff", () => {
  it.each(ENDED)("moderator on an unrelated %s match gets the menu and the Chat Log entry", (status) => {
    const vm = view("moderator", { ...stranger, status });
    expect(vm.canViewChatLog).toBe(true);
    expect(vm.canAct).toBe(true);
    // The Chat Log entry is rendered from that same flag.
    expect(template).toMatch(/<DropdownMenuItem v-if="canViewChatLog" @click="openChatLog">/);
  });

  it.each(ACTIVE)("moderator on an unrelated %s match has no Chat Log and no menu", (status) => {
    const vm = view("moderator", { ...stranger, status });
    expect(vm.canViewChatLog).toBe(false);
    expect(vm.canAct).toBe(false);
  });

  it.each(["user", "verified_user", "streamer"])("%s on an unrelated ended match gets no staff menu", (role) => {
    const vm = view(role, { ...stranger, status: "Finished" });
    expect(vm.canViewChatLog).toBe(false);
    expect(vm.canWatchCamera).toBe(false);
    expect(vm.canAct).toBe(false);
  });

  it("a logged-out viewer gets nothing", () => {
    expect(view(null, { ...stranger, status: "Finished" }).canAct).toBe(false);
  });

  it("administrators keep the menu on every match, as before", () => {
    for (const status of [...ENDED, ...ACTIVE]) {
      expect(view("administrator", { ...stranger, status }).canAct).toBe(true);
    }
    const finished = view("administrator", { ...stranger, status: "Finished" });
    expect(finished.canViewChatLog).toBe(true);
    expect(finished.canVoidElo).toBe(true);
    expect(finished.canDeleteMatch).toBe(true);
  });

  it("players and organizers keep their menu exactly as before", () => {
    expect(view("user", { status: "Live", is_in_lineup: true, is_organizer: false, match_maps: [] }).canAct).toBe(true);
    expect(view("user", { status: "Live", is_in_lineup: false, is_organizer: true, match_maps: [] }).canAct).toBe(true);
    // A plain organizer of an ended match still has no staff-only entries.
    const organizer = view("user", { status: "Finished", is_in_lineup: false, is_organizer: true, match_maps: [] });
    expect(organizer.canViewChatLog).toBe(false);
    expect(organizer.canWatchCamera).toBe(false);
  });

  it("canAct always yields a boolean and grants no entry by itself", () => {
    expect(typeof view("moderator", { ...stranger, status: "Finished" }).canAct).toBe("boolean");
    // Hidden entries stay hidden: each staff item still sits behind its own flag.
    for (const flag of ["canWatchCamera", "canViewChatLog", "canReparseDemos", "canVoidElo", "canDeleteMatch"]) {
      expect(template).toContain(`v-if="${flag}"`);
    }
    // Staff powers that need a real organizer role stay organizer-gated.
    const moderator = view("moderator", { ...stranger, status: "Finished" });
    expect(moderator.canWatchCamera).toBe(false);
    expect(moderator.canVoidElo).toBe(false);
    expect(moderator.canDeleteMatch).toBe(false);
    expect(moderator.canReparseDemos).toBe(false);
    expect(moderator.canSetMatchWinner).toBeFalsy();
  });
});
