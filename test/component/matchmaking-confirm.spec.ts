import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import MatchmakingConfirm from "../../components/matchmaking/MatchmakingConfirm.vue";

const mocks = vi.hoisted(() => ({
  store: null as any,
  socketEvent: vi.fn(),
  closeMatchReadyModal: vi.fn(),
  playCountdownSound: vi.fn(),
  playMatchFoundSound: vi.fn(),
  playTickSound: vi.fn(),
  startTabFlash: vi.fn(),
  stopTabFlash: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("@/components/ui/alert-dialog", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    AlertDialog: defineComponent({
      props: { open: { type: Boolean, default: false } },
      emits: ["update:open"],
      setup(props, { emit, slots }) {
        return () =>
          h(
            "div",
            {
              "data-testid": "match-confirm-dialog",
              "data-open": String(props.open),
              onKeydown: (event: KeyboardEvent) => {
                if (event.key === "Escape") emit("update:open", false);
              },
            },
            props.open ? slots.default?.() : [],
          );
      },
    }),
    AlertDialogContent: defineComponent({
      setup(_props, { slots }) {
        return () => h("section", slots.default?.());
      },
    }),
  };
});

vi.mock("~/stores/MatchmakingStore", () => ({
  useMatchmakingStore: () => mocks.store,
}));
vi.mock("~/composables/useMatchReadyModal", () => ({
  useMatchReadyModal: () => ({
    closeMatchReadyModal: mocks.closeMatchReadyModal,
  }),
}));
vi.mock("~/web-sockets/Socket", () => ({
  default: { event: mocks.socketEvent },
}));
vi.mock("~/composables/useSound", () => ({
  useSound: () => ({
    playCountdownSound: mocks.playCountdownSound,
    playMatchFoundSound: mocks.playMatchFoundSound,
    playTickSound: mocks.playTickSound,
  }),
}));
vi.mock("~/composables/useTabFlash", () => ({
  startTabFlash: mocks.startTabFlash,
  stopTabFlash: mocks.stopTabFlash,
}));
vi.mock("~/composables/useTabFlashSettings", () => ({
  useTabFlashSettings: () => ({ isMatchFoundFlashEnabled: { value: true } }),
}));

const wrappers: ReturnType<typeof mount>[] = [];

function makeConfirmation(overrides: Record<string, unknown> = {}) {
  return {
    confirmationId: "confirmation-1",
    type: "Competitive",
    region: "EU",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    confirmed: 1,
    players: 10,
    isReady: false,
    matchId: undefined,
    ...overrides,
  };
}

function mountConfirm(initial = makeConfirmation(), routePath = "/play") {
  mocks.store = reactive({
    joinedMatchmakingQueues: { confirmation: initial },
  });
  const wrapper = mount(MatchmakingConfirm, {
    global: {
      plugins: [
        {
          install(app) {
            Object.assign(app.config.globalProperties, {
              $t: (key: string) => key,
              $router: { push: mocks.routerPush },
              $route: { path: routePath },
            });
          },
        },
      ],
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function setConfirmation(confirmation: ReturnType<typeof makeConfirmation> | undefined) {
  mocks.store.joinedMatchmakingQueues.confirmation = confirmation;
}

function isDialogOpen(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .find('[data-testid="match-confirm-dialog"]')
    .attributes("data-open");
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockClear" in mock) mock.mockClear();
  }
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Match Found confirmation modal", () => {
  it("keeps the unready ready-check visible and cannot be dismissed with Escape", async () => {
    const wrapper = mountConfirm();

    expect(isDialogOpen(wrapper)).toBe("true");
    expect(wrapper.find("button").text()).toBe("matchmaking.ready");
    await wrapper
      .find('[data-testid="match-confirm-dialog"]')
      .trigger("keydown", { key: "Escape" });
    await flushPromises();

    expect(isDialogOpen(wrapper)).toBe("true");
    expect(wrapper.findAll("button")).toHaveLength(1);
  });

  it("requires the Ready action before treating this player as confirmed", async () => {
    const wrapper = mountConfirm();

    await wrapper.find("button").trigger("click");

    expect(mocks.socketEvent).toHaveBeenCalledWith("matchmaking:confirm", {
      confirmationId: "confirmation-1",
    });
    expect(isDialogOpen(wrapper)).toBe("true");
  });

  it("keeps the ready-check visible after this player is ready", async () => {
    const wrapper = mountConfirm();

    await wrapper.find("button").trigger("click");
    expect(mocks.socketEvent).toHaveBeenCalledOnce();

    setConfirmation(makeConfirmation({ isReady: true, confirmed: 4 }));
    await flushPromises();

    expect(isDialogOpen(wrapper)).toBe("true");
    expect(wrapper.text()).toContain("matchmaking.waiting_on_others");
    expect(wrapper.text()).toContain("matchmaking.locked_in");
    expect(wrapper.text()).toContain("4");
    expect(wrapper.text()).toContain("10");
    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(mocks.playTickSound).toHaveBeenCalledOnce();
  });

  it("does not submit Ready again after this player is ready", async () => {
    const wrapper = mountConfirm();
    setConfirmation(makeConfirmation({ isReady: true, confirmed: 4 }));
    await flushPromises();

    (wrapper.vm as unknown as { ready: () => void }).ready();

    expect(mocks.socketEvent).not.toHaveBeenCalled();
    expect(isDialogOpen(wrapper)).toBe("true");
  });

  it("hides the blocking overlay when every player has confirmed", async () => {
    const wrapper = mountConfirm(
      makeConfirmation({ confirmed: 10, isReady: false }),
    );

    expect(isDialogOpen(wrapper)).toBe("false");
  });

  it("continues the countdown and closes only after the expiry timestamp", async () => {
    vi.useFakeTimers();
    const startTime = new Date("2026-09-25T12:00:00.000Z");
    vi.setSystemTime(startTime);
    const expiresAt = new Date(startTime.getTime() + 2_500).toISOString();
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const wrapper = mountConfirm(makeConfirmation({ expiresAt }));

    // remainingSeconds begins at zero, but the future timestamp keeps the
    // dialog open during its initial render.
    expect(isDialogOpen(wrapper)).toBe("true");
    expect(wrapper.text()).toContain("00:02");

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(wrapper.text()).toContain("00:01");

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(wrapper.text()).toContain("00:00");
    expect(isDialogOpen(wrapper)).toBe("true");

    await vi.advanceTimersByTimeAsync(1_000);
    await flushPromises();
    expect(isDialogOpen(wrapper)).toBe("false");
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(mocks.stopTabFlash).toHaveBeenCalled();
  });

  it("still routes automatically when matchId arrives after the overlay closes", async () => {
    const wrapper = mountConfirm(
      makeConfirmation({ confirmed: 10, isReady: true }),
    );

    setConfirmation(
      makeConfirmation({ confirmed: 10, isReady: true, matchId: "match-1" }),
    );
    await flushPromises();

    expect(isDialogOpen(wrapper)).toBe("false");
    expect(mocks.routerPush).toHaveBeenCalledOnce();
    expect(mocks.routerPush).toHaveBeenCalledWith("/matches/match-1");
  });

  it(
    "clears interval and tab flash when a confirmation disappears, then accepts a new one",
    async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      const wrapper = mountConfirm();
      setConfirmation(undefined);
      await flushPromises();

      expect(isDialogOpen(wrapper)).toBe("false");
      expect(clearIntervalSpy).toHaveBeenCalled();
      expect(mocks.closeMatchReadyModal).toHaveBeenCalledOnce();
      expect(mocks.stopTabFlash).toHaveBeenCalled();

      setConfirmation(makeConfirmation({ confirmationId: "confirmation-2" }));
      await flushPromises();

      expect(isDialogOpen(wrapper)).toBe("true");
      expect(mocks.playMatchFoundSound).toHaveBeenCalledTimes(2);
      expect(mocks.startTabFlash).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps the desktop ready-check visible until Ready or full confirmation", () => {
    const wrapper = mountConfirm();

    expect(isDialogOpen(wrapper)).toBe("true");
    expect(wrapper.find("button").text()).toBe("matchmaking.ready");
  });
});

describe("Match Found confirmation modal with 5v5 Captain Pick", () => {
  const CAPTAIN_PICK_ROUTE_KEY = "deafcs:matchmaking:routed-captain-pick-id";

  const draft = (overrides: Record<string, unknown> = {}) => ({
    draftId: "confirmation-1",
    phase: "Drafting",
    pickIndex: 0,
    ...overrides,
  });

  beforeEach(() => {
    localStorage.removeItem(CAPTAIN_PICK_ROUTE_KEY);
    localStorage.removeItem("deafcs:matchmaking:routed-match-id");
  });

  it("uses the normal ready check first", () => {
    const wrapper = mountConfirm(makeConfirmation({ variant: "CaptainPick" }));

    expect(isDialogOpen(wrapper)).toBe("true");
    expect(wrapper.find("button").text()).toBe("matchmaking.ready");
    expect(mocks.playMatchFoundSound).toHaveBeenCalledOnce();
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("goes to the draft once all ten accepted, and ends the ready check", async () => {
    const wrapper = mountConfirm(
      makeConfirmation({ variant: "CaptainPick", isReady: true, confirmed: 9 }),
    );

    setConfirmation(
      makeConfirmation({
        variant: "CaptainPick",
        isReady: true,
        confirmed: 10,
        captainPick: draft(),
      }) as any,
    );
    await flushPromises();

    expect(isDialogOpen(wrapper)).toBe("false");
    expect(mocks.stopTabFlash).toHaveBeenCalled();
    expect(mocks.routerPush).toHaveBeenCalledOnce();
    expect(mocks.routerPush).toHaveBeenCalledWith("/play/captain-pick");
  });

  it("does not treat a committed draft without a match id as a ready check", async () => {
    // e.g. the first message after F5 / a reconnect mid-draft.
    const wrapper = mountConfirm(
      makeConfirmation({
        variant: "CaptainPick",
        confirmed: 10,
        isReady: "2",
        matchId: undefined,
        captainPick: draft({ pickIndex: 4 }),
      }) as any,
    );
    await flushPromises();

    expect(isDialogOpen(wrapper)).toBe("false");
    expect(wrapper.findAll("button")).toHaveLength(0);
    expect(mocks.playMatchFoundSound).not.toHaveBeenCalled();
    expect(mocks.startTabFlash).not.toHaveBeenCalled();
  });

  it("routes to a given draft only once, even after a reload", async () => {
    mountConfirm(
      makeConfirmation({ confirmed: 10, captainPick: draft() }) as any,
    );
    await flushPromises();
    expect(mocks.routerPush).toHaveBeenCalledOnce();

    // Every later pick is a new update for the same draft.
    setConfirmation(
      makeConfirmation({ confirmed: 10, captainPick: draft({ pickIndex: 1 }) }) as any,
    );
    await flushPromises();
    expect(mocks.routerPush).toHaveBeenCalledOnce();

    // A reload somewhere else on the site doesn't drag the player back.
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
    mocks.routerPush.mockClear();
    mountConfirm(
      makeConfirmation({ confirmed: 10, captainPick: draft({ pickIndex: 2 }) }) as any,
    );
    await flushPromises();
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("never leaves the draft for the match page while players are still being picked", async () => {
    // The real match exists from 10/10: the draft carries its id, but the
    // confirmation's own matchId stays empty until the teams are seated.
    mountConfirm(
      makeConfirmation({
        confirmed: 10,
        captainPick: draft({ matchId: "match-9" }),
      }) as any,
    );
    await flushPromises();
    mocks.routerPush.mockClear();

    for (const pickIndex of [1, 2, 6]) {
      setConfirmation(
        makeConfirmation({
          confirmed: 10,
          matchId: undefined,
          captainPick: draft({ pickIndex, matchId: "match-9" }),
        }) as any,
      );
      await flushPromises();
    }
    setConfirmation(
      makeConfirmation({
        confirmed: 10,
        matchId: undefined,
        captainPick: draft({
          phase: "CreatingMatch",
          pickIndex: null,
          matchId: "match-9",
        }),
      }) as any,
    );
    await flushPromises();

    expect(mocks.routerPush).not.toHaveBeenCalledWith("/matches/match-9");
    expect(mocks.routerPush).not.toHaveBeenCalled();
  });

  it("opens the normal match page when the draft's match is created", async () => {
    mountConfirm(
      makeConfirmation({ confirmed: 10, captainPick: draft() }) as any,
    );
    await flushPromises();
    mocks.routerPush.mockClear();

    setConfirmation(
      makeConfirmation({
        confirmed: 10,
        matchId: "match-9",
        captainPick: draft({ phase: "MatchCreated", pickIndex: null, matchId: "match-9" }),
      }) as any,
    );
    await flushPromises();

    expect(mocks.routerPush).toHaveBeenCalledOnce();
    expect(mocks.routerPush).toHaveBeenCalledWith("/matches/match-9");
  });

  it("lets the draft page handle MatchCreated navigation once", async () => {
    mountConfirm(
      makeConfirmation({ confirmed: 10, captainPick: draft() }) as any,
      "/play/captain-pick",
    );
    await flushPromises();
    mocks.routerPush.mockClear();

    setConfirmation(
      makeConfirmation({
        confirmed: 10,
        matchId: "match-9",
        captainPick: draft({
          phase: "MatchCreated",
          pickIndex: null,
          matchId: "match-9",
        }),
      }) as any,
    );
    await flushPromises();

    expect(mocks.routerPush).not.toHaveBeenCalled();
    expect(localStorage.getItem("deafcs:matchmaking:routed-match-id")).toBe("match-9");
  });
});
