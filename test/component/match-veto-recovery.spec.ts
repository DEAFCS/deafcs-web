// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { readFileSync } from "node:fs";
import path from "node:path";
import { print } from "graphql";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import { e_sides_enum } from "../../generated/zeus";
import MatchVetoRecoveryDialogs from "../../components/match/MatchVetoRecoveryDialogs.vue";
import MatchVetoRecoveryMenuItems from "../../components/match/MatchVetoRecoveryMenuItems.vue";
import MatchVetoFixDialog from "../../components/match/veto/MatchVetoFixDialog.vue";
import {
  canRecoverVeto,
  vetoRecoveryItems,
} from "../../utilities/vetoRecovery";
import {
  currentMatchAdminStep,
  matchAdminSteps,
} from "../../utilities/matchAdminSteps";
import type { VetoStep } from "../../utilities/rewind";

// Veto Recovery in the match's "..." menu (5Stack WEB 681116a #908, its veto
// fixes and Fix the Veto window). The dialog cases are upstream's
// MatchVetoFixDialog.spec.ts, mounted with plain Vitest instead of
// mountSuspended.

const ROLES = [
  "user",
  "verified_user",
  "streamer",
  "moderator",
  "match_organizer",
  "tournament_organizer",
  "administrator",
];
const above = (role: string) => (needed: string) =>
  ROLES.indexOf(role) >= ROLES.indexOf(needed);

