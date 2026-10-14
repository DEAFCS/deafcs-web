import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import fs from "node:fs";
import path from "node:path";

// Regression for the 2026-10-14 production 500 ("hasHostedDraftGame is not a
// function"): /play's draft rooms called a store method the DEAFCS draft
// store did not have. These tests run the real store and the real component,
// signed in, instead of checking source text.

const mocks = vi.hoisted(() => ({
  auth: null as any,
  query: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("~/stores/MatchmakingStore", () => ({
  useMatchmakingStore: () => ({ currentLobby: null, preferredRegions: [] }),
}));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    query: mocks.query,
    subscribe: mocks.subscribe,
    mutate: vi.fn(),
  }),
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: "en" } }),
}));

import { useDraftGamesStore } from "../../stores/DraftGamesStore";
import PlayDraftRooms from "../../components/play/PlayDraftRooms.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    inheritAttrs: false,
    setup:
      (_p, { slots, attrs }) =>
      () =>
        h(tag, attrs, slots.default?.()),
  });

const stubs = {
  Button: passthrough("button"),
  Input: true,
  Slider: true,
  Switch: true,
  Skeleton: true,
  Popover: passthrough(),
  PopoverTrigger: passthrough(),
  PopoverContent: passthrough(),
  Select: passthrough(),
  SelectTrigger: passthrough(),
  SelectValue: true,
  SelectContent: passthrough(),
  SelectItem: passthrough(),
  FadeSwap: passthrough(),
  Fold: defineComponent({
    props: ["open"],
    setup:
      (props, { slots }) =>
      () =>
        props.open ? h("div", { "data-fold-open": "" }, slots.default?.()) : null,
  }),
  WatchSegmented: true,
  PlayDraftRoomRow: true,
  PlayDraftHostBar: defineComponent({
    setup: () => () => h("div", { "data-host-bar": "" }),
  }),
  PlayDraftIntro: defineComponent({
    setup: () => () => h("div", { "data-draft-intro": "" }),
  }),
};

let settings: any;
let restriction: any;
const errors: unknown[] = [];

beforeEach(() => {
  setActivePinia(createPinia());
  errors.length = 0;
  mocks.query.mockReset();
  mocks.subscribe.mockReset();
  mocks.subscribe.mockReturnValue({
    subscribe: () => ({ unsubscribe: vi.fn() }),
  });
  mocks.auth = reactive({
    hasCheckedSession: true,
    me: { steam_id: "76561198000000001", name: "Anders" },
  });
  settings = reactive({ canCreateMatch: true, canCreateCustomMatch: true });
  restriction = reactive({ isRestricted: false });
  vi.stubGlobal("useApplicationSettingsStore", () => settings);
  vi.stubGlobal("useWebsiteRestrictionStore", () => restriction);
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({ eloForPlayer: () => null }));
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const mountRooms = async () => {
  const wrapper = mount(PlayDraftRooms, {
    global: {
      stubs,
      mocks: { $t: (key: string) => key },
      config: {
        errorHandler: (error: unknown) => {
          errors.push(error);
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
};

describe("the real draft store behind /play", () => {
  it("has every member /play's draft components call", () => {
    const store = useDraftGamesStore() as Record<string, unknown>;
    const playDir = path.resolve(__dirname, "../../components/play");
    const used = new Set<string>();
    for (const file of fs.readdirSync(playDir)) {
      const source = fs.readFileSync(path.join(playDir, file), "utf8");
      for (const match of source.matchAll(/\bdraftGames\s*\.\s*(\w+)/g)) {
        used.add(match[1]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const member of used) {
      // State may legitimately hold undefined (myDraftGame when not in a
      // room); what must hold is that the store has the member at all.
      expect(member in store, `draftGames.${member}`).toBe(true);
    }
    expect(typeof store.hasHostedDraftGame).toBe("function");
  });

  it("hasHostedDraftGame asks only for the player's own hosted rooms", async () => {
    mocks.query.mockResolvedValue({ data: { draft_games: [{ id: "d1" }] } });
    const store = useDraftGamesStore();
    await expect(store.hasHostedDraftGame("76561198000000001")).resolves.toBe(
      true,
    );
    const { variables, query, fetchPolicy } = mocks.query.mock.calls[0][0];
    expect(fetchPolicy).toBe("network-only");
    expect(JSON.stringify(query)).toContain("host_steam_id");
    expect(JSON.stringify({ query, variables })).toContain("76561198000000001");

    mocks.query.mockResolvedValue({ data: { draft_games: [] } });
    await expect(store.hasHostedDraftGame("76561198000000001")).resolves.toBe(
      false,
    );
  });
});

describe("PlayDraftRooms renders for a signed-in player (the crashing path)", () => {
  it("mounts without an error and shows the intro to a first-time host", async () => {
    mocks.query.mockResolvedValue({ data: { draft_games: [] } });
    const wrapper = await mountRooms();
    expect(errors).toEqual([]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(wrapper.find("[data-draft-intro]").exists()).toBe(true);
    expect(wrapper.find("[data-host-bar]").exists()).toBe(true);
  });

  it("hides the intro once the player has hosted before", async () => {
    mocks.query.mockResolvedValue({ data: { draft_games: [{ id: "d1" }] } });
    const wrapper = await mountRooms();
    expect(errors).toEqual([]);
    expect(wrapper.find("[data-draft-intro]").exists()).toBe(false);
  });

  it("a failing lookup only hides the intro, never the page", async () => {
    mocks.query.mockRejectedValue(new Error("network"));
    const wrapper = await mountRooms();
    expect(errors).toEqual([]);
    expect(wrapper.find("[data-draft-intro]").exists()).toBe(false);
    expect(wrapper.find("[data-host-bar]").exists()).toBe(true);
  });

  it("keeps the DEAFCS host gate: no host bar or intro without permission", async () => {
    mocks.query.mockResolvedValue({ data: { draft_games: [] } });
    settings.canCreateCustomMatch = false;
    const wrapper = await mountRooms();
    expect(errors).toEqual([]);
    expect(wrapper.find("[data-host-bar]").exists()).toBe(false);
    expect(wrapper.find("[data-draft-intro]").exists()).toBe(false);

    settings.canCreateCustomMatch = true;
    restriction.isRestricted = true;
    const restricted = await mountRooms();
    expect(restricted.find("[data-host-bar]").exists()).toBe(false);
  });
});
