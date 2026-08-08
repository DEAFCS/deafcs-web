import assert from "node:assert/strict";
import test from "node:test";
import { eloTierColor, tierFor, RANK_TIERS, ELO_BASELINE } from "../utils/eloTier.ts";

// Regression coverage for the ELO color tier rescale: Gold moves from the
// lowest-reachable-in-practice slot to the top tier, and Red moves in below
// it, per the new DEAFCS color progression. Colors are reused unchanged
// (same RGB triples already in the app) -- only thresholds/order move.

const RGB = {
  grey: "rgb(120 130 140)",
  lightSteel: "rgb(177 195 217)",
  mediumBlue: "rgb(94 152 215)",
  strongBlue: "rgb(75 105 255)",
  purple: "rgb(136 70 255)",
  magenta: "rgb(210 44 230)",
  red: "rgb(235 75 75)",
  gold: "rgb(254 215 0)",
};

test("boundary: 2499 -> Grey, 2500 -> Light Steel", () => {
  assert.equal(eloTierColor(2499), RGB.grey);
  assert.equal(eloTierColor(2500), RGB.lightSteel);
});

test("boundary: 4999 -> Light Steel, 5000 -> Medium Blue", () => {
  assert.equal(eloTierColor(4999), RGB.lightSteel);
  assert.equal(eloTierColor(5000), RGB.mediumBlue);
});

test("boundary: 7499 -> Medium Blue, 7500 -> Strong Blue", () => {
  assert.equal(eloTierColor(7499), RGB.mediumBlue);
  assert.equal(eloTierColor(7500), RGB.strongBlue);
});

test("boundary: 9999 -> Strong Blue, 10000 -> Purple", () => {
  assert.equal(eloTierColor(9999), RGB.strongBlue);
  assert.equal(eloTierColor(10000), RGB.purple);
});

test("boundary: 12499 -> Purple, 12500 -> Magenta", () => {
  assert.equal(eloTierColor(12499), RGB.purple);
  assert.equal(eloTierColor(12500), RGB.magenta);
});

test("boundary: 14999 -> Magenta, 15000 -> Red", () => {
  assert.equal(eloTierColor(14999), RGB.magenta);
  assert.equal(eloTierColor(15000), RGB.red);
});

test("boundary: 19999 -> Red, 20000 -> Gold", () => {
  assert.equal(eloTierColor(19999), RGB.red);
  assert.equal(eloTierColor(20000), RGB.gold);
});

test("very high ELO stays Gold (no upper bound)", () => {
  assert.equal(eloTierColor(1_000_000), RGB.gold);
});

test("negative and very-low ELO safely resolve to Grey, not an error or undefined", () => {
  assert.equal(eloTierColor(-500), RGB.grey);
  assert.equal(eloTierColor(0), RGB.grey);
  assert.equal(eloTierColor(1), RGB.grey);
});

test("non-numeric input returns undefined rather than throwing", () => {
  assert.equal(eloTierColor(null), undefined);
  assert.equal(eloTierColor(undefined), undefined);
  assert.equal(eloTierColor(NaN), undefined);
});

test("tierFor exposes the exact RGB triples from the spec (reused, not invented)", () => {
  assert.equal(tierFor(1).rgb, "120 130 140");
  assert.equal(tierFor(2500).rgb, "177 195 217");
  assert.equal(tierFor(5000).rgb, "94 152 215");
  assert.equal(tierFor(7500).rgb, "75 105 255");
  assert.equal(tierFor(10000).rgb, "136 70 255");
  assert.equal(tierFor(12500).rgb, "210 44 230");
  assert.equal(tierFor(15000).rgb, "235 75 75");
  assert.equal(tierFor(20000).rgb, "254 215 0");
});

test("RANK_TIERS is sorted descending by threshold (PlayerElo.vue's bracketProgress relies on this order)", () => {
  for (let i = 1; i < RANK_TIERS.length; i++) {
    assert.ok(
      RANK_TIERS[i - 1].threshold > RANK_TIERS[i].threshold,
      `${RANK_TIERS[i - 1].label} (${RANK_TIERS[i - 1].threshold}) should be above ${RANK_TIERS[i].label} (${RANK_TIERS[i].threshold})`,
    );
  }
  assert.equal(RANK_TIERS[RANK_TIERS.length - 1].threshold, ELO_BASELINE);
});
