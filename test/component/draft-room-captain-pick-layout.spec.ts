import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import fs from "node:fs";
import path from "node:path";

// Draft Room Captain Pick uses matchmaking Captain Pick's layout
// (MatchOverview + CaptainPickProgress): Team 1 | available players in two
// columns | Team 2. These mount the real Draft Room and real team panels.

const mocks = vi.hoisted(() => ({
  me: null as any,
  pick: vi.fn(() => Promise.resolve()),
  hubContext: null as any,
  focus: vi.fn(),
}));

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: mocks.me, isRoleAbove: () => false }),
}));
vi.mock("~/stores/DraftGamesStore", () => ({
  useDraftGamesStore: () => ({ pick: mocks.pick }),
}));
vi.mock("~/stores/ApplicationSettings", () => ({
  useApplicationSettingsStore: () => ({
    linkedAccountsEnabled: false,
    faceitEnabled: false,
    availableRegions: [{ value: "eu" }],
  }),
}));
vi.mock("~/composables/useChatHubContext", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  requestChatHubFocus: (id: string) => mocks.focus(id),
  useChatHubContext: (get: () => unknown) => {
    mocks.hubContext = get;
  },
}));

const blank = (name: string) =>
  defineComponent({ name, setup: () => () => h("div", { "data-stub": name }) });
for (const [file, name] of [
  ["~/components/chat/ChatLobby.vue", "ChatLobby"],
  ["~/components/match/overview/MatchOverview.vue", "MatchOverview"],
  ["~/components/match/MatchInfo.vue", "MatchInfo"],
  ["~/components/draft-games/DraftSettingsBar.vue", "DraftSettingsBar"],
  ["~/components/draft-games/DraftBackupsPanel.vue", "DraftBackupsPanel"],
  ["~/components/draft-games/DraftTurnStatus.vue", "DraftTurnStatus"],
  ["~/components/draft-games/DraftLog.vue", "DraftLog"],
  ["~/components/draft-games/DraftRequestQueue.vue", "DraftRequestQueue"],
  ["~/components/draft-games/DraftSettingsSheet.vue", "DraftSettingsSheet"],
  ["~/components/draft-games/DraftCoinFlip.vue", "DraftCoinFlip"],
  ["~/components/match/MatchAdminBottomBar.vue", "MatchAdminBottomBar"],
  ["~/components/common/AnimatedFilters.vue", "AnimatedFilters"],
  ["~/components/PlayerDisplay.vue", "PlayerDisplay"],
  ["~/components/draft-games/DraftOpenSlot.vue", "DraftOpenSlot"],
] as const) {
  vi.doMock(file, () => ({ default: blank(name) }));
}
vi.mock("~/components/draft-games/DraftPlayerCard.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      name: "DraftPlayerCard",
      props: { member: null, isCaptain: Boolean, accent: null },
      setup: (props, { slots }) => () =>
        h(
          "div",
          {
            "data-card": props.member.steam_id,
            "data-captain": props.isCaptain ? "" : undefined,
          },
          [props.member.player.name, slots.action?.()],
        ),
    }),
  };
});

// After the doMock loop above, so those stand-ins apply.
const { default: DraftRoom } = await import(
  "../../components/draft-games/DraftRoom.vue"
);

const player = (
  steam: string,
  lineup: number | null,
  extra: Record<string, unknown> = {},
) => ({
  steam_id: steam,
  status: "Accepted",
  lineup,
  is_captain: false,
  pick_order: null,
  joined_at: `2026-10-14T20:00:0${steam.length % 10}Z`,
  player: { steam_id: steam, name: `Player ${steam}` },
  ...extra,
});

