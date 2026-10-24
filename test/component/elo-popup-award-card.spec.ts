import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en.json";

// The tooltip parts render their content inline so the popup can be read.
vi.mock("~/components/ui/tooltip", () => {
  const pass = (name: string) =>
    defineComponent({
      name,
      setup(_, { slots }) {
        return () => h("div", { "data-part": name }, slots.default?.());
      },
    });
  return {
    TooltipProvider: pass("TooltipProvider"),
    Tooltip: pass("Tooltip"),
    TooltipTrigger: pass("TooltipTrigger"),
    TooltipContent: pass("TooltipContent"),
  };
});

import EloChangeBadge from "~/components/EloChangeBadge.vue";
import AwardNotificationCard from "~/components/notification/AwardNotificationCard.vue";

const i18n = () =>
  createI18n({ legacy: false, locale: "en", messages: { en: en as any } });

const NuxtLink = defineComponent({
  name: "NuxtLink",
  props: ["to"],
  setup(props, { slots, attrs }) {
    return () => h("a", { ...attrs, href: String(props.to) }, slots.default?.());
  },
});

const popup = (eloChange: Record<string, unknown>) =>
  mount(EloChangeBadge, {
    props: { eloChange },
    global: { plugins: [i18n()] },
  });

// A field's value and its indicator are sibling spans (the gap is CSS):
// read them as "value indicator".
const field = (wrapper: ReturnType<typeof popup>, name: string) => {
  const el = wrapper.find(`[data-elo-${name}]`).element;
  const parts = el.children.length
    ? Array.from(el.children).map((c) => c.textContent ?? "")
    : [el.textContent ?? ""];
  return parts
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
};

describe("ELO Change Details popup", () => {
  const v2Win = {
    type: "Competitive",
    elo_version: 2,
    scale_factor: 10000,
    elo_change: 356,
    current_elo: 8500,
    updated_elo: 8856,
    player_team_elo_avg: 8400,
    opponent_team_elo_avg: 9200,
    expected_score: 0.43,
    actual_score: 1,
    k_factor: 500,
    impact: 1.5,
    performance_multiplier: 1.25,
    series_multiplier: 1,
    kills: 30,
    deaths: 10,
    assists: 4,
    damage: 3000,
  };

  it("shows exactly the four ELO fields, values and indicators on one line", () => {
    const w = popup(v2Win);
    const labels = w.findAll("[data-elo-fields] > div > span:first-child").map((s) => s.text());
    expect(labels).toEqual(["EXPECTED", "BASE ELO", "IMPACT", "PERF ×"]);
    expect(field(w, "expected")).toBe("43%");
    expect(field(w, "delta")).toBe("Δ +0.57");
    expect(field(w, "base")).toBe("+285");
    expect(field(w, "impact")).toBe("1.50 HLTV rating");
    expect(field(w, "perf")).toBe("1.25 +25%");
    // Scoreboard stats are gone from the explanation.
    const text = w.text();
    for (const gone of ["K / D / A", "KDA", "DAMAGE", "SCORE", "EXP "]) {
      expect(text).not.toContain(gone);
    }
    // HLTV appears once, in IMPACT.
    expect(text.match(/HLTV/g)).toHaveLength(1);
    // The formula stays: K500 × Δ0.57 × P1.25 × S1 = +356.
    expect(w.find("footer").text().replace(/\s+/g, "")).toBe("K500×∆0.57×P1.25×S1=+356");
  });

  it("signs a loss correctly and keeps the loss PERF", () => {
    const w = popup({
      ...v2Win,
      elo_change: -263,
      updated_elo: 8237,
      expected_score: 0.6,
      actual_score: 0,
      impact: 1.25,
      performance_multiplier: 0.875,
    });
    expect(field(w, "delta")).toBe("Δ −0.60");
    expect(field(w, "base")).toBe("−300");
    expect(field(w, "perf")).toBe("0.875 −12.5%");
  });

  it("shows Duel/Wingman and older matches with their original Impact, not an HLTV rating", () => {
    const w = popup({
      type: "Duel",
      elo_version: 1,
      scale_factor: 4000,
      elo_change: 168,
      current_elo: 5000,
      updated_elo: 5168,
      expected_score: 0.5,
      actual_score: 1,
      k_factor: 500,
      impact: 1.12,
      performance_multiplier: 1.12,
      series_multiplier: 1,
    });
    expect(field(w, "impact")).toBe("1.12× +12%");
    expect(field(w, "perf")).toBe("1.12 +12%");
    expect(field(w, "base")).toBe("+250");
    expect(w.text()).not.toContain("HLTV");
  });
});

