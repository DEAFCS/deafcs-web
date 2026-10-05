import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive, ref } from "vue";
import { clipRoundKills, highlightCells } from "../../utilities/clipDisplay";
import { clipTileFields, topPlayOrderBy } from "../../graphql/matchClip";

const mocks = vi.hoisted(() => ({
  states: new Map<string, any>(), query: vi.fn(), mutate: vi.fn(), subscriptions: [] as any[],
  auth: null as any, route: null as any, share: vi.fn(), copied: null as any,
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("vue-router", () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("#app", async () => {
  const { ref } = await import("vue");
  return {
    useState: (key: string, init: () => any) => {
      if (!mocks.states.has(key)) mocks.states.set(key, ref(init()));
      return mocks.states.get(key);
    },
    useNuxtApp: () => ({ $apollo: { defaultClient: { mutate: mocks.mutate } } }),
  };
});
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("~/graphql/graphqlGen", () => ({ generateQuery: (q: any) => q, generateSubscription: (q: any) => q, generateMutation: (q: any) => q }));
vi.mock("~/graphql/getGraphqlClient", () => ({ default: () => ({
  query: mocks.query,
  subscribe: (request: any) => ({ subscribe: (listener: any) => {
    const subscription = { request, listener, unsubscribe: vi.fn() };
    mocks.subscriptions.push(subscription);
    return subscription;
  } }),
}) }));
vi.mock("~/composables/useClipShare", () => ({ useClipShare: () => ({ shareClip: mocks.share, copiedClipId: mocks.copied }) }));
vi.mock("~/components/clips/ClipPlayer.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return { default: defineComponent({ name: "ClipPlayer", props: ["src", "clipKey"], emits: ["progress", "ended", "next", "prev"],
    setup(props, { expose, slots }) { expose({ play: vi.fn() }); return () => h("div", [h("video", { src: props.src }), slots["top-left"]?.(), slots["top-right"]?.(), slots.bottom?.()]); },
  }) };
});
vi.mock("~/components/MatchTableRow.vue", () => ({ default: { template: "<div />" } }));
vi.mock("~/components/PlayerSearch.vue", () => ({ default: { template: "<div />" } }));
vi.mock("~/components/clips/RenderQueuePanel.vue", () => ({ default: { template: '<div data-testid="render-queue" />' } }));
vi.mock("~/components/clips/DeleteClipDialog.vue", () => ({ default: { template: "<div />" } }));

import ClipTile from "../../components/clips/ClipTile.vue";
import WatchHighlights from "../../components/watch/WatchHighlights.vue";
import ClipDetailModal from "../../components/clips/ClipDetailModal.vue";
import HighlightsPage from "../../pages/highlights/index.vue";
import { useClipModal } from "../../composables/useClipModal";
import { useClipFrameReveal } from "../../composables/useClipFrameReveal";

