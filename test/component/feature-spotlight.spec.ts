import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import fs from "node:fs";
import path from "node:path";

// 5Stack's Feature Spotlight (web 45a580e0: composables/useFeatureSpotlights,
// components/notification/FeatureSpotlightNotification + AutoHighlightsCover),
// ported 1:1. It is not part of News: a fixed catalog (Auto Highlights only),
// shown to a signed-in player who has not linked Steam match history, when
// the operator says imported matches get highlights
// (public.supports_imported_highlights) and the API serves player_dismissals.
// DEAFCS has neither yet, so it stays hidden until both exist.

const mocks = vi.hoisted(() => ({
  hasTable: true,
  me: { steam_id: "76561198000000001" } as { steam_id: string } | null,
  subscriptions: new Map<string, (data: any) => void>(),
  unsubscribed: [] as string[],
  mutate: vi.fn(),
  dismissFromStore: vi.fn(),
}));

vi.mock("~/utilities/schemaHasType", () => ({
  schemaHasType: async () => mocks.hasTable,
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: mocks.me }),
}));
vi.mock("~/composables/useSubscriptionManager", () => ({
  useSubscriptionManager: () => ({
    subscribe: (key: string, sub: any) => sub,
    unsubscribe: (key: string) => mocks.unsubscribed.push(key),
  }),
}));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    subscribe: ({ query }: any) => ({
      subscribe: ({ next }: any) => {
        mocks.subscriptions.set(query.definitions[0].name.value, (data) => next({ data }));
        return { unsubscribe() {} };
      },
    }),
    mutate: (args: any) => {
      mocks.mutate(args);
      return Promise.resolve({ data: {} });
    },
  }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

vi.setConfig({ testTimeout: 20_000 });

const feed = (name: string, data: any) => mocks.subscriptions.get(name)?.(data);

beforeEach(async () => {
  mocks.hasTable = true;
  mocks.me = { steam_id: "76561198000000001" };
  mocks.subscriptions.clear();
  mocks.unsubscribed.length = 0;
  mocks.mutate.mockReset();
  (await import("~/composables/useFeatureSpotlights")).resetFeatureSpotlights();
});

describe("useFeatureSpotlights (upstream 1:1)", () => {
  it("shows Auto Highlights to a player without linked match history, once both answers are in", async () => {
    const s = await import("~/composables/useFeatureSpotlights");
    await s.syncFeatureSpotlights("76561198000000001");
    expect(s.activeFeatureSpotlight()).toBeNull();

    feed("FeatureSpotlightDismissals", { player_dismissals: [] });
    expect(s.activeFeatureSpotlight()).toBeNull(); // match history still unknown

    feed("FeatureSpotlightMatchHistory", { player_steam_match_auth_by_pk: null });
    expect(s.activeFeatureSpotlight()).toMatchObject({
      key: "auto_highlights",
      to: "/settings/linked-accounts",
      title: "feature_spotlights.auto_highlights.title",
    });
  });

  it("stays hidden for a player who already linked match history", async () => {
    const s = await import("~/composables/useFeatureSpotlights");
    await s.syncFeatureSpotlights("76561198000000001");
    feed("FeatureSpotlightDismissals", { player_dismissals: [] });
    feed("FeatureSpotlightMatchHistory", {
      player_steam_match_auth_by_pk: { steam_id: "76561198000000001" },
    });
    expect(s.activeFeatureSpotlight()).toBeNull();
  });

  it("dismissing hides it at once, is saved per player, and is never restored", async () => {
    const s = await import("~/composables/useFeatureSpotlights");
    await s.syncFeatureSpotlights("76561198000000001");
    feed("FeatureSpotlightDismissals", { player_dismissals: [] });
    feed("FeatureSpotlightMatchHistory", { player_steam_match_auth_by_pk: null });

    s.dismissFeatureSpotlight("auto_highlights");
    expect(s.activeFeatureSpotlight()).toBeNull();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.mutate.mock.calls[0][0].variables.key).toBe(
      "feature_spotlight:auto_highlights",
    );

    // A later load from the server keeps it dismissed.
    feed("FeatureSpotlightDismissals", {
      player_dismissals: [{ key: "feature_spotlight:auto_highlights" }],
    });
    expect(s.activeFeatureSpotlight()).toBeNull();
  });

  it("never shows anything where the API has no player_dismissals (DEAFCS today)", async () => {
    mocks.hasTable = false;
    const s = await import("~/composables/useFeatureSpotlights");
    await s.syncFeatureSpotlights("76561198000000001");
    expect(mocks.subscriptions.size).toBe(0);
    expect(s.activeFeatureSpotlight()).toBeNull();
  });

  it("forgets everything on sign-out", async () => {
    const s = await import("~/composables/useFeatureSpotlights");
    await s.syncFeatureSpotlights("76561198000000001");
    feed("FeatureSpotlightDismissals", { player_dismissals: [] });
    feed("FeatureSpotlightMatchHistory", { player_steam_match_auth_by_pk: null });
    s.resetFeatureSpotlights();
    expect(s.activeFeatureSpotlight()).toBeNull();
    expect(mocks.unsubscribed).toEqual(
      expect.arrayContaining([
        "notifications:feature_spotlight_dismissals",
        "notifications:feature_spotlight_match_history",
      ]),
    );
  });
});