const { toastSpy, viewer } = vi.hoisted(() => ({
  toastSpy: vi.fn(),
  viewer: { role: "match_organizer" },
}));
vi.mock("@/components/ui/toast", () => ({ toast: toastSpy }));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({
    isRoleAbove: (needed: string) => above(viewer.role)(needed),
  }),
}));

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
let subscribed: number;
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
  viewer.role = "match_organizer";
  picks = [];
  subscribed = 0;
  mutate = vi.fn().mockResolvedValue({ data: {} });
  vi.stubGlobal("useNuxtApp", () => ({
    $apollo: {
      defaultClient: {
        mutate,
        subscribe: () => ({
          subscribe: ({ next }: { next: (value: unknown) => void }) => {
            subscribed += 1;
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
    is_tournament_match: false,
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

// The "..." menu: its items (a plain list here instead of the dropdown) next
// to the dialogs MatchActions keeps mounted.
const Menu = defineComponent({
  props: { match: { type: Object, required: true } },
  setup(props) {
    return () =>
      h("div", [
        h(MatchVetoRecoveryMenuItems, { match: props.match }),
        h(MatchVetoRecoveryDialogs, { match: props.match }),
      ]);
  },
});

async function mountMenu(match = vetoMatch()) {
  wrapper = mount(Menu, {
    props: { match },
    global: {
      plugins: [i18n],
      stubs: {
        transition: false,
        DropdownMenuItem: {
          inheritAttrs: false,
          emits: ["click"],
          template:
            '<button type="button" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
        },
        DropdownMenuSeparator: { template: "<hr />" },
        // The "Veto Recovery" submenu, opened.
        DropdownMenuSub: { template: '<div data-stub="sub"><slot /></div>' },
        DropdownMenuSubTrigger: {
          inheritAttrs: false,
          template:
            "<div :data-testid=\"$attrs['data-testid']\"><slot /></div>",
        },
        DropdownMenuSubContent: {
          template: '<div data-stub="sub-content"><slot /></div>',
        },
      },
    },
    attachTo: body(),
  });
  await flushPromises();
}

const item = (key: string) =>
  body().querySelector(
    `[data-testid="match-action-veto-${key}"]`,
  ) as HTMLElement | null;

const keys = (match: Record<string, any>, count = 2) =>
  vetoRecoveryItems(
    t,
    match,
    [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")].slice(0, count),
  ).map((entry) => entry.key);

describe("who gets Veto Recovery", () => {
  it.each([
    ["administrator", {}, true],
    ["match_organizer", {}, true],
    ["tournament_organizer", { is_tournament_match: true }, true],
    ["tournament_organizer", { is_tournament_match: false }, false],
    [
      "tournament_organizer",
      { is_tournament_match: true, is_organizer: false },
      false,
    ],
    ["moderator", {}, false],
    ["user", {}, false],
  ])("a %s on %o: %s", (role, overrides, expected) => {
    expect(canRecoverVeto(vetoMatch(overrides), above(role) as never)).toBe(
      expected,
    );
  });

  it("is the same while playing in the match", () => {
    for (const role of ["administrator", "match_organizer"]) {
      expect(
        canRecoverVeto(vetoMatch({ is_in_lineup: true }), above(role) as never),
      ).toBe(true);
    }
  });
});

describe("which veto fixes apply", () => {
  it("offers all four during the veto", () => {
    expect(keys(vetoMatch())).toEqual(["undo_last", "mispick", "redo", "time"]);
  });

  it("drops Give 30s More without a clock, and Undo before a step", () => {
    expect(keys(vetoMatch({ map_veto_pick_expires_at: null }))).toEqual([
      "undo_last",
      "mispick",
      "redo",
    ]);
    expect(keys(vetoMatch(), 0)).toEqual(["time"]);
  });

  it("still fixes a finished veto until the first map starts", () => {
    const live = {
      status: "Live",
      map_veto_picking_lineup_id: null,
      map_veto_pick_expires_at: null,
    };
    expect(
      keys(
        vetoMatch({
          ...live,
          match_maps: [{ id: "a", is_current_map: true, status: "Scheduled" }],
        }),
      ),
    ).toEqual(["mispick", "redo"]);
    expect(
      keys(
        vetoMatch({
          ...live,
          match_maps: [{ id: "a", is_current_map: true, status: "Warmup" }],
        }),
      ),
    ).toEqual([]);
    expect(keys(vetoMatch({ ...live, status: "Finished" }))).toEqual([]);
  });
});

describe("Veto Recovery in the ... menu", () => {
  it("undoes the last step after a confirm, telling the api how many picks it saw", async () => {
    picks = [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")];
    await mountMenu();

    item("undo_last")!.click();
    await flushPromises();
    expect(body().textContent).toContain(
      "Takes back Ironside's choice of Vertigo, and they choose again.",
    );
    (
      body().querySelector('[data-testid="veto-undo-confirm"]') as HTMLElement
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
    await mountMenu();

    item("time")!.click();
    await flushPromises();

    expect(sent()).toEqual([
      { name: "ExtendVetoClock", variables: { matchId: "m-1", seconds: 30 } },
    ]);
    expect(toastSpy).toHaveBeenCalledWith({
      title: "30 seconds added to the veto clock",
    });
  });

  it("redoes the veto from the first step", async () => {
    picks = [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")];
    await mountMenu();

    item("redo")!.click();
    await flushPromises();
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

  it("opens Fix a Mis-pick on the last step taken", async () => {
    picks = [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")];
    await mountMenu();

    item("mispick")!.click();
    await flushPromises();

    expect(body().textContent).toContain("Rewind to Step 2");
  });

  it.each([
    ["user", {}],
    ["moderator", {}],
    ["tournament_organizer", { is_tournament_match: false }],
  ])(
    "shows nothing to a %s who organizes the match, and doesn't subscribe",
    async (role, overrides) => {
      viewer.role = role;
      picks = [pick("Ban", "l-1", "nuke")];
      await mountMenu(vetoMatch(overrides));

      expect(
        body().querySelector('[data-testid^="match-action-veto-"]'),
      ).toBeNull();
      expect(subscribed).toBe(0);
    },
  );

  it("shows a tournament_organizer the fixes on its own tournament's match", async () => {
    viewer.role = "tournament_organizer";
    picks = [pick("Ban", "l-1", "nuke")];
    await mountMenu(vetoMatch({ is_tournament_match: true }));

    expect(item("redo")).not.toBeNull();
  });

  it("groups the four actions under one Veto Recovery submenu", async () => {
    picks = [pick("Ban", "l-1", "nuke"), pick("Ban", "l-2", "vertigo")];
    await mountMenu();

    const trigger = item("recovery")!;
    expect(trigger.textContent?.trim()).toBe("Veto Recovery");
    const content = body().querySelector('[data-stub="sub-content"]')!;
    expect(
      Array.from(content.querySelectorAll("button")).map((entry) =>
        entry.textContent?.trim(),
      ),
    ).toEqual([
      "Undo the Last Step",
      "Fix a Mis-pick",
      "Redo the Veto",
      "Give 30 Seconds More",
    ]);
    expect(body().querySelectorAll('[data-stub="sub"]')).toHaveLength(1);
  });

  it.each([
    ["no action applies", "match_organizer", { status: "Finished" }],
    [
      "the first map has started",
      "match_organizer",
      {
        status: "Live",
        match_maps: [{ id: "a", is_current_map: true, status: "Live" }],
      },
    ],
    ["the viewer isn't staff", "user", {}],
  ])("has no Veto Recovery submenu when %s", async (_, role, overrides) => {
    viewer.role = role;
    picks = [pick("Ban", "l-1", "nuke")];
    await mountMenu(vetoMatch(overrides));

    expect(item("recovery")).toBeNull();
    expect(body().querySelector('[data-stub="sub"]')).toBeNull();
    expect(body().querySelector("hr")).toBeNull();
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

describe("the Admin Dock", () => {
  const source = (file: string) =>
    readFileSync(path.resolve(__dirname, "../..", file), "utf8");

  it("is mounted for administrators only, on the match page and in draft rooms", () => {
    for (const file of [
      "pages/matches/[id]/index.vue",
      "components/draft-games/DraftRoom.vue",
    ]) {
      const code = source(file);
      expect(code).toMatch(
        /canViewMatchAdminBar[^{]*\{?\s*(return\s*)?useAuthStore\(\)\.isRoleAbove\(e_player_roles_enum\.administrator\)/,
      );
      expect(code).toContain(
        '<MatchAdminBottomBar v-if="canViewMatchAdminBar"',
      );
    }
  });

  it("carries no recovery controls, which stay in the ... menu", () => {
    const bar = source("components/match/MatchAdminBottomBar.vue");
    expect(bar).not.toMatch(
      /VetoRecovery|rewindMapVeto|extendVetoClock|setMatchPaused/,
    );
    const actions = source("components/match/MatchActions.vue");
    expect(actions).toContain('<MatchVetoRecoveryMenuItems :match="match" />');
    expect(actions).toContain('<MatchVetoRecoveryDialogs :match="match" />');
  });

  it("shows the Captain Pick step only while the captains pick", () => {
    const picking = { status: "PickingPlayers", options: { map_veto: true } };
    expect(matchAdminSteps(picking)[0]).toBe("captain_pick");
    expect(currentMatchAdminStep(picking)).toBe("captain_pick");
    expect(
      matchAdminSteps({ status: "Veto", options: { map_veto: true } }),
    ).not.toContain("captain_pick");
  });
});
