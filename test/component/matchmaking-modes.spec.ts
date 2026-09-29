import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";
import { makeDraft } from "./fixtures/captainPick";
import type { e_match_types_enum } from "../../generated/zeus";

const mocks = vi.hoisted(() => ({
  socketEvent: vi.fn(),
  toast: vi.fn(),
  isMobile: null as any,
}));

vi.mock("~/web-sockets/Socket", () => ({
  default: { event: mocks.socketEvent },
}));
vi.mock("@/components/ui/toast", () => ({ toast: mocks.toast }));
vi.mock("@vueuse/core", () => ({ useMediaQuery: () => mocks.isMobile }));
vi.mock("~/components/match/QuickMatchConnect.vue", () => ({ default: {} }));
vi.mock("~/components/match/MatchStatus.vue", () => ({ default: {} }));
vi.mock("../../components/TimeAgo.vue", () => ({ default: {} }));

import Matchmaking from "../../components/matchmaking/Matchmaking.vue";

const passthrough = (tag: string) =>
  defineComponent({
    setup:
      (_props, { slots, attrs }) =>
      () =>
        h(tag, attrs, slots.default?.()),
  });

let matchmakingStore: any;
let settings: any;
const wrappers: ReturnType<typeof mount>[] = [];

const mountMatchmaking = async () => {
  const wrapper = mount(Matchmaking, {
    // What the e_match_types query returns.
    data: () => ({
      e_match_types: ["Competitive", "Wingman", "Duel", "Premier"].map(
        (value) => ({ value: value as e_match_types_enum, description: value }),
      ),
    }),
    global: {
      stubs: {
        Alert: passthrough("div"),
        AlertDescription: passthrough("div"),
        Badge: passthrough("span"),
        NuxtLink: defineComponent({
          props: ["to"],
          setup:
            (props, { slots }) =>
            () =>
              h("a", { href: props.to }, slots.default?.()),
        }),
        TimeAgo: true,
      },
      plugins: [
        {
          install(app) {
            Object.assign(app.config.globalProperties, {
              $t: (key: string, params?: Record<string, unknown>) =>
                params ? `${key}:${JSON.stringify(params)}` : key,
              $route: { query: {} },
            });
          },
        },
      ],
    },
  });
  await flushPromises();
  wrappers.push(wrapper);
  return wrapper;
};

const cards = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll("button").filter((b) => !b.text().includes("cancel"));

const cardByLabel = (wrapper: ReturnType<typeof mount>, label: string) =>
  cards(wrapper).find((b) => b.text().includes(label))!;

beforeEach(() => {
  mocks.socketEvent.mockClear();
  mocks.toast.mockClear();
  mocks.isMobile = ref(false);

  matchmakingStore = reactive({
    joinedMatchmakingQueues: { details: undefined, confirmation: undefined },
    regionStats: {},
    preferredRegions: [{ value: "EU" }],
    currentLobby: undefined,
    getRegionlatencyResult: () => undefined,
  });
  settings = reactive({
    isMatchmakingTypeEnabled: () => true,
    captainPickEnabled: true,
    maxCompetitivePartySize: 5,
    availableRegions: [],
    matchmakingEnabled: true,
    showSeparators: false,
  });

  vi.stubGlobal("useMatchmakingStore", () => matchmakingStore);
  vi.stubGlobal("useApplicationSettingsStore", () => settings);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useAuthStore", () => ({
    me: { steam_id: "2", is_banned: false, matchmaking_cooldown: null },
  }));
  vi.stubGlobal("navigateTo", vi.fn());
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.unstubAllGlobals();
});

