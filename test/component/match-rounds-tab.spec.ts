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
import MatchRoundsTab from "../../components/match/rounds/MatchRoundsTab.vue";

// DEAFCS Rounds tab: organizers restore by clicking a round. It opens the
// Restore Round dialog (5stackgg/web #895, #900) on the clicked round, so the
// request is the dialog's own (backup of the round before), and the rows that
// can be clicked follow the dialog's rules.

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: toastSpy }));

let mutate: ReturnType<typeof vi.fn>;
let query: ReturnType<typeof vi.fn>;
let wrapper: ReturnType<typeof mount> | undefined;

const i18n = createI18n<Record<string, unknown>, "en">({
  legacy: false,
  locale: "en",
  messages: { en },
});

const match = (overrides: Record<string, any> = {}) => ({
  id: "m-1",
  status: "Live",
  is_organizer: true,
  options: { type: "Competitive", mr: 12 },
  match_maps: [{ id: "map-1", is_current_map: true, status: "Live" }],
  lineup_1: { id: "l-1", name: "Kestrel" },
  lineup_2: { id: "l-2", name: "Riptide" },
  ...overrides,
});

function round(number: number, undone = false, backup = true) {
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
    players: [],
  };
}

function rounds(overrides: Record<string, any> = {}) {
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
const text = () => body().textContent ?? "";

function rowButton(label: string) {
  return Array.from(body().querySelectorAll("li > button")).find((element) =>
    element.textContent?.trim().startsWith(label),
  ) as HTMLButtonElement | undefined;
}

function button(label: string) {
  return Array.from(body().querySelectorAll("button")).find((element) =>
    element.textContent?.trim().startsWith(label),
  ) as HTMLButtonElement | undefined;
}

async function mountTab(data = rounds()) {
  query.mockResolvedValue(data);
  wrapper = mount(MatchRoundsTab, {
    props: { match: match(), canRestartMap: true },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
  await flushPromises();
}

const sent = () =>
  mutate.mock.calls.map(([{ mutation, variables }]) => ({
    document: print(mutation),
    variables,
  }));

beforeEach(() => {
  mutate = vi.fn().mockResolvedValue({ data: {} });
  query = vi.fn().mockResolvedValue(rounds());
  vi.stubGlobal("useNuxtApp", () => ({
    $apollo: { defaultClient: { query, mutate } },
  }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rounds tab", () => {
  it("reads the rounds from the api", async () => {
    await mountTab();

    expect(print(query.mock.calls[0][0].query)).toContain(
      "getMatchRestoreRounds",
    );
    expect(query.mock.calls[0][0].variables).toEqual({ matchId: "m-1" });
    expect(text()).toContain("live round 14");
  });

  it("lists the played rounds with their winner, and the live round", async () => {
    await mountTab();

    expect(rowButton("Round 5")!.textContent).toContain("Kestrel");
    expect(rowButton("Round 5")!.textContent).toContain("CTs Eliminated Ts");
    expect(rowButton("Round 14")!.textContent).toContain("Now");
    expect(rowButton("Round 14")!.textContent).toContain(
      "Replay round 14 from the start",
    );
  });

  it("can't go back to round 1, which has no backup before it", async () => {
    await mountTab();

    expect(rowButton("Round 1")!.disabled).toBe(true);
    expect(rowButton("Round 1")!.textContent).toContain(
      "Round 1 has no backup",
    );
    expect(rowButton("Round 2")!.disabled).toBe(false);
  });

  it("opens Restore Round on the clicked round and restores from the backup before it", async () => {
    await mountTab();

    rowButton("Round 12")!.click();
    await flushPromises();

    expect(text()).toContain("Back to the start of round 12");
    button("Restore to Round 12")!.click();
    await flushPromises();

    expect(sent()[0].document).toContain("restoreMatchRound");
    expect(sent()[0].variables).toEqual({ matchId: "m-1", round: 11 });
  });

  it("brings back a round a restore undid", async () => {
    await mountTab(
      rounds({
        live_round: 12,
        rounds: Array.from({ length: 13 }, (_, index) =>
          round(index + 1, index + 1 >= 12),
        ),
      }),
    );

    expect(text()).toContain("Undone rounds");
    expect(rowButton("Round 12")!.textContent).toContain("Now");
    const undone = Array.from(
      body().querySelectorAll("section li > button"),
    ) as HTMLButtonElement[];
    expect(
      undone.map((element) => element.textContent?.trim().slice(0, 8)),
    ).toEqual(["Round 12", "Round 13"]);

    undone[0].click();
    await flushPromises();
    expect(text()).toContain("Forward to the start of round 13");
    button("Restore to Round 13")!.click();
    await flushPromises();

    expect(sent()[0].variables).toEqual({ matchId: "m-1", round: 12 });
  });

  it("says why nothing can be restored and offers no round", async () => {
    await mountTab(rounds({ blocked_reason: "team_member" }));

    expect(text()).toContain("another organizer has to restore rounds");
    expect(rowButton("Round 12")!.disabled).toBe(true);
    expect(rowButton("Round 14")!.disabled).toBe(true);
  });

  it("waits for the map to go live again after a restart", async () => {
    await mountTab(rounds({ blocked_reason: "not_live_yet", live_round: 1 }));

    expect(text()).toContain("The map isn't live again yet");
  });

  it("shows who still has to reconnect", async () => {
    await mountTab(rounds({ connected_players: 9, disconnected: ["osk"] }));

    expect(text()).toContain("Waiting for players to reconnect (9/10)");
    expect(text()).toContain("osk");
  });
});

// The Options block of MatchTabs, imports stripped (as match-recovery.spec).
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

describe("who sees the Rounds tab", () => {
  const tabs = optionsOf("components/match/MatchTabs.vue", {
    generateSubscription: () => ({}),
    generateQuery: () => ({}),
    $: () => "",
    matchAllMapsStats: {},
    CAPTAIN_PICK_LINEUP_LOCK: Symbol("captain-pick-lock"),
  });

  function canSeeRounds(m: Record<string, any>) {
    const ctx: any = { match: m };
    Object.defineProperty(ctx, "currentMap", {
      get: () => tabs.computed.currentMap.call(ctx),
    });
    return tabs.computed.canSeeRounds.call(ctx);
  }

  const onMap = (status: string, overrides: Record<string, any> = {}) =>
    match({
      match_maps: [{ id: "map-1", is_current_map: true, status }],
      ...overrides,
    });

  it.each(["Warmup", "Knife", "Live", "Overtime", "Paused"])(
    "an organizer sees it while the map is %s",
    (status) => {
      expect(canSeeRounds(onMap(status))).toBe(true);
    },
  );

  it.each(["WaitingForTV", "UploadingDemo", "Finished", "Scheduled"])(
    "not once the map is %s",
    (status) => {
      expect(canSeeRounds(onMap(status))).toBe(false);
    },
  );

  it("not someone who doesn't organize the match", () => {
    expect(canSeeRounds(onMap("Live", { is_organizer: false }))).toBe(false);
  });

  it("not in a Rush match", () => {
    expect(
      canSeeRounds(onMap("Live", { options: { type: "Rush", mr: 12 } })),
    ).toBe(false);
  });

  it.each(["Veto", "WaitingForServer", "Finished", "Canceled"])(
    "not for a %s match",
    (status) => {
      expect(canSeeRounds(onMap("Live", { status }))).toBe(false);
    },
  );
});

describe("Restart Match stays off", () => {
  it.each([
    "components/match/rounds/MatchRoundsTab.vue",
    "components/match/MatchRestartMapDialog.vue",
    "components/match/MatchTabs.vue",
  ])("%s never asks for restartMatch", (file) => {
    const source = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(source).not.toMatch(/restartMatch\b(?!Map)/);
  });
});
