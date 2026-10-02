import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import TimezoneFlag from "../../components/TimezoneFlag.vue";
import { makeDraft } from "./fixtures/captainPick";
import { captainPickPlayer } from "../../utilities/captainPickDraft";
import { useCaptainPickPlayers } from "../../composables/useCaptainPickPlayers";
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/stores/ApplicationSettings", () => ({
  useApplicationSettingsStore: () => ({ linkedAccountsEnabled: false, faceitEnabled: false }),
}));

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({ query }),
}));
// Keep real Overview, pool, team panels, cards, PlayerDisplay and flags.
// Stub unrelated stages and leaf dependencies, never the profile-link logic.
vi.mock("~/components/draft-games/PlayerRanks.vue", () => ({
  default: { template: "<span />" },
}));
vi.mock("~/components/draft-games/DraftLog.vue", () => ({
  default: { template: "<span />" },
}));
import CaptainPickProgress from "../../components/match/CaptainPickProgress.vue";
import MatchOverview from "../../components/match/overview/MatchOverview.vue";
import PlayerDisplay from "../../components/PlayerDisplay.vue";
import CaptainPickScreen from "../../components/matchmaking/captain-pick/CaptainPickScreen.vue";

const navigate = vi.fn();
const NuxtLink = defineComponent({
  name: "NuxtLink",
  props: ["to"],
  setup(props, { attrs, slots }) {
    return () => h("a", {
      ...attrs,
      href: props.to?.name === "players-id" ? `/players/${props.to.params.id}` : props.to,
      onClick: (event: Event) => { event.preventDefault(); navigate(props.to); },
    }, slots.default?.());
  },
});
const wrappers: ReturnType<typeof mount>[] = [];
const globalOptions = {
      stubs: {
        NuxtLink,
        FiveStackToolTip: { template: '<span><slot name="trigger" /></span>' },
        Avatar: { template: "<span><slot /></span>" },
        AvatarImage: { props: ["src"], template: '<img :src="src" />' },
        AvatarFallback: true,
        PlayerElo: true, PlayerVacBadge: true, PlayerPremierRank: true,
        PlayerFaceitRank: true, PlayerSkillGroupRank: true,
        DraftOpenSlot: true,
        OverviewActionBar: true, OverviewSchedule: true, OverviewCheckIn: true,
        OverviewRegion: true, OverviewPreMatch: true, OverviewVeto: true,
        MatchRegionVeto: true,
        Tooltip: true, TooltipTrigger: true, TooltipContent: true,
        CaptainPickChat: true, DraftTurnStatus: true, AnimatedFilters: true,
        Button: { template: '<button><slot /></button>' },
      },
      config: { globalProperties: { $t: (key: string) => key } },
    };
