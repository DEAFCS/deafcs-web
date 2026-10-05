import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import {
  normalizeTwitchChannel,
  twitchChannelFromLink,
  twitchChannelUrl,
} from "../../utilities/twitchChannel";
import {
  AUTO_STREAM_ID_PREFIX,
  autoPovEligible,
  matchStreamBlockVisible,
  mergeMatchStreams,
} from "../../utilities/matchStreams";
import {
  fetchMatchAutoStreams,
  fetchMyTwitchChannel,
  fetchPlayerTwitch,
  saveMyTwitchChannel,
} from "../../composables/useTwitchApi";
import PlayerTwitchLink from "../../components/player/PlayerTwitchLink.vue";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

describe("Twitch channel normalization (Linked Accounts)", () => {
  it.each([
    ["tricoN", "tricon"],
    ["https://twitch.tv/tricon", "tricon"],
    ["https://www.twitch.tv/tricon/", "tricon"],
    ["twitch.tv/TRICON", "tricon"],
    ["@TricoN", "tricon"],
    ["  tricon  ", "tricon"],
  ])("accepts %j as %j", (input, channel) => {
    expect(normalizeTwitchChannel(input)).toEqual({ ok: true, channel });
  });

  it("clears on empty input", () => {
    expect(normalizeTwitchChannel("")).toEqual({ ok: true, channel: null });
    expect(normalizeTwitchChannel(null)).toEqual({ ok: true, channel: null });
  });

  it.each([
    ["https://clips.twitch.tv/SomeClip", "unsupported_url"],
    ["https://www.twitch.tv/tricon/clip/SomeClip", "unsupported_url"],
    ["https://www.twitch.tv/videos/123", "unsupported_url"],
    ["https://youtube.com/@tricon", "unsupported_url"],
    ["javascript:alert(1)", "invalid_url"],
    ["http://", "invalid_url"],
    ["abc", "invalid_channel"],
    ["tri con", "invalid_channel"],
  ])("rejects %j (%s)", (input, error) => {
    expect(normalizeTwitchChannel(input)).toEqual({ ok: false, error });
  });

  it("mirrors the API's rules", () => {
    const web = read("utilities/twitchChannel.ts");
    expect(web).toContain("/^[a-z0-9_]{4,25}$/");
    expect(web).toContain('"twitch.tv", "www.twitch.tv", "m.twitch.tv"');
  });

  it("reads the channel from a manual stream link", () => {
    expect(twitchChannelFromLink("https://www.twitch.tv/TricoN")).toBe("tricon");
    expect(twitchChannelFromLink("https://player.twitch.tv/?channel=TricoN&parent=x")).toBe("tricon");
    expect(twitchChannelFromLink("https://www.twitch.tv/videos/1")).toBeNull();
    expect(twitchChannelFromLink("https://youtube.com/watch?v=1")).toBeNull();
    expect(twitchChannelFromLink("not a url")).toBeNull();
    expect(twitchChannelUrl("tricon")).toBe("https://www.twitch.tv/tricon");
  });
});

const auto = (channel: string, name: string, steamId = "1") => ({
  matchId: "m1",
  steamId,
  playerName: name,
  avatarUrl: null,
  channel,
  link: `https://www.twitch.tv/${channel}`,
  title: "live",
  gameName: "Counter-Strike",
});