const pass = defineComponent({ setup: (_, { slots }) => () => h("div", Object.values(slots).flatMap(slot => slot?.() ?? [])) });
const tileStub = defineComponent({ props: ["clip", "variant", "queue", "queueScope", "group", "tag"],
  setup: (props) => () => h("article", { "data-clip": props.clip.id, "data-variant": props.variant }, props.clip.title),
});
const stubs: Record<string, any> = {
  NuxtLink: defineComponent({ props: ["to"], setup: (p, { slots }) => () => h("a", { href: p.to }, slots.default?.()) }),
  NuxtImg: defineComponent({ setup: (_, { attrs }) => () => h("img", attrs) }),
  Avatar: pass, AvatarImage: true, AvatarFallback: pass, Spinner: true,
  TimeAgo: true,
  Popover: pass, PopoverContent: pass, PopoverTrigger: defineComponent({ setup: (_, { attrs, slots }) => () => h("button", attrs, slots.default?.()) }),
  Button: pass, Input: true, Label: pass, Skeleton: true,
  Dialog: pass, DialogPortal: pass, DialogOverlay: true, DialogContent: pass, DialogTitle: pass, DialogDescription: pass, VisuallyHidden: pass,
  Sheet: pass, SheetContent: pass, SheetHeader: pass, SheetTitle: pass, SheetDescription: pass, SheetTrigger: pass,
  Select: pass, SelectContent: pass, SelectTrigger: pass, SelectValue: true, SelectItem: pass,
  PageTransition: pass, TacticalPageHeader: pass, FilterBar: pass, FilterMenu: pass,
  Empty: pass, EmptyTitle: pass, EmptyDescription: pass, Pagination: true,
};
const wrappers: any[] = [];
function render(component: any, props: any = {}, extraStubs = {}) {
  const wrapper = mount(component, { props, global: { stubs: { ...stubs, ...extraStubs }, mocks: { $t: (key: string) => key } } });
  wrappers.push(wrapper);
  return wrapper;
}
const makeClip = (id: string, changes: any = {}): any => ({
  id, user_steam_id: "owner", target_steam_id: "player", title: `Player — Clip ${id}`,
  duration_ms: 24000, download_url: `https://media.test/${id}.mp4`, thumbnail_download_url: `/${id}.jpg`,
  kills_count: 5, round: 12, views_count: 321, visibility: "public", created_at: "2026-10-05T12:00:00Z",
  target: { steam_id: "player", name: "Player", avatar_url: null },
  match_map: { id: "map1", map: { name: "de_mirage", label: "Mirage", poster: "/map.jpg" } },
  ...changes,
});
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise<any>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
  mocks.states.clear(); mocks.query.mockReset(); mocks.mutate.mockReset(); mocks.share.mockReset(); mocks.subscriptions.length = 0;
  mocks.auth = reactive({ isAdmin: false, me: { steam_id: "guest" }, isStreamer: false, isMatchOrganizer: false, isTournamentOrganizer: false });
  mocks.route = reactive({ query: {}, path: "/highlights", hash: "" }); mocks.copied = ref(null);
  window.history.replaceState({}, "", "/watch");
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));
  vi.stubGlobal("definePageMeta", vi.fn()); vi.stubGlobal("useHead", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async () => ({ headers: { get: () => null } })));
  mocks.mutate.mockResolvedValue({ data: { updateClip: { success: true } } });
});
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("shared modern clip tile", () => {
  it("shows map, duration, player, round kills, views, and share without loading a video", async () => {
    const clip = makeClip("a"); const w = render(ClipTile, { clip });
    expect(w.text()).toContain("Mirage"); expect(w.text()).toContain("0:24"); expect(w.text()).toContain("Player");
    expect(w.text()).toContain("ACE"); expect(w.text()).toContain("321");
    expect(w.find("video").exists()).toBe(false); expect(mocks.query).not.toHaveBeenCalled();
    await w.get('[data-testid="clip-share"]').trigger("click"); expect(mocks.share).toHaveBeenCalledWith("a");
    mocks.copied.value = "a"; await nextTick(); expect(w.get('[data-testid="clip-share"]').attributes("aria-label")).toBe("clips.link_copied");
  });
  it("seeds only the clicked queue, and preserves modified link clicks", async () => {
    const clips = [makeClip("a"), makeClip("b"), makeClip("c")]; const w = render(ClipTile, { clip: clips[1], queue: clips, queueScope: "watch" });
    const modal = useClipModal();
    await w.get('[data-testid="clip-play"]').trigger("click", { ctrlKey: true }); expect(modal.activeClipId.value).toBeNull();
    await w.get('[data-testid="clip-play"]').trigger("click", { button: 0 });
    expect(modal.activeClipId.value).toBe("b"); expect(modal.clipQueue.value.map(c => c.id)).toEqual(["a", "b", "c"]);
    modal.openNextClip(); expect(modal.activeClipId.value).toBe("c"); modal.openPreviousClip(); expect(modal.activeClipId.value).toBe("b");
  });
  it("limits visibility controls to owner/admin and keeps match semantics", async () => {
    const w = render(ClipTile, { clip: makeClip("a", { visibility: "match" }) });
    expect(w.find('[data-testid="clip-visibility"]').exists()).toBe(false);
    mocks.auth.me.steam_id = "owner"; await nextTick(); expect(w.find('[data-testid="clip-visibility"]').exists()).toBe(true);
    const privateButton = w.findAll("button").find(b => b.text().includes("clips.visibility.private_hint"))!;
    await privateButton.trigger("click"); await flushPromises();
    expect(mocks.mutate.mock.calls[0][0].mutation.updateClip[0]).toEqual({ clip_id: "a", visibility: "private" });
    expect(w.emitted("visibility-changed")?.[0]).toEqual(["a", "private"]);
    mocks.auth.me.steam_id = "guest"; mocks.auth.isAdmin = true; await nextTick(); expect(w.find('[data-testid="clip-visibility"]').exists()).toBe(true);
  });
  it("does not call a 4K plus another round's knife kill an ace", () => {
    expect(clipRoundKills(makeClip("a", { title: "Player — Best Round (4K) + 1 Knife Kill" }))).toBe(4);
    expect(clipRoundKills(makeClip("a", { round: null }))).toBeNull();
    expect(clipRoundKills(makeClip("a", { title: "Multi-Kills (2× 3K)", kills_count: 6 }))).toBeNull();
  });
  it("retains grouped match navigation, teams, winner, best-of and map scores", () => {
    const clip = makeClip("a", { match_map: { id: "mm", lineup_1_score: 13, lineup_2_score: 9,
      map: { name: "de_mirage", label: "Mirage" }, match: { id: "m1", lineup_1_id: "l1", lineup_2_id: "l2", winning_lineup_id: "l1",
        lineup_1: { id: "l1", name: "Alpha" }, lineup_2: { id: "l2", name: "Bravo" }, options: { best_of: 3 }, match_maps: [] } } });
    const w = render(ClipTile, { clip, group: [clip, makeClip("b")] });
    expect(w.text()).toContain("Alpha"); expect(w.text()).toContain("Bravo"); expect(w.text()).toContain("13–9"); expect(w.text()).toContain("BO3");
    expect(w.get('[data-testid="clip-open-match"]').attributes("href")).toBe("/matches/m1");
  });
});

