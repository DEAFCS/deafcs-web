import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterLink } from "vue-router";
import { print } from "graphql";

// DEAFCS-only News comments (Anders 2026-10-14): Verified Users and above
// comment and +1 for 7 days after publication, 10-minute edits, one reply
// level, staff hide/restore, no Report button, text never rendered as HTML.

vi.setConfig({ testTimeout: 20_000 });

const ME = "76561190000000001";
const OTHER = "76561190000000002";
const ARTICLE = "a0000000-0000-0000-0000-000000000001";
const ROLES = [
  "user",
  "verified_user",
  "streamer",
  "moderator",
  "match_organizer",
  "tournament_organizer",
  "administrator",
];

const auth = { me: null as null | { steam_id: string; role: string } };
const gql = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("~/graphql/getGraphqlClient", () => ({ default: () => gql }));
vi.mock("@/components/ui/toast", () => ({ toast }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

beforeAll(() => {
  const g = globalThis as any;
  g.useRuntimeConfig = () => ({ public: { apiDomain: "api.deafcs.test" } });
  g.useAuthStore = () => ({
    get me() {
      return auth.me;
    },
    isRoleAbove: (role: string) =>
      !!auth.me && ROLES.indexOf(auth.me.role) >= ROLES.indexOf(role),
  });
  g.useWebsiteRestrictionStore = () => ({ isRestricted: false });
  g.useNuxtApp = () => ({ $i18n: { t: (key: string) => key } });
  g.navigateTo = vi.fn();
});

const route = { hash: "", fullPath: "/news/post" };
beforeEach(() => {
  (globalThis as any).useRoute = () => route;
  route.hash = "";
  auth.me = null;
  gql.query.mockReset();
  gql.mutate.mockReset();
  toast.mockReset();
});
afterEach(() => vi.useRealTimers());

const recent = (minutesAgo = 1) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

const player = (steamId: string, name: string, extra: Record<string, unknown> = {}) => ({
  steam_id: steamId,
  name,
  avatar_url: null,
  custom_avatar_url: null,
  country: null,
  team_members: [],
  ...extra,
});

const comment = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  parent_id: null,
  author_steam_id: OTHER,
  created_at: recent(30),
  edited_at: null,
  deleted_at: null,
  hidden_at: null,
  vote_count: 0,
  text: `Comment ${id}`,
  author: player(OTHER, "Bob"),
  votes: [],
  replies: [],
  ...over,
});

let lastQuery = "";
function serve(comments: any[], threads = comments.length, visible = threads) {
  gql.query.mockImplementation(async ({ query, variables }: any) => {
    lastQuery = print(query);
    return {
      data: {
        news_comments: comments.slice(variables.offset, variables.offset + variables.limit),
        threads: { aggregate: { count: threads } },
        visible: { aggregate: { count: visible } },
      },
    };
  });
}

