import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The organizer avatar in the tournament hero opened a popup containing a
// PlayerDisplay, whose own PlayerElo unconditionally rendered a second,
// nested HoverCard -- a popup inside a popup. PlayerDisplay also had no
// matchType there, so the ELO shown defaulted to Competitive regardless of
// the tournament's actual mode. The small trigger button also had no
// explicit focus-visible style, so keyboard focus fell back to the native
// browser outline (a stray white border). This file covers the ELO/
// matchType/focus-ring fixes specifically; the outer Popover-vs-HoverCard
// wrapper fix is covered by tournament-organizer-hovercard.test.mjs.

const tournamentDetail = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const playerDisplay = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);
const playerElo = await readFile(
  new URL("../components/PlayerElo.vue", import.meta.url),
  "utf8",
);

function organizerPlayerDisplayBlock() {
  const anchor = tournamentDetail.indexOf(':player="organizer"');
  assert.ok(anchor !== -1, "expected to find the organizer PlayerDisplay binding");
  const start = tournamentDetail.lastIndexOf("<PlayerDisplay", anchor);
  const end = tournamentDetail.indexOf("/>", anchor);
  return tournamentDetail.slice(start, end);
}

test("organizer PlayerDisplay receives the tournament's mode as matchType", () => {
  const block = organizerPlayerDisplayBlock();
  assert.match(block, /:match-type="tournament\.options\?\.type \|\| null"/);
});

test("organizer PlayerDisplay explicitly disables ELO interactivity", () => {
  const block = organizerPlayerDisplayBlock();
  assert.match(block, /:elo-interactive="false"/);
  assert.match(block, /:linkable="true"/);
  assert.match(block, /:tooltip="false"/);
});

test("PlayerElo's interactive prop defaults to true", () => {
  const idx = playerElo.indexOf("interactive: {");
  assert.ok(idx !== -1, "expected an interactive prop definition");
  const block = playerElo.slice(idx, playerElo.indexOf("},", idx));
  assert.match(block, /type: Boolean/);
  assert.match(block, /default: true/);
});

test("interactive=true still renders the existing HoverCard path", () => {
  assert.match(
    playerElo,
    /<HoverCard\s+v-if="interactive && \(competitiveElo \|\| wingmanElo \|\| duelElo\)"/,
  );
  assert.match(playerElo, /<HoverCardTrigger as-child>/);
  assert.match(playerElo, /<HoverCardContent/);
});

test("interactive=false renders the primary ELO without the HoverCard path", () => {
  const veIdx = playerElo.indexOf("v-else-if=\"competitiveElo || wingmanElo || duelElo\"");
  assert.ok(veIdx !== -1, "expected a non-interactive fallback branch");
  const branch = playerElo.slice(veIdx - 20, veIdx + 400);
  assert.doesNotMatch(branch, /HoverCard/);
  assert.match(branch, /triggerClasses/);
  assert.match(branch, /primaryElo/);
});

test("PlayerDisplay forwards an optional eloInteractive prop into every PlayerElo binding", () => {
  const idx = playerDisplay.indexOf("eloInteractive: {");
  assert.ok(idx !== -1, "expected an eloInteractive prop definition");
  const block = playerDisplay.slice(idx, playerDisplay.indexOf("},", idx));
  assert.match(block, /type: Boolean/);
  assert.match(block, /default: true/);

  const bindings = (playerDisplay.match(/<PlayerElo[\s\S]*?\/>/g) || []).filter(
    (b) => b.includes("eloForPlayer"),
  );
  assert.equal(bindings.length, 2, "expected exactly two PlayerElo bindings");
  for (const binding of bindings) {
    assert.match(binding, /:interactive="eloInteractive"/);
  }
});

test("existing consumers are unaffected because both new props default to preserving current behavior", () => {
  // No other call site passes :elo-interactive or :interactive explicitly,
  // so every existing PlayerDisplay/PlayerElo usage elsewhere keeps its
  // current HoverCard behavior via the true defaults asserted above.
  const otherEloInteractiveUsages = (
    tournamentDetail.match(/:elo-interactive="false"/g) || []
  ).length;
  assert.equal(
    otherEloInteractiveUsages,
    1,
    "expected elo-interactive=false to be scoped to only the organizer popover",
  );
});

test("tournamentHeroOrganizerClasses has an explicit focus-visible style instead of the native outline", () => {
  const idx = tournamentDetail.indexOf("const tournamentHeroOrganizerClasses =");
  assert.ok(idx !== -1);
  const line = tournamentDetail.slice(idx, tournamentDetail.indexOf(";", idx));
  assert.match(line, /focus-visible:outline-none/);
  assert.match(line, /focus-visible:ring-2/);
  assert.match(line, /focus-visible:ring-\[hsl\(var\(--tac-amber\)\/0\.5\)\]/);
});

console.log("tournament organizer elo popup checks passed");
