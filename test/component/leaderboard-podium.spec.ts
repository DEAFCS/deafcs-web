import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import en from "../../i18n/locales/en.json";

// The leaderboard's top-three podium (5Stack #985, DEAFCS links and values).

vi.mock("~/components/PlayerDisplay.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["player"],
      setup: (props) => () =>
        h("span", { "data-player": props.player?.steam_id }),
    }),
  };
});
vi.mock("~/components/TimezoneFlag.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ setup: () => () => h("i") }) };
});

import LeaderboardPodium from "../../components/leaderboard/LeaderboardPodium.vue";

const t = (key: string) =>
  key.split(".").reduce((obj: any, part) => obj?.[part], en) ?? key;

const NuxtLink = defineComponent({
  props: ["to"],
  setup:
    (props, { slots, attrs }) =>
    () =>
      h(
        "a",
        { ...attrs, href: `/players/${props.to?.params?.id}` },
        slots.default?.(),
      ),
});

function entry(rank: number, value: number) {
  return {
    rank,
    player_steam_id: `7656119800000000${rank}`,
    player_name: `Player ${rank}`,
    player_avatar_url: null,
    player_custom_avatar_url: null,
    player_country: null,
    value,
    secondary_value: rank,
    tertiary_value: 0,
    matches_played: 10 + rank,
  };
}

function mountPodium(props: Record<string, unknown>) {
  return mount(LeaderboardPodium, {
    props: {
      isAwards: false,
      meSteamId: null,
      highlightedSteamId: null,
      formatValue: (e: { value: number }) => String(e.value),
      valueColor: () => undefined,
      meta: (e: { matches_played: number }) => `${e.matches_played} matches`,
      ...props,
    },
    global: { components: { NuxtLink }, mocks: { $t: t } },
  });
}

describe("LeaderboardPodium", () => {
  it("stands the leader in the middle, second on the left, third on the right", () => {
    const wrapper = mountPodium({
      entries: [entry(1, 6200), entry(2, 6100), entry(3, 6000)],
    });
    const pods = wrapper.findAll(".lb-pod");
    expect(pods.map((p) => p.find(".lb-pod-place").text())).toEqual([
      "2",
      "1",
      "3",
    ]);
    expect(pods[1].classes()).toContain("lb-pod--first");
    expect(pods[1].attributes("href")).toBe("/players/76561198000000001");
    expect(pods[1].find(".lb-pod-value").text()).toBe("6200");
    expect(pods[1].find(".lb-pod-meta").text()).toBe("11 matches");
  });

  it("fills missing places with an empty card", () => {
    const wrapper = mountPodium({ entries: [entry(1, 5000)] });
    const empty = wrapper.findAll(".lb-pod--empty");
    expect(empty).toHaveLength(2);
    expect(empty[0].text()).toBe(en.pages.leaderboard.podium_empty);
  });

  it("marks the signed-in player and the deep-linked player", () => {
    const wrapper = mountPodium({
      entries: [entry(1, 3), entry(2, 2), entry(3, 1)],
      meSteamId: "76561198000000002",
      highlightedSteamId: "76561198000000003",
    });
    const pods = wrapper.findAll(".lb-pod");
    expect(pods[0].classes()).toContain("lb-pod--me");
    expect(pods[0].text()).toContain(en.pages.leaderboard.you);
    expect(pods[2].classes()).toContain("lb-pod--highlight");
  });

  it("shows gold, silver and bronze counts and MVPs on the trophies board", () => {
    const wrapper = mountPodium({
      entries: [entry(1, 4)],
      isAwards: true,
    });
    const leader = wrapper.find(".lb-pod--first");
    expect(leader.find(".lb-pod-value").exists()).toBe(false);
    expect(leader.findAll(".lb-medals > span").map((s) => s.text())).toEqual([
      "4",
      "1",
      "0",
    ]);
    expect(leader.find(".lb-pod-meta").text()).toContain("11");
  });
});
