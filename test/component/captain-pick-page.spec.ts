import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { draftAfter, makeDraft } from "./fixtures/captainPick";

const mocks = vi.hoisted(() => ({
  store: null as any,
  settings: null as any,
  socketEvent: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("~/stores/MatchmakingStore", () => ({
  useMatchmakingStore: () => mocks.store,
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: { steam_id: "2" } }),
}));
vi.mock("~/stores/ApplicationSettings", () => ({
  useApplicationSettingsStore: () => mocks.settings,
}));
vi.mock("~/web-sockets/Socket", () => ({
  default: { event: mocks.socketEvent },
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/components/ui/transitions/PageTransition.vue", () => ({
  default: defineComponent({
    setup:
      (_p, { slots }) =>
      () =>
        h("div", slots.default?.()),
  }),
}));
vi.mock("~/components/TacticalPageHeader.vue", () => ({
  default: defineComponent({
    setup:
      (_p, { slots }) =>
      () =>
        h("header", slots.title?.()),
  }),
}));

vi.mock(
  "~/components/matchmaking/captain-pick/CaptainPickScreen.vue",
  async () => {
    const vue = await import("vue");
    return {
      default: vue.defineComponent({
        name: "CaptainPickScreen",
        props: ["draft", "selfSteamId", "localDeadline", "timeUp", "pending"],
        emits: ["pick"],
        setup() {
          return () => vue.h("div", { "data-stub": "screen" });
        },
      }),
    };
  },
);

import CaptainPickPage from "../../pages/play/captain-pick.vue";

const Screen = { name: "CaptainPickScreen" };

const wrappers: ReturnType<typeof mount>[] = [];

const setConfirmation = (confirmation: any) => {
  mocks.store.joinedMatchmakingQueues.confirmation = confirmation;
};

const confirmationWith = (captainPick: any) => ({
  confirmationId: "draft-1",
  type: "Competitive",
  variant: "CaptainPick",
  confirmed: 10,
  players: 10,
  isReady: "2",
  matchId: captainPick.matchId ?? undefined,
  captainPick,
});

const mountPage = () => {
  const wrapper = mount(CaptainPickPage, {
    global: {
      mocks: { $t: (key: string) => key },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const screen = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findComponent(Screen);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-29T20:00:00.000Z"));
  mocks.store = reactive({
    joinedMatchmakingQueues: { confirmation: undefined },
  });
  mocks.settings = reactive({ captainPickEnabled: true });
  mocks.socketEvent.mockClear();
  mocks.routerReplace.mockClear();
  vi.stubGlobal("useHead", vi.fn());
  vi.stubGlobal("useRouter", () => ({ replace: mocks.routerReplace }));
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("/play/captain-pick", () => {
  it("renders the draft straight from the server state", () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const wrapper = mountPage();

    expect(screen(wrapper).props("draft").draftId).toBe("draft-1");
    expect(screen(wrapper).props("selfSteamId")).toBe("2");
  });

  it("sends the pick with the draft id, target and current pick index", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const wrapper = mountPage();

    screen(wrapper).vm.$emit("pick", "5");
    await flushPromises();

    expect(mocks.socketEvent).toHaveBeenCalledOnce();
    expect(mocks.socketEvent).toHaveBeenCalledWith("matchmaking:captain-pick", {
      confirmationId: "draft-1",
      steamId: "5",
      pickIndex: 0,
    });
    expect(screen(wrapper).props("pending")).toBe(true);
  });

  it("sends nothing else until the server answers", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const wrapper = mountPage();

    screen(wrapper).vm.$emit("pick", "5");
    screen(wrapper).vm.$emit("pick", "6");
    await flushPromises();

    expect(mocks.socketEvent).toHaveBeenCalledOnce();
  });

  it("lets the server decide the roster; a refused pick changes nothing locally", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const wrapper = mountPage();

    screen(wrapper).vm.$emit("pick", "5");
    await flushPromises();
    // Nothing optimistic: still the server's roster.
    expect(screen(wrapper).props("draft").lineups[1]).toEqual(["2"]);

    // The server refuses (another tab already picked) and resyncs this tab
    // with its own state: same pick, a different player taken.
    setConfirmation(confirmationWith(draftAfter([{ steam_id: "6" }])));
    await flushPromises();

    expect(screen(wrapper).props("pending")).toBe(false);
    expect(screen(wrapper).props("draft").lineups[1]).toEqual(["2", "6"]);
    expect(screen(wrapper).props("draft").available).toContain("5");
  });

  it("restores the draft after F5 once the server sends it", async () => {
    const wrapper = mountPage();
    expect(wrapper.find('[data-testid="captain-pick-loading"]').exists()).toBe(
      true,
    );

    await vi.advanceTimersByTimeAsync(3000);
    setConfirmation(confirmationWith(draftAfter([{ steam_id: "3" }])));
    await flushPromises();

    expect(screen(wrapper).props("draft").pickIndex).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });

  it("keeps the same deadline across a reload", async () => {
    // First load: server says 30s left.
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const first = mountPage();
    const firstDeadline = screen(first).props("localDeadline");

    // Reload 12s later: the server resends the same deadline, newer serverNow.
    first.unmount();
    wrappers.splice(0);
    vi.setSystemTime(new Date("2026-09-29T20:00:12.000Z"));
    mocks.store.joinedMatchmakingQueues.confirmation = confirmationWith(
      makeDraft({ serverNow: "2026-09-29T20:00:12.000Z" }),
    );
    const second = mountPage();

    expect(screen(second).props("localDeadline")).toBe(firstDeadline);
    expect(firstDeadline).toBe("2026-09-29T20:00:30.000Z");
  });

  it("reports time up only from the server deadline, and picks nobody itself", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const wrapper = mountPage();

    await vi.advanceTimersByTimeAsync(29_000);
    expect(screen(wrapper).props("timeUp")).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(screen(wrapper).props("timeUp")).toBe(true);
    expect(mocks.socketEvent).not.toHaveBeenCalled();
  });

  it("opens the normal match page once the match exists", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    mountPage();

    const locked = draftAfter(
      ["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id })),
    );
    setConfirmation(
      confirmationWith({
        ...locked,
        phase: "MatchCreated",
        matchId: "match-7",
      }),
    );
    await flushPromises();

    expect(mocks.routerReplace).toHaveBeenCalledWith("/matches/match-7");
  });

  it("returns to /play when the draft ends without a match (no requeue)", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    mountPage();

    // Creation failed: the server clears matchmaking state (and toasts why).
    setConfirmation(undefined);
    await flushPromises();

    expect(mocks.routerReplace).toHaveBeenCalledWith("/play");
    expect(mocks.socketEvent).not.toHaveBeenCalled();
  });

  it("returns to /play if there is no draft to restore", async () => {
    const wrapper = mountPage();

    await vi.advanceTimersByTimeAsync(8_000);

    expect(mocks.routerReplace).toHaveBeenCalledWith("/play");
    expect(wrapper.find('[data-testid="captain-pick-loading"]').text()).toBe(
      "matchmaking.captain_pick.not_found",
    );
  });

  it("keeps a running draft when an admin switches Captain Pick off", async () => {
    mocks.store.joinedMatchmakingQueues.confirmation =
      confirmationWith(makeDraft());
    const wrapper = mountPage();

    mocks.settings.captainPickEnabled = false;
    await flushPromises();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(screen(wrapper).exists()).toBe(true);
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });
});
