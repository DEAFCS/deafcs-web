import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import {
  TICKER_LIVE_STATUSES,
  TICKER_UPCOMING_LIMIT,
  streamIndicator,
  tickerCell,
  tickerFilterTabs,
  tickerKind,
  watchModeLabel,
} from "../../components/watch/watchTicker";
import { highlightsWhere } from "../../components/watch/watchHighlights";

// New /watch: 5Stack structure (match rail with All/Live/Upcoming/Results,
// highlights, tournaments at the bottom) in DEAFCS styling; discovery only.

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const t = (key: string, values?: any) =>
  values && typeof values === "object"
    ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(",")})`
    : typeof values === "number"
      ? `${key}#${values}`
      : key;

const NOW = new Date("2026-10-04T18:00:00Z");
const ctx = { t, locale: "en", now: NOW };

let seq = 0;
function makeMatch(over: Record<string, any> = {}) {
  seq++;
  return {
    id: over.id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    status: "Live",
    source: "5stack",
    started_at: "2026-10-04T17:00:00Z",
    ended_at: null,
    scheduled_at: null,
    is_in_lineup: false,
    is_coach: false,
    // Actual gameplay by default: Live with its server up.
    server_id: "srv-1",
    is_server_online: true,
    winning_lineup_id: null,
    lineup_1_id: "l1",
    lineup_2_id: "l2",
    min_players_per_lineup: 5,
    options: { best_of: 1, mr: 12, type: "Competitive", check_in_setting: "Players" },
    lineup_1: { id: "l1", name: "Alpha", team: null, lineup_players: [] },
    lineup_2: { id: "l2", name: "Bravo", team: null, lineup_players: [] },
    match_maps: [
      {
        id: "mm1",
        order: 1,
        status: "Live",
        is_current_map: true,
        lineup_1_score: 7,
        lineup_2_score: 5,
        winning_lineup_id: null,
        map: { id: "map1", name: "de_mirage", label: "Mirage", poster: "/mirage.webp", patch: null },
      },
    ],
    tournament_brackets: [],
    streams: [],
    ...over,
  };
}

const bo3Maps = () =>
  ["mirage", "inferno", "ancient"].map((name, i) => ({
    id: `mm-${name}`,
    order: i + 1,
    status: i === 0 ? "Finished" : "Scheduled",
    is_current_map: i === 1,
    lineup_1_score: i === 0 ? 13 : 0,
    lineup_2_score: i === 0 ? 8 : 0,
    winning_lineup_id: i === 0 ? "l1" : null,
    map: { id: name, name: `de_${name}`, label: name, poster: `/${name}.webp`, patch: null },
  }));

