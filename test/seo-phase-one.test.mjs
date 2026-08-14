import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  HOMEPAGE_DESCRIPTION,
  HOMEPAGE_STRUCTURED_DATA,
  HOMEPAGE_TITLE,
  HOMEPAGE_URL,
  SITE_LOGO_URL,
  SITE_NAME,
  STATIC_SITEMAP_PATHS,
} from "../utilities/seo.ts";

const app = await readFile(new URL("../app.vue", import.meta.url), "utf8");
const homepage = await readFile(
  new URL("../pages/index.vue", import.meta.url),
  "utf8",
);
const nuxtConfig = await readFile(
  new URL("../nuxt.config.ts", import.meta.url),
  "utf8",
);
const robots = await readFile(
  new URL("../public/robots.txt", import.meta.url),
  "utf8",
);
const sitemapRoute = await readFile(
  new URL("../server/routes/sitemap.xml.get.ts", import.meta.url),
  "utf8",
);

test("shared homepage SEO constants use the canonical DEAFCS identity", () => {
  assert.equal(SITE_NAME, "DEAFCS");
  assert.equal(HOMEPAGE_URL, "https://deafcs.net/");
  assert.equal(
    HOMEPAGE_TITLE,
    "DEAFCS — Competitive Counter-Strike for the Deaf Community",
  );
  assert.equal(
    HOMEPAGE_DESCRIPTION,
    "DEAFCS is the home of competitive Counter-Strike for the deaf community, featuring Quick Play, tournaments, cups, leagues, player statistics, rankings, and match results.",
  );
  assert.equal(
    SITE_LOGO_URL,
    "https://deafcs.net/branding/deafcs-logo.png",
  );
});

test("homepage metadata, canonical URL, and JSON-LD all reuse the shared constants", () => {
  assert.match(homepage, /useSeoMeta\(\{/);
  for (const field of [
    "title: HOMEPAGE_TITLE",
    "description: HOMEPAGE_DESCRIPTION",
    "ogSiteName: SITE_NAME",
    "ogUrl: HOMEPAGE_URL",
    "ogImage: SITE_LOGO_URL",
  ]) {
    assert.ok(homepage.includes(field), `missing homepage metadata: ${field}`);
  }
  assert.match(homepage, /titleTemplate:\s*null/);
  assert.match(
    homepage,
    /link:\s*\[\{ rel: "canonical", href: HOMEPAGE_URL \}\]/,
  );
  assert.match(homepage, /type: "application\/ld\+json"/);
  assert.match(
    homepage,
    /innerHTML: JSON\.stringify\(HOMEPAGE_STRUCTURED_DATA\)/,
  );
});

test("homepage structured data identifies the organization and website without a fake search action", () => {
  const graph = HOMEPAGE_STRUCTURED_DATA["@graph"];
  const organization = graph.find((entry) => entry["@type"] === "Organization");
  const website = graph.find((entry) => entry["@type"] === "WebSite");

  assert.deepEqual(organization, {
    "@type": "Organization",
    "@id": "https://deafcs.net/#organization",
    name: "DEAFCS",
    url: "https://deafcs.net/",
    logo: "https://deafcs.net/branding/deafcs-logo.png",
  });
  assert.equal(website?.name, "DEAFCS");
  assert.equal(website?.alternateName, "deafcs.net");
  assert.equal(website?.url, "https://deafcs.net/");
  assert.deepEqual(website?.publisher, {
    "@id": "https://deafcs.net/#organization",
  });
  assert.doesNotMatch(JSON.stringify(HOMEPAGE_STRUCTURED_DATA), /SearchAction/);
});

test("there is one internal-page title convention and the homepage opts out of it", () => {
  assert.doesNotMatch(nuxtConfig, /titleTemplate/);
  assert.equal((app.match(/titleTemplate/g) ?? []).length, 1);
  assert.match(app, /return `\$\{pageTitle\} \| \$\{base\}`/);
  assert.doesNotMatch(app, /return `\$\{base\} \| \$\{pageTitle\}`/);
  assert.match(nuxtConfig, /title: HOMEPAGE_TITLE/);
  assert.doesNotMatch(
    `${nuxtConfig}\n${app}\n${homepage}`,
    /5Stack — The System Behind the Game|DEAFCS - 5Stack|https:\/\/5stack\.gg/,
  );
});

test("the static sitemap contains only the approved public routes and emits absolute canonical URLs", () => {
  const expectedPaths = [
    "/",
    "/players",
    "/matches",
    "/tournaments",
    "/teams",
    "/news",
    "/leaderboard",
    "/league",
    "/awards",
    "/watch",
    "/stats-guide",
  ];
  assert.deepEqual([...STATIC_SITEMAP_PATHS], expectedPaths);
  assert.equal(new Set(STATIC_SITEMAP_PATHS).size, STATIC_SITEMAP_PATHS.length);

  const urls = STATIC_SITEMAP_PATHS.map(
    (path) => new URL(path, HOMEPAGE_URL).href,
  );
  for (const url of urls) {
    assert.match(url, /^https:\/\/deafcs\.net\//);
    assert.doesNotMatch(url, /\?|\/_nuxt|\/opt\/|\/settings|\/admin|token/i);
  }

  assert.match(sitemapRoute, /STATIC_SITEMAP_PATHS\.map/);
  assert.match(sitemapRoute, /new URL\(path, HOMEPAGE_URL\)\.href/);
  assert.match(sitemapRoute, /application\/xml; charset=utf-8/);
  assert.doesNotMatch(sitemapRoute, /lastmod|changefreq|priority/);
});

test("robots advertises the sitemap without blocking Nuxt assets", () => {
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/deafcs\.net\/sitemap\.xml$/m);
  assert.doesNotMatch(robots, /Disallow:\s*\/_nuxt/);
});

test("every locale exposes DEAFCS as the app navigation brand", async () => {
  const localeDirectory = new URL("../i18n/locales/", import.meta.url);
  const localeFiles = (await readdir(localeDirectory)).filter((name) =>
    name.endsWith(".json"),
  );
  assert.ok(localeFiles.length > 1);

  for (const name of localeFiles) {
    const locale = JSON.parse(
      await readFile(new URL(name, localeDirectory), "utf8"),
    );
    assert.equal(
      locale.layouts.app_nav.brand,
      "DEAFCS",
      `${name} still exposes a legacy navigation brand`,
    );
  }
});

test("SEO references existing DEAFCS logo and favicon assets", async () => {
  assert.equal(new URL(SITE_LOGO_URL).pathname, "/branding/deafcs-logo.png");
  const assetPaths = [
    "../public/branding/deafcs-logo.png",
    "../public/favicon.ico",
    "../public/favicon/64.png",
    "../public/favicon/192.png",
    "../public/favicon/512.png",
  ];
  for (const path of assetPaths) {
    await access(new URL(path, import.meta.url));
  }
  for (const publicPath of [
    "/favicon.ico",
    "/favicon/64.png",
    "/favicon/192.png",
    "/favicon/512.png",
  ]) {
    assert.ok(
      nuxtConfig.includes(publicPath),
      `${publicPath} is no longer referenced by the Nuxt head/PWA config`,
    );
  }
});
