import assert from "node:assert/strict";
import test from "node:test";
import {
  supportsTournamentMvp,
  tournamentMatchScores,
} from "../utilities/tournamentMatchRow.ts";

const match = (over = {}) => ({
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  options: { best_of: 1, type: "Competitive" },
  match_maps: [],
  ...over,
});

test("a finished historical record with no played map has no invented score", () => {
  assert.deepEqual(tournamentMatchScores(match()), [null, null]);
  assert.deepEqual(
    tournamentMatchScores(
      match({
        match_maps: [
          { lineup_1_score: 0, lineup_2_score: 0, winning_lineup_id: null },
        ],
      }),
    ),
    [null, null],
  );
});

test("BO1 shows rounds while a series shows maps won", () => {
  assert.deepEqual(
    tournamentMatchScores(
      match({
        match_maps: [
          { lineup_1_score: 13, lineup_2_score: 9, winning_lineup_id: "l1" },
        ],
      }),
    ),
    [13, 9],
  );
  assert.deepEqual(
    tournamentMatchScores(
      match({
        options: { best_of: 3, type: "Competitive" },
        match_maps: [
          { lineup_1_score: 13, lineup_2_score: 9, winning_lineup_id: "l1" },
          { lineup_1_score: 8, lineup_2_score: 13, winning_lineup_id: "l2" },
          { lineup_1_score: 13, lineup_2_score: 11, winning_lineup_id: "l1" },
        ],
      }),
    ),
    [2, 1],
  );
});

test("MVP is limited to five-player modes", () => {
  assert.equal(supportsTournamentMvp(match()), true);
  assert.equal(
    supportsTournamentMvp(match({ options: { best_of: 1, type: "Premier" } })),
    true,
  );
  assert.equal(
    supportsTournamentMvp(match({ options: { best_of: 1, type: "Wingman" } })),
    false,
  );
  assert.equal(
    supportsTournamentMvp(match({ options: { best_of: 1, type: "Duel" } })),
    false,
  );
});
