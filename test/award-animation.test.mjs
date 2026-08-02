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

function assertStaggeredPage(page, name, initialReadyFlag) {
  assert.match(page, /import PageTransition from "~\/components\/ui\/transitions\/PageTransition\.vue"/);
  assert.match(page, /<PageTransition(?:\s[^>]*)?>/);
  assert.match(page, /<PageTransition[^>]*:delay="100"/);
  assert.match(page, /<PageTransition :delay="175" :show="[^"]+">/);
  assert.doesNotMatch(page, /<PageTransition[^>]*(?:v-if|:key)=/);
  assert.match(page, new RegExp(`const ${initialReadyFlag} = ref\\(false\\)`));
  assert.match(
    page,
    new RegExp(
      `if \\(!${initialReadyFlag}\\.value\\) \\{\\s*${initialReadyFlag}\\.value = true`,
    ),
  );
  const firstDelayedSection = page.indexOf(':delay="100"');
  assert.ok(
    page.indexOf("<PageTransition") < firstDelayedSection,
    `${name} starts with an undelayed section`,
  );
  assert.ok(
    firstDelayedSection < page.indexOf('<PageTransition :delay="175"'),
    `${name} keeps sections in top-to-bottom order`,
  );
}

test("PageTransition activates after hydration without removing SSR markup", () => {
  assert.match(pageTransition, /show\?: boolean/);
  assert.match(
    pageTransition,
    /const visible = computed\(\(\) => props\.show && \(import\.meta\.server \|\| clientMounted\.value\)\)/,
  );
  assert.match(pageTransition, /onMounted\(\(\) => \{/);
  assert.match(pageTransition, /<div v-show="visible">/);
  assert.doesNotMatch(pageTransition, /<slot v-if=/);
});

test("Awards pages gate first result content and keep the entrance one-shot", () => {
  for (const [page, name, initialReadyFlag] of [
    [catalog, "catalog", "initialContentReady"],
    [detail, "detail", "initialLoadComplete"],
    [manage, "management", "initialContentReady"],
  ]) {
    assertStaggeredPage(page, name, initialReadyFlag);
  }

  assert.match(catalog, /<PageTransition :delay="175" :show="initialContentReady">/);
  assert.match(detail, /<PageTransition :delay="100" :show="detailContentReady">/);
  assert.match(detail, /<PageTransition :delay="175" :show="detailContentReady">/);
  assert.match(manage, /<PageTransition :delay="175" :show="initialContentReady">/);
  assert.match(catalog, /<div\s+v-if="loading"[\s\S]*aria-label="Loading awards"/);
  assert.match(detail, /<div v-if="loading" aria-busy="true" aria-label="Loading award">/);
  assert.match(manage, /<div\s+v-if="loading"[\s\S]*aria-label="Loading award definitions"/);
});

test("Shared transition keeps the visible stagger subtle and reduced-motion safe", () => {
  assert.match(pageTransition, /transition-duration:520ms/);
  assert.match(pageTransition, /translate-y-5/);
  assert.match(pageTransition, /motion-reduce:!opacity-100/);
  assert.match(pageTransition, /motion-reduce:!translate-y-0/);
  assert.match(pageTransition, /motion-reduce:!\[transition-delay:0ms\]/);
  assert.match(pageTransition, /reducedMotion\.value = window\.matchMedia/);
  assert.match(pageTransition, /if \(!props\.delay \|\| reducedMotion\.value\)/);
  assert.match(pageTransition, /transitionDelay/);
});

test("Award entrance order is header, controls/statistics, then results/history", () => {
  const catalogHeader = catalog.indexOf("<TacticalPageHeader");
  const catalogFilters = catalog.indexOf("<AnimatedFilters");
  const catalogResults = catalog.indexOf('<PageTransition :delay="175" :show="initialContentReady">');
  assert.ok(catalogHeader < catalogFilters);
  assert.ok(catalogFilters < catalogResults);

  const detailHeader = detail.indexOf("<header");
  const detailStats = detail.indexOf('<PageTransition :delay="100" :show="detailContentReady">');
  const detailHistory = detail.indexOf('<PageTransition :delay="175" :show="detailContentReady">');
  assert.ok(detailHeader < detailStats);
  assert.ok(detailStats < detailHistory);

  const managementHeader = manage.indexOf("<TacticalPageHeader");
  const managementToolbar = manage.indexOf('id="award-definitions-heading"');
  const managementResults = manage.indexOf('<PageTransition :delay="175" :show="initialContentReady">');
  assert.ok(managementHeader < managementToolbar);
  assert.ok(managementToolbar < managementResults);
});

test("Award updates stay inside stable wrappers and do not replay the full entrance", () => {
  for (const page of pages) {
    assert.doesNotMatch(page, /<PageTransition[^>]*\bv-if=/);
    assert.doesNotMatch(page, /<PageTransition[^>]*:key=/);
  }

  assert.match(catalog, /v-model="search"/);
  assert.match(catalog, /v-model="tier"/);
  assert.match(manage, /v-model="search"/);
  assert.match(manage, /v-model="status"/);
  assert.match(catalog, /fetchPolicy: "cache-first"/);
  assert.match(detail, /fetchPolicy: "network-only"/);
  assert.match(manage, /fetchPolicy: "network-only"/);
  assert.match(manage, /<Dialog v-model:open="formOpen">/);
  assert.doesNotMatch(pages.join("\n"), /window\.location|location\.reload|navigateTo\([^)]*replace/);
});
