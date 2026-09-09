import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(
  new URL("../pages/contact.vue", import.meta.url),
  "utf8",
);

test("keeps the approved Contact page structure", () => {
  assert.match(pageSource, /pages\.info\.contact\.live_match\.title/);
  assert.match(pageSource, /pages\.info\.contact\.other_ways/);
  assert.match(pageSource, /pages\.info\.contact\.account_data\.title/);
  assert.match(pageSource, /to="\/account-data"/);
  assert.match(pageSource, /pages\.info\.contact\.privacy\.title/);
  assert.match(pageSource, /to="\/privacy-policy"/);
  assert.match(pageSource, /pages\.info\.contact\.partnerships\.title/);
});

test("integrates each internal support category once", () => {
  for (const category of [
    "general_support",
    "bug_report",
    "player_report",
    "feedback",
    "organizer_application",
  ]) {
    assert.equal(
      (pageSource.match(new RegExp(`category: "${category}"`, "g")) ?? [])
        .length,
      1,
    );
  }
});

test("provides public email contact without requiring sign-in", () => {
  assert.match(pageSource, /mailto:info@deafcs\.net/);
  assert.match(pageSource, /Account \/ Login Help/);
  assert.match(pageSource, /works without signing in to DEAFCS/);
  assert.match(pageSource, /No DEAFCS login is required/);
  assert.match(pageSource, /Business \/ Media/);
  assert.match(pageSource, /Partnerships & Server Support/);
});