const mountOverview = (draft = makeDraft({ available: ["3", "4", "5"] })) => {
  const wrapper = mount(MatchOverview, {
    props: { match: { id: "m1", status: "PickingPlayers", options: {} }, stage: "captain-pick", captainPickProgress: draft },
    global: globalOptions,
  });
  wrappers.push(wrapper);
  return wrapper;
};
beforeEach(() => {
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({ eloForPlayer: () => null }));
  vi.stubGlobal("useAuthStore", () => ({ me: null }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.example" } }));
  vi.stubGlobal("useMatchmakingStore", () => ({ onlinePlayerSteamIds: [] }));
});

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Captain Pick public country records in match Overview", () => {
  const records = [
    { steam_id: "3", name: "Danish player", country: "DK", avatar_url: "https://example.com/dk.png", role: "moderator", elo: { competitive: 6000 }, faceit: { elo: 2200 } },
    { steam_id: "4", name: "German player", country: "DE", avatar_url: "https://example.com/de.png", role: "verified_user", elo: { competitive: 5500 } },
    { steam_id: "5", name: "Unknown country", country: null },
  ];

  it("public enrichment wins over the draft fallback and preserves DK, DE and null flags", async () => {
    query.mockResolvedValue({ data: { players: records } });
    const draft = ref(makeDraft());
    const { players } = useCaptainPickPlayers(draft);
    await flushPromises();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].query.loc.source.body).toContain("country");
    for (const [index, record] of records.entries()) {
      const player = captainPickPlayer(draft.value, record.steam_id, players.value);
      expect(player).toBe(players.value[record.steam_id]);
      const flag = mount(TimezoneFlag, { props: { country: player.country } });
      expect(flag.text()).toBe(["🇩🇰", "🇩🇪", "🌍"][index]);
      flag.unmount();
    }
  });

  it("Overview available-player cards must load public countries instead of permanently rendering fallback globes", async () => {
    query.mockResolvedValue({ data: { players: records } });
    const wrapper = mountOverview();
    await flushPromises();
    const flags = wrapper.getComponent(CaptainPickProgress).findAllComponents(TimezoneFlag).map((flag) => flag.text());
    expect(flags).toEqual(["🇩🇰", "🇩🇪", "🌍"]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps enriched pool and picked players on named same-context profile routes", async () => {
    query.mockResolvedValue({ data: { players: records } });
    const wrapper = mountOverview();
    await flushPromises();
    const display = wrapper.getComponent(CaptainPickProgress).findAllComponents(PlayerDisplay)[0];
    expect(display.props()).toMatchObject({ player: records[0], linkable: true, showRole: true, showElo: true });
    expect(display.find("img").attributes("src")).toBe(records[0].avatar_url);
    expect(display.find(".lucide-shield-half").exists()).toBe(true);
    const profile = display.getComponent(NuxtLink);
    const route = { name: "players-id", params: { id: "3" } };
    expect(profile.props("to")).toEqual(route);
    expect(profile.attributes("target")).toBeUndefined();
    expect(profile.attributes("href")).toBe("/players/3");
    await profile.trigger("click");
    expect(navigate).toHaveBeenCalledWith(route);

    // A public pick update must reuse the enriched record in the team panel.
    const draft = makeDraft({ available: ["4", "5"], lineups: { 1: ["2", "3"], 2: ["1"] } });
    await wrapper.setProps({ captainPickProgress: draft });
    const picked = wrapper.findAllComponents(PlayerDisplay).find((card) => card.props("player").steam_id === "3")!;
    expect(picked.props("player")).toEqual(records[0]);
    expect(picked.getComponent(TimezoneFlag).text()).toBe("🇩🇰");
    expect(picked.getComponent(NuxtLink).props("to")).toEqual(route);
    expect(picked.getComponent(NuxtLink).attributes("target")).toBeUndefined();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("real selectable cards pick on the main card while the dedicated profile link stops propagation", async () => {
    const wrapper = mount(CaptainPickScreen, {
      props: { draft: makeDraft(), selfSteamId: "2", players: { "3": records[0] } },
      global: globalOptions,
    });
    wrappers.push(wrapper);
    const card = wrapper.get('[data-testid="captain-pick-player-3"]');
    const display = card.getComponent(PlayerDisplay);
    expect(display.props("linkable")).toBe(false);
    expect(display.getComponent(NuxtLink).props("to")).toBeNull();
    await card.get(".draft-player-card").trigger("click");
    expect(wrapper.emitted("pick")).toEqual([["3"]]);
    await display.getComponent(NuxtLink).trigger("click");
    expect(wrapper.emitted("pick")).toEqual([["3"], ["3"]]);
    const parentClick = vi.fn();
    card.element.addEventListener("click", parentClick);
    const profile = card.get('[data-testid="captain-pick-profile-3"]');
    const link = card.findAllComponents(NuxtLink).find((item) => item.props("to")?.name === "players-id")!;
    expect(link.props("to")).toEqual({ name: "players-id", params: { id: "3" } });
    expect(profile.attributes("target")).toBeUndefined();
    const open = vi.spyOn(window, "open");
    await profile.trigger("click");
    expect(navigate).toHaveBeenCalledWith({ name: "players-id", params: { id: "3" } });
    expect(wrapper.emitted("pick")).toEqual([["3"], ["3"]]);
    expect(parentClick).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("does not start player enrichment for a normal match stage", async () => {
    const wrapper = mountOverview();
    await flushPromises();
    query.mockClear();
    await wrapper.setProps({ stage: "check-in", captainPickProgress: null });
    await flushPromises();
    expect(query).not.toHaveBeenCalled();
    expect((wrapper.vm as any).captainPickPlayers).toEqual({});
  });

  it("ignores late enrichment from a previous match scope", async () => {
    let resolveOld!: (value: any) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    query.mockResolvedValueOnce({ data: { players: [records[1]] } });
    const draft = ref(makeDraft());
    const { players } = useCaptainPickPlayers(draft);
    draft.value = makeDraft({ draftId: "new-match" });
    await flushPromises();
    expect(Object.keys(players.value)).toEqual(["4"]);
    resolveOld({ data: { players: [records[0]] } });
    await flushPromises();
    expect(Object.keys(players.value)).toEqual(["4"]);
  });
});
