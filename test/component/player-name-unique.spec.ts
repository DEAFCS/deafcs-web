import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import PlayerChangeName from "../../components/PlayerChangeName.vue";
import {
  isNameTakenError,
  isPlayerNameAvailable,
  PLAYER_NAME_TAKEN_FALLBACK,
} from "../../utilities/isPlayerNameAvailable";

vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

describe("isPlayerNameAvailable", () => {
  const apollo = (impl: () => Promise<unknown>) => ({ query: vi.fn(impl) });

  it("reflects the API's answer and sends the player being named", async () => {
    const free = apollo(async () => ({
      data: { isPlayerNameAvailable: { available: true } },
    }));
    await expect(isPlayerNameAvailable(free, "Neo", "76561190000000001")).resolves.toBe(true);
    expect(free.query.mock.calls[0][0].variables).toEqual({
      name: "Neo",
      steam_id: "76561190000000001",
    });
    // Always asked fresh, never from a stale cache.
    expect(free.query.mock.calls[0][0].fetchPolicy).toBe("network-only");

    const busy = apollo(async () => ({
      data: { isPlayerNameAvailable: { available: false } },
    }));
    await expect(isPlayerNameAvailable(busy, "Neo")).resolves.toBe(false);
  });

  it("fails open on a network error (the API and a unique index re-check on submit)", async () => {
    const broken = apollo(async () => {
      throw new Error("network");
    });
    await expect(isPlayerNameAvailable(broken, "Neo")).resolves.toBe(true);
  });

  it("recognises the API's rejection text, as a string or an Error", () => {
    expect(isNameTakenError(PLAYER_NAME_TAKEN_FALLBACK)).toBe(true);
    expect(isNameTakenError(new Error(PLAYER_NAME_TAKEN_FALLBACK))).toBe(true);
    expect(isNameTakenError(new Error("something else"))).toBe(false);
  });
});

describe("PlayerChangeName - taken names", () => {
  const ME = "76561190000000001";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("onMounted", onMounted);
    vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
    vi.stubGlobal("useAuthStore", () => ({
      me: { steam_id: ME },
      isRoleAbove: () => false,
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const mountForm = (available: boolean) => {
    const $apollo = {
      query: vi.fn().mockResolvedValue({
        data: { isPlayerNameAvailable: { available } },
      }),
      mutate: vi.fn().mockResolvedValue({}),
    };
    const wrapper = mount(PlayerChangeName, {
      props: { player: { steam_id: ME, name: "OldName" } },
      global: {
        config: {
          globalProperties: {
            $apollo,
            $t: (key: string, fallback?: string) => fallback ?? key,
          } as any,
        },
      },
    });
    return { wrapper, $apollo };
  };

  const type = async (wrapper: ReturnType<typeof mountForm>["wrapper"], value: string) => {
    await wrapper.get("input").setValue(value);
    await vi.advanceTimersByTimeAsync(350);
    await flushPromises();
    await nextTick();
  };

  it("shows the message and blocks Save while typing a taken name", async () => {
    const { wrapper, $apollo } = mountForm(false);
    await type(wrapper, "TakenName");

    expect($apollo.query).toHaveBeenCalled();
    expect(wrapper.get("[role=alert]").text()).toBe(PLAYER_NAME_TAKEN_FALLBACK);
    expect(wrapper.get("button[type=submit]").attributes("disabled")).toBeDefined();

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect($apollo.mutate).not.toHaveBeenCalled();
  });

  it("lets a free name through to the change request", async () => {
    const { wrapper, $apollo } = mountForm(true);
    await type(wrapper, "FreshName");

    expect(wrapper.find("[role=alert]").exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect($apollo.mutate).toHaveBeenCalledTimes(1);
  });

  it("does not look up a name that fails the format rule or is the player's own", async () => {
    const { wrapper, $apollo } = mountForm(false);
    await type(wrapper, "bad name!");
    await type(wrapper, "OldName");
    expect($apollo.query).not.toHaveBeenCalled();
    expect(wrapper.find("[role=alert]").exists()).toBe(false);
  });

  it("stops a name that was taken after the last keystroke when saving", async () => {
    const { wrapper, $apollo } = mountForm(true);
    await type(wrapper, "RaceName");
    // Someone grabs it before the submit-time re-check.
    $apollo.query.mockResolvedValue({
      data: { isPlayerNameAvailable: { available: false } },
    });
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect($apollo.mutate).not.toHaveBeenCalled();
    expect(wrapper.get("[role=alert]").text()).toBe(PLAYER_NAME_TAKEN_FALLBACK);
  });

  it("shows the same message when the API rejects the race at submit", async () => {
    const { wrapper, $apollo } = mountForm(true);
    $apollo.mutate.mockRejectedValue(new Error(PLAYER_NAME_TAKEN_FALLBACK));
    await type(wrapper, "RaceName");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(wrapper.get("[role=alert]").text()).toBe(PLAYER_NAME_TAKEN_FALLBACK);
  });
});
