import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import CaptainPickScreen from "../../components/matchmaking/captain-pick/CaptainPickScreen.vue";
import { draftAfter, makeDraft } from "./fixtures/captainPick";
import type { CaptainPickDraftState } from "~/utilities/captainPickDraft";

// Roster/clock/ELO pieces come from Draft Games and pull in stores and
// GraphQL; they are stubbed here but their props are what we assert on.
const TeamPanel = defineComponent({
  name: "DraftTeamPanel",
  props: ["title", "players", "perTeam", "active", "accent"],
  setup(props) {
    return () =>
      h("div", { "data-stub": "team", "data-active": String(!!props.active) }, [
        h("span", { class: "title" }, props.title),
        ...props.players.map((p: any) =>
          h(
            "span",
            { class: "member", "data-steam": p.steam_id },
            p.player.name,
          ),
        ),
      ]);
  },
});
const Clock = defineComponent({
  name: "DraftClock",
  props: ["deadline", "total", "pulse"],
  setup(props, { slots }) {
    return () =>
      h(
        "div",
        { "data-stub": "clock", "data-deadline": props.deadline },
        slots.default?.(),
      );
  },
});
const Elo = defineComponent({
  name: "PlayerElo",
  props: ["elo", "historicalElo"],
  setup(props) {
    return () => h("span", { class: "elo" }, String(props.historicalElo));
  },
});

const wrappers: ReturnType<typeof mount>[] = [];

