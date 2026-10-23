import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Ported from upstream 5Stack (5stackgg/web 4d76918 and 373ea25 / #867).
// With ssr:false, Nuxt rendered every build chunk as a <link rel="prefetch">
// in the HTML shell (400 on deafcs.net), which doubled first-visit requests.
// Built assets ship pre-compressed so Cloudflare does not re-compress them.
// Vite's gzip-size report stays off (upstream ec039a1d / #981): with the
// pre-compression on top, the build otherwise ran out of heap.

const config = await readFile(
  new URL("../nuxt.config.ts", import.meta.url),
  "utf8",
);

const hooks = config.match(/\r?\n  hooks: \{\r?\n([\s\S]*?)\r?\n  \},\r?\n/);
const nitro = config.match(/\r?\n  nitro: \{\r?\n([\s\S]*?)\r?\n  \},\r?\n/);

test("nuxt.config.ts has exactly one top-level hooks block", () => {
  assert.ok(hooks, "hooks block not found");
  assert.equal(config.match(/\r?\n  hooks: \{/g).length, 1);
});

test("build chunks are not prefetched from the HTML shell", () => {
  assert.match(
    hooks[1],
    /"build:manifest"\(manifest\) \{\s*for \(const chunk of Object\.values\(manifest\)\) \{\s*chunk\.prefetch = false;/,
  );
});

test("the entry modulepreload is left alone", () => {
  assert.doesNotMatch(hooks[1], /preload = false/);
});

test("the tournament Manage route hook is still registered", () => {
  assert.match(hooks[1], /"pages:extend"\(pages\)/);
  assert.match(hooks[1], /tournaments-tournamentId-manage/);
});

test("NuxtLink still prefetches a route on interaction", () => {
  assert.match(
    config,
    /prefetchOn: \{\s*visibility: false,\s*interaction: true,\s*\}/,
  );
});

test("built public assets ship pre-compressed with brotli and gzip", () => {
  assert.ok(nitro, "nitro block not found");
  assert.match(
    nitro[1],
    /compressPublicAssets: \{ brotli: true, gzip: true \}/,
  );
});

test("the build skips Vite's compressed-size report", () => {
  assert.match(config, /reportCompressedSize: false,/);
});