describe("Watch bento and discovery", () => {
  it("renders one hero and surrounding tiles with the selected playlist", async () => {
    const clips = Array.from({ length: 7 }, (_, i) => makeClip(String(i)));
    mocks.query.mockResolvedValue({ data: { match_clips: clips } });
    const w = render(WatchHighlights, {}, { ClipTile: tileStub }); await flushPromises();
    expect(w.findAll('[data-testid="watch-highlight-lead"]')).toHaveLength(1); expect(w.findAll('[data-testid="watch-highlight-tile"]')).toHaveLength(6);
    expect(w.findAllComponents(tileStub)[0].props("variant")).toBe("hero");
    expect(w.findAllComponents(tileStub)[0].props("queue")).toHaveLength(7);
    expect(mocks.query.mock.calls[0][0].variables.where.visibility).toEqual({ _eq: "public" });
    expect(topPlayOrderBy[1]).toEqual({ duration_ms: "asc_nulls_last" });
    expect(clipTileFields).not.toHaveProperty("download_url");
    for (let n = 1; n <= 7; n++) expect(highlightCells(clips.slice(0, n))[0].hero).toBe(true);
    expect(highlightCells(clips.slice(0, 2))[1]).toMatchObject({ cols: 6, rows: 2 });
  });
  it("an older filter request cannot overwrite newer tiles or loading state", async () => {
    const first = deferred(), second = deferred(); mocks.query.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const w = render(WatchHighlights, {}, { ClipTile: tileStub });
    const segmented = w.findComponent({ name: "WatchSegmented" }); segmented.vm.$emit("update:modelValue", "4k"); await nextTick();
    second.resolve({ data: { match_clips: [makeClip("new", { kills_count: 4 })] } }); await flushPromises();
    first.resolve({ data: { match_clips: [makeClip("old")] } }); await flushPromises();
    expect(w.find('[data-clip="new"]').exists()).toBe(true); expect(w.find('[data-clip="old"]').exists()).toBe(false);
    expect(mocks.query.mock.calls[1][0].variables.where).toMatchObject({ _or: [{ kills_count: { _eq: 4 } }, { kills_count: { _gte: 4 }, title: { _iregex: "Best Round \\(4K\\)" } }], round: { _is_null: false }, visibility: { _eq: "public" } });
  });
  it("excludes a misclassified total from Aces and invalidates an in-flight ghost request", async () => {
    mocks.query.mockResolvedValue({ data: { match_clips: [makeClip("mixed", { title: "Best Round (4K) + 1 Knife Kill" }), makeClip("ace")] } });
    const w = render(WatchHighlights, {}, { ClipTile: tileStub }); await flushPromises();
    w.findComponent({ name: "WatchSegmented" }).vm.$emit("update:modelValue", "ace"); await flushPromises();
    expect(w.find('[data-clip="mixed"]').exists()).toBe(false); expect(w.find('[data-clip="ace"]').exists()).toBe(true);
    w.findComponent({ name: "WatchSegmented" }).vm.$emit("update:modelValue", "4k"); await flushPromises();
    expect(w.find('[data-clip="mixed"]').exists()).toBe(true); expect(w.find('[data-clip="ace"]').exists()).toBe(false);
    await w.setProps({ ghost: true }); expect(w.find('[data-testid="watch-highlights-grid"]').exists()).toBe(false);
  });
});

