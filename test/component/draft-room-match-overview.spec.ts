import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import fs from "node:fs";
import path from "node:path";

// Draft Room veto and server start use the match page's own Overview
// (MatchOverview, as for matchmaking and tournament matches): the real
// Overview and team panels are mounted here; the veto board, the pre-match
// panel and the connect panel are the shared leaves, tested on their own.

const mocks = vi.hoisted(() => ({
  me: null as any,
  focus: vi.fn(),
  hubContext: (() => null) as () => any,
  leaves: [] as Array<{ name: string; props: Record<string, unknown> }>,
}));

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ me: mocks.me, isRoleAbove: () => false }),
}));
vi.mock("~/stores/DraftGamesStore", () => ({
  useDraftGamesStore: () => ({ pick: vi.fn() }),
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
  useChatHubContext: (context: () => any) => {
    mocks.hubContext = context;
  },
}));
vi.mock("~/composables/useCaptainPickPlayers", async () => {
  const { ref } = await import("vue");
  return { useCaptainPickPlayers: () => ({ players: ref({}) }) };
});

// A leaf that records its props, so the test sees what the Overview hands it.
const leaf = (name: string, props: string[]) =>
  defineComponent({
    name,
    props,
    setup(p) {
      mocks.leaves.push({ name, props: p as any });
      return () => h("div", { "data-leaf": name });
    },
  });
for (const [file, name, props] of [
  ["~/components/match/overview/OverviewVeto.vue", "OverviewVeto", ["match", "picks", "accent"]],
  ["~/components/match/overview/OverviewPreMatch.vue", "OverviewPreMatch", ["match", "picks"]],
  ["~/components/match/MatchRegionVeto.vue", "MatchRegionVeto", ["match"]],
  ["~/components/match/MatchInfo.vue", "MatchInfo", ["match", "hideBooting", "hideConnect"]],
  ["~/components/chat/ChatLobby.vue", "ChatLobby", []],
  ["~/components/draft-games/DraftSettingsBar.vue", "DraftSettingsBar", []],
  ["~/components/draft-games/DraftBackupsPanel.vue", "DraftBackupsPanel", []],
  ["~/components/draft-games/DraftTurnStatus.vue", "DraftTurnStatus", []],
  ["~/components/draft-games/DraftLog.vue", "DraftLog", []],
  ["~/components/draft-games/DraftRequestQueue.vue", "DraftRequestQueue", []],
  ["~/components/draft-games/DraftSettingsSheet.vue", "DraftSettingsSheet", []],
  ["~/components/draft-games/DraftCoinFlip.vue", "DraftCoinFlip", []],
  ["~/components/draft-games/DraftOpenSlot.vue", "DraftOpenSlot", []],
  ["~/components/match/MatchAdminBottomBar.vue", "MatchAdminBottomBar", []],
  ["~/components/common/AnimatedFilters.vue", "AnimatedFilters", []],
  ["~/components/PlayerDisplay.vue", "PlayerDisplay", []],
  ["~/components/draft-games/DraftClock.vue", "DraftClock", []],
] as const) {
  vi.doMock(file, () => ({ default: leaf(name, [...props]) }));
}
vi.doMock("~/components/draft-games/DraftPlayerCard.vue", () => ({
  default: defineComponent({
    name: "DraftPlayerCard",
    props: { member: null, isCaptain: Boolean },
    setup: (props) => () =>
      h(
        "div",
        {
          "data-card": props.member.steam_id,
          "data-captain": props.isCaptain ? "" : undefined,
        },
        props.member.player?.name,
      ),
  }),
}));

const { default: DraftRoom } = await import(
  "../../components/draft-games/DraftRoom.vue"
);

// Lineups as the Draft store now selects them (the match page's
// matchLineups fragment): players with profiles, the captain flag, the
// veto turn and the viewer's right to act.
const lineup = (n: 1 | 2, size: number, extra: Record<string, unknown> = {}) => ({
  id: `l${n}`,
  name: n === 1 ? "Team Alpha" : "Team Bravo",
  is_picking_map_veto: n === 1,
  can_pick_map_veto: false,
  is_picking_region_veto: false,
  can_pick_region_veto: false,
  lineup_players: Array.from({ length: size }, (_, i) => {
    const steam = String(n * 100 + i);
    return {
      steam_id: steam,
      captain: i === 0,
      checked_in: true,
      player: { steam_id: steam, name: `P${steam}` },
    };
  }),
  ...extra,
});

const match = (status: string, perTeam = 5, extra: Record<string, unknown> = {}) => ({
  id: "m1",
  status,
  source: "5stack",
  region: "eu",
  min_players_per_lineup: perTeam,
  map_veto_type: status === "Veto" ? "Ban" : null,
  map_veto_pick_expires_at: null,
  is_server_online: false,
  server_id: null,
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  lineup_1: lineup(1, perTeam),
  lineup_2: lineup(2, perTeam),
  match_maps: [],
  options: { best_of: 1, region_veto: false, map_veto: true },
  ...extra,
});

