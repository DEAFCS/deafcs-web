import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import { draftAfter, makeDraft } from "./fixtures/captainPick";
import {
  ButtonStub,
  Chat,
  Filters,
  Log,
  PlayerCard,
  TeamPanel,
  TurnStatus,
} from "./fixtures/captainPickScreenStubs";
import type { CaptainPickDraftState } from "~/utilities/captainPickDraft";

const mocks = vi.hoisted(() => ({ settings: null as any }));

vi.mock("~/stores/ApplicationSettings", () => ({
  useApplicationSettingsStore: () => mocks.settings,
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

// The Draft Games pieces pull in stores, GraphQL and sockets; they are
// replaced by stand-ins and the props Captain Pick hands them are what we
// assert on.
const { stub } = vi.hoisted(() => ({
  stub: (name: string) => async () => ({
    default: ((await import("./fixtures/captainPickScreenStubs")) as any)[name],
  }),
}));
vi.mock("~/components/draft-games/DraftTeamPanel.vue", stub("TeamPanel"));
vi.mock("~/components/draft-games/DraftPlayerCard.vue", stub("PlayerCard"));
vi.mock("~/components/draft-games/DraftTurnStatus.vue", stub("TurnStatus"));
vi.mock("~/components/draft-games/DraftLog.vue", stub("Log"));
vi.mock(
  "~/components/matchmaking/captain-pick/CaptainPickChat.vue",
  stub("Chat"),
);

import CaptainPickScreen from "../../components/matchmaking/captain-pick/CaptainPickScreen.vue";

const wrappers: ReturnType<typeof mount>[] = [];
const NuxtLink = defineComponent({
  name: "NuxtLink",
  props: ["to"],
  setup(props, { attrs, slots }) {
    return () => h("a", {
      ...attrs,
      href: `/players/${props.to.params.id}`,
      onClick: (event: Event) => event.preventDefault(),
    }, slots.default?.());
  },
});

const mountScreen = (
  draft: CaptainPickDraftState,
  props: Record<string, unknown> = {},
) => {
  const wrapper = mount(CaptainPickScreen, {
    props: { draft, localDeadline: draft.deadline, ...props },
    global: {
      stubs: {
        NuxtLink,
        DraftTeamPanel: TeamPanel,
        DraftPlayerCard: PlayerCard,
        DraftTurnStatus: TurnStatus,
        DraftLog: Log,
        CaptainPickChat: Chat,
        AnimatedFilters: Filters,
        Button: ButtonStub,
      },
      mocks: {
        $t: (key: string, params?: Record<string, unknown>) =>
          params ? `${key}:${JSON.stringify(params)}` : key,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const card = (wrapper: ReturnType<typeof mount>, steamId: string) =>
  wrapper.find(`[data-testid="captain-pick-player-${steamId}"]`);

const poolIds = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('[data-testid^="captain-pick-player-"]')
    .map((node) =>
      node.attributes("data-testid").replace("captain-pick-player-", ""),
    );

const players = {
  "2": { steam_id: "2", name: "Captain Two", country: "DK" },
  "3": { steam_id: "3", name: "Three", country: "DE", premier_rank: 21000 },
  "4": { steam_id: "4", name: "Four", country: "NO" },
  "5": { steam_id: "5", name: "Five" },
};

beforeEach(() => {
  mocks.settings = reactive({
    linkedAccountsEnabled: true,
    faceitEnabled: true,
  });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("Captain Pick screen: Draft layout", () => {
  it("shows the clock, who is picking and the pick order like Draft Games", () => {
    const wrapper = mountScreen(draftAfter([{ steam_id: "3" }]), {
      selfSteamId: "7",
    });
    const turn = wrapper.findComponent(TurnStatus);

    expect(turn.props("deadline")).toBe("2026-09-29T20:00:30.000Z");
    expect(turn.props("total")).toBe(30);
    expect(turn.props("isMine")).toBe(false);
    // Team 2 on the clock: Draft's blue accent.
    expect(turn.props("accent")).toBe("200 90% 62%");
    expect(turn.props("timeline").map((slot: any) => slot.state)).toEqual([
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(turn.props("timeline").map((slot: any) => slot.lineup)).toEqual([
      1, 2, 2, 1, 1, 2, 2,
    ]);
    expect(wrapper.find('[data-testid="captain-pick-turn"]').text()).toContain(
      '"name":"Player 1"',
    );
    expect(wrapper.find('[data-testid="captain-pick-progress"]').text()).toBe(
      'matchmaking.captain_pick.pick_progress:{"current":2,"total":7}',
    );
  });

  it("tells the captain it is their pick", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2" });

    expect(
      wrapper.find('[data-testid="captain-pick-your-turn"]').exists(),
    ).toBe(true);
    expect(wrapper.findComponent(TurnStatus).props("isMine")).toBe(true);
    expect(wrapper.findComponent(TurnStatus).props("accent")).toBe(
      "var(--tac-amber)",
    );
  });

  it("renders both teams in Draft team panels with full player records", () => {
    const wrapper = mountScreen(draftAfter([{ steam_id: "3" }]), {
      selfSteamId: "7",
      players,
    });
    const [teamA, teamB] = wrapper.findAllComponents(TeamPanel);

    expect(teamA.props("title")).toContain('"name":"Player 2"');
    expect(teamB.props("title")).toContain('"name":"Player 1"');
    expect(teamA.props("accent")).toBe("amber");
    expect(teamB.props("accent")).toBe("blue");
    expect(teamA.props("perTeam")).toBe(5);
    expect(teamA.props("profileInNewTab")).toBe(false);
    expect(teamB.props("active")).toBe(true);
    expect(teamA.props("active")).toBe(false);
    // Fetched records (with country) replace the lean participant data.
    expect(
      teamA.findAll(".member").map((m) => m.attributes("data-country")),
    ).toEqual(["DK", "DE"]);
    // Missing record: still shown, from the server's participant data.
    expect(teamB.find(".member").text()).toBe("Player 1");
  });

  it("shows the pool as Draft player cards with flags from the player records", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "7", players });
    const cards = wrapper.findAllComponents(PlayerCard);

    expect(poolIds(wrapper)).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(cards[0].props("member").player.country).toBe("DE");
    expect(cards[1].props("member").player.country).toBe("NO");
    expect(cards[2].props("member").player.country).toBeUndefined();
    expect(cards[0].props("profileInNewTab")).toBe(false);
    expect(cards[0].props("linkable")).toBe(false);
  });

  it("puts the chat in the sidebar with the viewer's server-side lineup", () => {
    const captain = mountScreen(makeDraft(), { selfSteamId: "1" });
    expect(captain.findComponent(Chat).props()).toEqual({
      draftId: "draft-1",
      myLineup: 2,
    });

    const unpicked = mountScreen(makeDraft(), { selfSteamId: "5" });
    expect(unpicked.findComponent(Chat).props("myLineup")).toBeNull();

    const picked = mountScreen(draftAfter([{ steam_id: "5" }]), {
      selfSteamId: "5",
    });
    expect(picked.findComponent(Chat).props("myLineup")).toBe(1);
  });
});

describe("Captain Pick screen: chat on phones and tablets", () => {
  const classesOf = (node: { classes: () => string[] }) => node.classes();

  it("keeps one chat, shown on every screen size and placed after the Draft Log", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "5" });
    const section = wrapper.find('[data-testid="captain-pick-chat-section"]');
    const history = wrapper.find('[data-testid="captain-pick-history"]');

    expect(wrapper.findAllComponents(Chat)).toHaveLength(1);
    expect(section.exists()).toBe(true);
    // Never hidden below xl: no base "hidden", no display only from xl up.
    expect(classesOf(section)).not.toContain("hidden");
    expect(
      classesOf(section).filter((c) =>
        /^(xl|lg|md|sm):(flex|block|grid)$/.test(c),
      ),
    ).toEqual([]);
    // Sidebar only from xl; below that the single column stacks in order.
    expect(
      wrapper.find('[data-testid="captain-pick-screen"]').classes(),
    ).toContain("xl:grid-cols-[minmax(0,1fr)_340px]");
    expect(
      history.element.compareDocumentPosition(section.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("puts the draft first: clock, teams, pool, Draft Log, then chat", () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2" });
    const order = [
      "captain-pick-turn-card",
      "captain-pick-team-1",
      "captain-pick-pool",
      "captain-pick-history",
      "captain-pick-chat-section",
    ].map((id) => wrapper.find(`[data-testid="${id}"]`).element);

    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("unlocks Team the moment the server picks the player, including the last one", async () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "10" });
    const chat = () => wrapper.findComponent(Chat);
    expect(chat().props("myLineup")).toBeNull();

    await wrapper.setProps({ draft: draftAfter([{ steam_id: "4" }]) });
    expect(chat().props("myLineup")).toBeNull();

    // Nobody picks 10: the server places them on Team A after pick seven.
    await wrapper.setProps({
      draft: draftAfter(
        ["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id })),
      ),
    });
    expect(chat().props("myLineup")).toBe(1);
    expect(wrapper.findAllComponents(Chat)).toHaveLength(1);
  });

  it("gives a picked player their own side only", async () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "4" });

    await wrapper.setProps({
      draft: draftAfter([{ steam_id: "3" }, { steam_id: "4" }]),
    });

    expect(wrapper.findComponent(Chat).props()).toEqual({
      draftId: "draft-1",
      myLineup: 2,
    });
  });
});

describe("Captain Pick screen: ratings", () => {
  it("offers DEAFCS / CS2 / FACEIT and only changes what the cards show", async () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2", players });
    const source = wrapper.find('[data-testid="captain-pick-rating-source"]');
    expect(
      source.findAll("button").map((b) => b.attributes("data-source")),
    ).toEqual(["elo", "cs2", "faceit"]);

    const matchTypes = () => [
      ...wrapper.findAllComponents(TeamPanel).map((c) => c.props("matchType")),
      ...wrapper.findAllComponents(PlayerCard).map((c) => c.props("matchType")),
    ];
    expect(new Set(matchTypes())).toEqual(new Set(["Competitive"]));

    await source.find('[data-source="cs2"]').trigger("click");
    expect(new Set(matchTypes())).toEqual(new Set(["Premier"]));

    await source.find('[data-source="faceit"]').trigger("click");
    expect(new Set(matchTypes())).toEqual(new Set(["Faceit"]));

    // Same pool, same pick: the rating is display only.
    expect(poolIds(wrapper)).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
    await wrapper.find('[data-testid="captain-pick-draft-4"]').trigger("click");
    expect(wrapper.emitted("pick")).toEqual([["4"]]);
  });

  it("hides the selector when only DEAFCS ratings exist", () => {
    mocks.settings = reactive({
      linkedAccountsEnabled: false,
      faceitEnabled: false,
    });
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2" });

    expect(
      wrapper.find('[data-testid="captain-pick-rating-source"]').exists(),
    ).toBe(false);
  });
});

describe("Captain Pick screen: picking", () => {
  it("picks from the Draft button and from the card itself", async () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2" });

    await wrapper.find('[data-testid="captain-pick-draft-5"]').trigger("click");
    await card(wrapper, "6").find(".body").trigger("click");

    expect(wrapper.emitted("pick")).toEqual([["5"], ["6"]]);
  });

  it("uses a dedicated same-context profile control without picking or bubbling", async () => {
    const wrapper = mountScreen(makeDraft(), { selfSteamId: "2" });
    const playerCard = card(wrapper, "5");
    expect(playerCard.find("a.profile").exists()).toBe(false);
    const profile = playerCard.get('[data-testid="captain-pick-profile-5"]');
    const parentClick = vi.fn();
    playerCard.element.addEventListener("click", parentClick);

    expect(profile.attributes("href")).toBe("/players/5");
    expect(profile.attributes("target")).toBeUndefined();
    expect(playerCard.getComponent(NuxtLink).props("to")).toEqual({
      name: "players-id", params: { id: "5" },
    });
    await profile.trigger("click");

    expect(wrapper.emitted("pick")).toBeUndefined();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("never picks for someone who is not on the clock", async () => {
    for (const selfSteamId of ["1", "5", null]) {
      const wrapper = mountScreen(makeDraft(), { selfSteamId });
      expect(
        wrapper.find('[data-testid="captain-pick-draft-5"]').exists(),
      ).toBe(false);
      await card(wrapper, "5").find(".body").trigger("click");
      expect(wrapper.emitted("pick")).toBeUndefined();
    }
  });

  it("blocks picks while one is pending or after the deadline", async () => {
    for (const props of [{ pending: true }, { timeUp: true }]) {
      const wrapper = mountScreen(makeDraft(), { selfSteamId: "2", ...props });
      expect(
        wrapper.find('[data-testid="captain-pick-draft-5"]').exists(),
      ).toBe(false);
      await card(wrapper, "5").find(".body").trigger("click");
      expect(wrapper.emitted("pick")).toBeUndefined();
    }
    const late = mountScreen(makeDraft(), { selfSteamId: "2", timeUp: true });
    expect(late.text()).toContain("matchmaking.captain_pick.time_up");
  });

  it("removes picked players from the pool", () => {
    const wrapper = mountScreen(
      draftAfter([{ steam_id: "3" }, { steam_id: "4" }]),
      { selfSteamId: "1" },
    );

    expect(poolIds(wrapper)).toEqual(["5", "6", "7", "8", "9", "10"]);
  });
});

describe("Captain Pick screen: Draft Log and the end of the draft", () => {
  it("logs every pick with who picked and marks timeout picks as auto", () => {
    const wrapper = mountScreen(
      draftAfter([{ steam_id: "3" }, { steam_id: "4", auto: true }]),
      { selfSteamId: "7", players },
    );
    const picks = wrapper.findComponent(Log).props("picks");

    // Captain Pick opts in to the spelled-out label (Draft Games doesn't).
    expect(wrapper.findComponent(Log).props("showAutoPickLabel")).toBe(true);
    expect(picks).toHaveLength(2);
    expect(picks[0]).toMatchObject({
      lineup: 1,
      auto_picked: false,
      captain: { steam_id: "2", name: "Captain Two" },
      picked: { steam_id: "3", name: "Three" },
    });
    expect(picks[1]).toMatchObject({
      lineup: 2,
      auto_picked: true,
      captain: { steam_id: "1" },
      picked: { steam_id: "4", name: "Four" },
    });
  });

  it("locks the teams after seven picks and places the last player without an eighth pick", () => {
    const done = draftAfter(
      ["3", "4", "5", "6", "7", "8", "9"].map((steam_id) => ({ steam_id })),
    );
    const wrapper = mountScreen(done, { selfSteamId: "2" });

    expect(wrapper.findComponent(TurnStatus).exists()).toBe(false);
    expect(wrapper.find('[data-testid="captain-pick-locked"]').text()).toBe(
      "matchmaking.captain_pick.creating_match",
    );
    expect(wrapper.find('[data-testid="captain-pick-pool"]').exists()).toBe(
      false,
    );
    expect(wrapper.findComponent(Log).props("picks")).toHaveLength(7);
    expect(
      wrapper.find('[data-testid="captain-pick-last-player"]').text(),
    ).toContain('"player":"Player 10"');
    const [teamA, teamB] = wrapper.findAllComponents(TeamPanel);
    expect(teamA.props("players")).toHaveLength(5);
    expect(teamB.props("players")).toHaveLength(5);
    expect(wrapper.emitted("pick")).toBeUndefined();
  });
});
