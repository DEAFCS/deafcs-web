import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { e_match_status_enum, e_player_roles_enum } from "../../generated/zeus";
import { generateMutation, generateSubscription } from "../../graphql/graphqlGen";

// MatchActions' real Options block (imports stripped, as the match page
// specs do): the admin "Void ELO" visibility rule and action.
const file = path.resolve(__dirname, "../../components/match/MatchActions.vue");
const source = readFileSync(file, "utf8");
const descriptor = parse(source).descriptor;
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
  "exports", "useAuthStore", "e_player_roles_enum", "e_match_status_enum", "generateSubscription", "generateMutation", "gql", "toast",
  "socket", "uuidv4", "useGpuPoolStatusStore", "useStreamerStore", "useApplicationSettingsStore", "cameraAdminGridUrl",
  ts.transpileModule(body, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
)(
  exportsObj, () => auth, e_player_roles_enum, e_match_status_enum, generateSubscription, generateMutation, () => ({}), toast,
  { on: vi.fn(), removeListener: vi.fn() }, () => "uuid", () => ({}), () => ({}), () => ({ settings: [] }), () => "",
);
const component = exportsObj.default;

const canVoid = (role: string | null, match: Record<string, any>) => {
  auth.me = role ? { steam_id: "900", role } : null;
  return component.computed.canVoidElo.call({ match });
};
const PLAYED = ["Finished", "Forfeit", "Tie", "Surrendered"];

describe("Void ELO visibility", () => {
  it("only administrators, never for being the organizer or a player", () => {
    const finished = { id: "m1", status: "Finished", is_organizer: true, is_in_lineup: true, elo_voided: false };
    for (const role of [null, "user", "verified_user", "streamer", "moderator", "match_organizer", "tournament_organizer"]) {
      expect(canVoid(role, finished)).toBe(false);
    }
    expect(canVoid("administrator", finished)).toBe(true);
  });

  it.each(PLAYED)("administrator sees it on a %s match", (status) => {
    expect(canVoid("administrator", { id: "m1", status, elo_voided: false })).toBe(true);
  });

  it.each(["Live", "Canceled", "Scheduled", "WaitingForCheckIn", "PickingPlayers", "Veto", "WaitingForServer", "Setup"])(
    "not on a %s match",
    (status) => {
      expect(canVoid("administrator", { id: "m1", status, elo_voided: false })).toBe(false);
    },
  );

  it("hidden once the match's ELO is voided", () => {
    expect(canVoid("administrator", { id: "m1", status: "Finished", elo_voided: true })).toBe(false);
  });
});

describe("Void ELO action", () => {
  it("sits with Cancel / Delete match and only opens a confirmation", () => {
    const item = template.match(/<template v-if="canVoidElo">[\s\S]*?<\/template>/)![0];
    expect(item).toContain('@click="showVoidEloDialog = true"');
    expect(item).toContain('$t("match.actions.void_elo")');
    expect(item).not.toContain("voidElo()");
    // Between Cancel and Delete in the admin area.
    expect(template.indexOf('v-if="canCancelMatch"')).toBeLessThan(template.indexOf('v-if="canVoidElo"'));
    expect(template.indexOf('v-if="canVoidElo"')).toBeLessThan(template.indexOf('<template v-if="canDeleteMatch">'));
    // The mutation runs only from the dialog's confirm button.
    const dialog = template.match(/<AlertDialog :open="showVoidEloDialog">[\s\S]*?<\/AlertDialog>/)![0];
    expect(dialog).toContain('$t("match.void_elo_confirm.title")');
    expect(dialog).toContain('$t("match.void_elo_confirm.description")');
    expect(dialog).toMatch(/<AlertDialogCancel[^>]*>\s*\{\{ \$t\("common\.cancel"\) \}\}/);
    expect(dialog).toMatch(/data-testid="void-elo-confirm"[\s\S]*voidElo\(\);[\s\S]*\$t\("match\.void_elo_confirm\.action"\)/);
    expect(template.match(/voidElo\(\)/g)).toHaveLength(1);
  });

  it("copy as written, without em dashes", () => {
    const en = JSON.parse(readFileSync(path.resolve(__dirname, "../../i18n/locales/en.json"), "utf8"));
    expect(en.match.void_elo_confirm).toEqual({
      title: "Void ELO?",
      description: "Remove the ELO changes from this match? The match, score, stats, highlights and demo will stay.",
      action: "Void ELO",
    });
    expect(en.match.actions.void_elo).toBe("Void ELO");
    expect(en.match.actions.elo_voided).toBe("ELO voided");
    expect(JSON.stringify(en.match.void_elo_confirm)).not.toContain("—");
  });

  const run = async (mutate: any) => {
    toast.mockClear();
    const ctx: any = { match: { id: "m1" }, voidingElo: false, $apollo: { mutate }, $t: (k: string) => k };
    await component.methods.voidElo.call(ctx);
    return ctx;
  };

  it("sends voidMatchElo(match_id) and confirms with 'ELO voided'", async () => {
    const mutate = vi.fn().mockResolvedValue({});
    const ctx = await run(mutate);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0].mutation).toEqual(
      generateMutation({ voidMatchElo: [{ match_id: "m1" }, { success: true }] } as any),
    );
    expect(JSON.stringify(mutate.mock.calls[0][0].mutation)).toContain("voidMatchElo");
    expect(toast).toHaveBeenCalledWith({ title: "match.actions.elo_voided" });
    expect(ctx.voidingElo).toBe(false);
  });

  it("an error is shown, and a second press while sending does nothing", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("only a played match"));
    await run(failing);
    expect(toast).toHaveBeenCalledWith({ variant: "destructive", title: "common.error", description: "only a played match" });
    const mutate = vi.fn();
    const ctx: any = { match: { id: "m1" }, voidingElo: true, $apollo: { mutate }, $t: (k: string) => k };
    await component.methods.voidElo.call(ctx);
    expect(mutate).not.toHaveBeenCalled();
  });

  it("the match page carries elo_voided so the item hides after voiding", () => {
    const page = readFileSync(path.resolve(__dirname, "../../pages/matches/[id]/index.vue"), "utf8");
    expect(page).toMatch(/const eloVoidedField: any = \{\s*elo_voided: true,/);
    expect(page).toContain("...eloVoidedField,");
  });
});