const mountScreen = (
  draft: CaptainPickDraftState,
  props: Record<string, unknown> = {},
) => {
  const wrapper = mount(CaptainPickScreen, {
    props: { draft, localDeadline: draft.deadline, ...props },
    global: {
      stubs: { DraftTeamPanel: TeamPanel, DraftClock: Clock, PlayerElo: Elo },
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const poolButtons = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('[data-testid^="captain-pick-player-"]');

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("Captain Pick screen", () => {
  it("renders both server-chosen captains' teams and the pool", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "7" });
    const teams = wrapper.findAllComponents(TeamPanel);

    // Team A is lineup 1 (the captain picking first), Team B lineup 2.
    expect(teams[0].props("title")).toContain('"name":"Player 2"');
    expect(teams[0].props("players").map((p: any) => p.steam_id)).toEqual([
      "2",
    ]);
    expect(teams[0].props("perTeam")).toBe(5);
    expect(teams[1].props("title")).toContain('"name":"Player 1"');
    expect(teams[1].props("players").map((p: any) => p.steam_id)).toEqual([
      "1",
    ]);
    // Rosters carry the Competitive ELO the draft started with.
    expect(teams[1].props("players")[0].player.elo).toEqual({
      competitive: 12500,
    });

    expect(
      poolButtons(wrapper).map((b) => b.attributes("data-testid")),
    ).toEqual(
      ["3", "4", "5", "6", "7", "8", "9", "10"].map(
        (id) => `captain-pick-player-${id}`,
      ),
    );
    expect(wrapper.find('[data-testid="captain-pick-pool"]').text()).toContain(
      "9000",
    );
  });

  it("shows whose turn it is and highlights that team", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "7" });

    expect(wrapper.find('[data-testid="captain-pick-turn"]').text()).toContain(
      '"name":"Player 2"',
    );
    expect(
      wrapper.find('[data-testid="captain-pick-your-turn"]').exists(),
    ).toBe(false);
    const teams = wrapper.findAllComponents(TeamPanel);
    expect(teams[0].props("active")).toBe(true);
    expect(teams[1].props("active")).toBe(false);
    expect(
      wrapper.find('[data-testid="captain-pick-progress"]').text(),
    ).toContain('"current":1,"total":7');
  });

  it("lets only the captain on turn pick, and says so clearly", async () => {
    const captain = mountScreen(makeDraft(), { selfSteamId: "2" });

    expect(captain.find('[data-testid="captain-pick-your-turn"]').text()).toBe(
      "matchmaking.captain_pick.your_pick",
    );
    expect(poolButtons(captain).every((b) => !b.attributes("disabled"))).toBe(
      true,
    );

    await poolButtons(captain)[2].trigger("click");
    expect(captain.emitted("pick")).toEqual([["5"]]);
  });

  it("does not let the other captain or a player pick", async () => {
    for (const steamId of ["1", "6", null]) {
      const wrapper = mountScreen(makeDraft(), { selfSteamId: steamId });
      expect(
        poolButtons(wrapper).every(
          (b) => b.attributes("disabled") !== undefined,
        ),
      ).toBe(true);
      await poolButtons(wrapper)[0].trigger("click");
      expect(wrapper.emitted("pick")).toBeUndefined();
    }
  });

  it("blocks repeat clicks while a pick is on its way", async () => {
    const wrapper = mountScreen(makeDraft(), {
      selfSteamId: "2",
      pending: true,
    });

    await poolButtons(wrapper)[0].trigger("click");
    expect(wrapper.emitted("pick")).toBeUndefined();
  });

  it("stops picking once time is up and waits for the server's auto-pick", async () => {
    const wrapper = mountScreen(makeDraft(), {
      selfSteamId: "2",
      timeUp: true,
    });

    expect(wrapper.text()).toContain("matchmaking.captain_pick.time_up");
    await poolButtons(wrapper)[0].trigger("click");
    expect(wrapper.emitted("pick")).toBeUndefined();
  });

  it("follows the server when the captain has two picks in a row", () => {
    // After pick 1, captain B (player 1) has picks 2 and 3.
    const afterFirst = draftAfter([{ steam_id: "5" }]);
    const wrapper = mountScreen(afterFirst, { selfSteamId: "1" });

    expect(
      wrapper.find('[data-testid="captain-pick-your-turn"]').exists(),
    ).toBe(true);
    expect(
      wrapper
        .findAllComponents(TeamPanel)[0]
        .props("players")
        .map((p: any) => p.steam_id),
    ).toEqual(["2", "5"]);
    expect(
      wrapper.find('[data-testid="captain-pick-progress"]').text(),
    ).toContain('"current":2,"total":7');
  });

  it("marks auto-picks in the pick history", () => {
    const wrapper = mountScreen(
      draftAfter([{ steam_id: "3", auto: true }, { steam_id: "4" }]),
      { selfSteamId: "7" },
    );

    const first = wrapper.find('[data-testid="captain-pick-history-0"]');
    const second = wrapper.find('[data-testid="captain-pick-history-1"]');
    expect(first.find('[data-testid="captain-pick-auto"]').exists()).toBe(true);
    expect(first.text()).toContain('"captain":"Player 2","player":"Player 3"');
    expect(second.find('[data-testid="captain-pick-auto"]').exists()).toBe(
      false,
    );
  });

  it("treats pick 7 as the last manual pick", () => {
    const beforeLast = draftAfter(
      ["3", "4", "5", "6", "7", "8"].map((steam_id) => ({ steam_id })),
    );
    const wrapper = mountScreen(beforeLast, { selfSteamId: "1" });

    expect(
      wrapper.find('[data-testid="captain-pick-progress"]').text(),
    ).toContain('"current":7,"total":7');
    expect(poolButtons(wrapper)).toHaveLength(2);
  });

  it("shows no eighth pick: the last player is placed automatically", async () => {
    const locked = draftAfter(
      ["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id })),
    );
    const wrapper = mountScreen(locked, { selfSteamId: "2" });

    expect(locked.lineups[1]).toHaveLength(5);
    expect(locked.lineups[2]).toHaveLength(5);
    expect(
      wrapper.find('[data-testid="captain-pick-your-turn"]').exists(),
    ).toBe(false);
    expect(wrapper.find('[data-stub="clock"]').exists()).toBe(false);
    expect(poolButtons(wrapper)).toHaveLength(0);
    expect(wrapper.find('[data-testid="captain-pick-locked"]').text()).toBe(
      "matchmaking.captain_pick.creating_match",
    );
    expect(
      wrapper.find('[data-testid="captain-pick-last-player"]').text(),
    ).toContain('"player":"Player 10"');
  });

  it("drives the countdown from the server deadline it is given", () => {
    const wrapper = mountScreen(makeDraft(), {
      selfSteamId: "2",
      localDeadline: "2026-09-29T20:00:25.000Z",
    });

    const clock = wrapper.findComponent(Clock);
    expect(clock.props("deadline")).toBe("2026-09-29T20:00:25.000Z");
    expect(clock.props("total")).toBe(30);
    expect(clock.props("pulse")).toBe(true);
  });

  it("explains a tied first pick without animating a coin flip", () => {
    const wrapper = mountScreen(
      makeDraft({ firstPickReason: "EqualEloCoinFlip" }),
    );

    expect(wrapper.text()).toContain(
      "matchmaking.captain_pick.first_pick_coin_flip",
    );
    expect(wrapper.findComponent({ name: "DraftCoinFlip" }).exists()).toBe(
      false,
    );
  });

  it("never mentions leaving, requeueing or a random map", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2" });
    const text = wrapper.text().toLowerCase();

    for (const word of [
      "leave queue",
      "requeue",
      "cancel",
      "roulette",
      "random map",
    ]) {
      expect(text).not.toContain(word);
    }
  });
});