describe("clip playlist loading", () => {
  async function openModal() {
    const modal = useClipModal(); modal.playClips([makeClip("a"), makeClip("b"), makeClip("c")], "a", "test");
    const w = render(ClipDetailModal, { clipId: "a" }); mocks.subscriptions[0].listener.next({ data: { match_clips: [makeClip("a")] } }); await flushPromises();
    return { w, modal, player: w.findComponent({ name: "ClipPlayer" }) };
  }
  it("warms exactly the next clip at six seconds remaining, once", async () => {
    const { w, player } = await openModal(); mocks.query.mockResolvedValue({ data: { match_clips: [makeClip("b")] } });
    player.vm.$emit("progress", { duration: 24, currentTime: 17, progress: .7 }); await flushPromises(); expect(mocks.query).not.toHaveBeenCalled();
    player.vm.$emit("progress", { duration: 24, currentTime: 18, progress: .75 }); await flushPromises();
    player.vm.$emit("progress", { duration: 24, currentTime: 19, progress: .8 }); await flushPromises();
    expect(mocks.query).toHaveBeenCalledTimes(1); expect(mocks.query.mock.calls[0][0].query.match_clips[0].where.id._eq).toBe("b");
    expect(w.findAll("video[data-preload]")).toHaveLength(1); expect(w.get("video[data-preload]").attributes("src")).toContain("b.mp4");
    await w.setProps({ clipId: "b" }); expect(w.text()).toContain("Clip b"); expect(w.find("video[data-preload]").exists()).toBe(false);
  });
  it("cancel suppresses auto-advance for this clip; ending normally advances", async () => {
    mocks.query.mockResolvedValue({ data: { match_clips: [makeClip("b")] } }); const { w, modal, player } = await openModal();
    player.vm.$emit("progress", { duration: 24, currentTime: 20, progress: .8 }); await flushPromises();
    const cancel = w.get('[data-testid="clip-auto-advance"]').findAll("button")[1]; await cancel.trigger("click");
    player.vm.$emit("ended"); await nextTick(); expect(modal.activeClipId.value).toBe("a");
    modal.openClip("b"); await w.setProps({ clipId: "b" }); mocks.subscriptions.at(-1).listener.next({ data: { match_clips: [makeClip("b")] } }); await flushPromises();
    player.vm.$emit("ended"); await nextTick(); expect(modal.activeClipId.value).toBe("c");
  });
  it("keeps the current clip stable during switching and ignores stale data/prefetch", async () => {
    const pending = deferred(); mocks.query.mockReturnValue(pending.promise); const { w, player } = await openModal();
    player.vm.$emit("progress", { duration: 24, currentTime: 20, progress: .8 }); await nextTick();
    await w.setProps({ clipId: "c" }); expect(w.text()).toContain("Clip a");
    mocks.subscriptions[0].listener.next({ data: { match_clips: [makeClip("stale")] } });
    pending.resolve({ data: { match_clips: [makeClip("b")] } }); await flushPromises();
    expect(w.text()).not.toContain("Clip stale"); expect(w.find("video[data-preload]").exists()).toBe(false);
    mocks.subscriptions.at(-1).listener.next({ data: { match_clips: [makeClip("c")] } }); await flushPromises(); expect(w.text()).toContain("Clip c");
  });
  it("a failed prefetch does not retry every progress tick", async () => {
    mocks.query.mockRejectedValue(new Error("offline")); const { player } = await openModal();
    player.vm.$emit("progress", { duration: 24, currentTime: 19, progress: .8 }); await flushPromises();
    player.vm.$emit("progress", { duration: 24, currentTime: 20, progress: .9 }); await flushPromises(); expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it("keyboard navigation moves through the playlist and leaves typing alone", async () => {
    const { modal } = await openModal();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })); expect(modal.activeClipId.value).toBe("b");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })); expect(modal.activeClipId.value).toBe("a");
    const input = document.createElement("input"); document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); expect(modal.activeClipId.value).toBe("a"); input.remove();
  });
});

