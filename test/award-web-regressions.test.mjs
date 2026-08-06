import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogUrl = new URL("../pages/awards/index.vue", import.meta.url);
const detailUrl = new URL("../pages/awards/[id].vue", import.meta.url);

test("a zero-grant award still has a complete interactive detail card", async () => {
  const page = await readFile(catalogUrl, "utf8");
  const detail = await readFile(detailUrl, "utf8");
  const zeroGrantAward = { id: "award-with-no-grants", occurrences: [] };
  const href = `/awards/${encodeURIComponent(zeroGrantAward.id)}`;

  assert.equal(href, "/awards/award-with-no-grants");
  assert.match(page, /function awardHref\(id: string\)/);
  assert.match(page, /return `\/awards\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(page, /<a[\s\S]*?v-for="award in group\.awards"[\s\S]*?:href="awardHref\(award\.id\)"/);
  assert.match(page, /:href="awardHref\(award\.id\)"[\s\S]*?<\/a>/);
  assert.doesNotMatch(page, /activeGrantCount\(award\)[\s\S]*?\?\s*awardHref/);
  assert.match(detail, /query PublicAwardCore/);
  assert.match(detail, /query PublicAwardHistory/);
});
