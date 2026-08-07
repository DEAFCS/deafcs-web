import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression coverage for the finished-match ELO hover bug: hovering a
// player's ELO badge on a match page showed all 3 mode ratings
// (Competitive/Wingman/Duel) while the match was live/pre-finish, but once
// the match finished, only the mode that was played kept a value -- the
// other two rendered as "--" -- even though the player has real current
// ratings for them.
//
// Root cause: PlayerDisplay.vue's `eloForDisplay` computed (feeding
// PlayerElo's `elo` prop, which drives BOTH the trigger badge and the
// hover card's three rows) collapsed from the full `player.elo` object
// down to a single-key `{ [eloModeKey]: historicalElo }` object once a
// `historicalElo` value existed (i.e. once `match.elo_changes` had a row
// for this match). LineupOverviewRow.vue's mobile-only `mobileEloForDisplay`
// had the identical bug. The hover must always show the player's full
// current canonical per-mode ELO; the match's own historical result
// belongs on the row instead (EloChangeBadge, fed directly from
// `match.elo_changes`, independent of this prop) and must be unaffected.

const playerDisplaySource = await readFile(
  new URL("../components/PlayerDisplay.vue", import.meta.url),
  "utf8",
);
const lineupRowSource = await readFile(
  new URL("../components/match/LineupOverviewRow.vue", import.meta.url),
  "utf8",
);
const eloChangeBadgeSource = await readFile(
  new URL("../components/EloChangeBadge.vue", import.meta.url),
  "utf8",
);

// Mirrors PlayerDisplay.vue's `eloForDisplay` computed exactly (post-fix):
// it no longer branches on historicalElo at all.
function eloForDisplay(player) {
  return player?.elo;
}

// Mirrors LineupOverviewRow.vue's `mobileEloForDisplay` computed exactly
// (post-fix): same simplification.
function mobileEloForDisplay(member) {
  return member?.player?.elo;
}

const fullElo = { competitive: 4905, wingman: 5131, duel: 5970 };
const fullEloAfterMatch = { competitive: 4905, wingman: 5131, duel: 6152 };

test("live/pre-match: the hover shows all 3 current mode values", () => {
  const player = { elo: fullElo };
  const result = eloForDisplay(player);
  assert.deepEqual(result, fullElo);
  assert.equal(result.competitive, 4905);
  assert.equal(result.wingman, 5131);
  assert.equal(result.duel, 5970);
});

test("finished Duel match: the hover keeps Competitive + Wingman + the updated Duel value", () => {
  // Player just finished a Duel match, moving their Duel rating from 5970
  // to 6152; player.elo already reflects that (it's the live canonical
  // computed field, unaffected by match status).
  const player = { elo: fullEloAfterMatch };
  const result = eloForDisplay(player);
  assert.deepEqual(result, fullEloAfterMatch);
  assert.equal(result.competitive, 4905, "Competitive must not disappear");
  assert.equal(result.wingman, 5131, "Wingman must not disappear");
  assert.equal(result.duel, 6152, "Duel must reflect the just-finished match");
});

test("finished Wingman match: the hover keeps Competitive + Duel alongside the updated Wingman value", () => {
  const player = {
    elo: { competitive: 4905, wingman: 5320, duel: 5970 },
  };
  const result = eloForDisplay(player);
  assert.equal(result.competitive, 4905, "Competitive must not disappear");
  assert.equal(result.wingman, 5320);
  assert.equal(result.duel, 5970, "Duel must not disappear");
});

test("mobile row hover matches the same full-object behavior as the desktop hover", () => {
  const member = { player: { elo: fullEloAfterMatch } };
  assert.deepEqual(mobileEloForDisplay(member), fullEloAfterMatch);
});

test("PlayerDisplay.vue's eloForDisplay no longer collapses to a single-mode object", () => {
  // The old buggy branch built `{ [this.eloModeKey]: this.historicalElo }`.
  // That pattern -- and the eloModeKey computed that only existed to
  // support it -- must be gone.
  assert.doesNotMatch(
    playerDisplaySource,
    /return \{ \[this\.eloModeKey\]: this\.historicalElo \};/,
  );
  assert.doesNotMatch(playerDisplaySource, /eloModeKey\(\)/);
  assert.match(
    playerDisplaySource,
    /eloForDisplay\(\)[\s\S]{0,120}\{\s*return this\.player\?\.elo;\s*\}/,
  );
});

test("LineupOverviewRow.vue's mobileEloForDisplay no longer collapses to a single-mode object", () => {
  assert.doesNotMatch(
    lineupRowSource,
    /return \{ \[modeKey\]: this\.memberEloChange\.updated_elo \};/,
  );
  assert.match(
    lineupRowSource,
    /mobileEloForDisplay\(\)[^{]*\{\s*return this\.member\?\.player\?\.elo;\s*\}/,
  );
});

test("the match row's historical ELO result (EloChangeBadge) is untouched by this fix", () => {
  // EloChangeBadge reads elo_changes fields directly and independently of
  // PlayerDisplay's eloForDisplay/historicalElo -- it must keep doing so,
  // proving the row's historical before/change/after display is unaffected
  // by making the hover always show the full current object.
  assert.match(eloChangeBadgeSource, /eloChange/);
  assert.doesNotMatch(eloChangeBadgeSource, /eloForDisplay/);
  assert.doesNotMatch(eloChangeBadgeSource, /eloModeKey/);
});

test("memberEloChange (the row's historical source) is still wired from match.elo_changes, unrelated to the hover fix", () => {
  assert.match(
    lineupRowSource,
    /memberEloChange\(\)[\s\S]{0,300}this\.match\.elo_changes\?\.find\?\./,
  );
});