// A Captains room mid-draft: captain 1 (Team 1) and captain 2 (Team 2),
// Team 1 to pick, players 3..n in the pool.
const room = (perTeam = 5, overrides: Record<string, unknown> = {}) => {
  const players = [
    player("1", 1, { is_captain: true, pick_order: 0 }),
    player("2", 2, { is_captain: true, pick_order: 0 }),
  ];
  for (let i = 3; i <= perTeam * 2; i++) players.push(player(String(i), null));
  return {
    id: "draft-1",
    mode: "Captains",
    status: "Drafting",
    type: perTeam === 5 ? "Competitive" : perTeam === 2 ? "Wingman" : "Duel",
    capacity: perTeam * 2,
    current_pick_lineup: 1,
    host_steam_id: "1",
    host: { name: "Player 1" },
    access: "Open",
    is_organizer: false,
    match_id: null,
    picks: [],
    players,
    ...overrides,
  };
};

const wrappers: ReturnType<typeof mount>[] = [];
const render = (self: string | null, r = room()) => {
  mocks.me = self ? { steam_id: self, teams: [] } : null;
  const w = mount(DraftRoom, {
    props: { room: r },
    global: {
      stubs: { NuxtLink: { template: "<a><slot /></a>" } },
      mocks: { $t: (key: string) => key },
    },
  });
  wrappers.push(w);
  return w;
};

