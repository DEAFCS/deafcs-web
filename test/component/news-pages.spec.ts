import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterLink } from "vue-router";
import fs from "node:fs";
import path from "node:path";

// /news and /news/[slug] after the 5Stack News port (web f2d5eee9): the
// newest post is the showcase, the rest are Earlier posts, and an article
// ends with the article itself (DEAFCS removed upstream's Older/Newer links
// and Latest posts grid). Posts written for the old layout, including the
// sign-language video in "Our First 10 Days", still render.

// The first mount imports the whole page tree, which is slow under a full run.
vi.setConfig({ testTimeout: 20_000 });

const API = "api.deafcs.test";
const VIDEO = `https://${API}/news/video/686cd66e99163cb1c67e5542.mp4`;

const settings = { newsEnabled: true, newsLabel: "", canPostNews: false };
const notifications = {
  lastReadNewsAt: null as string | null,
  latestNewsArticle: null as any,
  markNewsRead: vi.fn(),
};
const auth = { me: null as any };

const gql = vi.hoisted(() => ({ query: vi.fn(), mutate: vi.fn() }));
vi.mock("~/graphql/getGraphqlClient", () => ({ default: () => gql }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

beforeAll(() => {
  (window as any).happyDOM.settings.navigation.disableChildFrameNavigation =
    true;
  const g = globalThis as any;
  g.useRuntimeConfig = () => ({ public: { apiDomain: API } });
  g.useApplicationSettingsStore = () => settings;
  g.useNotificationStore = () => notifications;
  g.useWebsiteRestrictionStore = () => ({ isRestricted: false });
  g.useAuthStore = () => ({
    get me() {
      return auth.me;
    },
    isRoleAbove: () => false,
  });
  g.useSeoMeta = () => {};
  g.useNuxtApp = () => ({ $i18n: { t: (key: string) => key } });
  g.navigateTo = vi.fn();
  g.definePageMeta = () => {};
});

const route = { params: {} as Record<string, string>, hash: "" };
beforeEach(() => {
  (globalThis as any).useRoute = () => route;
  gql.query.mockReset();
  settings.canPostNews = false;
  auth.me = null;
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const article = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${n}`,
  slug: `post-${n}`,
  title: `Post ${n}`,
  teaser: `Teaser ${n}`,
  cover_image_url: `https://${API}/news/image/cover-${n}.png`,
  status: "published",
  published_at: `2026-09-${String(20 - n).padStart(2, "0")}T10:00:00Z`,
  updated_at: `2026-09-${String(20 - n).padStart(2, "0")}T10:00:00Z`,
  content_markdown: `Intro ${n}.\n\n### First part\n\nText.\n\n### Second part\n\nMore.`,
  ...extra,
});

// The article page also loads its comments (NewsComments); an empty thread.
const isThread = (query: unknown) =>
  JSON.stringify(query).includes("NewsCommentThread");
const emptyThread = {
  data: {
    news_comments: [],
    threads: { aggregate: { count: 0 } },
    visible: { aggregate: { count: 0 } },
  },
};

const Pass = defineComponent({ setup: (_, { slots }) => () => slots.default?.() });

async function mountPage(file: string, at: string) {
  const Blank = defineComponent({ render: () => null });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: Blank },
      { path: "/news", name: "news", component: Blank },
      { path: "/news/:slug", component: Blank },
      { path: "/news/manage/:id", component: Blank },
      { path: "/players/:id", name: "players-id", component: Blank },
    ],
  });
  await router.push(at);
  await router.isReady();
  const { default: Page } = await import(`../../pages/news/${file}`);
  const wrapper = mount(Page, {
    attachTo: document.body,
    global: {
      plugins: [router],
      components: { NuxtLink: RouterLink },
      stubs: { PageTransition: Pass, FadeSwap: Pass, ClientOnly: Pass },
      mocks: { $t: (key: string, args?: any) => (args ? `${key}:${JSON.stringify(args)}` : key) },
    },
  });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 400));
  await flushPromises();
  return wrapper;
}

