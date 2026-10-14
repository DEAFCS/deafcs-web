import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";
import { makeDraft } from "./fixtures/captainPick";
import en from "../../i18n/locales/en.json";

// The /play matchmaking hero (PlayMatchmaking, ported from 5Stack): DEAFCS's
// four modes, its party rules, Captain Pick and the DEAFCS access states.

const mocks = vi.hoisted(() => ({
  socketEvent: vi.fn(),
  toast: vi.fn(),
  navigateTo: vi.fn(),
  openSidebar: vi.fn(),
}));

const translate = (key: string, params?: unknown) => {
  if (key === "matchmaking.captain_pick.title") {
    return en.matchmaking.captain_pick.title;
  }
  if (key.startsWith("matchmaking.match_types.") && key.endsWith(".title")) {
    const type = key.split(".")[2] as "competitive" | "wingman" | "duel";
    return en.matchmaking.match_types[type].title;
  }
  return params !== undefined ? `${key}:${JSON.stringify(params)}` : key;
};

vi.mock("~/web-sockets/Socket", () => ({
  default: { event: mocks.socketEvent },
}));
vi.mock("~/components/ui/toast", () => ({ toast: mocks.toast }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: translate }) }));
vi.mock("@vueuse/core", async () => {
  const { ref } = await import("vue");
  return {
    useNow: () => ref(new Date()),
    useMediaQuery: () => ref(false),
    useResizeObserver: () => undefined,
  };
});
vi.mock("@vue/apollo-composable", async () => {
  const { ref } = await import("vue");
  return { useSubscription: () => ({ result: ref(null) }) };
});
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    query: vi.fn().mockResolvedValue({
      data: { verification_applications: [{ status: "pending" }] },
    }),
  }),
}));
vi.mock("~/composables/useRightSidebar", () => ({
  useRightSidebar: () => ({ setRightSidebarOpen: mocks.openSidebar }),
}));
vi.mock("~/components/match/QuickMatchConnect.vue", () => ({ default: {} }));
vi.mock("~/components/match/MatchStatus.vue", () => ({ default: {} }));
vi.mock("~/components/matchmaking/MatchmakingSettingsPanel.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      setup: (_, { slots }) => () => h("span", slots.trigger?.()),
    }),
  };
});

import PlayMatchmaking from "../../components/play/PlayMatchmaking.vue";
import { clearPendingJoin } from "../../utilities/matchmakingJoinPending";

const passthrough = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup:
      (_props, { slots, attrs }) =>
      () =>
        h(tag, attrs, slots.default?.()),
  });

let matchmakingStore: any;
let settings: any;
let auth: any;
let restriction: any;
const wrappers: ReturnType<typeof mount>[] = [];

const mountHero = async () => {
  const wrapper = mount(PlayMatchmaking, {
    attachTo: document.body,
    global: {
      stubs: {
        HeightSwap: passthrough("div"),
        Fold: defineComponent({
          props: ["open"],
          setup:
            (props, { slots }) =>
            () =>
              props.open ? h("div", slots.default?.()) : null,
        }),
        Button: defineComponent({
          inheritAttrs: false,
          props: ["asChild", "disabled"],
          setup:
            (props, { slots, attrs }) =>
            () =>
              props.asChild
                ? slots.default?.()
                : h("button", { ...attrs, disabled: props.disabled }, slots.default?.()),
        }),
        NuxtLink: defineComponent({
          props: ["to"],
          setup:
            (props, { slots }) =>
            () =>
              h(
                "a",
                {
                  href:
                    typeof props.to === "string"
                      ? props.to
                      : JSON.stringify(props.to),
                },
                slots.default?.(),
              ),
        }),
        SteamIcon: true,
      },
      mocks: { $t: translate },
    },
  });
  await flushPromises();
  wrappers.push(wrapper);
  return wrapper;
};

const tiles = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[role="radio"]');
const tile = (wrapper: ReturnType<typeof mount>, key: string) =>
  wrapper.get(`[role="radio"][data-mode-key="${key}"]`);
const findMatch = (wrapper: ReturnType<typeof mount>) =>
  wrapper.get("[data-find-match]");

