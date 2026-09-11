import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(
  new URL("../pages/about.vue", import.meta.url),
  "utf8",
);
const enLocale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);
const about = enLocale.pages.info.about;

test("8temporary is presented under its formal name, not the 8rary short handle", () => {
  assert.equal(about.partner.title, "Media & Accessibility Partner: 8temporary");
  assert.equal(about.partner.link_label, "8temporary");
  assert.doesNotMatch(about.partner.title, /8rary/);
  assert.doesNotMatch(about.partner.link_label, /8rary/);
  assert.match(pageSource, /pages\.info\.about\.partner\.title/);
});

test("8temporary partner card renders the supplied logo asset", () => {
  assert.match(
    pageSource,
    /src="\/img\/partners\/8temporary-logo\.png"/,
  );
});

test("5Stack platform section exists with accurate, non-ownership wording", () => {
  assert.match(pageSource, /pages\.info\.about\.platform\.title/);
  assert.equal(about.platform.title, "Platform Technology: 5Stack");

  const platformCopy = `${about.platform.title} ${about.platform.intro} ${about.platform.body}`;
  assert.doesNotMatch(platformCopy, /5Stack (made|created|owns|operates) DEAFCS/i);
  assert.doesNotMatch(platformCopy, /DEAFCS is (owned|operated) by 5Stack/i);
  assert.match(platformCopy, /5Stack/);
  assert.match(platformCopy, /DEAFCS builds on and customizes/);
});

test("5Stack section renders the supplied logo asset", () => {
  assert.match(pageSource, /src="\/img\/partners\/5stack-logo\.png"/);
});

test("5Stack external links use a safe target and rel", () => {
  const linkBlocks = pageSource.match(
    /<a\s+href="https:\/\/(?:5stack\.gg|docs\.5stack\.gg)\/"[^>]*>/g,
  );
  assert.ok(linkBlocks && linkBlocks.length >= 1, "expected a 5stack.gg link");
  for (const link of linkBlocks) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener noreferrer"/);
  }
});

test("new partner/platform copy avoids em dashes and en dashes", () => {
  const copy = [
    about.partner.title,
    about.partner.intro,
    about.partner.body,
    about.partner.link_label,
    about.platform.title,
    about.platform.intro,
    about.platform.body,
    about.platform.link_label,
    about.platform.docs_label,
  ].join(" ");
  assert.doesNotMatch(copy, /[—–]/);
});

test("partner and platform logo assets exist on disk", async () => {
  await access(
    new URL("../public/img/partners/8temporary-logo.png", import.meta.url),
  );
  await access(
    new URL("../public/img/partners/5stack-logo.png", import.meta.url),
  );
});
