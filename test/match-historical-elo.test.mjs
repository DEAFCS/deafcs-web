import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Match rows previously mixed a player's CURRENT active-season ELO (from
// usePlayerActiveSeasonElo's eloForPlayer, live/dynamic) with that match's
// own historical delta (EloChangeBadge, correctly match-scoped) -- so an
// old match's visible base number silently changed as the player played
// more matches later. Desktop even threaded a historical value down the
// prop chain, but wired it to elo_changes[].updated_elo (the POST-match
// value) and PlayerDisplay never consumed it at all, so it was a no-op.
//
// Fix: elo_changes[].current_elo (the PRE-match snapshot, already selected
// by graphql/eloFields.ts, no query change needed) now flows all the way
// down to PlayerElo's new `historicalElo` prop, which overrides ONLY the
// primary visible number. The hover tooltip (competitive/wingman/duel rows)
// intentionally keeps reading the live `elo` prop unconditionally.

const lineupOverviewRow = await readFile(
  new URL("../components/match/LineupOverviewRow.vue", import.meta.url),
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
const eloChangeBadge = await readFile(
  new URL("../components/EloChangeBadge.vue", import.meta.url),
  "utf8",
);
const lineupMember = await readFile(
  new URL("../components/match/LineupMember.vue", import.meta.url),
  "utf8",
);
const playerStatusDisplay = await readFile(
  new URL("../components/match/PlayerStatusDisplay.vue", import.meta.url),
  "utf8",
);

// A. Desktop: LineupOverviewRow's LineupMember binding uses current_elo
// (pre-match), not updated_elo (post-match).
test("desktop match row passes elo_changes current_elo, not updated_elo, as historical-elo", () => {
  assert.match(
    lineupOverviewRow,
    /:historical-elo="memberEloChange\?\.current_elo"/,
  );
  assert.doesNotMatch(
    lineupOverviewRow,
    /:historical-elo="memberEloChange\?\.updated_elo"/,
  );
});

// B. Mobile: the mobile PlayerElo also receives the same historical value.
test("mobile match row's PlayerElo also receives memberEloChange.current_elo as historical-elo", () => {
  const mobileEloBlock = lineupOverviewRow.slice(
    lineupOverviewRow.indexOf("<PlayerElo"),
    lineupOverviewRow.indexOf("<PlayerElo") + 300,
  );
  assert.match(mobileEloBlock, /:elo="eloForPlayer\(member\?\.player\)"/);
  assert.match(mobileEloBlock, /:type="match\?\.options\?\.type"/);
  assert.match(
    mobileEloBlock,
    /:historical-elo="memberEloChange\?\.current_elo"/,
  );
});

// C. Prop chain: PlayerDisplay forwards historicalElo into every PlayerElo
// binding it owns (both the matchRank-fallback and the plain showElo path).
test("PlayerDisplay forwards historicalElo into both of its PlayerElo bindings", () => {
  const eloBindings = playerDisplay.match(
    /<PlayerElo[\s\S]*?\/>/g,
  ) || [];
  assert.equal(
    eloBindings.length,
    2,
    "expected exactly two PlayerElo bindings in PlayerDisplay.vue",
  );
  for (const binding of eloBindings) {
    assert.match(
      binding,
      /:elo="eloForPlayer\(player\)"/,
      "each binding must still pass the live elo object for the tooltip",
    );
    assert.match(
      binding,
      /:historical-elo="historicalElo"/,
      "each binding must forward the historicalElo prop through",
    );
  }
});

// The rest of the chain (LineupOverviewRow -> LineupMember ->
// PlayerStatusDisplay -> PlayerDisplay) must not be duplicated/reimplemented
// -- just plain prop forwarding at each layer.
test("LineupMember and PlayerStatusDisplay forward historicalElo without reimplementing it", () => {
  assert.match(lineupMember, /historicalElo:\s*\{\s*\n\s*type: Number,/);
  assert.match(lineupMember, /:historical-elo="historicalElo"/);
  assert.match(playerStatusDisplay, /historicalElo:\s*\{\s*\n\s*type: Number,/);
  assert.match(playerStatusDisplay, /:historical-elo="historicalElo"/);
});

// D. PlayerElo: primaryElo prefers historicalElo when present.
test("PlayerElo's primaryElo computed prefers historicalElo over the live per-mode value", () => {
  assert.match(
    playerElo,
    /historicalElo:\s*\{\s*\n\s*type: Number,/,
  );
  assert.match(
    playerElo,
    /primaryElo\(\): number \| undefined \{\s*\n\s*if \(this\.historicalElo != null\) \{\s*\n\s*return this\.historicalElo;\s*\n\s*\}/,
  );
});

// E. Tooltip: competitive/wingman/duel rows and eloRows stay sourced from
// the live `elo` prop only, never from historicalElo.
test("tooltip rows (competitiveElo/wingmanElo/duelElo/eloRows) are not overridden by historicalElo", () => {
  assert.match(
    playerElo,
    /competitiveElo\(\): number \| undefined \{\s*\n\s*return this\.elo\?\.competitive;/,
  );
  assert.match(
    playerElo,
    /wingmanElo\(\): number \| undefined \{\s*\n\s*return this\.elo\?\.wingman;/,
  );
  assert.match(
    playerElo,
    /duelElo\(\): number \| undefined \{\s*\n\s*return this\.elo\?\.duel;/,
  );
  // eloRows must build its rows from competitiveElo/wingmanElo/duelElo
  // (the live-only computeds above), not from historicalElo.
  const eloRowsBlock = playerElo.slice(
    playerElo.indexOf("eloRows(): ModeRow[]"),
    playerElo.indexOf("eloRows(): ModeRow[]") + 1200,
  );
  assert.doesNotMatch(eloRowsBlock, /historicalElo/);
  assert.match(eloRowsBlock, /value: this\.competitiveElo,/);
  assert.match(eloRowsBlock, /value: this\.wingmanElo,/);
  assert.match(eloRowsBlock, /value: this\.duelElo,/);
});

// F. Regression: EloChangeBadge (the CURRENT/UPDATED/delta popup) is
// completely untouched by this fix.
test("EloChangeBadge's CURRENT/UPDATED/delta popup logic is untouched", () => {
  assert.match(
    eloChangeBadge,
    /const currentElo = computed\(\(\) =>\s*\n\s*Math\.round\(toNum\(props\.eloChange\?\.current_elo\)\),\s*\n\);/,
  );
  assert.match(
    eloChangeBadge,
    /const updatedElo = computed\(\(\) =>\s*\n\s*Math\.round\(toNum\(props\.eloChange\?\.updated_elo\)\),\s*\n\);/,
  );
  assert.doesNotMatch(eloChangeBadge, /historicalElo/);
});

console.log("match historical ELO display checks passed");