describe("FeatureSpotlightNotification card", () => {
  beforeEach(() => {
    (globalThis as any).useNotificationStore = () => ({
      dismissFeatureSpotlight: mocks.dismissFromStore,
    });
    (globalThis as any).useWebsiteRestrictionStore = () => ({ isRestricted: false });
    mocks.dismissFromStore.mockReset();
  });
  afterEach(() => {
    delete (globalThis as any).useNotificationStore;
  });

  const mountCard = async () => {
    const { default: Card } = await import(
      "../../components/notification/FeatureSpotlightNotification.vue"
    );
    return mount(Card, {
      props: {
        spotlight: {
          key: "auto_highlights",
          to: "/settings/linked-accounts",
          title: "feature_spotlights.auto_highlights.title",
          teaser: "feature_spotlights.auto_highlights.teaser",
          action: "feature_spotlights.auto_highlights.action",
        },
      },
      global: {
        mocks: { $t: (key: string) => key },
        components: {
          NuxtLink: defineComponent({
            props: ["to"],
            emits: ["click"],
            setup: (props, { slots, emit }) => () =>
              h("a", { href: props.to, onClick: () => emit("click") }, slots.default?.()),
          }),
        },
        stubs: { AutoHighlightsCover: { template: '<div data-testid="cover" />' } },
      },
    });
  };

  it("shows the cover, label, title, teaser, action and dismiss", async () => {
    const w = await mountCard();
    expect(w.find('[data-testid="cover"]').exists()).toBe(true);
    expect(w.text()).toContain("feature_spotlights.label");
    expect(w.text()).toContain("feature_spotlights.auto_highlights.title");
    expect(w.text()).toContain("feature_spotlights.auto_highlights.teaser");
    expect(w.get("a").attributes("href")).toBe("/settings/linked-accounts");
    expect(w.text()).toContain("layouts.notifications.dismiss");
    expect(w.text()).not.toMatch(/5stack/i);
  });

  it("Dismiss and the action both dismiss it, once each", async () => {
    const w = await mountCard();
    await w.findAll("button").find((b) => b.text().includes("dismiss"))!.trigger("click");
    expect(mocks.dismissFromStore).toHaveBeenCalledWith("auto_highlights");
    await w.get("a").trigger("click");
    expect(mocks.dismissFromStore).toHaveBeenCalledTimes(2);
  });
});

describe("DEAFCS wiring", () => {
  const read = (p: string) =>
    fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

  it("only syncs where linked accounts are on and the operator says imported matches get highlights", () => {
    const store = read("stores/NotificationStore.ts");
    expect(store).toMatch(
      /useApplicationSettingsStore\(\)\.linkedAccountsEnabled &&\s+useApplicationSettingsStore\(\)\.importedHighlightsSupported/,
    );
    expect(store).toContain("void syncFeatureSpotlights(steamId);");
    expect(store).toContain("resetFeatureSpotlights();");
    const settings = read("stores/ApplicationSettings.ts");
    expect(settings).toContain('setting.name === "public.supports_imported_highlights"');
  });

  it("counts it as a personal alert and shows it under News in the Alerts panel", () => {
    const store = read("stores/NotificationStore.ts");
    expect(store).toContain("!!featureSpotlight.value ||");
    expect(store).toContain("(featureSpotlight.value ? 1 : 0) +");
    const panel = read("components/hub/NotificationsPanel.vue");
    expect(panel.indexOf("<NewsNotification />")).toBeLessThan(
      panel.indexOf("<FeatureSpotlightNotification"),
    );
    expect(panel).toContain('v-else-if="!unreadNewsArticle && !featureSpotlight"');
  });
});