describe("Award Received card", () => {
  it("shows one trophy and the award's name, linking to the award", () => {
    const w = mount(AwardNotificationCard, {
      props: { name: "Test - Player of the Month", to: "/awards/abc" },
      global: { stubs: { NuxtLink } },
    });
    expect(w.findAll("svg")).toHaveLength(1);
    expect(w.text()).toBe("Test - Player of the Month");
    expect(w.find("a").attributes("href")).toBe("/awards/abc");
  });

  it("keeps a long name inside the card (two lines at most)", () => {
    const long = "Community Contributor of the Year for Outstanding Help ".repeat(3).trim();
    const w = mount(AwardNotificationCard, {
      props: { name: long },
      global: { stubs: { NuxtLink } },
    });
    const name = w.find("[data-award-notification-card] > span:last-child");
    expect(name.classes()).toEqual(expect.arrayContaining(["min-w-0", "line-clamp-2", "break-words"]));
  });
});

vi.mock("~/composables/useOrphanedScan", () => ({
  useOrphanedScan: () => ({ dialogOpen: { value: false } }),
}));
// Not part of this card; keeps the generated GraphQL client out of the test.
vi.mock("~/components/notification/NotificationContext.vue", () => ({
  default: { name: "NotificationContext", render: () => null },
}));

describe("NotificationItem", { timeout: 30_000 }, () => {
  // The shared Button reads the website-restriction store (auto-imported).
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));

  const item = async (notification: Record<string, unknown>) => {
    const { default: NotificationItem } = await import(
      "~/components/notification/NotificationItem.vue"
    );
    return mount(NotificationItem, {
      props: {
        notification: {
          id: "n1",
          is_read: false,
          created_at: new Date().toISOString(),
          steam_id: "76561190000000001",
          ...notification,
        },
      },
      global: {
        plugins: [i18n()],
        stubs: {
          NuxtLink,
          TimeAgo: true,
          NotificationContext: true,
        },
      },
    });
  };

  it("shows Award Received with one trophy card holding the award name", async () => {
    const w = await item({
      type: "AwardGranted",
      title: "Award Received",
      message: "You were awarded <b>Test - Player of the Month</b>.",
      entity_id:
        "e729f4e4-7cf5-41e7-9fe6-5b00e864ab94/player_of_the_month:2026-09",
    });
    expect(w.find("h3").text()).toBe("Award Received");
    expect(w.find("p").text()).toBe("You were awarded.");
    const card = w.find("[data-award-notification-card]");
    expect(card.text()).toBe("Test - Player of the Month");
    expect(card.findAll("svg")).toHaveLength(1);
    expect(card.attributes("href")).toBe(
      "/awards/e729f4e4-7cf5-41e7-9fe6-5b00e864ab94",
    );
    // Still dismissable like every unread notification.
    expect(w.text()).toContain("Dismiss");
  });

  it("leaves other notifications exactly as they were", async () => {
    const w = await item({
      type: "NewsPublished",
      title: "News",
      message: "A <b>new</b> article",
      entity_id: "x",
    });
    expect(w.find("[data-award-notification-card]").exists()).toBe(false);
    expect(w.find("p").text()).toBe("A new article");
  });
});
