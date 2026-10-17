import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

// 5Stack WEB cfd7ecb MatchHighlightsReel (layout from 9702249 #716): player
// with the clip details under it, and an "Up next" thumbnail queue beside it
// (a horizontal strip on phones). DEAFCS adaptations: no ?w= avatar resize,
// and can-prev/can-next for the DEAFCS player controls.
const mocks = vi.hoisted(() => ({
  playClips: vi.fn(),
  shareClip: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  activeClipId: null as any,
  copiedClipId: null as any,
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string, args?: any) => (args ? `${key}:${JSON.stringify(args)}` : key) }),
}));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
vi.mock("~/composables/useClipModal", () => ({
  useClipModal: () => ({ playClips: mocks.playClips, activeClipId: mocks.activeClipId }),
}));
vi.mock("~/composables/useClipShare", () => ({
  useClipShare: () => ({ shareClip: mocks.shareClip, copiedClipId: mocks.copiedClipId }),
}));
vi.mock("~/components/clips/ClipPlayer.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      name: "ClipPlayer",
      props: ["src", "poster", "clipKey", "canPrev", "canNext"],
      emits: ["play", "pause", "ended", "progress", "prev", "next"],
      setup(props, { expose, slots }) {
        expose({ play: mocks.play, pause: mocks.pause });
        return () => h("div", { "data-player": props.clipKey }, [h("video", { src: props.src }), slots.empty?.()]);
      },
    }),
  };
});

let Reel: any;
let ClipKillBadge: any;
beforeAll(async () => {
  mocks.activeClipId = ref<string | null>(null);
  mocks.copiedClipId = ref<string | null>(null);
  Reel = (await import("../../components/match/MatchHighlightsReel.vue")).default;
  ClipKillBadge = (await import("../../components/clips/ClipKillBadge.vue")).default;
});
afterEach(() => {
  vi.clearAllMocks();
  mocks.activeClipId.value = null;
  mocks.copiedClipId.value = null;
});

const clip = (id: string, extra: any = {}) => ({
  id,
  title: `Clip ${id}`,
  target_steam_id: "p1",
  target: { steam_id: "p1", name: "Alpha One", avatar_url: "/avatars/players/p1.png" },
  download_url: `https://media.test/${id}.mp4`,
  thumbnail_download_url: `/thumbs/${id}.jpg`,
  duration_ms: 24000,
  kills_count: 3,
  round: 7,
  views_count: 12,
  created_at: "2026-10-01T12:00:00Z",
  match_map: { id: "mm1", map: { name: "de_mirage", label: "Mirage", poster: "/map.jpg" } },
  ...extra,
});

const match = {
  id: "m1",
  lineup_1: { name: "Team Alpha", lineup_players: [{ steam_id: "p1" }] },
  lineup_2: { name: "Team Bravo", lineup_players: [{ player: { steam_id: "p2" } }] },
};

const pass = defineComponent({ setup: (_, { slots }) => () => h("span", slots.default?.()) });
function render(clips: any[]) {
  return mount(Reel, {
    props: { match },
    global: {
      provide: { matchClips: ref(clips) },
      mocks: { $t: (key: string, args?: any) => (args ? `${key}:${JSON.stringify(args)}` : key) },
      stubs: {
        NuxtImg: defineComponent({ setup: (_, { attrs }) => () => h("img", attrs) }),
        Avatar: pass,
        AvatarImage: defineComponent({ props: ["src"], setup: (p) => () => h("img", { "data-avatar": p.src }) }),
        AvatarFallback: pass,
        Button: defineComponent({ setup: (_, { attrs, slots }) => () => h("button", attrs, slots.default?.()) }),
      },
    },
  });
}

