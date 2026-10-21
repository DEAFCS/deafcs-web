// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { print } from "graphql";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import { e_sides_enum } from "../../generated/zeus";
import MatchAdminDockActions from "../../components/match/MatchAdminDockActions.vue";
import MatchVetoFixDialog from "../../components/match/veto/MatchVetoFixDialog.vue";
import {
  fixProblemItems,
  type FixProblemState,
} from "../../utilities/fixProblem";
import {
  currentMatchAdminStep,
  matchAdminSteps,
} from "../../utilities/matchAdminSteps";
import type { VetoStep } from "../../utilities/rewind";

// The admin dock's Veto Recovery and step-aware fixes (5Stack WEB 681116a
// #908). The dialog cases are upstream's MatchVetoFixDialog.spec.ts, mounted
// with plain Vitest instead of mountSuspended.

const { toastSpy, role } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  role: { value: "moderator" },
}));
vi.mock("@/components/ui/toast", () => ({ toast: toastSpy }));
vi.mock("~/stores/AuthStore", () => {
  const ROLES = [
    "user",
    "verified_user",
    "streamer",
    "moderator",
    "match_organizer",
    "tournament_organizer",
    "administrator",
  ];
  return {
    useAuthStore: () => ({
      isRoleAbove: (needed: string) =>
        ROLES.indexOf(role.value) >= ROLES.indexOf(needed),
    }),
  };
});

const i18n = createI18n<Record<string, unknown>, "en">({
  legacy: false,
  locale: "en",
  messages: { en },
});
const t = i18n.global.t as unknown as (
  key: string,
  values?: Record<string, unknown>,
) => string;

// upstream's DEMO_VETO (utilities/demoMatch.ts): a best of three.
const DEMO_VETO: VetoStep[] = [
  { step: 1, type: "Ban", lineup: 1, map: "de_nuke" },
  { step: 2, type: "Ban", lineup: 2, map: "de_vertigo" },
  { step: 3, type: "Pick", lineup: 1, map: "de_mirage" },
  { step: 4, type: "Side", lineup: 2, map: "de_mirage", side: e_sides_enum.CT },
  { step: 5, type: "Pick", lineup: 2, map: "de_ancient" },
  {
    step: 6,
    type: "Side",
    lineup: 1,
    map: "de_ancient",
    side: e_sides_enum.TERRORIST,
  },
  { step: 7, type: "Ban", lineup: 2, map: "de_anubis" },
  { step: 8, type: "Ban", lineup: 1, map: "de_inferno" },
  { step: 9, type: "Decider", lineup: null, map: "de_dust2" },
];

let mutate: ReturnType<typeof vi.fn>;
let picks: Array<any>;
let wrapper: ReturnType<typeof mount> | undefined;