describe("rail model", () => {
  it("classifies statuses (Captain Pick counts as about to go live)", () => {
    expect(tickerKind({ status: "Live" })).toBe("live");
    for (const s of ["WaitingForServer", "Veto", "PickingPlayers", "WaitingForCheckIn"]) {
      expect(tickerKind({ status: s })).toBe("pre");
    }
    expect(tickerKind({ status: "Scheduled" })).toBe("upcoming");
    expect(tickerKind({ status: "Finished" })).toBe("result");
    expect(TICKER_LIVE_STATUSES).toContain("PickingPlayers");
  });

  it("filter tabs: All, Live N, Upcoming N (capped), Results", () => {
    expect(tickerFilterTabs({ live: 2, upcoming: 4 }, t)).toEqual([
      { key: "all", label: "pages.watch.ticker.filter_all", count: null },
      { key: "live", label: "pages.watch.ticker.filter_live", count: "2" },
      { key: "upcoming", label: "pages.watch.ticker.filter_upcoming", count: "4" },
      { key: "results", label: "pages.watch.ticker.filter_results", count: null },
    ]);
    expect(tickerFilterTabs({ live: 0, upcoming: TICKER_UPCOMING_LIMIT }, t)[2].count).toBe(`${TICKER_UPCOMING_LIMIT}+`);
  });

  it("cells carry mode, best-of, every map, tournament and the viewer's own match", () => {
    const cell = tickerCell(
      makeMatch({
        options: { best_of: 3, mr: 12, type: "Wingman", check_in_setting: "Players" },
        match_maps: bo3Maps(),
        tournament_brackets: [{ stage: { tournament: { id: "t1", name: "Cup #1" } } }],
        is_coach: true,
      }),
      ctx,
    );
    expect(cell).toMatchObject({ mode: "Wingman", bestOf: 3, tag: "Cup #1", you: true });
    expect(cell.maps.map((m) => m.map?.name)).toEqual(["de_mirage", "de_inferno", "de_ancient"]);
    expect(cell.teams[0].pips).toEqual({ won: 1, total: 2 });
  });

  it("result score: BO1 rounds, BO3 maps won; winner emphasised", () => {
    const bo1 = tickerCell(
      makeMatch({ status: "Finished", winning_lineup_id: "l1", match_maps: [{ ...makeMatch().match_maps[0], lineup_1_score: 13, lineup_2_score: 9 }] }),
      ctx,
    );
    expect(bo1.teams.map((tm) => tm.score)).toEqual([13, 9]);
    expect(bo1.teams[0].emphasis).toBe("win");
    const bo3 = tickerCell(
      makeMatch({ status: "Finished", winning_lineup_id: "l1", options: { best_of: 3, type: "Competitive" }, match_maps: bo3Maps() }),
      ctx,
    );
    expect(bo3.status.text).toBe("pages.watch.ticker.final_best_of(count=3)");
    expect(bo3.teams.map((tm) => tm.score)).toEqual([1, 0]);
  });

  it("stream indicator: in game and pre-match (a caster can be on air), never on the viewer's own match", () => {
    const live = { kind: "live" as const, you: false };
    expect(streamIndicator(live, 1, t)).toBe("pages.watch.stream_indicator_one");
    expect(streamIndicator(live, 2, t)).toBe("pages.watch.stream_indicator_other(count=2)");
    expect(streamIndicator(live, 0, t)).toBeNull();
    expect(streamIndicator({ kind: "live", you: true }, 3, t)).toBeNull();
    // Pre-match (ready check, Captain Pick, veto, server): manual streams count.
    expect(streamIndicator({ kind: "pre", you: false }, 1, t)).toBe("pages.watch.stream_indicator_one");
    expect(streamIndicator({ kind: "pre", you: true }, 1, t)).toBeNull();
    expect(streamIndicator({ kind: "upcoming", you: false }, 3, t)).toBeNull();
    expect(streamIndicator({ kind: "result", you: false }, 3, t)).toBeNull();
  });

  it("automatic POVs only count in actual gameplay (Live + server up), never for the viewer's own match", () => {
    expect(tickerCell(makeMatch(), ctx).autoPov).toBe(true);
    for (const status of ["WaitingForCheckIn", "PickingPlayers", "Veto", "WaitingForServer", "Scheduled", "Finished"]) {
      expect(tickerCell(makeMatch({ status }), ctx).autoPov, status).toBe(false);
    }
    // Live but no server yet / server still booting.
    expect(tickerCell(makeMatch({ server_id: null }), ctx).autoPov).toBe(false);
    expect(tickerCell(makeMatch({ is_server_online: false }), ctx).autoPov).toBe(false);
    expect(tickerCell(makeMatch({ is_in_lineup: true }), ctx).autoPov).toBe(false);
    expect(tickerCell(makeMatch({ is_coach: true }), ctx).autoPov).toBe(false);
  });

  it("compact mode labels: 5V5 / 2V2 / 1V1, display only", () => {
    expect(watchModeLabel("Competitive")).toBe("5V5");
    expect(watchModeLabel("Wingman")).toBe("2V2");
    expect(watchModeLabel("Duel")).toBe("1V1");
    // Other modes keep their own name; the cell keeps the real type.
    expect(watchModeLabel("Premier")).toBe("Premier");
    expect(watchModeLabel(null)).toBeNull();
    expect(tickerCell(makeMatch(), ctx).mode).toBe("Competitive");
  });
});