describe("full Highlights retains DEAFCS browsing", () => {
  it("stale browser filter responses cannot replace a newer page", async () => {
    const old = deferred(), current = deferred();
    mocks.route.query = { view: "singles" };
    mocks.query.mockImplementation((request: any) => {
      if (request.query.match_clips_aggregate) return Promise.resolve({ data: { match_clips_aggregate: { aggregate: { count: 1 } } } });
      return request.query.match_clips[0].where.target_steam_id ? current.promise : old.promise;
    });
    const w = render(HighlightsPage, {}, { ClipTile: tileStub });
    mocks.route.query = { view: "singles", player: "player" }; await nextTick();
    current.resolve({ data: { match_clips: [makeClip("new")] } }); await flushPromises();
    old.resolve({ data: { match_clips: [makeClip("old")] } }); await flushPromises();
    expect(w.find('[data-clip="new"]').exists()).toBe(true); expect(w.find('[data-clip="old"]').exists()).toBe(false);
  });
  it("preserves public discovery, pagination, grouped tiles and click-scoped queues", async () => {
    mocks.query.mockImplementation(async (request: any) => ({ data: request.query.match_maps_aggregate
      ? { match_maps_aggregate: { aggregate: { count: 30 } } }
      : { match_maps: [{ id: "map1", match: { id: "match1" }, match_clips: [makeClip("a"), makeClip("b")] }] } }));
    const w = render(HighlightsPage, {}, { ClipTile: tileStub }); await flushPromises();
    const request = mocks.query.mock.calls.find(([r]) => r.query.match_maps)?.[0];
    expect(request.query.match_maps[0].where.match_clips.visibility).toEqual({ _eq: "public" });
    expect(request.query.match_maps[1].match_clips[1]).not.toHaveProperty("download_url");
    expect(w.findComponent(tileStub).props("group")).toHaveLength(2); expect(w.findComponent(tileStub).props("queueScope")).toBe("highlights-index");
    const pagination = w.findComponent({ name: "Pagination" }); expect(pagination.exists()).toBe(true);
    expect(useClipModal().clipQueue.value).toHaveLength(0); // Rendering never overwrites another playlist.
    pagination.vm.$emit("page", 2); await flushPromises(); expect(mocks.query.mock.calls.at(-1)?.[0].query.match_maps[0].offset).toBe(24);
    expect(mocks.subscriptions).toHaveLength(0); // Guest has no render-queue subscription.
  });
  it("admin player/date/kills/visibility filters and render queue are preserved", async () => {
    mocks.auth.isAdmin = true; mocks.route.query = { player: "player", since: "7d", kills: "4", sort: "views" };
    mocks.query.mockResolvedValue({ data: { match_clips: [makeClip("private", { visibility: "private" })], match_clips_aggregate: { aggregate: { count: 1 } } } });
    const w = render(HighlightsPage, {}, { ClipTile: tileStub }); await flushPromises();
    const req = mocks.query.mock.calls.find(([r]) => r.query.match_clips)?.[0];
    expect(req.query.match_clips[0].where).toMatchObject({ target_steam_id: { _eq: "player" }, kills_count: { _gte: 4 } });
    expect(req.query.match_clips[0].where.created_at._gte).toBeDefined(); expect(req.query.match_clips[0].where.visibility).toBeUndefined();
    expect(w.find('[data-testid="render-queue"]').exists()).toBe(true); expect(mocks.subscriptions[0].request.query.clip_render_jobs).toBeDefined();
    expect(w.findComponent(tileStub).props("clip").visibility).toBe("private");
  });
});

