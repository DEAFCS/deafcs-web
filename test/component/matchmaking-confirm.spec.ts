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

function mountConfirm(initial = makeConfirmation()) {
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

  it("stops blocking the app once this player is ready", async () => {
    const wrapper = mountConfirm();
    setConfirmation(makeConfirmation({ isReady: true, confirmed: 4 }));
    await flushPromises();

    expect(isDialogOpen(wrapper)).toBe("false");
    expect(mocks.playTickSound).toHaveBeenCalledOnce();
  });

  it("hides the blocking overlay when every player has confirmed", async () => {
    const wrapper = mountConfirm(
      makeConfirmation({ confirmed: 10, isReady: false }),
    );

    expect(isDialogOpen(wrapper)).toBe("false");
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
