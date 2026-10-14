import { beforeAll, describe, expect, it, vi } from "vitest";

// The News renderer, ported from 5Stack (web f2d5eee9, utilities/newsMarkdown.ts)
// with the DEAFCS additions on top: posts written before the upstream
// @[video] token keep their sign-language videos, Vimeo still embeds, video
// files only play from our own uploads, and `##` posts get a contents list.

const API = "api.deafcs.test";
const HOSTED = `https://${API}/news/video/686cd66e99163cb1c67e5542.mp4`;
const POSTER = `https://${API}/news/image/poster.webp`;

beforeAll(() => {
  // DOMPurify parses the embeds; happy-dom would otherwise try to load them.
  (window as any).happyDOM.settings.navigation.disableChildFrameNavigation =
    true;
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: API } }));
});

const load = () => import("~/utilities/newsMarkdown");

const LABEL = { anchorLabel: "Copy a link to this section" };

describe("upstream behaviour", () => {
  const post = [
    "<!--",
    "  Suggested Title  : Utility Library",
    "-->",
    "",
    "## Utility Library & Practice Servers",
    "",
    "Where to stand, where to aim, where it lands.",
    "",
    "### A library per map",
    "",
    "- **Filter it down**, utility type, side, technique.",
    "",
    "### Practice servers, one click",
    "",
    "Press **Practice** and you get your own server.",
    "",
    "### Practice servers, one click",
    "",
    "Twice, to check ids stay unique.",
    "",
    "---",
    "",
    "**Ready to stop guessing at smokes?** Open **Utility** and hit **Practice**.",
  ].join("\r\n");

  it("drops the heading that repeats the title", async () => {
    const { renderNewsArticle } = await load();
    const article = renderNewsArticle(post, LABEL);
    expect(article.html).not.toContain("Utility Library &amp; Practice Servers");
    expect(article.html).not.toContain("Suggested Title");
    expect(article.html).toContain("Where to stand");
  });

  it("lists ### headings as sections with unique, linkable ids", async () => {
    const { renderNewsArticle } = await load();
    const article = renderNewsArticle(post, LABEL);
    expect(article.sections).toEqual([
      { id: "a-library-per-map", text: "A library per map" },
      { id: "practice-servers-one-click", text: "Practice servers, one click" },
      { id: "practice-servers-one-click-2", text: "Practice servers, one click" },
    ]);
    expect(article.html).toContain('<h3 id="a-library-per-map">');
    expect(article.html).toContain('href="#practice-servers-one-click-2"');
    expect(article.html).toContain('aria-label="Copy a link to this section"');
  });

  it("splits the closing paragraph after the last --- into the highlight block", async () => {
    const { renderNewsArticle } = await load();
    const article = renderNewsArticle(post, LABEL);
    expect(article.closingHtml).toContain("Ready to stop guessing at smokes?");
    expect(article.html).not.toContain("Ready to stop guessing");
    expect(article.html).not.toContain("<hr");
  });

  it("keeps a --- followed by more than a short sign-off in the body", async () => {
    const { renderNewsArticle } = await load();
    const article = renderNewsArticle(
      "Intro\n\n---\n\n### More\n\nText",
      LABEL,
    );
    expect(article.closingHtml).toBe("");
    expect(article.html).toContain("<hr");
  });

  it("reports a read time of at least a minute", async () => {
    const { newsOutline } = await load();
    expect(newsOutline("short").minutes).toBe(1);
    expect(newsOutline(Array(700).fill("word").join(" ")).minutes).toBe(3);
  });

  it("embeds a YouTube token as a privacy-enhanced iframe", async () => {
    const { renderNewsMarkdown } = await load();
    // (happy-dom drops the first wrapper element; browsers keep it.)
    const html = renderNewsMarkdown(
      "Intro.\n\n@[video](https://youtu.be/dQw4w9WgXcQ)",
    );
    expect(html).toContain('class="news-embed"');
    expect(html).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
});

describe("DEAFCS: existing sign-language videos", () => {
  // The exact shape the old editor stored (production post
  // deafcs-our-first-10-days, 2026-09-25).
  const legacy = [
    "## Welcome to DEAFCS",
    "If you haven't seen our welcome video yet, take a look below.",
    "",
    "",
    `<video controls preload="metadata" src="${HOSTED}"></video>`,
    "",
    "",
    "## We grow together",
    "",
    "Text.",
  ].join("\n");

  it("plays an uploaded video stored as a raw <video> tag", async () => {
    const { renderNewsArticle } = await load();
    const article = renderNewsArticle(legacy, LABEL);
    expect(article.html).toContain('class="news-embed"');
    expect(article.html).toMatch(/<video[^>]*class="news-video"/);
    expect(article.html).toContain(`src="${HOSTED}"`);
    expect(article.html).toMatch(/<video[^>]*controls/);
    expect(article.html).toMatch(/<video[^>]*playsinline/);
  });

  it("never autoplays or forces sound", async () => {
    const { renderNewsArticle } = await load();
    const { html } = renderNewsArticle(legacy, LABEL);
    expect(html).not.toMatch(/autoplay/i);
    expect(html).toMatch(/preload="metadata"/);
  });

  it("renders the same video in the editor preview", async () => {
    const { renderNewsMarkdown } = await load();
    expect(renderNewsMarkdown(legacy)).toContain(`src="${HOSTED}"`);
  });

  it("plays the upstream token for new uploads, with the captured poster", async () => {
    const { renderNewsMarkdown, videoToken } = await load();
    const html = renderNewsMarkdown(videoToken(HOSTED, POSTER));
    expect(html).toContain(`src="${HOSTED}"`);
    expect(html).toContain(`poster="${POSTER}"`);
  });

  it("still embeds a bare YouTube link on its own line", async () => {
    const { renderNewsMarkdown } = await load();
    const html = renderNewsMarkdown(
      "Watch:\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n",
    );
    expect(html).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  it("still embeds a bare Vimeo link on its own line", async () => {
    const { renderNewsMarkdown } = await load();
    const html = renderNewsMarkdown("Intro.\n\nhttps://vimeo.com/123456789");
    expect(html).toContain('src="https://player.vimeo.com/video/123456789"');
  });

  it("leaves a link inside a sentence as a normal link", async () => {
    const { renderNewsMarkdown } = await load();
    const html = renderNewsMarkdown(
      "See https://www.youtube.com/watch?v=dQw4w9WgXcQ for more.",
    );
    expect(html).not.toContain("<iframe");
  });

  it("only plays video files from our own uploads", async () => {
    const { renderNewsMarkdown, isEmbeddableVideoUrl } = await load();
    const outside = "https://evil.example/clip.mp4";
    expect(renderNewsMarkdown(`@[video](${outside})`)).not.toContain("<video");
    expect(renderNewsMarkdown(`Intro.\n\n@[video](${outside})`)).toContain(
      'class="news-embed-link"',
    );
    expect(isEmbeddableVideoUrl(outside)).toBe(false);
    expect(isEmbeddableVideoUrl(HOSTED)).toBe(true);
    expect(isEmbeddableVideoUrl("https://vimeo.com/123456789")).toBe(true);
  });
});

describe("DEAFCS: ## sections", () => {
  it("uses ## headings for the contents list when a post has no ###", async () => {
    const { renderNewsArticle, newsOutline } = await load();
    const source = "Intro.\n\n## We grow together ❤️\n\nA.\n\n## What is next? 🚀\n\nB.";
    const article = renderNewsArticle(source, LABEL);
    expect(article.sections.map((s) => s.text)).toEqual([
      "We grow together ❤️",
      "What is next? 🚀",
    ]);
    expect(article.html).toContain(`<h2 id="${article.sections[0].id}">`);
    expect(newsOutline(source).sections).toEqual(article.sections);
  });

  it("keeps ### as the sections when a post uses both", async () => {
    const { renderNewsArticle } = await load();
    const article = renderNewsArticle(
      "Intro.\n\n## Part\n\n### Detail\n\nText",
      LABEL,
    );
    expect(article.sections).toEqual([{ id: "detail", text: "Detail" }]);
    expect(article.html).toContain("<h2>Part</h2>");
  });
});

// Sanitising (scripts, event handlers, javascript: links, iframes outside the
// allowlist, <video>/<source> outside our uploads) is DOMPurify running in the
// browser. happy-dom returns empty output for some of those inputs, so a test
// here could pass without proving anything; it is checked in a real browser
// against this renderer instead (see the News QA notes).