describe("MatchHighlightsReel (5Stack port)", () => {
  it("renders nothing without clips", () => {
    expect(render([]).find("section").exists()).toBe(false);
  });

  it("features the first clip with details, views, share and Details under the player", () => {
    const w = render([clip("a"), clip("b", { target_steam_id: "p2", target: { steam_id: "p2", name: "Bravo Two", avatar_url: null }, kills_count: 5, round: 9 })]);
    const player = w.findComponent({ name: "ClipPlayer" });
    expect(player.props("clipKey")).toBe("a");
    expect(player.props("src")).toBe("https://media.test/a.mp4");
    expect(player.props("poster")).toBe("/thumbs/a.jpg");
    expect(player.props("canPrev")).toBe(false);
    expect(player.props("canNext")).toBe(true);

    const text = w.text();
    expect(text).toContain("Alpha One");
    expect(text).toContain("Team Alpha");
    expect(text).toContain("0:24");
    expect(text).toContain("12");
    expect(text).toContain("clips.details");
    // Stored-size avatar: the DEAFCS API has no ?w= resize.
    expect(w.find("[data-avatar]").attributes("data-avatar")).toBe("https://api.test/avatars/players/p1.png");
    expect(w.find("a[href='/players/p1']").exists()).toBe(true);
  });

  it("lists every clip in Up next with thumbnail, kill badge, duration and team", () => {
    const w = render([clip("a"), clip("b", { target_steam_id: "p2", target: { steam_id: "p2", name: "Bravo Two", avatar_url: null } })]);
    expect(w.text()).toContain("match.up_next");
    expect(w.text()).toContain('match.highlights.clip_count:{"count":2}');
    const rows = w.findAll("ol button");
    expect(rows).toHaveLength(2);
    expect(rows[0].attributes("aria-current")).toBe("true");
    expect(rows[1].attributes("aria-current")).toBeUndefined();
    expect(rows[0].find("img").attributes("src")).toBe("/thumbs/a.jpg");
    expect(rows[0].text()).toContain("clips.selected");
    expect(rows[1].text()).toContain("Bravo Two");
    expect(rows[1].text()).toContain("Team Bravo");
    expect(rows[1].text()).toContain('common.round:{"number":7}');
    expect(rows[1].findComponent(ClipKillBadge).props("size")).toBe("xs");
  });

  it("falls back to the map poster when a clip has no thumbnail", () => {
    const w = render([clip("a", { thumbnail_download_url: null })]);
    expect(w.findComponent({ name: "ClipPlayer" }).props("poster")).toBe("/map.jpg");
    expect(w.find("ol img").attributes("src")).toBe("/map.jpg");
  });

  it("switches and plays a clip from the queue, and marks it now playing", async () => {
    const w = render([clip("a"), clip("b")]);
    await w.findAll("ol button")[1].trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "ClipPlayer" }).props("clipKey")).toBe("b");
    expect(mocks.play).toHaveBeenCalled();
    w.findComponent({ name: "ClipPlayer" }).vm.$emit("play");
    await flushPromises();
    const rows = w.findAll("ol button");
    expect(rows[1].attributes("aria-current")).toBe("true");
    expect(rows[1].text()).toContain("clips.now_playing");
  });

  it("follows the player's prev/next and auto-advances near the end", async () => {
    const w = render([clip("a"), clip("b"), clip("c")]);
    const player = () => w.findComponent({ name: "ClipPlayer" });
    player().vm.$emit("next");
    await flushPromises();
    expect(player().props("clipKey")).toBe("b");
    player().vm.$emit("prev");
    await flushPromises();
    expect(player().props("clipKey")).toBe("a");
    player().vm.$emit("progress", { progress: 0.99, currentTime: 23.8, duration: 24 });
    await flushPromises();
    expect(player().props("clipKey")).toBe("b");
  });

  it("opens Details with this match's clips as the playlist, and shares the featured clip", async () => {
    const clips = [clip("a"), clip("b")];
    const w = render(clips);
    const details = w.findAll("button").find((b) => b.text().includes("clips.details"))!;
    await details.trigger("click");
    expect(mocks.playClips).toHaveBeenCalledWith(clips, "a", "match-highlights:m1");
    const share = w.find("button[aria-label='clips.share_clip']");
    await share.trigger("click");
    expect(mocks.shareClip).toHaveBeenCalledWith("a");
  });

  it("pauses the inline player when the detail modal opens", async () => {
    render([clip("a")]);
    mocks.activeClipId.value = "a";
    await flushPromises();
    expect(mocks.pause).toHaveBeenCalled();
  });
});

describe("ClipKillBadge (5Stack port)", () => {
  const badge = (props: any) =>
    mount(ClipKillBadge, { props });
  const lit = (w: any) => w.findAll("span[aria-hidden='true']").filter((m: any) => m.classes().includes("bg-[hsl(var(--tac-amber))]"));

  it("lights all five marks for an ace and N of five for a multi-kill", () => {
    expect(lit(badge({ kills: 5, round: 22 }))).toHaveLength(5);
    expect(badge({ kills: 5, round: 22 }).text()).toContain("clips.tile.kills.ace");
    expect(lit(badge({ kills: 3, round: 7 }))).toHaveLength(3);
  });

  it("isn't an ace when a knife kill from another round makes the fifth", () => {
    const w = badge({ kills: 5, round: 9, title: "k1tty - Best Round (4K) + 1 Knife Kill" });
    expect(lit(w)).toHaveLength(4);
    expect(w.text()).not.toContain("clips.tile.kills.ace");
    expect(w.attributes("title")).toBeUndefined();
  });

  it("has the xs size used by queue thumbnails", () => {
    expect(badge({ kills: 4, round: 2, size: "xs" }).find("span").classes()).toContain("h-5");
    expect(badge({ kills: 4, round: 2 }).find("span").classes()).toContain("h-[26px]");
  });

  it("renders nothing without kills", () => {
    expect(badge({ kills: 0, round: 3 }).text()).toBe("");
  });
});