describe("match stream choices: manual first, then player POVs", () => {
  const t = (key: string, values?: any) => (key === "streams.player_pov" ? `${values.name} POV` : key);

  it("manual streams keep their priority order before automatic POVs", () => {
    const merged = mergeMatchStreams(
      [
        { id: "b", link: "https://youtube.com/watch?v=1", title: "Second", priority: 2 },
        { id: "a", link: "https://www.twitch.tv/officialcast", title: "Official", priority: 1 },
      ],
      [auto("tricon", "TricoN"), auto("theft", "Theft", "2")],
      t,
    );
    expect(merged.map((s) => s.title)).toEqual(["Official", "Second", "TricoN POV", "Theft POV"]);
    expect(merged[2]).toMatchObject({
      id: `${AUTO_STREAM_ID_PREFIX}tricon`,
      link: "https://www.twitch.tv/tricon",
      auto: { playerName: "TricoN", steamId: "1" },
    });
    expect(merged[0].auto).toBeUndefined();
  });

  it("a channel staff already attached by hand is shown once, as the manual entry", () => {
    const merged = mergeMatchStreams(
      [{ id: "m", link: "https://www.twitch.tv/TricoN", title: "Main cast (TricoN)", priority: 1 }],
      [auto("tricon", "TricoN")],
      t,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "m", title: "Main cast (TricoN)" });
  });

  it("duplicate automatic entries collapse, case-insensitively", () => {
    const merged = mergeMatchStreams([], [auto("tricon", "TricoN"), { ...auto("TRICON", "TricoN"), channel: "TRICON" }], t);
    expect(merged).toHaveLength(1);
  });

  it("a POV is never titled as an official cast", () => {
    const [pov] = mergeMatchStreams([], [auto("tricon", "TricoN")], t);
    expect(pov.title).toBe("TricoN POV");
    expect(pov.title.toLowerCase()).not.toContain("official");
  });
});

const lifecycle = (status: string, over: Record<string, any> = {}) => ({
  id: "m1",
  status,
  server_id: "srv-1",
  is_server_online: true,
  is_in_lineup: false,
  is_coach: false,
  ended_at: null as string | null,
  ...over,
});
const PRE_MATCH: Array<[string, Record<string, any>]> = [
  ["WaitingForCheckIn", { server_id: null, is_server_online: false }], // ready check
  ["PickingPlayers", { server_id: null, is_server_online: false }], // Captain Pick
  ["Veto", { server_id: null, is_server_online: false }],
  ["WaitingForServer", { server_id: null, is_server_online: false }],
  ["Live", { is_server_online: false }], // server booting
  ["Live", { server_id: null, is_server_online: false }], // no server yet
];

describe("stream lifecycle: manual streams pre-match, automatic POVs in gameplay only", () => {
  it.each(PRE_MATCH)("%s %j: a manual stream shows, automatic POVs do not", (status, over) => {
    const match = lifecycle(status, over);
    expect(matchStreamBlockVisible(match, true)).toBe(true);
    expect(autoPovEligible(match)).toBe(false);
  });

  it("actual gameplay (Live, server up): manual and automatic POVs", () => {
    const match = lifecycle("Live");
    expect(matchStreamBlockVisible(match, true)).toBe(true);
    expect(autoPovEligible(match)).toBe(true);
  });

  it("finished: no POVs; manual streams only for the ten-minute outro", () => {
    const now = Date.parse("2026-10-04T18:00:00Z");
    const recent = lifecycle("Finished", { ended_at: "2026-10-04T17:55:00Z" });
    const old = lifecycle("Finished", { ended_at: "2026-10-04T17:40:00Z" });
    expect(autoPovEligible(recent)).toBe(false);
    expect(matchStreamBlockVisible(recent, true, now)).toBe(true);
    expect(matchStreamBlockVisible(old, true, now)).toBe(false);
    expect(matchStreamBlockVisible(lifecycle("Canceled"), true, now)).toBe(false);
  });

  it("no streams: no block", () => {
    expect(matchStreamBlockVisible(lifecycle("Veto"), false)).toBe(false);
  });
});

