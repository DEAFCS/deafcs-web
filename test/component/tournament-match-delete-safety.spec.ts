import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { e_match_status_enum, e_player_roles_enum } from "../../generated/zeus";
import { generateMutation, generateSubscription } from "../../graphql/graphqlGen";
import { isOrphanedBracket } from "../../utilities/tournamentOrphanBracket";

// MatchActions' real Options block (imports stripped, as the other match
// action specs do): a tournament match is never offered the generic delete.
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

const as = (role: string | null, match: Record<string, any>) => {
  auth.me = role ? { steam_id: "900", role } : null;
  return {
    canDelete: component.computed.canDeleteMatch.call({ match }),
    blocked: component.computed.deleteBlockedForTournament.call({ match }),
  };
};

describe("generic Delete Match on a tournament match", () => {
  it("is hidden for a tournament match and replaced by an explanation", () => {
    const result = as("administrator", { id: "m", status: "Finished", is_tournament_match: true });
    expect(result.canDelete).toBe(false);
    expect(result.blocked).toBe(true);
    expect(template).toContain("match.actions.delete_tournament_blocked");
    expect(template).toContain('v-if="deleteBlockedForTournament"');
  });

  it("is still offered for a normal match", () => {
    const result = as("administrator", { id: "m", status: "Finished", is_tournament_match: false });
    expect(result.canDelete).toBe(true);
    expect(result.blocked).toBe(false);
    expect(as("administrator", { id: "m", status: "Canceled" }).canDelete).toBe(true);
  });

  it("is never offered to anyone below administrator, or on a live match", () => {
    expect(as("tournament_organizer", { id: "m", status: "Finished" }).canDelete).toBe(false);
    expect(as("administrator", { id: "m", status: "Live" }).canDelete).toBe(false);
    expect(as("administrator", { id: "m", status: "Live", is_tournament_match: true }).blocked).toBe(false);
  });
});

describe("orphaned bracket slot", () => {
  const slot = { match: null, bye: false, finished: true, team_1: { id: "a" }, team_2: { id: "b" } };

  it("is a played slot with both teams and no match", () => {
    expect(isOrphanedBracket(slot)).toBe(true);
  });

  it("is not a slot with a match, a bye, an unfinished slot or one missing a team", () => {
    expect(isOrphanedBracket({ ...slot, match: { id: "m" } })).toBe(false);
    expect(isOrphanedBracket({ ...slot, bye: true })).toBe(false);
    expect(isOrphanedBracket({ ...slot, finished: false })).toBe(false);
    expect(isOrphanedBracket({ ...slot, team_2: null })).toBe(false);
    expect(isOrphanedBracket(null)).toBe(false);
  });
});
