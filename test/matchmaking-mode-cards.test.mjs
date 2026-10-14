import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The /play mode tiles (5Stack's PlayModeTile inside PlayMatchmaking). The old
// icon cards were replaced by upstream's typographic tiles; what DEAFCS kept
// is checked here: shared mode colors, native buttons and no nested controls.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [hero, tile, modes, competitiveIcon] = await Promise.all([
  read("../components/play/PlayMatchmaking.vue"),
  read("../components/play/PlayModeTile.vue"),
  read("../utilities/matchmakingModes.ts"),
  read("../public/img/icons/competitive-team.svg"),
]);

test("competitive icon is a currentColor three-person outline asset", () => {
  assert.match(competitiveIcon, /<symbol id="competitive-team"/);
  assert.match(competitiveIcon, /stroke="currentColor"/);
  assert.equal((competitiveIcon.match(/<circle\b/g) ?? []).length, 3);
  assert.doesNotMatch(competitiveIcon, /#[0-9a-f]{3,8}\b/i);
});

test("mode tiles are native buttons in a radio group", () => {
  assert.match(tile, /<button\s+type="button"\s+role="radio"/);
  assert.match(tile, /:aria-checked="checked"/);
  assert.match(hero, /role="radiogroup"/);
});

test("mode tiles reuse shared mode colors without local RGB duplication", () => {
  assert.match(hero, /modeColorStyle\(mode\)/);
  assert.match(
    modes,
    /import \{ matchTypeColorStyle \} from "~\/utilities\/matchTypeColors"/,
  );
  assert.match(modes, /:\s*matchTypeColorStyle\(mode\.type\)/);
  assert.doesNotMatch(modes, /249 158 47|217 70 239|34 211 238/);
  for (const source of [hero, tile]) {
    assert.doesNotMatch(source, /249 158 47|217 70 239|34 211 238|250 204 21/);
  }
});

test("a tile holds no nested button: its whole face picks the mode", () => {
  const body = tile.slice(tile.indexOf("<button"));
  assert.equal((body.match(/<button\b/g) ?? []).length, 1);
});