describe("anti-cheat: a match's own players and coaches get no streams", () => {
  for (const [who, over] of [
    ["player", { is_in_lineup: true }],
    ["coach", { is_coach: true }],
  ] as const) {
    it(`own-match ${who}: no manual stream and no POV, before or during the game`, () => {
      for (const [status, extra] of [...PRE_MATCH, ["Live", {}] as [string, Record<string, any>]]) {
        const match = lifecycle(status, { ...extra, ...over });
        expect(matchStreamBlockVisible(match, true), status).toBe(false);
        expect(autoPovEligible(match), status).toBe(false);
      }
    });
  }

  it("a spectator or an admin who does not play can watch", () => {
    // is_in_lineup / is_coach are per viewer; an admin's role adds nothing here.
    const spectator = lifecycle("Live");
    const admin = lifecycle("Live", { is_organizer: true });
    for (const match of [spectator, admin]) {
      expect(matchStreamBlockVisible(match, true)).toBe(true);
      expect(autoPovEligible(match)).toBe(true);
    }
    expect(matchStreamBlockVisible(lifecycle("Veto", { is_organizer: true }), true)).toBe(true);
  });
});

describe("match page wiring (anti-cheat, gameplay only, manual intact)", () => {
  const page = read("pages/matches/[id]/index.vue");

  it("polls automatic POVs only once gameplay is live and never for its own players or coaches", () => {
    expect(page).toContain("return autoPovEligible(this.match) ? this.match.id : null;");
    expect(page).toContain("this.autoStreamsTimer = setInterval(load, 45_000);");
    expect(page).toContain("this.stopAutoStreams();");
  });

  it("merges POVs after manual streams; the whole block follows the lifecycle/anti-cheat rule", () => {
    expect(page).toMatch(/mergeMatchStreams\(\s*\(this\.match\?\.streams \|\| \[\]\)\.filter\(\(s\) => !s\.is_game_streamer\),\s*this\.autoStreams,/);
    expect(page).toMatch(/matchStreamBlockVisible\(\s*this\.match,\s*\(this\.match\?\.streams\?\.length \|\| 0\) > 0 \|\| this\.autoStreams\.length > 0,\s*\)/);
    // One stream surface: the existing StreamEmbed picker, rendered once.
    expect(page.match(/<StreamEmbed/g)).toHaveLength(1);
  });

  it("the manual stream management tab is untouched", () => {
    const manage = read("components/match/MatchLiveStreams.vue");
    expect(manage).not.toContain("autoStreams");
    expect(manage).toContain("insert_match_streams_one");
  });
});

describe("Twitch API client fails safe and never talks to Twitch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses only the DEAFCS API with the session cookie", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ channel: "tricon", live: true }) });
    await fetchPlayerTwitch("765");
    await fetchMyTwitchChannel();
    await fetchMatchAutoStreams(["m1", "m2", "m1"]);
    const urls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(urls).toEqual([
      "https://api.test/twitch/players/765",
      "https://api.test/twitch/me",
      "https://api.test/twitch/match-streams?matchIds=m1%2Cm2",
    ]);
    expect(urls.some((u) => u.includes("twitch.tv") || u.includes("helix"))).toBe(false);
    fetchMock.mock.calls.forEach(([, init]) => expect(init.credentials).toBe("include"));
  });

  it("any failure means no channel / not live / no streams", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await fetchPlayerTwitch("1")).toMatchObject({ channel: null, live: false });
    expect(await fetchMyTwitchChannel()).toBeNull();
    expect(await fetchMatchAutoStreams(["m1"])).toEqual({});
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await fetchPlayerTwitch("1")).toMatchObject({ channel: null, live: false });
  });

  it("saves my own channel with PUT and reports the API's validation error", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ channel: "tricon" }) });
    expect(await saveMyTwitchChannel("tricon")).toEqual({ ok: true, channel: "tricon" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ channel: "tricon" }) });

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "unsupported_url" }) });
    expect(await saveMyTwitchChannel("x")).toEqual({ ok: false, error: "unsupported_url" });
  });

  it("does not call the API for an empty match list", async () => {
    expect(await fetchMatchAutoStreams([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("profile Twitch icon", () => {
  const mocks = { $t: (k: string, v?: any) => `${k}:${v?.channel ?? ""}` };
  const mountLink = (props: any) =>
    mount(PlayerTwitchLink, {
      props,
      global: { mocks, stubs: { TwitchIcon: { template: "<svg data-testid='twitch-icon' />" } } },
    });

  vi.mock("vue-i18n", () => ({
    useI18n: () => ({ t: (k: string, v?: any) => `${k}:${v?.channel ?? ""}` }),
  }));

  it("is hidden without a channel", () => {
    expect(mountLink({ channel: null }).find('[data-testid="player-twitch-link"]').exists()).toBe(false);
    expect(mountLink({ channel: "" }).html()).not.toContain("twitch");
  });

  it("links to the channel in a new tab, safely", () => {
    const link = mountLink({ channel: "tricon", live: false }).get('[data-testid="player-twitch-link"]');
    expect(link.attributes("href")).toBe("https://www.twitch.tv/tricon");
    expect(link.attributes("target")).toBe("_blank");
    expect(link.attributes("rel")).toBe("noopener noreferrer");
    expect(link.attributes("aria-label")).toBe("player.twitch.title:tricon");
  });

  it("offline or status unavailable (no Twitch credentials): icon still shown, no dot", () => {
    for (const live of [false, undefined]) {
      const w = mountLink({ channel: "deafcs_pov_demo", live });
      expect(w.find('[data-testid="player-twitch-link"]').exists()).toBe(true);
      expect(w.find('[data-testid="twitch-icon"]').exists()).toBe(true);
      expect(w.find('[data-testid="player-twitch-live-dot"]').exists()).toBe(false);
    }
  });

  it("shows the green dot only while live", () => {
    expect(mountLink({ channel: "tricon", live: false }).find('[data-testid="player-twitch-live-dot"]').exists()).toBe(false);
    const live = mountLink({ channel: "tricon", live: true });
    expect(live.get('[data-testid="player-twitch-live-dot"]').classes()).toContain("bg-emerald-500");
    expect(live.get('[data-testid="player-twitch-link"]').attributes("aria-label")).toBe("player.twitch.live_title:tricon");
  });

  it("the profile renders it from the API, next to Steam", () => {
    const profile = read("pages/players/[id].vue");
    expect(profile).toContain('<PlayerTwitchLink\n                    :channel="twitch.channel"\n                    :live="twitch.live"');
    expect(profile).toContain("const data = await fetchPlayerTwitch(id);");
    expect(profile).toContain("this.twitchTimer = window.setInterval(load, 60_000);");
  });
});

describe("Twitch is configured in Linked Accounts, not Profile Settings", () => {
  const settings = read("pages/settings/index.vue");
  const linked = read("pages/settings/linked-accounts.vue");

  it("Profile Settings no longer has a Twitch field or Twitch save logic", () => {
    expect(settings.toLowerCase()).not.toContain("twitch");
    // Name, country and language still go through the players update.
    expect(settings).toContain("<PlayerChangeName");
    expect(settings).toContain('name="country"');
    expect(settings).toContain("country: this.form.values.country,");
    expect(settings).toContain("language: this.form.values.language,");
    expect(settings).toContain("<SettingsSaveBar");
  });

  it("Linked Accounts groups Steam under Game Accounts and Twitch under Streaming & Social", () => {
    const game = linked.indexOf("pages.settings.linked_accounts.group_game_accounts");
    const streaming = linked.indexOf("pages.settings.linked_accounts.group_streaming_social");
    expect(game).toBeGreaterThan(-1);
    expect(streaming).toBeGreaterThan(game);
    // Steam linking, the Steam bot and Pending Imports stay in Game Accounts.
    for (const marker of ["submitLink", "presence_title", "pending_imports"]) {
      const at = linked.indexOf(marker, linked.indexOf("<template>"));
      expect(at, marker).toBeGreaterThan(game);
      expect(at, marker).toBeLessThan(streaming);
    }
    expect(linked.slice(streaming)).toContain('<TwitchChannelCard :steam-id="me?.steam_id" />');
    expect(linked.match(/<TwitchChannelCard/g)).toHaveLength(1);
  });
});
