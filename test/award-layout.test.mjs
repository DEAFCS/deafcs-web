import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [mainContent, catalog, detail, manage] = await Promise.all([
  readFile(new URL("../layouts/components/MainContent.vue", import.meta.url), "utf8"),
  readFile(new URL("../pages/awards/index.vue", import.meta.url), "utf8"),
  readFile(new URL("../pages/awards/[id].vue", import.meta.url), "utf8"),
  readFile(new URL("../pages/awards/manage.vue", import.meta.url), "utf8"),
]);

test("Awards pages reuse the standard MainContent width", () => {
  assert.match(mainContent, /lg:max-w-7xl/);

  for (const page of [catalog, detail, manage]) {
    assert.doesNotMatch(page, /container\s+mx-auto\s+max-w-(?:5xl|6xl|7xl)/);
    assert.doesNotMatch(page, /<main[^>]*max-w-|<div[^>]*max-w-/);
  }

  assert.match(catalog, /TacticalPageHeader/);
  assert.match(manage, /TacticalPageHeader/);
});

test("Awards page roots keep only their vertical layout spacing", () => {
  assert.match(catalog, /<div class="space-y-5 py-6">/);
  assert.match(detail, /<main class="space-y-5 py-6">/);
  assert.match(manage, /<main class="space-y-5 py-6">/);
});

test("the catalog keeps responsive card columns after width normalization", () => {
  assert.match(
    catalog,
    /grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/,
  );
});