describe("/play matchmaking modes", () => {
  it("shows 5v5, 5v5 Captain Pick, 2v2 and 1v1 in that order", async () => {
    const wrapper = await mountMatchmaking();

    const labels = cards(wrapper).map((b) => b.text());
    expect(labels).toHaveLength(4);
    expect(labels[0]).toContain("Competitive");
    expect(labels[1]).toContain("matchmaking.captain_pick.title");
    expect(labels[1]).toContain(
      "matchmaking.match_types.captain_pick.description",
    );
    expect(labels[2]).toContain("Wingman");
    expect(labels[3]).toContain("Duel");
  });

  it("uses the same order on mobile", async () => {
    mocks.isMobile = ref(true);
    const wrapper = await mountMatchmaking();

    expect(cards(wrapper).map((b) => b.text().trim())).toEqual([
      "5v5",
      "matchmaking.captain_pick.title",
      "2v2",
      "1v1",
    ]);
  });

  it("hides Captain Pick while its switch is off", async () => {
    settings.captainPickEnabled = false;
    const wrapper = await mountMatchmaking();

    expect(cards(wrapper)).toHaveLength(3);
    expect(wrapper.text()).not.toContain("matchmaking.captain_pick.title");
  });

  it("joins Standard 5v5 with exactly the old payload", async () => {
    const wrapper = await mountMatchmaking();

    await cardByLabel(wrapper, "Competitive").trigger("click");

    expect(mocks.socketEvent).toHaveBeenCalledWith("matchmaking:join-queue", {
      type: "Competitive",
      regions: ["EU"],
    });
  });

  it("joins Captain Pick as Competitive with the CaptainPick variant", async () => {
    const wrapper = await mountMatchmaking();

    await cardByLabel(wrapper, "matchmaking.captain_pick.title").trigger(
      "click",
    );

    expect(mocks.socketEvent).toHaveBeenCalledWith("matchmaking:join-queue", {
      type: "Competitive",
      regions: ["EU"],
      variant: "CaptainPick",
    });
  });

  it("leaves 2v2 and 1v1 unchanged", async () => {
    const wrapper = await mountMatchmaking();

    await cardByLabel(wrapper, "Wingman").trigger("click");
    await cardByLabel(wrapper, "Duel").trigger("click");

    expect(mocks.socketEvent.mock.calls).toEqual([
      ["matchmaking:join-queue", { type: "Wingman", regions: ["EU"] }],
      ["matchmaking:join-queue", { type: "Duel", regions: ["EU"] }],
    ]);
  });

  it("makes Captain Pick unavailable in a party, without touching 5v5 rules", async () => {
    matchmakingStore.currentLobby = {
      players: [{ status: "Accepted" }, { status: "Accepted" }],
    };
    const wrapper = await mountMatchmaking();

    const captainPick = cardByLabel(wrapper, "matchmaking.captain_pick.title");
    expect(captainPick.attributes("disabled")).toBeDefined();
    expect(captainPick.text()).toContain("matchmaking.captain_pick.solo_only");
    expect(
      cardByLabel(wrapper, "Competitive").attributes("disabled"),
    ).toBeUndefined();

    await captainPick.trigger("click");
    expect(mocks.socketEvent).not.toHaveBeenCalled();
  });

  it("shows each card's own queue count", async () => {
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
    const wrapper = await mountMatchmaking();

    const [standard, captainPick, wingman, duel] = cards(wrapper).map((b) =>
      b.text(),
    );
    expect(standard).toContain("6 matchmaking.in_queue");
    expect(captainPick).toContain("2 matchmaking.in_queue");
    expect(wingman).toContain("2 matchmaking.in_queue");
    expect(duel).toContain("1 matchmaking.in_queue");
  });

  it("labels and counts a Captain Pick search as Captain Pick", async () => {
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
    const wrapper = await mountMatchmaking();

    expect(wrapper.text()).toContain("matchmaking.captain_pick.title");
    expect(wrapper.text()).toContain("1 matchmaking.in_queue");
    expect(wrapper.text()).not.toContain("5 matchmaking.in_queue");
  });

  it("replaces the queue with a link to the draft once committed, with no way to leave", async () => {
    matchmakingStore.joinedMatchmakingQueues.confirmation = {
      confirmationId: "draft-1",
      confirmed: 10,
      players: 10,
      captainPick: makeDraft(),
    };
    const wrapper = await mountMatchmaking();

    const panel = wrapper.find('[data-testid="captain-pick-in-progress"]');
    expect(panel.exists()).toBe(true);
    expect(panel.find("a").attributes("href")).toBe("/play/captain-pick");
    expect(wrapper.text()).not.toContain("matchmaking.cancel_matchmaking");
    expect(cards(wrapper)).toHaveLength(0);
  });

  it("still shows the committed draft when Captain Pick is switched off", async () => {
    settings.captainPickEnabled = false;
    matchmakingStore.joinedMatchmakingQueues.confirmation = {
      confirmationId: "draft-1",
      confirmed: 10,
      players: 10,
      captainPick: makeDraft(),
    };
    const wrapper = await mountMatchmaking();

    expect(
      wrapper.find('[data-testid="captain-pick-in-progress"]').exists(),
    ).toBe(true);
  });
});