async function mountComments(publishedAt: string | null = recent(60)) {
  const Blank = defineComponent({ render: () => null });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Blank },
      { path: "/players/:id", name: "players-id", component: Blank },
      { path: "/teams/:id", component: Blank },
    ],
  });
  await router.push("/");
  await router.isReady();
  const { default: NewsComments } = await import(
    "../../components/news/NewsComments.vue"
  );
  const wrapper = mount(NewsComments, {
    attachTo: document.body,
    props: { articleId: ARTICLE, publishedAt },
    global: {
      plugins: [router],
      components: { NuxtLink: RouterLink },
      stubs: { TimeAgo: { props: ["date"], template: "<span>ago</span>" } },
      mocks: {
        $t: (key: string, args?: any) =>
          args ? `${key}:${JSON.stringify(args)}` : key,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("who can take part", () => {
  it("asks guests to sign in, and never asks them for votes", async () => {
    serve([comment("c1")]);
    const wrapper = await mountComments();
    expect(wrapper.find('[data-testid="comments-sign-in"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="comment-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="comment-reply"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="comment-vote"]').attributes("disabled")).toBeDefined();
    // Guests may not select news_comment_votes or the hide reason.
    expect(lastQuery).not.toContain("votes");
    expect(lastQuery).not.toContain("hidden_reason");
    wrapper.unmount();
  });

  it("tells a signed-in player who is not verified why they cannot comment", async () => {
    auth.me = { steam_id: ME, role: "user" };
    serve([comment("c1")]);
    const wrapper = await mountComments();
    expect(wrapper.find('[data-testid="comments-verified-only"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="comment-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="comment-vote"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("lets a Verified User post, then shows the comment after the refresh", async () => {
    auth.me = { steam_id: ME, role: "verified_user" };
    const thread: any[] = [];
    serve(thread);
    gql.mutate.mockImplementation(async ({ variables }: any) => {
      thread.push(comment("new", { author_steam_id: ME, author: player(ME, "Me"), text: variables.body }));
      return { data: { postNewsComment: { id: "new" } } };
    });
    const wrapper = await mountComments();

    await wrapper.find('[data-testid="comment-input"]').setValue("  Great update!  ");
    await wrapper.find('[data-testid="comment-submit"]').trigger("click");
    await flushPromises();

    expect(gql.mutate).toHaveBeenCalledTimes(1);
    expect(gql.mutate.mock.calls[0][0].variables).toEqual({
      article: ARTICLE,
      parent: null,
      body: "Great update!",
    });
    expect(wrapper.find('[data-testid="comment-text"]').text()).toBe("Great update!");
    expect((wrapper.find('[data-testid="comment-input"]').element as HTMLTextAreaElement).value).toBe("");
    wrapper.unmount();
  });

  it("shows the server's message when a write is refused", async () => {
    auth.me = { steam_id: ME, role: "verified_user" };
    serve([]);
    gql.mutate.mockRejectedValue({ graphQLErrors: [{ message: "You are commenting too fast. Please wait a minute." }] });
    const wrapper = await mountComments();
    await wrapper.find('[data-testid="comment-input"]').setValue("again");
    await wrapper.find('[data-testid="comment-submit"]').trigger("click");
    await flushPromises();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "You are commenting too fast. Please wait a minute." }),
    );
    wrapper.unmount();
  });
});

describe("7-day window", () => {
  it("closes posting, replies and +1 after 7 days but keeps comments readable", async () => {
    auth.me = { steam_id: ME, role: "administrator" };
    serve([comment("c1", { vote_count: 4 })]);
    const wrapper = await mountComments(new Date(Date.now() - 8 * 86_400_000).toISOString());
    expect(wrapper.find('[data-testid="comments-closed"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="comment-input"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="comment-reply"]').exists()).toBe(false);
    const vote = wrapper.find('[data-testid="comment-vote"]');
    expect(vote.text()).toContain("+4");
    expect(vote.attributes("disabled")).toBeDefined();
    expect(wrapper.find('[data-testid="comment-text"]').text()).toBe("Comment c1");
    wrapper.unmount();
  });
});

describe("replies", () => {
  it("renders replies under their comment, and posts a reply to the parent", async () => {
    auth.me = { steam_id: ME, role: "verified_user" };
    serve([
      comment("c1", {
        replies: [
          comment("r1", { parent_id: "c1", text: "Reply one" }),
          comment("r2", { parent_id: "c1", text: "Reply two", author_steam_id: ME, author: player(ME, "Me") }),
        ],
      }),
    ]);
    gql.mutate.mockResolvedValue({ data: { postNewsComment: { id: "r3" } } });
    const wrapper = await mountComments();

    const parent = wrapper.find('[data-comment-id="c1"]');
    expect(parent.findAll("ol [data-comment-id]").map((r) => r.attributes("data-comment-id"))).toEqual(["r1", "r2"]);

    // Reply on a reply answers the top-level comment (one level deep).
    await wrapper.find('[data-comment-id="r1"] [data-testid="comment-reply"]').trigger("click");
    await wrapper.find('[data-comment-id="c1"] [data-testid="comment-input"]').setValue("Me too");
    await wrapper.find('[data-comment-id="c1"] [data-testid="comment-submit"]').trigger("click");
    await flushPromises();
    expect(gql.mutate.mock.calls[0][0].variables).toEqual({ article: ARTICLE, parent: "c1", body: "Me too" });
    wrapper.unmount();
  });

  it("folds long reply threads behind Show more replies", async () => {
    serve([
      comment("c1", {
        replies: ["r1", "r2", "r3", "r4", "r5"].map((id) => comment(id, { parent_id: "c1" })),
      }),
    ]);
    const wrapper = await mountComments();
    expect(wrapper.findAll("ol ol [data-comment-id]")).toHaveLength(3);
    await wrapper.find('[data-testid="comment-more-replies"]').trigger("click");
    expect(wrapper.findAll("ol ol [data-comment-id]")).toHaveLength(5);
    wrapper.unmount();
  });
});

describe("+1", () => {
  it("toggles the viewer's +1 and is disabled on their own comment", async () => {
    auth.me = { steam_id: ME, role: "verified_user" };
    serve([
      comment("c1", { vote_count: 2 }),
      comment("mine", { author_steam_id: ME, author: player(ME, "Me") }),
    ]);
    gql.mutate.mockResolvedValue({ data: { toggleNewsCommentVote: { comment_id: "c1", vote_count: 3, voted: true } } });
    const wrapper = await mountComments();

    const vote = wrapper.find('[data-comment-id="c1"] [data-testid="comment-vote"]');
    await vote.trigger("click");
    await flushPromises();
    expect(gql.mutate.mock.calls[0][0].variables).toEqual({ id: "c1" });
    expect(vote.text()).toContain("+3");
    expect(vote.attributes("aria-pressed")).toBe("true");

    const own = wrapper.find('[data-comment-id="mine"] [data-testid="comment-vote"]');
    expect(own.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});

describe("own comments", () => {
  it("offers Edit for 10 minutes and Delete with a confirmation", async () => {
    auth.me = { steam_id: ME, role: "verified_user" };
    serve([
      comment("fresh", { author_steam_id: ME, author: player(ME, "Me"), created_at: recent(2) }),
      comment("old", { author_steam_id: ME, author: player(ME, "Me"), created_at: recent(11) }),
    ]);
    gql.mutate.mockResolvedValue({ data: {} });
    const wrapper = await mountComments();
    expect(wrapper.find('[data-comment-id="fresh"] [data-testid="comment-edit"]').exists()).toBe(true);
    expect(wrapper.find('[data-comment-id="old"] [data-testid="comment-edit"]').exists()).toBe(false);

    await wrapper.find('[data-comment-id="old"] [data-testid="comment-delete"]').trigger("click");
    expect(gql.mutate).not.toHaveBeenCalled();
    const confirm = wrapper
      .find('[data-comment-id="old"]')
      .findAll("button")
      .find((b) => b.text() === "pages.news.comments.delete");
    await confirm!.trigger("click");
    await flushPromises();
    expect(gql.mutate.mock.calls[0][0].variables).toEqual({ id: "old" });
    wrapper.unmount();
  });

  it("shows deleted comments as deleted, without actions", async () => {
    serve([comment("gone", { deleted_at: recent(1), text: null })]);
    const wrapper = await mountComments();
    expect(wrapper.text()).toContain("pages.news.comments.deleted");
    expect(wrapper.find('[data-testid="comment-text"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("moderation", () => {
  it("shows readers 'Removed by staff' and staff the text, reason and Restore", async () => {
    serve([comment("h", { hidden_at: recent(1), text: null })]);
    let wrapper = await mountComments();
    expect(wrapper.text()).toContain("pages.news.comments.removed_by_staff");
    expect(wrapper.find('[data-testid="comment-hide"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="comment-restore"]').exists()).toBe(false);
    wrapper.unmount();

    auth.me = { steam_id: ME, role: "moderator" };
    serve([
      comment("h", { hidden_at: recent(1), text: "rude words", hidden_reason: "insults" }),
      comment("ok"),
    ]);
    gql.mutate.mockResolvedValue({ data: {} });
    wrapper = await mountComments();
    expect(lastQuery).toContain("hidden_reason");
    const hidden = wrapper.find('[data-comment-id="h"]');
    expect(hidden.text()).toContain("rude words");
    expect(hidden.text()).toContain("pages.news.comments.hidden_badge");
    expect(hidden.text()).toContain("insults");
    await hidden.find('[data-testid="comment-restore"]').trigger("click");
    await flushPromises();
    expect(gql.mutate.mock.calls[0][0].variables).toEqual({ id: "h", hidden: false, reason: null });

    await wrapper.find('[data-comment-id="ok"] [data-testid="comment-hide"]').trigger("click");
    await wrapper.find('[data-comment-id="ok"] input').setValue("spam");
    const hide = wrapper
      .find('[data-comment-id="ok"]')
      .findAll("button")
      .find((b) => b.text() === "pages.news.comments.hide");
    await hide!.trigger("click");
    await flushPromises();
    expect(gql.mutate.mock.calls[1][0].variables).toEqual({ id: "ok", hidden: true, reason: "spam" });
    wrapper.unmount();
  });

  it("never offers hiding to non-staff, and has no Report button for anyone", async () => {
    for (const role of [null, "user", "verified_user", "moderator"]) {
      auth.me = role ? { steam_id: ME, role } : null;
      serve([comment("c1")]);
      const wrapper = await mountComments();
      expect(wrapper.find('[data-testid="comment-hide"]').exists()).toBe(role === "moderator");
      expect(wrapper.html().toLowerCase()).not.toContain("report");
      wrapper.unmount();
    }
  });
});

describe("pagination", () => {
  it("loads 20 threads at a time", async () => {
    const all = Array.from({ length: 25 }, (_, i) => comment(`c${i}`));
    serve(all);
    const wrapper = await mountComments();
    expect(wrapper.findAll("ol > li[data-comment-id]")).toHaveLength(20);
    expect(wrapper.find('[data-testid="comment-count"]').text()).toBe("25");
    await wrapper.find('[data-testid="comments-more"]').trigger("click");
    await flushPromises();
    expect(gql.query.mock.calls.at(-1)![0].variables).toMatchObject({ offset: 20, limit: 20 });
    expect(wrapper.findAll("ol > li[data-comment-id]")).toHaveLength(25);
    expect(wrapper.find('[data-testid="comments-more"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("players", () => {
  it("shows a country flag only when known, and a team logo only for exactly one active team", async () => {
    const team = (id: string) => ({ team: { id, name: `Team ${id}`, short_name: id, avatar_url: null } });
    serve([
      comment("one", { author: player(OTHER, "A", { country: "DK", team_members: [team("t1")] }) }),
      comment("two", { author: player(OTHER, "B", { team_members: [team("t1"), team("t2")] }) }),
      comment("none", { author: player(OTHER, "C") }),
    ]);
    const wrapper = await mountComments();
    const one = wrapper.find('[data-comment-id="one"]');
    expect(one.find('[data-testid="comment-flag"]').exists()).toBe(true);
    expect(one.find('[data-testid="comment-team"]').attributes("href")).toBe("/teams/t1");
    expect(wrapper.find('[data-comment-id="two"] [data-testid="comment-team"]').exists()).toBe(false);
    expect(wrapper.find('[data-comment-id="none"] [data-testid="comment-team"]').exists()).toBe(false);
    expect(wrapper.find('[data-comment-id="none"] [data-testid="comment-flag"]').exists()).toBe(false);
    // Benched rosters are filtered out in the query itself. The status is a
    // Hasura enum (e_team_roster_statuses_enum), so it must be the bare enum
    // value: a quoted "Benched" fails validation for every viewer (the
    // 2026-10-14 release incident).
    expect(lastQuery).toContain("status: {_neq: Benched}");
    expect(lastQuery).not.toMatch(/_neq: "Benched"/);
    wrapper.unmount();
  });
});

describe("safe text", () => {
  it("shows HTML a player typed as text and links web addresses safely", async () => {
    serve([
      comment("x", {
        text: '<img src=x onerror="alert(1)"><b>bold</b> see https://deafcs.net/play.',
      }),
    ]);
    const wrapper = await mountComments();
    const text = wrapper.find('[data-comment-id="x"] [data-testid="comment-text"]');
    expect(text.find("img").exists()).toBe(false);
    expect(text.find("b").exists()).toBe(false);
    expect(text.text()).toContain('<img src=x onerror="alert(1)"><b>bold</b>');
    const link = text.find("a");
    expect(link.attributes("href")).toBe("https://deafcs.net/play");
    expect(link.attributes("rel")).toContain("nofollow");
    expect(link.attributes("target")).toBe("_blank");
    wrapper.unmount();
  });
});

describe("notification links", () => {
  it("opens the reply on its article", async () => {
    const { newsCommentNotificationPath } = await import("~/utilities/newsCommentText");
    expect(newsCommentNotificationPath("news_comment:season-2:abc-1")).toBe("/news/season-2#comment-abc-1");
    expect(newsCommentNotificationPath("direct:1:2")).toBeNull();
    expect(newsCommentNotificationPath(null)).toBeNull();
  });

  it("brings a linked reply into view, loading further pages if needed", async () => {
    const all = Array.from({ length: 25 }, (_, i) => comment(`c${i}`));
    all[22].replies = ["r1", "r2", "r3", "r4"].map((id) => comment(id, { parent_id: "c22" }));
    serve(all);
    route.hash = "#comment-r4";
    const scroll = vi.fn();
    (Element.prototype as any).scrollIntoView = scroll;
    const wrapper = await mountComments();
    await flushPromises();
    const target = wrapper.find('[data-comment-id="r4"]');
    expect(target.exists()).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(target.find(".ring-1").exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("load failure", () => {
  it("says comments could not be loaded, without a raw error toast", async () => {
    gql.query.mockRejectedValue(new Error("field 'news_comments' not found in type: 'query_root'"));
    const wrapper = await mountComments();
    expect(wrapper.find('[data-testid="comments-failed"]').exists()).toBe(true);
    expect(toast).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