const body = () => document.body;
const button = (text: string) =>
  Array.from(body().querySelectorAll("button")).find((element) =>
    element.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement | undefined;
const sent = () =>
  mutate.mock.calls.map(([{ mutation, variables }]) => ({
    name: print(mutation).match(/mutation (\w+)/)?.[1],
    variables,
  }));

beforeEach(() => {
  role.value = "moderator";
  picks = [];
  mutate = vi.fn().mockResolvedValue({ data: {} });
  vi.stubGlobal("useNuxtApp", () => ({
    $apollo: {
      defaultClient: {
        mutate,
        subscribe: () => ({
          subscribe: ({ next }: { next: (value: unknown) => void }) => {
            next({ data: { match_map_veto_picks: picks } });
            return { unsubscribe: vi.fn() };
          },
        }),
      },
    },
  }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const pick = (type: string, lineup: string, map: string) => ({
  id: `${type}-${map}`,
  type,
  side: null,
  match_lineup_id: lineup,
  auto_picked: false,
  map: { id: map, name: `de_${map}`, label: null },
});

function vetoMatch(overrides: Record<string, any> = {}) {
  return {
    id: "m-1",
    status: "Veto",
    is_organizer: true,
    is_in_lineup: false,
    is_server_online: false,
    lineup_1_id: "l-1",
    lineup_2_id: "l-2",
    lineup_1: { id: "l-1", name: "Kestrel" },
    lineup_2: { id: "l-2", name: "Ironside" },
    map_veto_picking_lineup_id: "l-1",
    map_veto_pick_expires_at: new Date(Date.now() + 20_000).toISOString(),
    map_veto_sequence: [
      { index: 0, type: "Ban", team: 1 },
      { index: 1, type: "Ban", team: 2 },
      { index: 2, type: "Pick", team: 1 },
    ],
    options: {
      type: "Competitive",
      map_veto: true,
      best_of: 3,
      map_pool: {
        maps: [
          { id: "nuke", name: "de_nuke" },
          { id: "vertigo", name: "de_vertigo" },
        ],
      },
    },
    match_maps: [],
    ...overrides,
  };
}

async function mountDock(match = vetoMatch()) {
  wrapper = mount(MatchAdminDockActions, {
    props: { match },
    global: { plugins: [i18n], stubs: { transition: false } },
    attachTo: body(),
  });
  await flushPromises();
}

async function choose(title: string) {
  button(t("match.recovery.fix.title"))!.click();
  await flushPromises();
  button(title)!.click();
  await flushPromises();
}

const state = (overrides: Partial<FixProblemState> = {}): FixProblemState => ({
  status: "Veto",
  stepLabel: "Veto",
  currentMapStatus: null,
  mapsStarted: false,
  rush: false,
  mapVeto: true,
  vetoPicks: 2,
  vetoTeam: "Kestrel",
  vetoClockRunning: true,
  lastPick: { team: "Ironside", map: "Vertigo" },
  canControl: true,
  canRestartMatch: false,
  ...overrides,
});

const keys = (overrides: Partial<FixProblemState> = {}) => {
  const menu = fixProblemItems(t, state(overrides));
  return [...menu.now, ...menu.anytime].map((item) => item.key);
};

describe("Fix a Problem in the admin dock", () => {
  it("offers the four veto fixes during the veto", () => {
    expect(keys()).toEqual(["undo_last", "mispick", "redo", "time"]);
  });

  it("drops Give 30s More when no clock runs, and Undo before a step is taken", () => {
    expect(keys({ vetoClockRunning: false })).toEqual([
      "undo_last",
      "mispick",
      "redo",
    ]);
    expect(keys({ vetoPicks: 0, lastPick: null })).toEqual(["time"]);
  });

  it("still fixes a finished veto until the first map starts", () => {
    expect(
      keys({ status: "Live", currentMapStatus: "Scheduled", vetoTeam: null }),
    ).toEqual(["mispick", "redo"]);
    expect(
      keys({
        status: "Live",
        currentMapStatus: "Live",
        mapsStarted: true,
        vetoTeam: null,
      }),
    ).toEqual(["restore", "restart_map"]);
  });

  it("offers nothing to an organizer the api would refuse", () => {
    expect(keys({ canControl: false })).toEqual([]);
    expect(
      keys({
        canControl: false,
        status: "Live",
        currentMapStatus: "Live",
        mapsStarted: true,
      }),
    ).toEqual([]);
  });

  it("keeps Restart Match out until its branch turns it on, and then for Live only", () => {
    const live = {
      status: "Live",
      currentMapStatus: "Live",
      mapsStarted: true,
    };
    expect(keys(live)).not.toContain("restart");
    expect(keys({ ...live, canRestartMatch: true })).toContain("restart");
    expect(keys({ canRestartMatch: true })).not.toContain("restart");
  });

  it("has no fixes on a finished match (they stay in the ... menu)", () => {
    expect(keys({ status: "Finished", vetoPicks: 9 })).toEqual([]);
  });
});

describe("the dock's steps", () => {
  it("shows Captain Pick only while the captains pick", () => {
    const picking = { status: "PickingPlayers", options: { map_veto: true } };
    expect(matchAdminSteps(picking)).toEqual([
      "captain_pick",
      "check_in",
      "veto",
      "warmup",
      "live",
      "finished",
    ]);
    expect(currentMatchAdminStep(picking)).toBe("captain_pick");
    expect(
      matchAdminSteps({ status: "Veto", options: { map_veto: true } }),
    ).not.toContain("captain_pick");
  });
});

describe("Veto Recovery from the dock", () => {
  it("undoes the last step after a confirm, telling the api how many picks it saw", async () => {
    picks = [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")];
    await mountDock();

    await choose(t("match.fix_menu.undo_last_title"));
    expect(body().textContent).toContain(
      "Takes back Ironside's choice of Vertigo, and they choose again.",
    );
    (
      body().querySelector('[data-testid="dock-undo-confirm"]') as HTMLElement
    ).click();
    await flushPromises();

    expect(sent()).toEqual([
      {
        name: "RewindMapVeto",
        variables: { matchId: "m-1", step: 2, expected: 2 },
      },
    ]);
  });

  it("gives the team on the clock 30 more seconds", async () => {
    picks = [pick("Ban", "l-1", "nuke")];
    await mountDock();

    await choose(t("match.fix_menu.time_title"));

    expect(sent()).toEqual([
      { name: "ExtendVetoClock", variables: { matchId: "m-1", seconds: 30 } },
    ]);
    expect(toastSpy).toHaveBeenCalledWith({
      title: "30 seconds added to the veto clock",
    });
  });

  it("opens Redo the Veto on the first step", async () => {
    picks = [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")];
    await mountDock();

    await choose(t("match.fix_menu.redo_title"));
    expect(body().textContent).toContain("Rewind to Step 1");
    button("Rewind the Veto")!.click();
    await flushPromises();

    expect(sent()).toEqual([
      {
        name: "RewindMapVeto",
        variables: { matchId: "m-1", step: 1, expected: 2 },
      },
    ]);
  });

  it("hides the veto fixes from a player organizing below match_organizer", async () => {
    role.value = "moderator";
    picks = [pick("Ban", "l-1", "nuke")];
    await mountDock(vetoMatch({ is_in_lineup: true }));

    expect(button(t("match.recovery.fix.title"))).toBeUndefined();

    wrapper!.unmount();
    role.value = "match_organizer";
    await mountDock(vetoMatch({ is_in_lineup: true }));
    expect(button(t("match.recovery.fix.title"))).toBeDefined();
  });

  it("shows Pause on a live map and sends setMatchPaused", async () => {
    await mountDock(
      vetoMatch({
        status: "Live",
        is_server_online: true,
        match_maps: [{ id: "map-1", is_current_map: true, status: "Live" }],
      }),
    );

    (body().querySelector('[data-testid="dock-pause"]') as HTMLElement).click();
    await flushPromises();

    expect(sent()).toEqual([
      {
        name: "SetMatchPaused",
        variables: { match_id: "m-1", paused: true },
      },
    ]);
  });
});

describe("Fix the Veto", () => {
  async function mountDialog(props: Record<string, unknown>) {
    wrapper = mount(MatchVetoFixDialog, {
      props: {
        open: true,
        steps: DEMO_VETO,
        lineup1: "Kestrel",
        lineup2: "Ironside",
        ...props,
      },
      global: { plugins: [i18n], stubs: { transition: false } },
      attachTo: body(),
    });
    await flushPromises();
  }

  it("rewinds from the step the organizer clicks", async () => {
    await mountDialog({ done: 4, initialStep: 4, bestOf: 3 });

    expect(body().textContent).toContain("Veto · Best of 3");
    expect(body().textContent).toContain(
      "Rewind to Step 4 · Ironside Chooses a Side Again",
    );

    (
      body().querySelector(
        'button[aria-label="Rewind to step 3"]',
      ) as HTMLElement
    ).click();
    await flushPromises();

    expect(body().textContent).toContain(
      "Rewind to Step 3 · Kestrel Picks Again",
    );
    expect(body().textContent).toContain(
      "Clears Kestrel's pick of Mirage, Ironside's side on Mirage.",
    );

    button("Rewind the Veto")!.click();
    expect(wrapper!.emitted("confirm")?.at(-1)).toEqual([3]);
  });

  it("starts a finished veto at the last ban, since nobody chose the Decider", async () => {
    await mountDialog({ done: 9, initialStep: 9, bestOf: 5 });

    expect(body().textContent).toContain("Veto · Best of 5");
    expect(body().textContent).toContain("Rewind to Step 8");
    expect(
      (
        body().querySelector(
          'button[aria-label="Rewind to step 9"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("can't rewind a step that hasn't been taken", async () => {
    await mountDialog({ done: 4, initialStep: 9, bestOf: 5 });

    expect(body().textContent).toContain("Rewind to Step 4");
    expect(
      (
        body().querySelector(
          'button[aria-label="Rewind to step 6"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
