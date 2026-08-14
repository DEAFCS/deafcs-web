import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isNuxtDirectoryPath } from "../server/utils/nuxtDirectoryPath.ts";
import { STATIC_SITEMAP_PATHS } from "../utilities/seo.ts";

const middleware = await readFile(
  new URL("../server/middleware/nuxt-directory-404.ts", import.meta.url),
  "utf8",
);

test("only the bare Nuxt directory paths are classified as missing", () => {
  assert.equal(isNuxtDirectoryPath("/_nuxt"), true);
  assert.equal(isNuxtDirectoryPath("/_nuxt/"), true);

  for (const path of [
    "/_nuxt/app.abc123.js",
    "/_nuxt/styles.abc123.css",
    "/_nuxt/image.webp",
    "/_nuxtish",
    "/",
  ]) {
    assert.equal(isNuxtDirectoryPath(path), false, path);
  }
});

test("server middleware returns a narrow 404 without prefix-blocking real assets", () => {
  assert.match(
    middleware,
    /isNuxtDirectoryPath\(getRequestURL\(event\)\.pathname\)/,
  );
  assert.match(middleware, /statusCode:\s*404/);
  assert.match(middleware, /statusMessage:\s*"Not Found"/);
  assert.doesNotMatch(middleware, /startsWith|Disallow|\/opt\//);
});

test("the static sitemap never exposes the Nuxt asset namespace", () => {
  assert.equal(
    STATIC_SITEMAP_PATHS.some((path) => path.startsWith("/_nuxt")),
    false,
  );
});