beforeEach(() => {
  mocks.pick.mockClear();
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({ eloForPlayer: () => null }));
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const mmOverview = fs.readFileSync(
  path.resolve(__dirname, "../../components/match/overview/MatchOverview.vue"),
  "utf8",
);
const mmPool = fs.readFileSync(
  path.resolve(__dirname, "../../components/match/CaptainPickProgress.vue"),
  "utf8",
);
const classOf = (source: string, testid: string) =>
  source.match(
    new RegExp(`class="([^"]+)"\\s+data-testid="${testid}"`),
  )?.[1];

describe("Draft Room Captain Pick uses the matchmaking Captain Pick layout", () => {
  it("lays out Team 1 | available players | Team 2 with MatchOverview's grid", () => {
    const w = render(null);
    const board = w.get('[data-testid="draft-board"]');
    expect(board.attributes("class")).toBe(
      mmOverview.match(/<div\s+class="(grid min-w-0 grid-cols-1[^"]+)"/)?.[1],
    );
    expect(w.get('[data-testid="draft-board-middle"]').attributes("class")).toBe(
      classOf(mmOverview, "overview-middle"),
    );
    // Source order is players, Team 1, Team 2; the order classes put the
    // players in the middle from 1400px, as in MatchOverview.
    const kids = board.element.children;
    expect(kids[0].getAttribute("data-testid")).toBe("draft-board-middle");
    expect(kids[1].getAttribute("data-testid")).toBe("draft-board-team-1");
    expect(kids[2].getAttribute("data-testid")).toBe("draft-board-team-2");
    expect(kids[1].className).toContain("order-2");
    expect(kids[1].className).toContain("min-[1400px]:order-1");
    expect(kids[2].className).toContain("order-3");
    expect(mmOverview).toContain("'order-2 min-[1400px]:order-1' : 'order-3'");
  });

  it("shows the available players in two columns, like CaptainPickProgress", () => {
    const w = render(null);
    const grid = w.get('[data-testid="draft-board-middle"] .grid');
    expect(grid.classes()).toContain("sm:grid-cols-2");
    expect(grid.classes()).not.toContain("xl:grid-cols-3");
    expect(mmPool).toMatch(/class="grid min-w-0 gap-2 sm:grid-cols-2"/);
    expect(grid.findAll("[data-card]")).toHaveLength(8);
  });

  it("gives the board the full width, with no chat column for a signed-in player", () => {
    const w = render("5");
    expect(w.get('[data-testid="draft-room-layout"]').classes()).not.toContain(
      "xl:grid-cols-[minmax(0,1fr)_340px]",
    );
    // The chat itself is in the Chat Hub, opened from the Chat Hub icon:
    // no embedded chat and no Open Chat button on the page.
    expect(w.find('[data-stub="ChatLobby"]').exists()).toBe(false);
    expect(w.find('[data-testid="draft-room-open-chat"]').exists()).toBe(false);
    expect(w.find('[data-testid="draft-room-side"]').exists()).toBe(false);
  });

  // Veto and server start: the match Overview takes the full-width board
  // (see draft-room-match-overview.spec.ts), Captain Pick's board is gone.
  it("hands the full-width board to the match Overview once the match is underway", () => {
    const live = mount(DraftRoom, {
      props: {
        room: room(5, { match_id: "m1" }),
        match: { id: "m1", status: "Veto", options: {} },
      },
      global: {
        stubs: { NuxtLink: { template: "<a><slot /></a>" } },
        mocks: { $t: (key: string) => key },
      },
    });
    wrappers.push(live);
    expect(live.find('[data-testid="draft-board"]').exists()).toBe(false);
    expect(live.find('[data-stub="MatchOverview"]').exists()).toBe(true);
    expect(live.get('[data-testid="draft-room-layout"]').classes()).not.toContain(
      "xl:grid-cols-[minmax(0,1fr)_340px]",
    );
  });

  it("uses the shared team panels with captain badge and pick-turn highlight", () => {
    const w = render(null);
    const team1 = w.get('[data-testid="draft-board-team-1"]');
    const team2 = w.get('[data-testid="draft-board-team-2"]');
    expect(team1.text()).toContain("draft_games.room.team_alpha");
    expect(team2.text()).toContain("draft_games.room.team_bravo");
    expect(team1.get('[data-card="1"]').attributes()).toHaveProperty(
      "data-captain",
    );
    expect(team2.get('[data-card="2"]').attributes()).toHaveProperty(
      "data-captain",
    );
    const panels = w.findAllComponents({ name: "DraftTeamPanel" });
    expect(panels.map((p) => p.props("active"))).toEqual([true, false]);
    expect(panels.map((p) => p.props("accent"))).toEqual(["amber", "blue"]);
  });

  it("lets only the captain whose turn it is draft", async () => {
    const captain = render("1");
    const buttons = captain
      .get('[data-testid="draft-board-middle"]')
      .findAll("button")
      .filter((b) => b.text().includes("draft_games.room.draft"));
    expect(buttons).toHaveLength(8);
    await buttons[0].trigger("click");
    expect(mocks.pick).toHaveBeenCalledWith("draft-1", "3");

    for (const self of ["2", "5", null]) {
      const w = render(self);
      const draftButtons = w
        .findAll("button")
        .filter((b) => b.text().includes("draft_games.room.draft"));
      expect(draftButtons, `viewer ${self}`).toHaveLength(0);
    }
  });

  it("is read-only for spectators: no pick, assign or captain controls", () => {
    const w = render(null, room(5, { status: "Drafting" }));
    const middle = w.get('[data-testid="draft-board-middle"]');
    expect(middle.findAll("button")).toHaveLength(0);
    expect(middle.findAll("[data-card]")).toHaveLength(8);
  });

  it.each([
    [5, 8],
    [2, 2],
    [1, 0],
  ])("supports %i-per-team rooms (pool of %i) without fixed sizes", (perTeam, poolSize) => {
    const w = render(null, room(perTeam));
    const panels = w.findAllComponents({ name: "DraftTeamPanel" });
    expect(panels.map((p) => p.props("perTeam"))).toEqual([perTeam, perTeam]);
    expect(
      w.get('[data-testid="draft-board-middle"]').findAll("[data-card]"),
    ).toHaveLength(poolSize);
  });
});