describe("highlights filters use real clip data only", () => {
  it("public clips, time range, Aces/4Ks on single-round clips", () => {
    expect(highlightsWhere("all", "all", NOW)).toEqual({ visibility: { _eq: "public" } });
    expect(highlightsWhere("ace", "week", NOW)).toEqual({
      visibility: { _eq: "public" },
      created_at: { _gte: new Date(NOW.getTime() - 7 * 86_400_000).toISOString() },
      kills_count: { _eq: 5 },
      round: { _is_null: false },
    });
    expect(highlightsWhere("4k", "all", NOW)).toMatchObject({ kills_count: { _eq: 4 }, round: { _is_null: false } });
    expect(highlightsWhere("all", "today", NOW).created_at._gte).toBeDefined();
  });
});

// --- mounted ------------------------------------------------------------------
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: any) =>
      values && typeof values === "object"
        ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(",")})`
        : typeof values === "number"
          ? `${key}#${values}`
          : key,
    locale: { value: "en" },
  }),
}));

const apollo = vi.hoisted(() => ({
  live: [] as any[],
  upcoming: [] as any[],
  results: [] as any[],
  clips: [] as any[],
  clipVars: [] as any[],
  liveTournaments: [] as any[],
}));

vi.mock("@vue/apollo-composable", () => ({
  useApolloClient: () => ({
    client: {
      subscribe: (opts: any) => ({
        subscribe: (observer: any) => {
          const data = opts.variables?.statuses
            ? { matches: apollo.live }
            : opts.variables?.status === "Scheduled"
              ? { matches: apollo.upcoming }
              : { tournaments: apollo.liveTournaments };
          queueMicrotask(() => observer.next({ data }));
          return { unsubscribe() {}, closed: false };
        },
      }),
      query: async (opts: any) => {
        if (opts.variables?.status === "Finished") return { data: { matches: apollo.results } };
        return { data: null };
      },
    },
  }),
}));

vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({
    query: async (opts: any) => {
      apollo.clipVars.push(opts.variables);
      return { data: { match_clips: apollo.clips } };
    },
  }),
}));

const NuxtLink = defineComponent({
  props: ["to"],
  setup(props, { slots, attrs }) {
    return () =>
      h(
        "a",
        { ...attrs, href: typeof props.to === "string" ? props.to : `/matches/${props.to?.params?.id}` },
        slots.default?.(),
      );
  },
});
const MapDisplay = defineComponent({
  props: ["map"],
  setup(props, { attrs }) {
    return () => h("div", { ...attrs, "data-map": props.map?.name });
  },
});
const HighlightCard = defineComponent({
  props: ["clip"],
  setup(props) {
    return () => h("article", { "data-clip": props.clip.id }, props.clip.title);
  },
});

const stubs = {
  NuxtLink,
  NuxtImg: defineComponent({ setup: (_, { attrs }) => () => h("img", { ...attrs, "data-default-bg": "true" }) }),
  MapDisplay,
  HighlightCard,
  RecentTournaments: defineComponent({
    props: ["sectionLabel", "statuses"],
    setup: (p) => () => h("div", { "data-testid": "recent-tournaments", "data-label": p.sectionLabel }),
  }),
  TournamentFeatureCard: defineComponent({
    props: ["tournament", "statusVariant", "statusLabel"],
    setup: (p) => () =>
      h("div", { "data-testid": "tournament-feature-card", "data-id": p.tournament.id, "data-variant": p.statusVariant }, p.statusLabel),
  }),
  Select: true,
  SelectContent: true,
  SelectItem: true,
  SelectTrigger: true,
  SelectValue: true,
};

const wrappers: VueWrapper[] = [];
beforeEach(() => {
  apollo.live = [];
  apollo.upcoming = [];
  apollo.results = [];
  apollo.clips = [];
  apollo.clipVars = [];
  apollo.liveTournaments = [];
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ streams: {} }) })));
});
afterEach(() => {
  for (const w of wrappers.splice(0)) w.unmount();
  vi.unstubAllGlobals();
});

vi.setConfig({ testTimeout: 30_000 });

async function mountComp(file: string, props: Record<string, any> = {}) {
  const mod = await import(/* @vite-ignore */ path.resolve(__dirname, "../..", file));
  const w = mount(mod.default, {
    props,
    global: { stubs, mocks: { $t: (k: string, v?: any) => (v && typeof v === "object" ? `${k}(${Object.values(v).join(",")})` : k) } },
  });
  wrappers.push(w);
  await flushPromises();
  await flushPromises();
  return w;
}

