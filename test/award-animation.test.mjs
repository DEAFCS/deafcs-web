import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageTransition, catalog, detail, manage] = await Promise.all([
  readFile(new URL("../components/ui/transitions/PageTransition.vue", import.meta.url), "utf8"),
  readFile(new URL("../pages/awards/index.vue", import.meta.url), "utf8"),
  readFile(new URL("../pages/awards/[id].vue", import.meta.url), "utf8"),
  readFile(new URL("../pages/awards/manage.vue", import.meta.url), "utf8"),
]);

const pages = [catalog, detail, manage];

function assertStaggeredPage(page, name) {
  assert.match(page, /import PageTransition from "~\/components\/ui\/transitions\/PageTransition\.vue"/);
  assert.match(page, /<PageTransition>/);
  assert.match(page, /<PageTransition :delay="100">/);
  assert.match(page, /<PageTransition :delay="175">/);
  assert.doesNotMatch(page, /<PageTransition[^>]*(?:v-if|:key)=/);
  assert.ok(
    page.indexOf('<PageTransition>') < page.indexOf('<PageTransition :delay="100">'),
    `${name} starts with an undelayed section`,
  );
  assert.ok(
    page.indexOf('<PageTransition :delay="100">') < page.indexOf('<PageTransition :delay="175">'),
    `${name} keeps sections in top-to-bottom order`,
  );
}

test("Awards pages use the shared one-shot staggered entrance wrapper", () => {
  for (const [page, name] of [
    [catalog, "catalog"],
    [detail, "detail"],
    [manage, "management"],
  ]) {
    assertStaggeredPage(page, name);
  }

  assert.match(pageTransition, /<Transition\s+appear/);
  assert.match(pageTransition, /motion-reduce:!\[transition-delay:0ms\]/);
  assert.match(pageTransition, /motion-reduce:translate-y-0/);
  assert.match(pageTransition, /transitionDelay/);
});

test("Awards catalog entrance order is header, filters, then results", () => {
  const header = catalog.indexOf("<TacticalPageHeader");
  const filters = catalog.indexOf("<AnimatedFilters");
  const results = catalog.indexOf('class="grid grid-cols-1');
  assert.ok(header < filters);
  assert.ok(filters < results);
});

test("Award detail entrance order is header, stats, then holder history", () => {
  const header = detail.indexOf("<header");
  const stats = detail.indexOf('<dl v-else-if="award"');
  const history = detail.indexOf('<section v-else-if="award"');
  assert.ok(header < stats);
  assert.ok(stats < history);
});

test("Award management keeps dialogs outside the page entrance wrappers", () => {
  const results = manage.indexOf('aria-label="Loading award definitions"');
  const table = manage.indexOf("<table");
  const dialog = manage.indexOf('<Dialog v-model:open="formOpen"');
  const pageExit = manage.lastIndexOf("</PageTransition>");
  assert.ok(results < table);
  assert.ok(pageExit < dialog);
});

test("Awards updates remain inside stable transition children", () => {
  for (const page of pages) {
    assert.doesNotMatch(page, /<PageTransition[^>]*\bv-if=/);
    assert.doesNotMatch(page, /<PageTransition[^>]*:key=/);
  }
  assert.match(catalog, /v-model="search"/);
  assert.match(catalog, /v-model="tier"/);
  assert.match(manage, /v-model="search"/);
  assert.match(manage, /v-model="status"/);
});
