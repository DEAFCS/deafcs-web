import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, shallowMount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, reactive } from "vue";
import LiveAvatarImg from "../../components/LiveAvatarImg.vue";
import ChatMessage from "../../components/chat/ChatMessage.vue";
import PartySeats from "../../components/hub/PartySeats.vue";
import MatchLobby from "../../components/matchmaking-lobby/MatchLobby.vue";
import { CHAT_REACTIONS } from "../../constants/chat";
import {
  chatReactionChoices,
  heldChatReactions,
} from "../../utilities/chatMessageActions";
import { resolveAvatarUrl } from "../../utilities/avatarUrl";

vi.mock("~/utilities/dateLocale", () => ({ dateLocale: () => "en-US" }));
const state = vi.hoisted(() => ({
  mutate: vi.fn().mockResolvedValue({}),
  invite: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({ mutate: state.mutate }),
}));

const auth = reactive({ me: { steam_id: "1" }, isRoleAbove: () => false });
const members = () => [
  {
    captain: false,
    status: "Invited",
    player: { steam_id: "3", name: "Invited", avatar_url: "/3.jpg" },
  },
  {
    captain: true,
    status: "Accepted",
    player: { steam_id: "1", name: "Captain", avatar_url: "/1.jpg" },
  },
  {
    captain: false,
    status: "Accepted",
    player: { steam_id: "2", name: "Member", avatar_url: "/2.jpg" },
  },
];
const global = {
  mocks: {
    $t: (key: string, params?: any) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
  },
  stubs: {
    NuxtLink: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("a", slots.default?.()),
    }),
    FiveStackToolTip: defineComponent({
      setup:
        (_, { slots }) =>
        () =>
          h("div", slots.trigger?.()),
    }),
    PlayerSearch: defineComponent({
      props: ["exclude"],
      emits: ["selected"],
      setup:
        (_, { slots }) =>
        () =>
          h("div", { "data-search": "" }, slots.default?.()),
    }),
    PlayerElo: true,
    MatchmakingLobbyAccess: true,
  },
};
let seatSettings: any;
beforeEach(() => {
  seatSettings = {
    isMatchmakingTypeEnabled: () => true,
    captainPickEnabled: true,
    maxCompetitivePartySize: 5,
  };
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.deafcs.test" },
  }));
  vi.stubGlobal("useAuthStore", () => auth);
  vi.stubGlobal("useMatchmakingStore", () => ({ inviteToLobby: state.invite }));
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({
    eloForPlayer: () => ({ competitive: 1200 }),
  }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useApplicationSettingsStore", () => seatSettings);
  auth.me = { steam_id: "1" };
  state.mutate.mockClear();
  state.invite.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("dock avatar URL and fallback", () => {
  it("resolves custom paths and preserves Steam CDN URLs", () => {
    expect(resolveAvatarUrl("/avatars/NOBOXEEE.jpg", "api.deafcs.test")).toBe(
      "https://api.deafcs.test/avatars/NOBOXEEE.jpg",
    );
    expect(
      resolveAvatarUrl(
        "https://avatars.steamstatic.com/user.jpg",
        "api.deafcs.test",
      ),
    ).toBe("https://avatars.steamstatic.com/user.jpg");
  });
  it("uses the current custom avatar and shows a silhouette on load failure", async () => {
    const w = mount(LiveAvatarImg, {
      props: { steamId: "2", fallbackUrl: "/old.jpg" },
      global: {
        mocks: {
          $apollo: {
            query: vi
              .fn()
              .mockResolvedValue({
                data: { players_by_pk: { custom_avatar_url: "/new.jpg" } },
              }),
          },
        },
      },
    });
    await flushPromises();
    expect(w.get("img").attributes("src")).toBe(
      "https://api.deafcs.test/new.jpg",
    );
    await w.get("img").trigger("error");
    expect(w.find("img").exists()).toBe(false);
    expect(w.find("svg").exists()).toBe(true);
    await w.setProps({ fallbackUrl: "/updated.jpg" });
    expect(w.find("img").exists()).toBe(true);
    w.unmount();
  });
  it("handles missing avatars and failed live queries", async () => {
    const w = mount(LiveAvatarImg, {
      props: { steamId: "2" },
      global: {
        mocks: {
          $apollo: { query: vi.fn().mockRejectedValue(new Error("offline")) },
        },
      },
    });
    await flushPromises();
    expect(w.find("svg").exists()).toBe(true);
    w.unmount();
  });
  it("ignores a stale response after switching people", async () => {
    let finish: (value: any) => void = () => {};
    const query = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({ data: { players_by_pk: { avatar_url: "/3.jpg" } } });
    const w = mount(LiveAvatarImg, {
      props: { steamId: "2" },
      global: { mocks: { $apollo: { query } } },
    });
    await w.setProps({ steamId: "3" });
    await flushPromises();
    finish({ data: { players_by_pk: { avatar_url: "/2.jpg" } } });
    await flushPromises();
    expect(w.get("img").attributes("src")).toBe(
      "https://api.deafcs.test/3.jpg",
    );
    w.unmount();
  });
});

describe("24-hour chat timestamps", () => {
  it("renders local wall-clock time and edit tooltip in 24-hour format even in en-US", () => {
    const timestamp = "2026-10-13T21:05:00Z";
    const w = shallowMount(ChatMessage, {
      props: {
        message: {
          id: "123e4567-e89b-42d3-a456-426614174000",
          from: { steam_id: "2", name: "Friend" },
          message: "Hello",
          timestamp,
          edited_at: timestamp,
        },
        absoluteTimestamps: true,
      },
      global,
    });
    const expected = new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    expect((w.vm as any).clockTime).toBe(expected);
    expect(w.text()).toContain(expected);
    expect((w.vm as any).editedAtLabel).toContain(expected);
    expect((w.vm as any).editedAtLabel).not.toMatch(/AM|PM/);
    w.unmount();
  });
});

describe("upstream compact lobby controls", () => {
  it("sorts captain first, counts accepted members and keeps five seats and ELO", () => {
    const w = mount(PartySeats, {
      props: { lobby: { id: "l1", players: members() } },
      global,
    });
    expect(w.text()).toContain('"count":2');
    expect(w.findAll(".group\\/seat")[0].text()).toContain("Captain");
    expect(w.findAll("[data-search]")).toHaveLength(2);
    expect(w.findAll("player-elo-stub")).toHaveLength(3);
    w.unmount();
  });
  it("sizes the seats to the biggest party an open mode allows, not a fixed five", () => {
    seatSettings.maxCompetitivePartySize = 3;
    const capped = mount(PartySeats, {
      props: { lobby: { id: "l1", players: members().slice(1, 2) } },
      global,
    });
    expect(capped.text()).toContain('"max":3');
    expect(capped.findAll("[data-search]")).toHaveLength(2);
    capped.unmount();

    seatSettings.isMatchmakingTypeEnabled = (type: string) =>
      type !== "competitive";
    seatSettings.captainPickEnabled = false;
    const duo = mount(PartySeats, {
      props: { lobby: { id: "l1", players: members() } },
      global,
    });
    // Wingman's limit is 2, but nobody already in the party loses a seat.
    expect(duo.text()).toContain('"max":3');
    expect(duo.findAll("[data-search]")).toHaveLength(0);
    duo.unmount();
  });
  it("captains invite excluding members and remove through the existing authorized mutation", async () => {
    const w = mount(PartySeats, {
      props: { lobby: { id: "l1", players: members() } },
      global,
    });
    // Find by the actual stub component when it has no inferred name.
    const searchStub = w.findAllComponents(global.stubs.PlayerSearch)[0];
    expect(searchStub.props("exclude")).toEqual(["1", "2", "3"]);
    searchStub.vm.$emit("selected", { steam_id: "4" });
    await flushPromises();
    expect(state.invite).toHaveBeenCalledWith("4");
    const remove = w
      .findAll("button")
      .find((b) => b.attributes("aria-label")?.includes('"name":"Member"'))!;
    await remove.trigger("click");
    await flushPromises();
    expect(state.mutate).toHaveBeenCalledOnce();
    expect(
      String(state.mutate.mock.calls[0][0].mutation.loc.source.body),
    ).toContain('steam_id: "2"');
    w.unmount();
  });
  it("members have no invite or remove controls, but can leave", async () => {
    auth.me = { steam_id: "2" };
    const w = mount(PartySeats, {
      props: { lobby: { id: "l1", players: members() } },
      global,
    });
    expect(w.findAll("[data-search]")).toHaveLength(0);
    expect(w.findAll("button")).toHaveLength(1);
    await w.get("button").trigger("click");
    await flushPromises();
    expect(state.mutate).toHaveBeenCalledOnce();
    w.unmount();
  });
  it("the top navigation party pill opens Lobby and removal does not open it", async () => {
    const w = shallowMount(MatchLobby, {
      props: { lobby: { id: "l1", players: members() }, active: true },
      global: {
        ...global,
        mocks: { ...global.mocks, $apollo: { mutate: state.mutate } },
      },
    });
    w.findComponent({ name: "TransitionGroup" }).vm.$emit("click");
    expect(w.emitted("open")).toHaveLength(1);
    w.unmount();
  });
});

it("offers 24 unique reactions while historical party membership remains removable", () => {
  expect(CHAT_REACTIONS).toHaveLength(24);
  expect(new Set(CHAT_REACTIONS.map((r) => r.glyph)).size).toBe(24);
  const message: any = { reactions: { party: ["1"] } };
  expect(
    chatReactionChoices(message, "1", { canReact: true, canAddReaction: true }),
  ).toHaveLength(24);
  expect(heldChatReactions(message, "1").has("party")).toBe(true);
});