describe("WatchMatchCard (DEAFCS identity)", () => {
  async function card(match: any, streamLabel: string | null = null) {
    return mountComp("components/watch/WatchMatchCard.vue", { model: tickerCell(match, ctx), streamLabel });
  }

  it("links the whole card to the match page", async () => {
    const m = makeMatch({ id: "11111111-1111-4111-8111-111111111111" });
    const w = await card(m);
    expect(w.get('[data-testid="watch-match-card"]').attributes("href")).toBe(`/matches/${m.id}`);
  });

  it("BO1: one map background; BO3: all three side by side; none: default background", async () => {
    const bo1 = await card(makeMatch());
    expect(bo1.findAll('[data-testid="watch-card-map"]').map((n) => n.attributes("data-map"))).toEqual(["de_mirage"]);

    const bo3 = await card(makeMatch({ options: { best_of: 3, type: "Competitive" }, match_maps: bo3Maps() }));
    expect(bo3.findAll('[data-testid="watch-card-map"]').map((n) => n.attributes("data-map"))).toEqual([
      "de_mirage",
      "de_inferno",
      "de_ancient",
    ]);
    expect(bo3.text()).toContain("BO3");

    const none = await card(makeMatch({ status: "Scheduled", match_maps: [] }));
    expect(none.find('[data-testid="watch-card-map"]').exists()).toBe(false);
    expect(none.find('[data-default-bg="true"]').exists()).toBe(true);
  });

  it("shows 5V5 / 2V2 / 1V1 in the existing mode badge colours", async () => {
    for (const [type, label, rgb] of [
      ["Competitive", "5V5", "249 158 47"],
      ["Wingman", "2V2", "217 70 239"],
      ["Duel", "1V1", "34 211 238"],
    ]) {
      const w = await card(makeMatch({ options: { best_of: 1, type } }));
      const badge = w.get('[data-testid="watch-card-mode"]');
      expect(badge.text()).toBe(label);
      expect(w.text()).not.toContain(type);
      expect(badge.attributes("style")).toContain(`--mode-rgb: ${rgb}`);
      expect(badge.classes().join(" ")).toContain("text-[rgb(var(--mode-rgb))]");
    }
    // Card size unchanged.
    const w = await card(makeMatch());
    expect(w.get('[data-testid="watch-match-card"]').classes()).toEqual(expect.arrayContaining(["w-60", "h-[7.75rem]"]));
  });

  it("the shared MatchTypeBadge still shows the full type everywhere else", async () => {
    const w = await mountComp("components/MatchTypeBadge.vue", { type: "Competitive" });
    expect(w.text()).toBe("Competitive");
  });

  it("shows the stream indicator but never embeds a player", async () => {
    const w = await card(makeMatch(), "LIVE · 2 STREAMS");
    expect(w.get('[data-testid="watch-stream-indicator"]').text()).toContain("LIVE · 2 STREAMS");
    expect(w.find("iframe").exists()).toBe(false);
    expect(w.find("video").exists()).toBe(false);
    const quiet = await card(makeMatch(), null);
    expect(quiet.find('[data-testid="watch-stream-indicator"]').exists()).toBe(false);
  });
});

