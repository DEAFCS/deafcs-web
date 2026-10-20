// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { print } from "graphql";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import {
  e_match_map_status_enum,
  e_match_status_enum,
  e_player_roles_enum,
} from "../../generated/zeus";
import MatchRestoreRoundDialog from "../../components/match/MatchRestoreRoundDialog.vue";

// Restore Round and Restart Map for organizers (5stackgg/web 8413f8d #895,
// ffcbea2 #900). The dialog cases are upstream's
// tests/components/match/MatchRecovery.spec.ts, mounted with plain Vitest
// instead of mountSuspended. DEAFCS opens both from the match menu instead
// of upstream's Fix a Problem dock, so the menu rules are checked here too.

let mutate: ReturnType<typeof vi.fn>;
let query: ReturnType<typeof vi.fn>;
let wrapper: ReturnType<typeof mount> | undefined;

const i18n = createI18n<Record<string, unknown>, "en">({
  legacy: false,
  locale: "en",
  messages: { en },
});

const sent = () =>
  mutate.mock.calls.map(([{ mutation, variables }]) => ({
    document: print(mutation),
    variables,
  }));

function match(overrides: Record<string, any> = {}) {
  return {
    id: "m-1",
    status: "Live",
    is_organizer: true,
    winning_lineup_id: null,
    lineup_1_id: "l-1",
    lineup_2_id: "l-2",
    options: { type: "Competitive", map_veto: true, best_of: 1, mr: 12 },
    match_maps: [{ id: "map-1", is_current_map: true, status: "Live" }],
    lineup_1: { id: "l-1", name: "Kestrel" },
    lineup_2: { id: "l-2", name: "Riptide" },
    tournament_brackets: [],
    ...overrides,
  };
}

function round(number: number, backup = true, undone = false) {
  return {
    round: number,
    lineup_1_score: number,
    lineup_2_score: 0,
    lineup_1_side: "CT",
    lineup_2_side: "TERRORIST",
    winning_side: "CT",
    winning_reason: "CTsWin",
    lineup_1_timeouts: 3,
    lineup_2_timeouts: 3,
    next_lineup_1_side: "CT",
    next_lineup_2_side: "TERRORIST",
    has_backup: backup,
    undone,
    players: [
      {
        steam_id: "1",
        name: "vexa",
        lineup: 1,
        cash: 4100 + number,
        armor: 100,
        helmet: true,
        alive: true,
        weapons: ["weapon_glock", "weapon_ak47"],
        kills: number,
        deaths: 0,
      },
    ],
  };
}

function restoreRounds(overrides: Record<string, any> = {}) {
  return {
    data: {
      getMatchRestoreRounds: {
        map_name: "de_mirage",
        restorable: true,
        blocked_reason: null,
        live_round: 14,
        economy_hidden: false,
        connected_players: 10,
        expected_players: 10,
        disconnected: [],
        rounds: Array.from({ length: 13 }, (_, index) => round(index + 1)),
        ...overrides,
      },
    },
  };
}

const body = () => document.body;

