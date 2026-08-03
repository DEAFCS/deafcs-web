import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const matchmaking = await readFile(
  new URL("../components/matchmaking/Matchmaking.vue", import.meta.url),
  "utf8",
);

test("matchmaking mode cards use the intended mode icons", () => {
  assert.match(matchmaking, /Competitive:\s*Users/);
  assert.match(matchmaking, /Wingman:\s*UsersRound/);
  assert.match(matchmaking, /Duel:\s*UserRound/);
});

test("matchmaking cards preserve native queue behavior", () => {
  assert.match(matchmaking, /<button[\s\S]*type="button"/);
  assert.match(matchmaking, /:disabled="!canQueueType\(type\.value\)"/);
  assert.match(
    matchmaking,
    /@click="handleMatchTypeClick\(type\.value\)"/,
  );
});

test("matchmaking cards reuse shared mode colors without local RGB duplication", () => {
  assert.match(
    matchmaking,
    /import \{ matchTypeColorStyle \} from "~\/utilities\/matchTypeColors"/,
  );
  assert.doesNotMatch(matchmaking, /const matchTypeColors/);
  assert.doesNotMatch(matchmaking, /249 158 47|217 70 239|34 211 238/);
});

test("queue CTA is visible text inside the card, not a nested button", () => {
  const ctaIndex = matchmaking.indexOf(
    '$t("matchmaking.confirm_selection")',
  );
  assert.notEqual(ctaIndex, -1);

  const ctaStart = matchmaking.lastIndexOf("<span", ctaIndex);
  const ctaEnd = matchmaking.indexOf("</span>", ctaIndex) + "</span>".length;
  const ctaRegion = matchmaking.slice(ctaStart, ctaEnd);
  assert.match(ctaRegion, /<span/);
  assert.match(ctaRegion, /<ArrowRight/);
  assert.doesNotMatch(ctaRegion, /<button/);
});
