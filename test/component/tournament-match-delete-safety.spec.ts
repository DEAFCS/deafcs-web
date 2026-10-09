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
    disabledDelete: component.computed.canDeleteTournamentMatchDisabled.call({ match }),
  };
};

describe("tournament match page: Delete Match is greyed out, there is no Reset Match", () => {
  const read = (f: string) => readFileSync(path.resolve(__dirname, "../..", f), "utf8");

  it("a tournament match shows a disabled Delete Match and never the generic delete", () => {
    const result = as("administrator", { id: "m", status: "Finished", is_tournament_match: true });
    expect(result.canDelete).toBe(false);
    expect(result.disabledDelete).toBe(true);
    const block = template.match(/<template v-if="canDeleteTournamentMatchDisabled">[\s\S]*?<\/template>/)![0];
    expect(block).toContain("disabled");
    expect(block).toContain("text-muted-foreground");
    expect(block).toContain('$t("match.actions.delete")');
    // Inert: no click handler, no dialog, no explanation text.
    expect(block).not.toContain("@click");
    expect(block).not.toContain("showDeleteDialog");
    expect(block).not.toContain("delete_tournament_blocked");
  });

  it("there is no Reset Match on the match page any more", () => {
    expect(template).not.toContain("reset_tournament_match");
    expect(template).not.toContain("TournamentMatchResetFlow");
    expect(component.computed.canResetTournamentMatch).toBeUndefined();
    expect(component.methods.openTournamentReset).toBeUndefined();
    expect(read("i18n/locales/en.json")).not.toContain("reset_tournament_match");
  });

  it("the disabled Delete only shows to whoever could delete a normal match", () => {
    expect(as("user", { id: "m", status: "Finished", is_tournament_match: true, is_organizer: true }).disabledDelete).toBe(false);
    expect(as("tournament_organizer", { id: "m", status: "Finished", is_tournament_match: true }).disabledDelete).toBe(false);
    expect(as(null, { id: "m", status: "Finished", is_tournament_match: true }).disabledDelete).toBe(false);
    expect(as("administrator", { id: "m", status: "Live", is_tournament_match: true }).disabledDelete).toBe(false);
  });

  it("a normal match keeps a working Delete Match and no disabled one", () => {
    const result = as("administrator", { id: "m", status: "Finished", is_tournament_match: false });
    expect(result.canDelete).toBe(true);
    expect(result.disabledDelete).toBe(false);
    expect(as("administrator", { id: "m", status: "Canceled" }).canDelete).toBe(true);
    const deleteBlock = template.match(/<template v-if="canDeleteMatch">[\s\S]*?<\/template>/)![0];
    expect(deleteBlock).toContain("showDeleteDialog = true");
  });

  it("is never offered on a live match, and Delete stays administrator-only", () => {
    expect(as("tournament_organizer", { id: "m", status: "Finished" }).canDelete).toBe(false);
    expect(as("administrator", { id: "m", status: "Live" }).canDelete).toBe(false);
  });

  it("the generic delete is not reachable for a tournament match from the page", () => {
    expect(as("administrator", { id: "m", status: "Finished", is_tournament_match: true }).canDelete).toBe(false);
  });

  it("the bracket card keeps the one shared tournament reset flow", () => {
    const flow = read("components/tournament/TournamentMatchResetFlow.vue");
    expect(flow).toContain("PreviewTournamentMatchReset");
    expect(flow).toContain("ResetTournamentMatch");
    const card = read("components/tournament/TournamentMatch.vue");
    expect(card).toContain("TournamentMatchResetFlow");
    expect(card).not.toContain("mutation ResetTournamentMatch");
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