function button(text: string) {
  return Array.from(body().querySelectorAll("button")).find((element) =>
    element.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  mutate = vi.fn().mockResolvedValue({ data: {} });
  query = vi.fn().mockResolvedValue(restoreRounds());
  vi.stubGlobal("useNuxtApp", () => ({
    $apollo: { defaultClient: { query, mutate } },
  }));
  // DEAFCS's Button reads this auto-imported store.
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("restore round", () => {
  async function mountRestore(data = restoreRounds()) {
    query.mockResolvedValue(data);
    wrapper = mount(MatchRestoreRoundDialog, {
      props: { match: match(), open: true },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();
  }

  it("asks the api for the rounds, not RCON", async () => {
    await mountRestore();

    expect(print(query.mock.calls[0][0].query)).toContain(
      "getMatchRestoreRounds",
    );
    expect(query.mock.calls[0][0].variables).toEqual({ matchId: "m-1" });
  });

  it("replays the live round by loading the backup taken after the round before it", async () => {
    await mountRestore();

    expect(body().textContent).toContain("Replay round 14 from the start");
    button("Replay Round 14")!.click();
    await flushPromises();

    expect(sent()[0].document).toContain("restoreMatchRound");
    expect(sent()[0].variables).toEqual({ matchId: "m-1", round: 13 });
  });

  it("labels an earlier pick by the round that gets played again", async () => {
    await mountRestore();

    (
      body().querySelector('button[aria-label^="Round 12:"]') as HTMLElement
    ).click();
    await flushPromises();

    expect(body().textContent).toContain("Back to the start of round 12");
    expect(body().textContent).toContain(
      "Undoes rounds 12–13 and the round in progress",
    );
    button("Restore to Round 12")!.click();
    await flushPromises();

    expect(sent()[0].variables).toEqual({ matchId: "m-1", round: 11 });
  });

  it("goes forward again to rounds a restore undid", async () => {
    await mountRestore(
      restoreRounds({
        live_round: 12,
        rounds: Array.from({ length: 13 }, (_, index) =>
          round(index + 1, true, index + 1 >= 12),
        ),
      }),
    );

    expect(body().textContent).toContain("Replay round 12 from the start");
    expect(body().textContent).toContain("Undone, can still be brought back");
    (body().querySelector('button[aria-label="14"]') as HTMLElement).click();
    await flushPromises();

    expect(body().textContent).toContain("Forward to the start of round 14");
    expect(body().textContent).toContain(
      "Brings back rounds 12–13, with their kills and damage.",
    );
    button("Restore to Round 14")!.click();
    await flushPromises();

    expect(sent()[0].variables).toEqual({ matchId: "m-1", round: 13 });
  });

  it("waits for a restarted map to go live before offering its rounds", async () => {
    await mountRestore(
      restoreRounds({
        blocked_reason: "not_live_yet",
        live_round: 1,
        rounds: Array.from({ length: 13 }, (_, index) =>
          round(index + 1, true, true),
        ),
      }),
    );

    expect(body().textContent).toContain(
      "The map isn't live again yet. Once it is, any earlier round can be restored until round 1 is over.",
    );
    expect(button("Restore to Round")).toBeUndefined();
  });

  it("picks nothing after a map restart, so undoing it is a choice", async () => {
    await mountRestore(
      restoreRounds({
        live_round: 1,
        rounds: Array.from({ length: 13 }, (_, index) =>
          round(index + 1, true, true),
        ),
      }),
    );

    expect(body().textContent).toContain("Undone, can still be brought back");
    expect(button("Restore to Round")!.disabled).toBe(true);
  });

  it("waits for a missing player instead of sending the restore", async () => {
    await mountRestore(
      restoreRounds({ connected_players: 9, disconnected: ["osk"] }),
    );

    expect(body().textContent).toContain(
      "Waiting for players to reconnect (9/10). Not connected: osk.",
    );
    expect(button("Replay Round 14")!.disabled).toBe(true);
  });

  it("doesn't wait for a benched substitute once enough players are in", async () => {
    await mountRestore(restoreRounds({ disconnected: ["bench"] }));

    expect(body().textContent).not.toContain("Waiting for players");
    expect(button("Replay Round 14")!.disabled).toBe(false);
  });

  it("tells an organizer on one of the teams to ask someone else", async () => {
    await mountRestore(
      restoreRounds({ blocked_reason: "team_member", economy_hidden: true }),
    );

    expect(body().textContent).toContain(
      "You're on one of the teams, so another organizer has to restore rounds.",
    );
    expect(button("Replay Round")).toBeUndefined();
  });

  it("says why there is nothing to restore in a Rush match", async () => {
    await mountRestore(
      restoreRounds({ blocked_reason: "rush", restorable: false, rounds: [] }),
    );

    expect(body().textContent).toContain("Rush matches can't restore rounds.");
    expect(button("Replay Round")).toBeUndefined();
  });
});

// The Options blocks of the real components, imports stripped and the
// identifiers they use supplied (as match-actions-render-subscription does).
function optionsOf(file: string, names: Record<string, unknown>) {
  const source = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  const script = parse(source).descriptor.script!.content;
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

const toast = vi.fn();
const actions = optionsOf("components/match/MatchActions.vue", {
  useAuthStore: () => ({ isRoleAbove: () => false, me: null }),
  e_player_roles_enum,
  e_match_status_enum,
  e_match_map_status_enum,
  generateSubscription: () => ({}),
  generateMutation: () => ({}),
  gql: (strings: TemplateStringsArray) => strings.join(""),
  toast,
  socket: { on: vi.fn(), removeListener: vi.fn() },
  uuidv4: () => "uuid",
  useGpuPoolStatusStore: () => ({}),
  useStreamerStore: () => ({}),
  useApplicationSettingsStore: () => ({ settings: [] }),
  cameraAdminGridUrl: () => "",
});

const maps = optionsOf("components/match/MatchMaps.vue", {
  e_match_status_enum,
  generateMutation: () => ({}),
  toast,
});

function actionsFor(m: Record<string, any>) {
  const ctx: any = { match: m };
  for (const name of ["currentMap", "canRestoreRound", "canRestartMap"]) {
    Object.defineProperty(ctx, name, {
      get: () => actions.computed[name].call(ctx),
    });
  }
  return ctx;
}

const onMap = (status: string, overrides: Record<string, any> = {}) =>
  match({
    match_maps: [{ id: "map-1", is_current_map: true, status }],
    ...overrides,
  });

describe("match menu", () => {
  it.each(["Warmup", "Live", "Overtime", "Paused"])(
    "offers Restore Round and Restart Map while the map is %s",
    (status) => {
      const ctx = actionsFor(onMap(status));
      expect(ctx.canRestoreRound).toBe(true);
      expect(ctx.canRestartMap).toBe(true);
    },
  );

  it("offers to start the map over from the knife round, not a restore", () => {
    const ctx = actionsFor(onMap("Knife"));
    expect(ctx.canRestoreRound).toBe(false);
    expect(ctx.canRestartMap).toBe(true);
  });

  it.each(["WaitingForTV", "UploadingDemo", "Finished", "Scheduled"])(
    "offers neither once the map is %s",
    (status) => {
      const ctx = actionsFor(onMap(status));
      expect(ctx.canRestoreRound).toBe(false);
      expect(ctx.canRestartMap).toBe(false);
    },
  );

  it("offers neither to someone who doesn't organize the match", () => {
    const ctx = actionsFor(onMap("Live", { is_organizer: false }));
    expect(ctx.canRestoreRound).toBe(false);
    expect(ctx.canRestartMap).toBe(false);
  });

  it.each(["Veto", "WaitingForServer", "Finished", "Canceled"])(
    "offers neither for a %s match",
    (status) => {
      const ctx = actionsFor(onMap("Live", { status }));
      expect(ctx.canRestoreRound).toBe(false);
      expect(ctx.canRestartMap).toBe(false);
    },
  );

  it("never offers Restart Match: the api action waits for the server stop fix", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../components/match/MatchActions.vue"),
      "utf8",
    );
    expect(source).not.toMatch(/restartMatch\(/);
  });

  it("restarts the map from warmup through the api", async () => {
    const apolloMutate = vi.fn().mockResolvedValue({ data: {} });
    const ctx: any = {
      match: match(),
      $apollo: { mutate: apolloMutate },
      $t: (key: string) => key,
    };
    await actions.methods.restartMatchMap.call(ctx);

    expect(apolloMutate.mock.calls[0][0].mutation).toContain(
      "restartMatchMap(match_id: $matchId)",
    );
    expect(apolloMutate.mock.calls[0][0].variables).toEqual({
      matchId: "m-1",
    });
    expect(toast).toHaveBeenLastCalledWith({
      title: "match.recovery.restart_map.restarted",
    });
  });

  it("shows why the server refused a map restart", async () => {
    const ctx: any = {
      match: match(),
      $apollo: {
        mutate: vi.fn().mockRejectedValue(new Error("the map is already over")),
      },
      $t: (key: string) => key,
    };
    await actions.methods.restartMatchMap.call(ctx);

    expect(toast).toHaveBeenLastCalledWith({
      title: "match.recovery.restart_map.failed",
      description: "the map is already over",
      variant: "destructive",
    });
  });
});

describe("map card", () => {
  const canRestore = (m: Record<string, any>, matchMap: Record<string, any>) =>
    maps.computed.canRestoreRound.call({ match: m, matchMap });

  it("shows Restore Round on the map being played", () => {
    expect(
      canRestore(match(), { is_current_map: true, status: "Live" }),
    ).toBe(true);
  });

  it("leaves it off other maps and finished maps", () => {
    expect(
      canRestore(match(), { is_current_map: false, status: "Live" }),
    ).toBe(false);
    expect(
      canRestore(match(), { is_current_map: true, status: "Finished" }),
    ).toBe(false);
  });
});
