import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import {
  e_match_map_status_enum,
  e_match_status_enum,
  e_player_roles_enum,
} from "../../generated/zeus";

// What the match page shows User A, a match_organizer on a match they neither
// created nor play in, next to User B, its creator. is_organizer, can_cancel
// and can_assign_server come from the API (test/match-recovery-hasura.spec.ts
// in api-deafcs checks them through Hasura); here: what the page does with
// them. Options blocks of the real components, imports stripped.
const ROLES = [
  "user",
  "verified_user",
  "streamer",
  "moderator",
  "match_organizer",
  "tournament_organizer",
  "administrator",
];
let viewerRole = "user";
const useAuthStore = () => ({
  me: { steam_id: "900", role: viewerRole },
  isRoleAbove: (role: string) =>
    ROLES.indexOf(viewerRole) >= ROLES.indexOf(role),
});

function source(file: string) {
  return readFileSync(path.resolve(__dirname, "../..", file), "utf8");
}

function optionsOf(file: string, names: Record<string, unknown>) {
  const script = parse(source(file)).descriptor.script!.content;
  const ast = ts.createSourceFile("c.ts", script, ts.ScriptTarget.Latest, true);
  let code = script;
  for (const node of [...ast.statements].reverse()) {
    if (ts.isImportDeclaration(node)) {
      code = code.slice(0, node.pos) + code.slice(node.end);
    }
  }
  const exportsObj: any = {};
  new Function(
    "exports",
    ...Object.keys(names),
    ts.transpileModule(code, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  )(exportsObj, ...Object.values(names));
  return exportsObj.default;
}

const shared = {
  useAuthStore,
  e_player_roles_enum,
  e_match_status_enum,
  e_match_map_status_enum,
  generateSubscription: () => ({}),
  generateMutation: () => ({}),
  generateQuery: () => ({}),
};

const actions = optionsOf("components/match/MatchActions.vue", {
  ...shared,
  gql: (strings: TemplateStringsArray) => strings.join(""),
  toast: vi.fn(),
  useGpuPoolStatusStore: () => ({}),
  useStreamerStore: () => ({}),
  cameraAdminGridUrl: () => "",
});

const tabs = optionsOf("components/match/MatchTabs.vue", {
  ...shared,
  $: () => "",
  matchAllMapsStats: {},
  CAPTAIN_PICK_LINEUP_LOCK: Symbol("captain-pick-lock"),
});

function view(
  component: any,
  names: Array<string>,
  role: string,
  m: Record<string, any>,
) {
  viewerRole = role;
  const ctx: any = { match: m };
  for (const name of names) {
    Object.defineProperty(ctx, name, {
      get: () => component.computed[name].call(ctx),
    });
  }
  return ctx;
}

// A live match on a live map, as the API reports it to an organizer.
const liveMatch = (overrides: Record<string, any> = {}) => ({
  id: "m1",
  status: e_match_status_enum.Live,
  options: { type: "Competitive", mr: 12 },
  server_id: "server-1",
  is_organizer: true,
  is_in_lineup: false,
  can_cancel: true,
  can_assign_server: true,
  match_maps: [{ id: "map-1", is_current_map: true, status: "Live" }],
  ...overrides,
});

const ACTION_FLAGS = [
  "currentMap",
  "isPaused",
  "canRestoreRound",
  "canRestartMap",
  "canPauseResume",
  "canCancelMatch",
];
const TAB_FLAGS = ["currentMap", "canSeeRounds", "canSendRCONCommands"];

describe("User A, a match_organizer on someone else's match", () => {
  it("gets the Rounds tab, Restore Round, Restart Map, Pause/Resume and Cancel", () => {
    const a = view(actions, ACTION_FLAGS, "match_organizer", liveMatch());
    expect(a.canRestoreRound).toBe(true);
    expect(a.canRestartMap).toBe(true);
    expect(a.canPauseResume).toBe(true);
    expect(a.canCancelMatch).toBe(true);
    expect(
      view(tabs, TAB_FLAGS, "match_organizer", liveMatch()).canSeeRounds,
    ).toBe(true);
  });

  it("sees the same controls as User B, the creator", () => {
    for (const flag of ACTION_FLAGS.slice(2)) {
      expect(
        view(actions, ACTION_FLAGS, "match_organizer", liveMatch())[flag],
      ).toBe(view(actions, ACTION_FLAGS, "user", liveMatch())[flag]);
    }
    expect(
      view(tabs, TAB_FLAGS, "match_organizer", liveMatch()).canSeeRounds,
    ).toBe(view(tabs, TAB_FLAGS, "user", liveMatch()).canSeeRounds);
  });

  it("gets no RCON commands; an administrator does", () => {
    expect(
      view(tabs, TAB_FLAGS, "match_organizer", liveMatch()).canSendRCONCommands,
    ).toBe(false);
    expect(
      view(tabs, TAB_FLAGS, "tournament_organizer", liveMatch())
        .canSendRCONCommands,
    ).toBe(false);
    expect(
      view(tabs, TAB_FLAGS, "administrator", liveMatch()).canSendRCONCommands,
    ).toBe(true);

    // The admin bar's RCON console has the same administrator-only gate.
    expect(source("components/match/MatchAdminBottomBar.vue")).toMatch(
      /const canSendRCONCommands = computed\(\s*\(\) =>\s*useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.administrator\) &&/,
    );
  });

  it("is never offered Restart Match", () => {
    for (const file of [
      "components/match/MatchActions.vue",
      "components/match/MatchTabs.vue",
      "components/match/MatchAdminBottomBar.vue",
      "components/match/rounds/MatchRoundsTab.vue",
    ]) {
      expect(source(file)).not.toMatch(/restartMatch(?!Map)/);
    }
  });

  it("loses Pause/Resume while playing in the match", () => {
    expect(
      view(
        actions,
        ACTION_FLAGS,
        "match_organizer",
        liveMatch({ is_in_lineup: true }),
      ).canPauseResume,
    ).toBe(false);
  });

  it("gets nothing on a match the API says they don't organize", () => {
    const outsider = liveMatch({
      is_organizer: false,
      can_cancel: false,
      can_assign_server: false,
    });
    const a = view(actions, ACTION_FLAGS, "tournament_organizer", outsider);
    expect(a.canRestoreRound).toBe(false);
    expect(a.canRestartMap).toBe(false);
    expect(a.canPauseResume).toBe(false);
    expect(
      view(tabs, TAB_FLAGS, "tournament_organizer", outsider).canSeeRounds,
    ).toBe(false);
  });
});
