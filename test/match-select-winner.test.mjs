import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Bug A: MatchSelectWinner used to mutate winning_lineup_id directly via a
// raw update_matches_by_pk, bypassing the backend's setMatchWinner action --
// the only place that (a) checks match-organizer permission via a real guard
// and (b) refuses a reassignment once a downstream tournament match has
// progressed (canReassignWinner). This makes the component go through that
// guarded action instead, matching the sibling MatchSelectMapWinner.vue's
// existing setMapWinner action-call pattern.

const source = await readFile(
  new URL("../components/match/MatchSelectWinner.vue", import.meta.url),
  "utf8",
);

test("updateMatchWinner no longer issues a raw update_matches_by_pk mutation", () => {
  assert.doesNotMatch(source, /update_matches_by_pk/);
});

test("updateMatchWinner calls the guarded setMatchWinner action with match_id and winning_lineup_id", () => {
  assert.match(source, /generateMutation\(\{\s*setMatchWinner:\s*\[/);
  const methodBlock = source.slice(
    source.indexOf("async updateMatchWinner()"),
    source.indexOf("async updateMatchWinner()") + 1000,
  );
  assert.match(methodBlock, /match_id:\s*this\.match\.id,/);
  assert.match(methodBlock, /winning_lineup_id:\s*winningLineupId,/);
});

test("a rejected reassignment (e.g. downstream match already started) reverts the selector and shows a destructive toast instead of silently applying", () => {
  const methodBlock = source.slice(
    source.indexOf("async updateMatchWinner()"),
    source.indexOf("},\n  },\n  computed:"),
  );
  assert.match(methodBlock, /catch \(error: any\) \{/);
  assert.match(
    methodBlock,
    /this\.form\.setFieldValue\("lineup_id", this\.match\.winning_lineup_id\);/,
  );
  assert.match(methodBlock, /variant:\s*"destructive"/);
});

test("a successful update still shows the existing match.winner.set success toast", () => {
  assert.match(source, /title:\s*this\.\$t\("match\.winner\.set"\),/);
});

test("form wiring, lineup options, and the winner watcher are unchanged", () => {
  assert.match(source, /lineup_id:\s*z\.string\(\)\.nullable\(\),/);
  assert.match(
    source,
    /this\.form\.setFieldValue\("lineup_id", this\.match\.winning_lineup_id\);/,
  );
  assert.match(source, /value:\s*this\.match\.lineup_1\.id,/);
  assert.match(source, /value:\s*this\.match\.lineup_2\.id,/);
});