describe("WatchMatchRail", () => {
  it("All: live first, then up next, then results by day; filters narrow it; counts correct", async () => {
    apollo.live = [
      makeMatch({ id: "aaaaaaaa-0000-4000-8000-000000000001", status: "Veto" }),
      makeMatch({ id: "aaaaaaaa-0000-4000-8000-000000000002", status: "Live", streams: [{ id: "s1", link: "https://www.twitch.tv/cast", title: "Cast", priority: 1 }] }),
    ];
    apollo.upcoming = [makeMatch({ id: "bbbbbbbb-0000-4000-8000-000000000001", status: "Scheduled", scheduled_at: "2026-10-04T20:00:00Z", match_maps: [] })];
    apollo.results = [makeMatch({ id: "cccccccc-0000-4000-8000-000000000001", status: "Finished", ended_at: NOW.toISOString(), winning_lineup_id: "l1" })];

    const w = await mountComp("components/watch/WatchMatchRail.vue", { ghost: false });
    const vm = w.vm as any;
    expect(vm.tabs.map((tab: any) => [tab.key, tab.count])).toEqual([
      ["all", null],
      ["live", "2"],
      ["upcoming", "1"],
      ["results", null],
    ]);
    const kinds = () => w.findAll('[data-testid="watch-match-card"]').map((c) => c.attributes("data-kind"));
    // In game first, then the pre-match one, then upcoming, then results.
    expect(kinds()).toEqual(["live", "pre", "upcoming", "result"]);
    expect(w.findAll('[data-testid="watch-rail-divider"]').length).toBe(2);

    for (const [filter, expected] of [
      ["live", ["live", "pre"]],
      ["upcoming", ["upcoming"]],
      ["results", ["result"]],
      ["all", ["live", "pre", "upcoming", "result"]],
    ] as const) {
      vm.filter = filter;
      await flushPromises();
      expect(kinds()).toEqual(expected);
    }
  });

  it("live card counts manual + automatic POV streams; own match shows none; batched API call", async () => {
    const watchable = "dddddddd-0000-4000-8000-000000000001";
    const mine = "dddddddd-0000-4000-8000-000000000002";
    apollo.live = [
      makeMatch({ id: watchable, streams: [{ id: "s1", link: "https://www.twitch.tv/tricon", title: "Cast", priority: 1 }] }),
      makeMatch({ id: mine, is_in_lineup: true, streams: [{ id: "s2", link: "https://www.twitch.tv/x", title: "X", priority: 1 }] }),
    ];
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        streams: {
          [watchable]: [
            // Same channel staff attached manually: counted once.
            { matchId: watchable, steamId: "1", playerName: "TricoN", avatarUrl: null, channel: "tricon", link: "https://www.twitch.tv/tricon", title: null, gameName: "Counter-Strike" },
            { matchId: watchable, steamId: "2", playerName: "Theft", avatarUrl: null, channel: "theft", link: "https://www.twitch.tv/theft", title: null, gameName: "Counter-Strike" },
          ],
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const w = await mountComp("components/watch/WatchMatchRail.vue", { ghost: false });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`https://api.test/twitch/match-streams?matchIds=${watchable}`);
    const cards = w.findAll('[data-testid="watch-match-card"]');
    const indicators = cards.map((c) => c.find('[data-testid="watch-stream-indicator"]'));
    expect(indicators[0].text()).toContain("pages.watch.stream_indicator_other(count=2)");
    expect(indicators[1].exists()).toBe(false);
    expect(w.find("iframe").exists()).toBe(false);
  });

  it("pre-match and server boot: manual streams count, automatic POVs are neither fetched nor counted", async () => {
    const ids = {
      captainPick: "eeeeeeee-0000-4000-8000-000000000001",
      veto: "eeeeeeee-0000-4000-8000-000000000002",
      booting: "eeeeeeee-0000-4000-8000-000000000003",
      checkIn: "eeeeeeee-0000-4000-8000-000000000004",
      quiet: "eeeeeeee-0000-4000-8000-000000000005",
      mineVeto: "eeeeeeee-0000-4000-8000-000000000006",
    };
    const cast = (n: string) => [{ id: `s-${n}`, link: `https://www.twitch.tv/cast_${n}`, title: "Cast", priority: 1 }];
    apollo.live = [
      makeMatch({ id: ids.captainPick, status: "PickingPlayers", server_id: null, is_server_online: false, streams: cast("a") }),
      makeMatch({ id: ids.veto, status: "Veto", server_id: null, is_server_online: false, streams: cast("b") }),
      // Live, server still booting: manual only.
      makeMatch({ id: ids.booting, status: "Live", is_server_online: false, streams: cast("c") }),
      makeMatch({ id: ids.checkIn, status: "WaitingForCheckIn", server_id: null, is_server_online: false, streams: cast("d") }),
      makeMatch({ id: ids.quiet, status: "Veto", server_id: null, is_server_online: false }),
      makeMatch({ id: ids.mineVeto, status: "Veto", server_id: null, is_server_online: false, is_in_lineup: true, streams: cast("e") }),
    ];
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ streams: {} }) }));
    vi.stubGlobal("fetch", fetchMock);
    const w = await mountComp("components/watch/WatchMatchRail.vue", { ghost: false });
    await flushPromises();

    // No match is in actual gameplay: no automatic POV lookup at all.
    expect(fetchMock).not.toHaveBeenCalled();
    const indicator = (id: string) =>
      w
        .findAll('[data-testid="watch-match-card"]')
        .find((c) => c.attributes("href") === `/matches/${id}`)!
        .find('[data-testid="watch-stream-indicator"]');
    for (const id of [ids.captainPick, ids.veto, ids.booting, ids.checkIn]) {
      expect(indicator(id).text(), id).toContain("pages.watch.stream_indicator_one");
    }
    expect(indicator(ids.quiet).exists()).toBe(false);
    // Own match: never offered its streams, before or during the game.
    expect(indicator(ids.mineVeto).exists()).toBe(false);
  });

  it("an automatic POV the API returned is not counted once the match is no longer in gameplay", async () => {
    const id = "ffffffff-0000-4000-8000-000000000001";
    apollo.live = [makeMatch({ id, is_server_online: false })];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ streams: {} }) })));
    const w = await mountComp("components/watch/WatchMatchRail.vue", { ghost: false });
    (w.vm as any).autoStreams = {
      [id]: [{ matchId: id, steamId: "1", playerName: "TricoN", avatarUrl: null, channel: "tricon", link: "https://www.twitch.tv/tricon", title: null, gameName: "Counter-Strike" }],
    };
    await flushPromises();
    expect(w.find('[data-testid="watch-stream-indicator"]').exists()).toBe(false);
  });

  it("MATCHES has the same See all link as HIGHLIGHTS, to the full Matches page", async () => {
    const rail = await mountComp("components/watch/WatchMatchRail.vue", { ghost: false });
    const link = rail.get('[data-testid="watch-matches-see-all"]');
    expect(link.attributes("href")).toBe("/matches");
    expect(link.text()).toContain("common.see_all");
    // Same look as the Highlights link, and only one Matches heading.
    const railSrc = read("components/watch/WatchMatchRail.vue");
    const highlightsSrc = read("components/watch/WatchHighlights.vue");
    const linkClass =
      'class="inline-flex items-center gap-1 font-mono text-[0.65rem] normal-case tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"';
    expect(railSrc).toContain(linkClass);
    expect(highlightsSrc).toContain(linkClass);
    expect(railSrc.match(/pages\.watch\.ticker\.label/g)).toHaveLength(1);

    apollo.clips = [{ id: "c1", title: "Clip", created_at: NOW.toISOString() }];
    const highlights = await mountComp("components/watch/WatchHighlights.vue", { ghost: false });
    expect(highlights.findAll("a").map((a) => a.attributes("href"))).toContain("/highlights");
  });

  it("shows a note instead of an empty row", async () => {
    const w = await mountComp("components/watch/WatchMatchRail.vue", { ghost: false });
    (w.vm as any).filter = "live";
    await flushPromises();
    expect(w.get('[data-testid="watch-rail-note"]').text()).toContain("pages.watch.ticker.nothing_live");
  });
});