describe("/news", () => {
  beforeEach(() => {
    const posts = [1, 2, 3, 4].map((n) => article(n));
    gql.query.mockImplementation(({ query }: any) => {
      const text = JSON.stringify(query);
      if (text.includes("news_articles_aggregate")) {
        return Promise.resolve({
          data: { news_articles_aggregate: { aggregate: { count: 4 } } },
        });
      }
      return Promise.resolve({ data: { news_articles: posts } });
    });
  });

  it("shows the newest post as the showcase with read time and a Read action", async () => {
    const wrapper = await mountPage("index.vue", "/news");
    const lead = wrapper.find('[aria-labelledby="news-lead-title"]');
    expect(lead.exists()).toBe(true);
    expect(lead.find("#news-lead-title").text()).toBe("Post 1");
    expect(lead.text()).toContain("Teaser 1");
    expect(lead.text()).toContain("pages.news.read_time");
    expect(lead.find('img[src$="cover-1.png"]').exists()).toBe(true);
    const read = lead.findAll("a").find((a) => a.text().includes("pages.news.read_post"));
    expect(read?.attributes("href")).toBe("/news/post-1");
    wrapper.unmount();
  });

  it("links the showcase's sections straight into the post", async () => {
    const wrapper = await mountPage("index.vue", "/news");
    const hrefs = wrapper
      .find('[aria-labelledby="news-lead-title"]')
      .findAll("a")
      .map((a) => a.attributes("href"));
    expect(hrefs).toContain("/news/post-1#first-part");
    expect(hrefs).toContain("/news/post-1#second-part");
    wrapper.unmount();
  });

  it("lists the other posts under Earlier posts", async () => {
    const wrapper = await mountPage("index.vue", "/news");
    expect(wrapper.text()).toContain("pages.news.earlier");
    const cards = wrapper
      .findAll("a")
      .map((a) => a.attributes("href"))
      .filter((href) => href === "/news/post-2" || href === "/news/post-3" || href === "/news/post-4");
    expect(new Set(cards)).toEqual(new Set(["/news/post-2", "/news/post-3", "/news/post-4"]));
    expect(wrapper.find('a[href="/news/manage/new"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("only offers New post to staff who can post News", async () => {
    settings.canPostNews = true;
    gql.query.mockImplementation(({ query }: any) => {
      const text = JSON.stringify(query);
      if (text.includes("newsPostsAdmin")) {
        return Promise.resolve({ data: { newsPostsAdmin: [] } });
      }
      if (text.includes("news_articles_aggregate")) {
        return Promise.resolve({ data: { news_articles_aggregate: { aggregate: { count: 1 } } } });
      }
      return Promise.resolve({ data: { news_articles: [article(1)] } });
    });
    const wrapper = await mountPage("index.vue", "/news");
    expect(wrapper.find('a[href="/news/manage/new"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("/news/[slug]", () => {
  const firstTenDays = article(1, {
    slug: "deafcs-our-first-10-days",
    title: "DEAFCS: Our First 10 Days",
    // The stored shape of the production post (old editor, ## sections).
    content_markdown: [
      "It has now been 10 days since **DEAFCS.net officially opened**.",
      "",
      "## Welcome to DEAFCS 🎥",
      "If you haven't seen our welcome video yet, take a look below.",
      "",
      "",
      `<video controls preload="metadata" src="${VIDEO}"></video>`,
      "",
      "",
      "## We grow together ❤️",
      "",
      "Text.",
      "",
      `![](https://${API}/news/image/8c8d843f95589613330ca3d4.png)`,
    ].join("\n"),
    author: null,
  });

  beforeEach(() => {
    route.params = { slug: "deafcs-our-first-10-days" };
    gql.query.mockImplementation(async ({ query }: any) =>
      isThread(query) ? emptyThread : { data: { news_articles: [firstTenDays] } },
    );
  });

  it("renders an existing post with its sign-language video", async () => {
    const wrapper = await mountPage("[slug].vue", "/news/deafcs-our-first-10-days");
    const video = wrapper.find(".news-content video");
    expect(video.exists()).toBe(true);
    expect(video.find("source").attributes("src")).toBe(VIDEO);
    expect(video.attributes()).toHaveProperty("controls");
    expect(video.attributes()).toHaveProperty("playsinline");
    expect(video.attributes()).not.toHaveProperty("autoplay");
    expect(wrapper.find('.news-content img[src$="8c8d843f95589613330ca3d4.png"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("shows the cover hero, the title and an On this page list", async () => {
    const wrapper = await mountPage("[slug].vue", "/news/deafcs-our-first-10-days");
    expect(wrapper.find("h1").text()).toBe("DEAFCS: Our First 10 Days");
    expect(wrapper.find('header img[src$="cover-1.png"]').exists()).toBe(true);
    const toc = wrapper.findAll('nav[aria-label="pages.news.on_this_page"] a');
    expect(toc.map((a) => a.text())).toEqual(
      expect.arrayContaining(["Welcome to DEAFCS 🎥", "We grow together ❤️"]),
    );
    const anchor = wrapper.find(".news-content h2[id] .news-anchor");
    expect(anchor.exists()).toBe(true);
    wrapper.unmount();
  });

  it("ends with the article and its comments: no Older/Newer links and no Latest posts grid", async () => {
    const wrapper = await mountPage("[slug].vue", "/news/deafcs-our-first-10-days");
    expect(wrapper.text()).not.toContain("pages.news.latest");
    expect(wrapper.text()).not.toContain("pages.news.older");
    expect(wrapper.text()).not.toContain("pages.news.newer");
    expect(wrapper.find('nav[aria-label="pages.news.around"]').exists()).toBe(false);
    // The article and its comments. No neighbour or latest-post lookups.
    const queries = gql.query.mock.calls.map(([arg]: any) => arg.query);
    expect(queries.filter((q: unknown) => !isThread(q))).toHaveLength(1);
    expect(queries.filter(isThread)).toHaveLength(1);
    // Comments come right after the article body, and nothing after them.
    const comments = wrapper.find("section#comments");
    expect(comments.exists()).toBe(true);
    expect(comments.element.nextElementSibling).toBeNull();
    expect(
      wrapper.find(".news-content").element.compareDocumentPosition(comments.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    wrapper.unmount();
  });

  it("offers Copy link to readers and Edit only to staff", async () => {
    let wrapper = await mountPage("[slug].vue", "/news/deafcs-our-first-10-days");
    expect(wrapper.text()).toContain("pages.news.copy_link");
    expect(wrapper.find('a[href="/news/manage/id-1"]').exists()).toBe(false);
    wrapper.unmount();

    settings.canPostNews = true;
    gql.query.mockImplementation(({ query }: any) =>
      isThread(query)
        ? Promise.resolve(emptyThread)
        : JSON.stringify(query).includes("newsPostAdmin")
        ? Promise.resolve({ data: { newsPostAdmin: { id: "id-1", view_count: "7" } } })
        : Promise.resolve({ data: { news_articles: [firstTenDays] } }),
    );
    wrapper = await mountPage("[slug].vue", "/news/deafcs-our-first-10-days");
    expect(wrapper.find('a[href="/news/manage/id-1"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe("News notification", () => {
  it("links the bell's News card straight to the article", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../components/notification/NewsNotification.vue"),
      "utf8",
    );
    expect(source).toContain("`/news/${a.slug}`");
    expect(source).toContain("article.cover_image_url");
  });

  it("exposes the read watermark the News page uses for New badges", () => {
    const store = fs.readFileSync(
      path.resolve(__dirname, "../../stores/NotificationStore.ts"),
      "utf8",
    );
    expect(store).toMatch(/return \{[\s\S]*\blastReadNewsAt,[\s\S]*\}/);
  });
});