describe("thumbnail to first-frame handoff", () => {
  function mountReveal() {
    const state = reactive({ id: "a" as string | null, src: "/a.mp4" });
    let reveal!: ReturnType<typeof useClipFrameReveal>;
    const w = render(defineComponent({ setup() {
      reveal = useClipFrameReveal(() => state.id, () => state.src);
      return () => h("video", { src: state.src, onPlaying: reveal.onPlaying, onLoadeddata: reveal.onLoadedData });
    } }));
    return { state, reveal, w, video: w.get("video").element as HTMLVideoElement };
  }
  it("waits for a painted frame and ignores callbacks from the previous clip", async () => {
    vi.useFakeTimers(); const { w, state, reveal, video } = mountReveal();
    const callbacks: Array<() => void> = [];
    Object.defineProperty(video, "requestVideoFrameCallback", { value: vi.fn(fn => { callbacks.push(fn); return callbacks.length; }) });
    Object.defineProperty(video, "cancelVideoFrameCallback", { value: vi.fn() });
    await w.get("video").trigger("playing"); expect(reveal.revealed.value).toBe(false);
    state.id = "b"; state.src = "/b.mp4"; await nextTick();
    callbacks[0](); expect(reveal.revealed.value).toBe(false); expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
    await w.get("video").trigger("playing"); callbacks[1](); expect(reveal.revealed.value).toBe(true);
  });
  it("supports browsers without frame callbacks and ignores preloader events", async () => {
    const { w, reveal, video } = mountReveal();
    Object.defineProperty(video, "requestVideoFrameCallback", { value: undefined });
    video.dataset.preload = ""; await w.get("video").trigger("playing"); expect(reveal.revealed.value).toBe(false);
    delete video.dataset.preload; await w.get("video").trigger("playing"); expect(reveal.revealed.value).toBe(true);
  });
  it("has a bounded fallback and cancels it when the modal closes", async () => {
    vi.useFakeTimers(); const { state, reveal } = mountReveal();
    vi.advanceTimersByTime(2999); expect(reveal.revealed.value).toBe(false);
    vi.advanceTimersByTime(1); expect(reveal.revealed.value).toBe(true);
    state.id = null; await nextTick(); vi.advanceTimersByTime(5000); expect(reveal.revealed.value).toBe(false);
  });
});
