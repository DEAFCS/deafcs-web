import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// /sw.js and /sw-push.js have fixed names. Without an origin Cache-Control
// header Cloudflare cached /sw.js at the edge for up to 4 hours (its default
// browser TTL), so installed apps got service-worker updates late.
// nuxt.config.ts sends `no-store` for exactly these files.

const config = await readFile(
  new URL("../nuxt.config.ts", import.meta.url),
  "utf8",
);

const routeRules = config.match(
  /\r?\n  routeRules: \{\r?\n([\s\S]*?)\r?\n  \},\r?\n/,
);

test("nuxt.config.ts has a top-level routeRules block", () => {
  assert.ok(routeRules, "routeRules block not found");
});

for (const path of ["/sw.js", "/sw-push.js"]) {
  test(`${path} is served with Cache-Control: no-store`, () => {
    const escaped = path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    assert.match(
      routeRules[1],
      new RegExp(
        `"${escaped}": \\{ headers: \\{ "cache-control": "no-store" \\} \\}`,
      ),
    );
  });
}

test("hashed /_nuxt/ assets are not given a no-store rule", () => {
  assert.doesNotMatch(routeRules[1], /_nuxt/);
  assert.doesNotMatch(routeRules[1], /workbox/);
});

test("the service worker still imports /sw-push.js", () => {
  assert.match(config, /importScripts: \["\/sw-push\.js"\]/);
});