// The Chat Hub offers the Draft chat with the same rules the API applies:
// players post, Open room spectators read once drafting starts, private
// rooms stay closed to outsiders.
describe("Draft Room chat in the Chat Hub", () => {
  const hubRooms = () => mocks.hubContext().rooms;

  it("offers an Open room spectator the Draft chat read-only while drafting", () => {
    render("99");
    expect(hubRooms()).toEqual([
      expect.objectContaining({ type: "draft", lobbyId: "draft-1", readOnly: true }),
    ]);
    expect(mocks.hubContext().autoOpen).toBe(false);
  });

  it("gives players, the host and organizers the writable room", () => {
    for (const self of ["1", "2", "5"]) {
      render(self);
      expect(hubRooms(), self).toEqual([
        expect.not.objectContaining({ readOnly: true }),
      ]);
      expect(hubRooms()[0].lobbyId).toBe("draft-1");
    }
    render("99", room(5, { is_organizer: true }));
    expect(hubRooms()[0].readOnly).toBeUndefined();
  });

  it.each(["Private", "Invite", "Friends"])(
    "offers a %s room spectator nothing",
    (access) => {
      render("99", room(5, { access }));
      expect(hubRooms()).toEqual([]);
    },
  );

  it("offers nothing when signed out", () => {
    render(null);
    expect(hubRooms()).toEqual([]);
  });
});

// The embedded chat is gone: the room's only chat is the Chat Hub room
// above, reached from the Chat Hub icon. Anders 2026-10-14: no page-level
// Open Chat button either.
describe("Draft Room chat entry", () => {
  beforeEach(() => mocks.focus.mockClear());

  it("has no embedded chat and no Open Chat button, and still gives the Hub the Draft chat", () => {
    for (const self of ["1", "5", "99"]) {
      const w = render(self);
      expect(w.find('[data-stub="ChatLobby"]').exists(), self).toBe(false);
      expect(w.find('[data-testid="draft-room-open-chat"]').exists(), self).toBe(false);
      expect(w.find('[data-testid="draft-room-chat-entry"]').exists(), self).toBe(false);
      expect(w.text(), self).not.toContain("open_chat");
      expect(w.text(), self).not.toContain("chat_in_hub");
      expect(mocks.hubContext().rooms[0].lobbyId, self).toBe("draft-1");
    }
    expect(mocks.focus).not.toHaveBeenCalled();
  });

  it("hands the Hub the Match Chat once the match has taken over, without a button", async () => {
    mocks.me = { steam_id: "1", teams: [] };
    const w = mount(DraftRoom, {
      props: {
        room: room(5, { match_id: "m1", status: "Completed" }),
        match: {
          id: "m1",
          status: "Finished",
          options: {},
          lineup_1_id: "l1",
          lineup_2_id: "l2",
          lineup_1: { lineup_players: [{ steam_id: "1" }] },
          lineup_2: { lineup_players: [] },
        },
      },
      global: {
        stubs: { NuxtLink: { template: "<a><slot /></a>" } },
        mocks: { $t: (key: string) => key },
      },
    });
    wrappers.push(w);
    expect(mocks.hubContext().rooms.map((r: any) => r.type)).toEqual([
      "match",
      "match_team",
    ]);
    expect(w.find('[data-testid="draft-room-open-chat"]').exists()).toBe(false);
    expect(mocks.focus).not.toHaveBeenCalled();
  });

  it("offers no entry to a private room outsider, and a login prompt when signed out", () => {
    const outsider = render("99", room(5, { access: "Private" }));
    expect(
      outsider.find('[data-testid="draft-room-chat-entry"]').exists(),
    ).toBe(false);
    const guest = render(null);
    const entry = guest.get('[data-testid="draft-room-chat-entry"]');
    expect(entry.text()).toContain("draft_games.room.login_to_chat");
    expect(entry.find('[data-testid="draft-room-open-chat"]').exists()).toBe(
      false,
    );
  });

  it("keeps the join queue in the side column", () => {
    const players = [
      ...room(5).players,
      { ...room(5).players[2], steam_id: "50", status: "Requested" },
    ];
    const w = render(
      "1",
      room(5, {
        is_organizer: true,
        status: "Open",
        require_approval: true,
        players,
      }),
    );
    expect(w.find('[data-testid="draft-room-queue"]').exists()).toBe(true);
    expect(w.find('[data-testid="draft-room-side"]').exists()).toBe(true);
    expect(w.find('[data-testid="draft-room-open-chat"]').exists()).toBe(false);
  });
});