async function queue(wrapper: ReturnType<typeof mount>, key: string) {
  await tile(wrapper, key).trigger("click");
  await findMatch(wrapper).trigger("click");
}

beforeEach(() => {
  clearPendingJoin();
  mocks.socketEvent.mockClear();
  mocks.toast.mockClear();
  mocks.navigateTo.mockClear();
  window.localStorage.clear();

  matchmakingStore = reactive({
    joinedMatchmakingQueues: { details: undefined, confirmation: undefined },
    regionStats: {},
    preferredRegions: [{ value: "EU", description: "Europe" }],
    currentLobby: undefined,
    playersOnline: [],
    playerMaxAcceptableLatency: 80,
    getRegionlatencyResult: () => ({ latency: "21.40" }),
  });
  settings = reactive({
    isMatchmakingTypeEnabled: () => true,
    captainPickEnabled: true,
    maxCompetitivePartySize: 5,
    availableRegions: [{ value: "EU", description: "Europe", has_node: true }],
    matchmakingEnabled: true,
    matchmakingRoleAllowed: true,
  });
  auth = reactive({
    me: { steam_id: "2", is_banned: false, matchmaking_cooldown: null },
  });
  restriction = reactive({ isRestricted: false });

  vi.stubGlobal("useMatchmakingStore", () => matchmakingStore);
  vi.stubGlobal("useApplicationSettingsStore", () => settings);
  vi.stubGlobal("useWebsiteRestrictionStore", () => restriction);
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("navigateTo", mocks.navigateTo);
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe("/play matchmaking hero", () => {
  it("shows Captain Pick, Competitive, Wingman and Duel in that order", async () => {
    const wrapper = await mountHero();

    expect(tiles(wrapper).map((t) => t.attributes("data-mode-key"))).toEqual([
      "CompetitiveCaptainPick",
      "Competitive",
      "Wingman",
      "Duel",
    ]);
    const text = tiles(wrapper).map((t) => t.text());
    expect(text[0]).toContain("Captain Pick");
    expect(text[0]).toContain("matchmaking.captain_pick.description");
    expect(text[1]).toContain("Competitive");
    expect(text[2]).toContain("Wingman");
    expect(text[3]).toContain("Duel");
    expect(wrapper.text()).not.toContain("Rush");
  });

  it("gives each mode its own color, and marks the pick with a check, not color alone", async () => {
    const wrapper = await mountHero();
    const style = (key: string) => tile(wrapper, key).attributes("style");
    expect(style("CompetitiveCaptainPick")).toContain("--mode-rgb: 250 204 21");
    expect(style("Competitive")).toContain("--mode-rgb: 249 158 47");
    expect(style("Wingman")).toContain("--mode-rgb: 217 70 239");
    expect(style("Duel")).toContain("--mode-rgb: 34 211 238");

    await tile(wrapper, "Wingman").trigger("click");
    expect(tile(wrapper, "Wingman").attributes("aria-checked")).toBe("true");
    expect(tile(wrapper, "Wingman").find("[data-tile-checked]").exists()).toBe(
      true,
    );
    expect(tile(wrapper, "Duel").attributes("aria-checked")).toBe("false");
  });

  it("hides Captain Pick while its switch is off", async () => {
    settings.captainPickEnabled = false;
    const wrapper = await mountHero();

    expect(tiles(wrapper)).toHaveLength(3);
    expect(wrapper.text()).not.toContain("Captain Pick");
  });

  it("nothing is queued until a mode is picked", async () => {
    const wrapper = await mountHero();
    expect(findMatch(wrapper).attributes("disabled")).toBeDefined();
  });

  it("joins Standard 5v5 with exactly the old payload", async () => {
    const wrapper = await mountHero();
    await queue(wrapper, "Competitive");

    expect(mocks.socketEvent).toHaveBeenCalledWith("matchmaking:join-queue", {
      type: "Competitive",
      regions: ["EU"],
    });
  });

  it("joins Captain Pick as Competitive with the CaptainPick variant", async () => {
    const wrapper = await mountHero();
    await queue(wrapper, "CompetitiveCaptainPick");

    expect(mocks.socketEvent).toHaveBeenCalledWith("matchmaking:join-queue", {
      type: "Competitive",
      regions: ["EU"],
      variant: "CaptainPick",
    });
  });

  it("leaves 2v2 and 1v1 unchanged", async () => {
    const wrapper = await mountHero();
    await queue(wrapper, "Wingman");
    clearPendingJoin(); // the server answered the first join
    await queue(wrapper, "Duel");

    expect(mocks.socketEvent.mock.calls).toEqual([
      ["matchmaking:join-queue", { type: "Wingman", regions: ["EU"] }],
      ["matchmaking:join-queue", { type: "Duel", regions: ["EU"] }],
    ]);
  });

  it("makes Captain Pick and Duel unavailable to a party of two, without touching 5v5 rules", async () => {
    matchmakingStore.currentLobby = {
      players: [
        { status: "Accepted", captain: true, player: { steam_id: "2" } },
        { status: "Accepted", captain: false, player: { steam_id: "3" } },
      ],
    };
    const wrapper = await mountHero();

    const captainPick = tile(wrapper, "CompetitiveCaptainPick");
    expect(captainPick.attributes("aria-disabled")).toBe("true");
    expect(captainPick.text()).toContain("matchmaking.captain_pick.solo_only");
    expect(tile(wrapper, "Duel").text()).toContain(
      "matchmaking.party_size.duel_requirement",
    );
    expect(tile(wrapper, "Competitive").attributes("aria-disabled")).toBeUndefined();

    await captainPick.trigger("click");
    expect(captainPick.attributes("aria-checked")).toBe("false");
    await queue(wrapper, "Competitive");
    expect(mocks.socketEvent.mock.calls).toEqual([
      ["matchmaking:join-queue", { type: "Competitive", regions: ["EU"] }],
    ]);
  });

  it("keeps the admin Competitive party cap", async () => {
    settings.maxCompetitivePartySize = 2;
    matchmakingStore.currentLobby = {
      players: ["2", "3", "4"].map((id, index) => ({
        status: "Accepted",
        captain: index === 0,
        player: { steam_id: id },
      })),
    };
    const wrapper = await mountHero();
    expect(tile(wrapper, "Competitive").attributes("aria-disabled")).toBe("true");
    expect(tile(wrapper, "Competitive").text()).toContain(
      'matchmaking.party_size.requirement:{"half":2}',
    );
  });

  it("shows each tile's own queue count", async () => {
    matchmakingStore.regionStats = {
      EU: {
        Competitive: [{ index: 0, size: 6 }],
        CompetitiveCaptainPick: [
          { index: 0, size: 1 },
          { index: 1, size: 1 },
        ],
        Wingman: [{ index: 0, size: 2 }],
        Duel: [{ index: 0, size: 1 }],
      },
    };
    const wrapper = await mountHero();

    const [captainPick, standard, wingman, duel] = tiles(wrapper).map((t) =>
      t.text(),
    );
    expect(standard).toContain("6 matchmaking.in_queue");
    expect(captainPick).toContain("2 matchmaking.in_queue");
    expect(wingman).toContain("2 matchmaking.in_queue");
    expect(duel).toContain("1 matchmaking.in_queue");
  });

  it("labels and counts a Captain Pick search as Captain Pick, and anyone in it can cancel", async () => {
    matchmakingStore.currentLobby = {
      players: [
        { status: "Accepted", captain: true, player: { steam_id: "9", name: "Lead" } },
        { status: "Accepted", captain: false, player: { steam_id: "2" } },
      ],
    };
    matchmakingStore.joinedMatchmakingQueues.details = {
      type: "Competitive",
      variant: "CaptainPick",
      regions: ["EU"],
    };
    matchmakingStore.regionStats = {
      EU: {
        Competitive: [{ index: 0, size: 5 }],
        CompetitiveCaptainPick: [{ index: 0, size: 1 }],
      },
    };
    const wrapper = await mountHero();

    const search = wrapper.get("[data-play-search]");
    expect(search.text()).toContain("Captain Pick");
    expect(search.attributes("style")).toContain("--mode-rgb: 250 204 21");
    expect(search.text()).toContain('layouts.queue.in_queue:{"count":1}');
    expect(search.text()).not.toContain('{"count":5}');
    await wrapper.get("[data-play-cancel]").trigger("click");
    expect(mocks.socketEvent).toHaveBeenCalledWith(
      "matchmaking:leave",
      undefined,
    );
  });

  it("replaces the queue with a link to the draft once committed, with no way to leave", async () => {
    matchmakingStore.joinedMatchmakingQueues.confirmation = {
      confirmationId: "draft-1",
      confirmed: 10,
      players: 10,
      captainPick: makeDraft(),
    };
    const wrapper = await mountHero();

    const panel = wrapper.find('[data-testid="captain-pick-in-progress"]');
    expect(panel.exists()).toBe(true);
    expect(panel.find("a").attributes("href")).toBe("/play/captain-pick");
    expect(wrapper.find("[data-play-cancel]").exists()).toBe(false);
    expect(tiles(wrapper)).toHaveLength(0);
  });

  it("still shows the committed draft when Captain Pick is switched off", async () => {
    settings.captainPickEnabled = false;
    matchmakingStore.joinedMatchmakingQueues.confirmation = {
      confirmationId: "draft-1",
      confirmed: 10,
      players: 10,
      captainPick: makeDraft(),
    };
    const wrapper = await mountHero();

    expect(
      wrapper.find('[data-testid="captain-pick-in-progress"]').exists(),
    ).toBe(true);
  });
});

describe("/play hero access states (DEAFCS)", () => {
  it("an unverified player sees the modes, the verification link, and can't queue", async () => {
    settings.matchmakingRoleAllowed = false;
    const wrapper = await mountHero();

    expect(wrapper.attributes("data-state")).toBe("unverified");
    expect(wrapper.text()).toContain(
      "pages.play.matchmaking.verification_required",
    );
    expect(wrapper.find('a[href="/verify/status"]').exists()).toBe(true);
    expect(tiles(wrapper)).toHaveLength(4);
    await tile(wrapper, "Competitive").trigger("click");
    expect(findMatch(wrapper).attributes("disabled")).toBeDefined();
  });

  it("while matchmaking is closed the hero says so instead of disappearing", async () => {
    settings.matchmakingEnabled = false;
    const wrapper = await mountHero();

    expect(wrapper.attributes("data-state")).toBe("closed");
    expect(wrapper.text()).toContain("pages.play.matchmaking.closed");
    expect(tiles(wrapper)).toHaveLength(4);
    expect(findMatch(wrapper).attributes("disabled")).toBeDefined();
  });

  it("a party member waits for the leader", async () => {
    matchmakingStore.currentLobby = {
      players: [
        { status: "Accepted", captain: true, player: { steam_id: "9", name: "Lead" } },
        { status: "Accepted", captain: false, player: { steam_id: "2" } },
      ],
    };
    const wrapper = await mountHero();

    expect(wrapper.attributes("data-state")).toBe("member");
    expect(wrapper.text()).toContain(
      'pages.play.matchmaking.waiting_for:{"name":"Lead"}',
    );
    expect(wrapper.find("[data-find-match]").exists()).toBe(false);
  });

  it("a website restriction is named, not mistaken for a party rule", async () => {
    restriction.isRestricted = true;
    const wrapper = await mountHero();

    expect(wrapper.attributes("data-state")).toBe("restricted");
    expect(wrapper.text()).toContain("account_restriction.short");
    expect(wrapper.text()).not.toContain("party_size");
  });

  it("a guest sees the modes and signs in from the button", async () => {
    auth.me = null;
    const wrapper = await mountHero();

    expect(wrapper.attributes("data-state")).toBe("guest");
    expect(tiles(wrapper)).toHaveLength(4);
    await wrapper.get("button.h-11").trigger("click");
    expect(mocks.navigateTo).toHaveBeenCalledWith("/login?redirect=/play");
    expect(mocks.socketEvent).not.toHaveBeenCalled();
  });
});
