// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { readFileSync } from "node:fs";
import path from "node:path";
import { print } from "graphql";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";
import MatchPreMatchRecoveryDialogs from "../../components/match/MatchPreMatchRecoveryDialogs.vue";
import MatchPreMatchRecoveryMenuItems from "../../components/match/MatchPreMatchRecoveryMenuItems.vue";
import {
  canRunPreMatchRecovery,
  captainPickPicks,
  captainPickResettable,
  vetoResettable,
} from "../../utilities/preMatchRecovery";
import {
  currentMatchAdminStep,
  matchAdminSteps,
} from "../../utilities/matchAdminSteps";

// DEAFCS: the only pre-match recovery, Reset Veto (upstream 5Stack's Redo the
// Veto, rewindMapVeto at step 1) and Reset Captain Pick, in the match's "..."
// menu for staff; and the administrator-only Admin Dock.

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

// The public Captain Pick progress feed (EventSource).
class FakeEventSource {
  static opened: Array<FakeEventSource> = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.opened.push(this);
  }
  send(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

let mutate: ReturnType<typeof vi.fn>;
let subscribed: number;
let vetoPicks: number;
let wrapper: ReturnType<typeof mount> | undefined;

const body = () => document.body;
const sent = () =>
  mutate.mock.calls.map(([{ mutation, variables }]) => ({
    name: print(mutation).match(/mutation (\w+)/)?.[1],
    field: print(mutation).match(/\{\s*(\w+)\(/)?.[1],
    step: print(mutation).match(/step: (\d+)/)?.[1],
    variables,
  }));

beforeEach(() => {
  viewer.role = "match_organizer";
  vetoPicks = 2;
  subscribed = 0;
  FakeEventSource.opened = [];
  mutate = vi.fn().mockResolvedValue({ data: {} });
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.test" },
  }));
  vi.stubGlobal("useNuxtApp", () => ({
    $apollo: {
      defaultClient: {
        mutate,
        subscribe: () => ({
          subscribe: ({ next }: { next: (value: unknown) => void }) => {
            subscribed += 1;
            next({
              data: {
                match_map_veto_picks: Array.from(
                  { length: vetoPicks },
                  (_, i) => ({ id: `pick-${i}` }),
                ),
              },
            });
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

function vetoMatch(overrides: Record<string, any> = {}) {
  return {
    id: "m-1",
    status: "Veto",
    is_organizer: true,
    is_tournament_match: false,
    options: { type: "Competitive", map_veto: true, best_of: 3 },
    match_maps: [],
    ...overrides,
  };
}

const pickingMatch = (overrides: Record<string, any> = {}) =>
  vetoMatch({ status: "PickingPlayers", ...overrides });

const progress = (phase = "Drafting", picked = 3) => ({
  matchId: "m-1",
  active: true,
  completed: false,
  progress: {
    phase,
    lineups: {
      1: [
        "c1",
        ...Array.from({ length: Math.ceil(picked / 2) }, (_, i) => `a${i}`),
      ],
      2: [
        "c2",
        ...Array.from({ length: Math.floor(picked / 2) }, (_, i) => `b${i}`),
      ],
    },
  },
});

// The "..." menu: its items (a plain list here instead of the dropdown) next
// to the dialogs MatchActions keeps mounted.
const Menu = defineComponent({
  props: { match: { type: Object, required: true } },
  setup(props) {
    return () =>
      h("div", [
        h(MatchPreMatchRecoveryMenuItems, { match: props.match }),
        h(MatchPreMatchRecoveryDialogs, { match: props.match }),
      ]);
  },
});

async function mountMenu(match: Record<string, any>) {
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
      },
    },
    attachTo: body(),
  });
  await flushPromises();
}

const byTestId = (id: string) =>
  body().querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

describe("who gets them", () => {
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
    expect(
      canRunPreMatchRecovery(vetoMatch(overrides), above(role) as never),
    ).toBe(expected);
  });

  it("is the same while playing in the match", () => {
    for (const role of ["administrator", "match_organizer"]) {
      expect(
        canRunPreMatchRecovery(
          vetoMatch({ is_in_lineup: true }),
          above(role) as never,
        ),
      ).toBe(true);
    }
  });
});

describe("when each applies", () => {
  it("resets a veto with picks, until the first map starts", () => {
    expect(vetoResettable(vetoMatch(), 2)).toBe(true);
    expect(vetoResettable(vetoMatch(), 0)).toBe(false);
    expect(
      vetoResettable(
        vetoMatch({
          status: "Live",
          match_maps: [{ id: "a", is_current_map: true, status: "Scheduled" }],
        }),
        9,
      ),
    ).toBe(true);
    expect(
      vetoResettable(
        vetoMatch({
          status: "Live",
          match_maps: [{ id: "a", is_current_map: true, status: "Warmup" }],
        }),
        9,
      ),
    ).toBe(false);
    expect(vetoResettable(vetoMatch({ status: "Finished" }), 9)).toBe(false);
    expect(vetoResettable(vetoMatch({ options: { map_veto: false } }), 2)).toBe(
      false,
    );
  });

  it("resets a Captain Pick while picking with somebody picked", () => {
    expect(captainPickPicks(progress().progress)).toBe(3);
    expect(captainPickResettable(pickingMatch(), progress().progress)).toBe(
      true,
    );
    expect(
      captainPickResettable(pickingMatch(), progress("Drafting", 0).progress),
    ).toBe(false);
    expect(
      captainPickResettable(pickingMatch(), progress("CreatingMatch").progress),
    ).toBe(false);
    expect(captainPickResettable(vetoMatch(), progress().progress)).toBe(false);
    expect(captainPickResettable(pickingMatch(), null)).toBe(false);
  });
});

describe("in the ... menu", () => {
  it("resets the veto after a confirm, at step 1 with the picks staff saw", async () => {
    await mountMenu(vetoMatch());

    expect(byTestId("match-action-reset-captain-pick")).toBeNull();
    byTestId("match-action-reset-veto")!.click();
    await flushPromises();
    expect(body().textContent).toContain(
      "Every ban, pick and side choice is cleared",
    );
    byTestId("reset-veto-confirm")!.click();
    await flushPromises();

    expect(sent()).toEqual([
      {
        name: "ResetVeto",
        field: "rewindMapVeto",
        step: "1",
        variables: { matchId: "m-1", expected: 2 },
      },
    ]);
    expect(toastSpy).toHaveBeenCalledWith({ title: "Veto reset" });
  });

  it("resets the Captain Pick after a confirm, with the picks staff saw", async () => {
    await mountMenu(pickingMatch());
    expect(FakeEventSource.opened.map((source) => source.url)).toEqual([
      "https://api.test/matchmaking/captain-pick/m-1/progress",
    ]);
    expect(byTestId("match-action-reset-captain-pick")).toBeNull();

    FakeEventSource.opened[0].send(progress("Drafting", 3));
    await flushPromises();

    expect(byTestId("match-action-reset-veto")).toBeNull();
    byTestId("match-action-reset-captain-pick")!.click();
    await flushPromises();
    expect(body().textContent).toContain("The same ten players");
    byTestId("reset-captain-pick-confirm")!.click();
    await flushPromises();

    expect(sent()).toEqual([
      {
        name: "ResetCaptainPick",
        field: "resetCaptainPick",
        step: undefined,
        variables: { matchId: "m-1", expected: 3 },
      },
    ]);
    expect(toastSpy).toHaveBeenCalledWith({ title: "Captain Pick reset" });
  });

  it("drops Reset Captain Pick once the teams lock", async () => {
    await mountMenu(pickingMatch());
    FakeEventSource.opened[0].send(progress("Drafting", 3));
    await flushPromises();
    expect(byTestId("match-action-reset-captain-pick")).not.toBeNull();

    FakeEventSource.opened[0].send(progress("CreatingMatch", 8));
    await flushPromises();
    expect(byTestId("match-action-reset-captain-pick")).toBeNull();
  });

  it("does nothing on cancel", async () => {
    await mountMenu(vetoMatch());
    byTestId("match-action-reset-veto")!.click();
    await flushPromises();
    (
      Array.from(body().querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Cancel",
      ) as HTMLElement
    ).click();
    await flushPromises();

    expect(mutate).not.toHaveBeenCalled();
  });

  it("shows a failed reset", async () => {
    mutate.mockRejectedValue(new Error("The first map has already started"));
    await mountMenu(vetoMatch());
    byTestId("match-action-reset-veto")!.click();
    await flushPromises();
    byTestId("reset-veto-confirm")!.click();
    await flushPromises();

    expect(toastSpy).toHaveBeenCalledWith({
      title: "Couldn't reset the veto",
      description: "The first map has already started",
      variant: "destructive",
    });
  });

  it.each([
    ["user", {}],
    ["moderator", {}],
    ["tournament_organizer", { is_tournament_match: false }],
  ])(
    "shows nothing to a %s who organizes the match, and follows nothing",
    async (role, overrides) => {
      viewer.role = role;
      await mountMenu(vetoMatch(overrides));
      wrapper!.unmount();
      await mountMenu(pickingMatch(overrides));

      expect(
        body().querySelector('[data-testid^="match-action-reset-"]'),
      ).toBeNull();
      expect(subscribed).toBe(0);
      expect(FakeEventSource.opened).toHaveLength(0);
    },
  );

  it("shows a tournament_organizer both on its own tournament's match", async () => {
    viewer.role = "tournament_organizer";
    await mountMenu(vetoMatch({ is_tournament_match: true }));
    expect(byTestId("match-action-reset-veto")).not.toBeNull();
  });

  it("offers no Undo, Fix a Mis-pick or Give 30s More", () => {
    const sources = [
      "components/match/MatchActions.vue",
      "components/match/MatchPreMatchRecoveryMenuItems.vue",
      "components/match/MatchPreMatchRecoveryDialogs.vue",
      "utilities/preMatchRecovery.ts",
    ].map((file) =>
      readFileSync(path.resolve(__dirname, "../..", file), "utf8"),
    );
    for (const code of sources) {
      expect(code).not.toMatch(
        /extendVetoClock|undo_last|mispick|Veto Recovery/,
      );
    }
    expect(JSON.stringify(en)).not.toMatch(
      /Undo the Last Step|Fix a Mis-pick|Give 30 Seconds More/,
    );
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
      /PreMatchRecovery|rewindMapVeto|resetCaptainPick|setMatchPaused/,
    );
    const actions = source("components/match/MatchActions.vue");
    expect(actions).toContain(
      '<MatchPreMatchRecoveryMenuItems :match="match" />',
    );
    expect(actions).toContain(
      '<MatchPreMatchRecoveryDialogs :match="match" />',
    );
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