describe("WatchHighlights", () => {
  it("lead play plus tiles, existing HighlightCard, Aces filter queries real metadata", async () => {
    apollo.clips = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, title: `Clip ${i}`, created_at: NOW.toISOString() }));
    const w = await mountComp("components/watch/WatchHighlights.vue", { ghost: false });
    expect(w.findAll('[data-testid="watch-highlight-lead"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="watch-highlight-tile"]')).toHaveLength(4);
    expect(w.findAll("article[data-clip]")).toHaveLength(5);
    expect(apollo.clipVars.at(-1).where).toMatchObject({ visibility: { _eq: "public" } });
    expect(w.find("iframe").exists()).toBe(false);

    (w.vm as any).$?.setupState && ((w.vm as any).kind = "ace");
    await flushPromises();
    expect(apollo.clipVars.at(-1).where).toMatchObject({ kills_count: { _eq: 5 }, round: { _is_null: false } });
  });
});

describe("page structure", () => {
  const page = read("pages/watch/index.vue");
  it("rail, featured live tournament, highlights, then tournaments at the bottom; no stream player or big Streaming Now section", () => {
    const rail = page.indexOf("<WatchMatchRail");
    const featured = page.indexOf("<WatchFeaturedTournament");
    const highlights = page.indexOf("<WatchHighlights");
    const tournaments = page.indexOf("<WatchTournaments");
    expect(rail).toBeGreaterThan(0);
    expect(featured).toBeGreaterThan(rail);
    expect(highlights).toBeGreaterThan(featured);
    expect(tournaments).toBeGreaterThan(highlights);
    expect(page).not.toContain("LiveStreamFeatureCard");
    expect(page).not.toContain("StreamEmbed");
    expect(page).not.toContain("section_streaming_now");
    for (const f of ["WatchMatchRail.vue", "WatchMatchCard.vue", "WatchHighlights.vue", "WatchTournaments.vue", "WatchFeaturedTournament.vue"]) {
      const src = read(`components/watch/${f}`);
      expect(src, f).not.toContain("<iframe");
      expect(src, f).not.toContain("StreamEmbed");
      expect(src, f).not.toContain("WhepPlayer");
    }
  });

  it("bottom tournaments: Upcoming, then Recent, See all; never the live one (featured above)", async () => {
    apollo.liveTournaments = [{ id: "t-live", name: "Autumn Cup" }];
    const w = await mountComp("components/watch/WatchTournaments.vue");
    expect(w.findAll('[data-testid="recent-tournaments"]').map((n) => n.attributes("data-label"))).toEqual([
      "pages.watch.tournaments.upcoming",
      "pages.watch.tournaments.recent",
    ]);
    expect(w.text()).toContain("pages.watch.tournaments.title");
    expect(w.findAll("a").map((a) => a.attributes("href"))).toContain("/tournaments");
    expect(w.find('[data-testid="tournament-feature-card"]').exists()).toBe(false);
    expect(read("components/watch/WatchTournaments.vue")).not.toContain("TournamentFeatureCard");
    expect(read("components/watch/WatchTournaments.vue")).not.toContain("e_tournament_status_enum.Live");
  });

  it("featured live tournament: the large card per live tournament, after the rail", async () => {
    apollo.liveTournaments = [
      { id: "t-1", name: "Autumn Cup" },
      { id: "t-2", name: "Night Cup" },
    ];
    const w = await mountComp("components/watch/WatchFeaturedTournament.vue");
    const cards = w.findAll('[data-testid="tournament-feature-card"]');
    expect(cards.map((c) => c.attributes("data-id"))).toEqual(["t-1", "t-2"]);
    expect(cards.every((c) => c.attributes("data-variant") === "live")).toBe(true);
    expect(cards[0].text()).toBe("common.live");
    // Live tournaments only (league tournaments excluded, as before).
    const src = read("components/watch/WatchFeaturedTournament.vue");
    expect(src).toContain("status: { _eq: e_tournament_status_enum.Live }");
    expect(src).toContain("_and: [NOT_LEAGUE_TOURNAMENT]");
  });

  it("featured live tournament: renders nothing at all when none is live", async () => {
    apollo.liveTournaments = [];
    const w = await mountComp("components/watch/WatchFeaturedTournament.vue");
    expect(w.find('[data-testid="watch-featured-tournament"]').exists()).toBe(false);
    expect(w.text()).toBe("");
    // No placeholder spacing either: the margin lives on the component's
    // own (absent) root, not on the page wrapper.
    expect(page).toMatch(/<PageTransition v-if="!feedIsEmpty" :delay="75">\s*<WatchFeaturedTournament \/>/);
  });

  it("credits 5Stack (MIT) where its code was adapted", () => {
    for (const f of ["components/watch/WatchMatchRail.vue", "components/watch/watchTicker.ts", "components/watch/WatchHighlights.vue", "components/watch/WatchSegmented.vue", "utilities/seededSubscribe.ts", "graphql/watchTickerFields.ts"]) {
      expect(read(f), f).toMatch(/5Stack web .*MIT|MIT.*5Stack/s);
    }
    expect(read("LICENSE")).toContain("Copyright (c) 2025 5Stack.gg");
  });
});