const room = (perTeam = 5, overrides: Record<string, unknown> = {}) => ({
  id: "draft-1",
  mode: "Captains",
  status: "Completed",
  type: "Competitive",
  capacity: perTeam * 2,
  current_pick_lineup: null,
  host_steam_id: "100",
  host: { name: "P100" },
  access: "Open",
  is_organizer: false,
  match_id: "m1",
  picks: [],
  players: [],
  ...overrides,
});

const wrappers: ReturnType<typeof mount>[] = [];
const render = (m: any, self: string | null = "100", r = room()) => {
  mocks.me = self ? { steam_id: self, teams: [] } : null;
  const w = mount(DraftRoom, {
    props: { room: r, match: m },
    global: {
      stubs: { NuxtLink: { template: "<a><slot /></a>" } },
      mocks: { $t: (key: string) => key },
    },
  });
  wrappers.push(w);
  return w;
};
const leafProps = (name: string) =>
  mocks.leaves.filter((l) => l.name === name).at(-1)?.props;

beforeEach(() => {
  mocks.leaves.length = 0;
  mocks.focus.mockClear();
  localStorage.clear();
  vi.stubGlobal("navigateTo", vi.fn());
  vi.stubGlobal("useAuthStore", () => ({ me: mocks.me, isRoleAbove: () => false }));
  vi.stubGlobal("usePlayerActiveSeasonElo", () => ({ eloForPlayer: () => null }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: {} }));
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const overviewSource = fs.readFileSync(
  path.resolve(__dirname, "../../components/match/overview/MatchOverview.vue"),
  "utf8",
);

describe("Draft Room veto uses the matchmaking/tournament match Overview", () => {
  it("renders MatchOverview's board: Team 1 | veto | Team 2", () => {
    const w = render(match("Veto"));
    const overview = w.get('[data-testid="draft-match-overview"]');
    expect(overview.attributes("data-stage")).toBe("veto");
    const middle = overview.get('[data-testid="overview-middle"]');
    const grid = middle.element.parentElement!;
    expect(grid.className).toContain(
      "min-[1400px]:grid-cols-[minmax(260px,1fr)_minmax(0,1.35fr)_minmax(260px,1fr)]",
    );
    expect(overviewSource).toContain(grid.className);
    expect(middle.find('[data-leaf="OverviewVeto"]').exists()).toBe(true);
    expect(overview.find('[data-testid="overview-team-1"]').text()).toContain("P100");
    expect(overview.find('[data-testid="overview-team-2"]').text()).toContain("P200");
    // The old Draft Room veto card is gone.
    expect(w.find(".veto-stage").exists()).toBe(false);
    expect(w.find('[data-leaf="MatchMapVeto"]').exists()).toBe(false);
  });

  it("passes the Draft match to the shared veto board unchanged (same pick/ban mutation and rights)", () => {
    const m = match("Veto");
    render(m);
    expect(leafProps("OverviewVeto")?.match).toEqual(m);
    // Organizer region override form, as on the match page.
    expect(leafProps("MatchRegionVeto")?.match).toEqual(m);
  });

  it("marks the team whose veto turn it is and shows captains", () => {
    const w = render(match("Veto"));
    const panels = w.findAllComponents({ name: "DraftTeamPanel" });
    expect(panels.map((p) => p.props("active"))).toEqual([true, false]);
    expect(w.get('[data-testid="overview-team-1"] [data-card="100"]').attributes()).toHaveProperty("data-captain");
    expect(w.get('[data-testid="overview-team-2"] [data-card="200"]').attributes()).toHaveProperty("data-captain");
  });

  it.each([5, 2, 1])("supports %i players per team", (perTeam) => {
    const w = render(match("Veto", perTeam), "100", room(perTeam));
    const panels = w.findAllComponents({ name: "DraftTeamPanel" });
    expect(panels.map((p) => p.props("perTeam"))).toEqual([perTeam, perTeam]);
    expect(w.findAll('[data-testid="overview-team-1"] [data-card]')).toHaveLength(perTeam);
  });

  it("gives the board the full width with no chat side column", () => {
    const w = render(match("Veto"));
    expect(w.get('[data-testid="draft-room-layout"]').classes()).not.toContain(
      "xl:grid-cols-[minmax(0,1fr)_340px]",
    );
    expect(w.find('[data-testid="draft-room-side"]').exists()).toBe(false);
    expect(w.find('[data-testid="draft-room-chat-entry"]').exists()).toBe(false);
    expect(w.find('[data-leaf="ChatLobby"]').exists()).toBe(false);
  });

  it("keeps a backup's banner beside the Overview", () => {
    const w = render(match("Veto"), "900", room(5, {
      players: [{ steam_id: "900", status: "Waitlist", lineup: null, player: { steam_id: "900", name: "B" } }],
    }));
    expect(w.find('[data-testid="draft-room-side"]').exists()).toBe(true);
  });

  // Anders 2026-10-14: the Chat Hub icon is the one way into chat, so the
  // board has no Open Chat button; the rooms are still handed to the Hub.
  it("has no Open Chat button, and still gives the Hub the Match Chat", () => {
    // A drafted player: once the match exists the room's chat is its Match
    // Chat (plus Team Chat).
    const w = render(match("Veto"), "101", room(5, {
      players: [{ steam_id: "101", status: "Accepted", lineup: 1, player: { steam_id: "101", name: "P101" } }],
    }));
    expect(w.find('[data-testid="draft-room-open-chat"]').exists()).toBe(false);
    expect(w.text()).not.toContain("open_chat");
    expect(mocks.hubContext()?.rooms?.[0]?.type).toBe("match");
    expect(mocks.focus).not.toHaveBeenCalled();
  });

  it.each(["Veto", "WaitingForServer"])(
    "shows no Open Chat to anyone during %s",
    (status) => {
      for (const self of ["101", "999", null]) {
        const w = render(match(status), self as any);
        expect(w.find('[data-testid="draft-room-open-chat"]').exists()).toBe(false);
      }
    },
  );
});

describe("Draft Room after the veto uses the Overview's pre-match view", () => {
  const maps = [
    { id: "mm1", order: 1, lineup_1_side: "CT", lineup_2_side: "TERRORIST", map: { id: "a", name: "de_anubis", label: "Anubis" } },
    { id: "mm2", order: 2, lineup_1_side: "TERRORIST", lineup_2_side: "CT", map: { id: "b", name: "de_mirage", label: "Mirage" } },
    { id: "mm3", order: 3, lineup_1_side: null, lineup_2_side: null, map: { id: "c", name: "de_nuke", label: "Nuke" } },
  ];

  it.each(["WaitingForServer", "Live"])(
    "%s shows maps and the server panel in the middle",
    (status) => {
      const w = render(match(status, 5, { match_maps: maps.slice(0, 1) }));
      const overview = w.get('[data-testid="draft-match-overview"]');
      expect(overview.attributes("data-stage")).toBe("pre-match");
      expect(overview.find('[data-testid="overview-middle"] [data-leaf="OverviewPreMatch"]').exists()).toBe(true);
      // The connect details are the Overview's (MatchInfo connect-only inside
      // OverviewPreMatch); the top match info hides its own, as on the match page.
      expect(leafProps("MatchInfo")?.hideConnect).toBe(true);
      expect(w.text()).not.toContain("draft_games.room.match_starting");
    },
  );

  it("hands BO3 maps to the shared pre-match view", () => {
    const m = match("WaitingForServer", 5, { match_maps: maps, options: { best_of: 3, map_veto: true } });
    render(m);
    expect((leafProps("OverviewPreMatch")?.match as any).match_maps).toHaveLength(3);
  });

  it("never adds connection fields the API did not send", () => {
    const m = match("Live", 5, { is_server_online: true, server_id: "s1" });
    render(m, null);
    const passed = leafProps("OverviewPreMatch")?.match as any;
    expect(passed.connection_string).toBeUndefined();
    expect(passed.connection_link).toBeUndefined();
  });

  it("keeps the top match info's connect panel outside the Overview stages", () => {
    render(match("WaitingForCheckIn"));
    expect(leafProps("MatchInfo")?.hideConnect).toBe(false);
  });
});

describe("Scoreboard hand-over", () => {
  it("notes the server-ready moment with the match page's own helper, once", async () => {
    const live = match("Live", 5, { is_server_online: true, server_id: "s1" });
    const w = render(live);
    const key = "deafcs:match-server-ready:m1";
    const first = Number(localStorage.getItem(key));
    expect(first).toBeGreaterThan(0);
    // A refresh or a later tick does not restart the 30 seconds.
    await w.setProps({ match: { ...live } });
    render(live);
    expect(Number(localStorage.getItem(key))).toBe(first);
  });

  it("notes nothing before the server is ready", () => {
    render(match("WaitingForServer"));
    expect(localStorage.getItem("deafcs:match-server-ready:m1")).toBeNull();
  });

  it("has no Scoreboard timer of its own: the page hands over to the match page", () => {
    const room = fs.readFileSync(path.resolve(__dirname, "../../components/draft-games/DraftRoom.vue"), "utf8");
    const page = fs.readFileSync(path.resolve(__dirname, "../../pages/draft-room/[id].vue"), "utf8");
    expect(room).not.toMatch(/SCOREBOARD_HANDOFF_MS|scoreboardHandoffAt|setTimeout/);
    expect(page).toMatch(/match\.value\?\.status === "Live"[\s\S]*navigateTo\(`\/matches\/\$\{match\.value\.id\}`\)/);
  });
});
