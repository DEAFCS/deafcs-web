import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import TimezoneFlag from "../../components/TimezoneFlag.vue";
import DraftLog from "../../components/draft-games/DraftLog.vue";
import { draftAfter, makeDraft } from "./fixtures/captainPick";
import {
  captainPickLineupMembers,
  captainPickLogEntries,
  captainPickPlayer,
  captainPickTeamChatId,
  captainPickTimeline,
  myCaptainPickLineup,
} from "~/utilities/captainPickDraft";

// PlayerDisplay pulls in stores and GraphQL; this stand-in renders a link
// the way its NuxtLink root does, so we can see the attrs it receives.
vi.mock("~/components/PlayerDisplay.vue", async () => {
  const vue = await import("vue");
  return {
    default: vue.defineComponent({
      name: "PlayerDisplay",
      props: ["player"],
      setup(props) {
        return () =>
          vue.h(
            "a",
            { href: `/players/${props.player.steam_id}` },
            props.player.name,
          );
      },
    }),
  };
});
vi.mock("~/components/draft-games/PlayerRanks.vue", async () => {
  const vue = await import("vue");
  return {
    default: vue.defineComponent({
      name: "PlayerRanks",
      setup: () => () => vue.h("span"),
    }),
  };
});
vi.mock("~/components/FiveStackToolTip.vue", async () => {
  const vue = await import("vue");
  return {
    default: vue.defineComponent({
      name: "FiveStackToolTip",
      setup:
        (_p, { slots }) =>
        () =>
          vue.h("div", [slots.trigger?.(), slots.default?.()]),
    }),
  };
});

import DraftPlayerCard from "../../components/draft-games/DraftPlayerCard.vue";

const wrappers: ReturnType<typeof mount>[] = [];
const $t = (key: string) => key;
const track = <T extends ReturnType<typeof mount>>(wrapper: T) => {
  wrappers.push(wrapper);
  return wrapper;
};

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("Captain Pick draft view helpers", () => {
  it("uses the public player record when it has loaded, otherwise the draft's own data", () => {
    const draft = makeDraft();
    const record = { steam_id: "3", name: "Three", country: "DE" };

    expect(captainPickPlayer(draft, "3", { "3": record })).toBe(record);
    expect(captainPickPlayer(draft, "4", { "3": record })).toEqual({
      steam_id: "4",
      name: "Player 4",
      avatar_url: null,
      elo: { competitive: 8500 },
    });
  });

  it("builds lineups captain first, in pick order", () => {
    const draft = draftAfter([{ steam_id: "3" }, { steam_id: "4" }]);

    expect(
      captainPickLineupMembers(draft, 2).map((m) => [m.steam_id, m.pick_order]),
    ).toEqual([
      ["1", 0],
      ["4", 1],
    ]);
  });

  it("finds the viewer's side only from the server lineups", () => {
    const draft = draftAfter([{ steam_id: "3" }]);

    expect(myCaptainPickLineup(draft, "2")).toBe(1);
    expect(myCaptainPickLineup(draft, "1")).toBe(2);
    expect(myCaptainPickLineup(draft, "3")).toBe(1);
    expect(myCaptainPickLineup(draft, "4")).toBeNull();
    expect(myCaptainPickLineup(draft, null)).toBeNull();
    expect(myCaptainPickLineup(null, "2")).toBeNull();
  });

  it("names each side's team chat room after the draft", () => {
    expect(captainPickTeamChatId("draft-1", 1)).toBe("draft-1:1");
    expect(captainPickTeamChatId("draft-1", 2)).toBe("draft-1:2");
  });

  it("marks the pick order done, current and upcoming", () => {
    expect(
      captainPickTimeline(
        draftAfter([{ steam_id: "3" }, { steam_id: "4" }]),
      ).map((slot) => slot.state),
    ).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    const done = draftAfter(
      ["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id })),
    );
    expect(
      new Set(captainPickTimeline(done).map((slot) => slot.state)),
    ).toEqual(new Set(["done"]));
  });

  it("logs the seven picks only, never the last player as an eighth", () => {
    const done = draftAfter(
      ["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({
        steam_id,
        auto: steam_id === "6",
      })),
    );
    const entries = captainPickLogEntries(done);

    expect(entries).toHaveLength(7);
    expect(entries.map((entry) => entry.picked.steam_id)).not.toContain("10");
    expect(entries.filter((entry) => entry.auto_picked)).toHaveLength(1);
    expect(entries[3]).toMatchObject({
      id: "pick-3",
      lineup: 1,
      auto_picked: true,
      captain: { steam_id: "2" },
      picked: { steam_id: "6" },
    });
  });
});

describe("country flags", () => {
  const flagFor = (country?: string) =>
    track(mount(TimezoneFlag, { props: { country } })).text();

  it("shows each player's own flag", () => {
    expect(flagFor("DE")).toBe("🇩🇪");
    expect(flagFor("DK")).toBe("🇩🇰");
    expect(flagFor("NO")).toBe("🇳🇴");
    expect(flagFor("GB")).toBe("🇬🇧");
  });

  it("shows the globe only when the country is unknown", () => {
    expect(flagFor(undefined)).toBe("🌍");
    expect(flagFor("")).toBe("🌍");
  });

  it("gives a mixed lobby mixed flags once player records are used", () => {
    const players = {
      "3": { steam_id: "3", name: "A", country: "DE" },
      "4": { steam_id: "4", name: "B", country: "DK" },
      "5": { steam_id: "5", name: "C", country: "NO" },
    };
    const flags = ["3", "4", "5", "6"].map((id) =>
      flagFor(captainPickPlayer(makeDraft(), id, players).country),
    );

    expect(flags).toEqual(["🇩🇪", "🇩🇰", "🇳🇴", "🌍"]);
  });
});

describe("DraftPlayerCard profile link", () => {
  const member = { steam_id: "5", player: { steam_id: "5", name: "Five" } };

  it("opens the profile in a new tab when asked", () => {
    const wrapper = track(
      mount(DraftPlayerCard, {
        props: { member, profileInNewTab: true },
        global: { mocks: { $t } },
      }),
    );
    const link = wrapper.find("a");

    expect(link.attributes("href")).toBe("/players/5");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener");
  });

  it("keeps normal navigation everywhere else (Draft Games)", () => {
    const wrapper = track(
      mount(DraftPlayerCard, {
        props: { member },
        global: { mocks: { $t } },
      }),
    );

    expect(wrapper.find("a").attributes("target")).toBeUndefined();
  });
});

describe("DraftLog", () => {
  const mountLog = (picks: any[]) =>
    track(
      mount(DraftLog, {
        props: { picks },
        global: {
          mocks: { $t },
          stubs: {
            TransitionGroup: defineComponent({
              setup:
                (_p, { slots }) =>
                () =>
                  h("div", slots.default?.()),
            }),
          },
        },
      }),
    );

  it("labels timed-out picks as auto-picked", () => {
    const wrapper = mountLog([
      {
        id: "pick-0",
        lineup: 1,
        auto_picked: false,
        captain: { name: "Cap" },
        picked: { name: "Three" },
      },
      {
        id: "pick-1",
        lineup: 2,
        auto_picked: true,
        captain: { name: "Cap B" },
        picked: { name: "Four" },
      },
    ]);
    const autos = wrapper.findAll('[data-testid="draft-log-auto"]');

    expect(autos).toHaveLength(1);
    expect(autos[0].text()).toBe("draft_games.room.log_auto");
    expect(wrapper.text()).toContain("Four");
  });
});
