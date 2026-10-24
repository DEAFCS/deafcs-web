import assert from "node:assert/strict";
import test from "node:test";
import {
  eloBreakdown,
  formatMultiplier,
  formatPercent,
  formatSigned,
} from "../utilities/eloBreakdown.ts";
import {
  awardNameFromMessage,
  awardNotificationPath,
} from "../utilities/awardNotification.ts";

// The ELO popup reads every value from the stored row: its own formula
// version, scale, expected score, PERF and series. Nothing is recomputed with
// today's formula.

test("ELO v2 win: expected 43%, Δ +0.57, base ELO +285, HLTV 1.50, PERF 1.25 (+25%)", () => {
  const b = eloBreakdown({
    elo_version: 2,
    scale_factor: 10000,
    expected_score: 0.43,
    actual_score: 1,
    k_factor: 500,
    impact: 1.5,
    performance_multiplier: 1.25,
    series_multiplier: 1,
    elo_change: 356,
  });
  assert.equal(b.expectedPercent, 43);
  assert.equal(formatSigned(b.delta, 2), "+0.57");
  assert.equal(b.baseElo, 285);
  assert.equal(b.impactIsHltv, true);
  assert.equal(b.impact, 1.5);
  assert.equal(b.impactPercent, null);
  assert.equal(formatMultiplier(b.perf), "1.25");
  assert.equal(formatPercent(b.perfPercent), "+25%");
  assert.equal(b.scale, 10000);
});

test("ELO v2 loss: negative Δ and base ELO, loss PERF below 1 shows a minus percentage", () => {
  const b = eloBreakdown({
    elo_version: 2,
    scale_factor: 10000,
    expected_score: 0.6,
    actual_score: 0,
    k_factor: 500,
    impact: 1.25,
    performance_multiplier: 0.875,
    series_multiplier: 2,
  });
  assert.equal(formatSigned(b.delta, 2), "−0.60");
  assert.equal(b.baseElo, -600);
  assert.equal(formatMultiplier(b.perf), "0.875");
  assert.equal(formatPercent(b.perfPercent), "−12.5%");
});

test("ELO v2 without a rating shows no HLTV value and neutral PERF", () => {
  const b = eloBreakdown({ elo_version: 2, impact: null, performance_multiplier: 1, expected_score: 0.5, actual_score: 1 });
  assert.equal(b.impact, null);
  assert.equal(formatPercent(b.perfPercent), "0%");
});

test("version 1 (Duel, Wingman, every match before v2) keeps its own Impact and scale", () => {
  const b = eloBreakdown({
    elo_version: 1,
    scale_factor: null,
    expected_score: 0.5,
    actual_score: 0,
    k_factor: 500,
    impact: 1.12,
    performance_multiplier: 0.255,
    series_multiplier: 1,
  });
  assert.equal(b.impactIsHltv, false);
  assert.equal(b.impact, 1.12);
  assert.equal(formatPercent(b.impactPercent), "+12%");
  assert.equal(b.scale, 4000);
  assert.equal(b.baseElo, -250);
  assert.equal(formatMultiplier(b.perf), "0.255");
});

test("a legacy row without the new columns reads as version 1", () => {
  const b = eloBreakdown({ expected_score: "0.25", actual_score: "1", impact: "0.9", performance_multiplier: "0.9" });
  assert.equal(b.version, 1);
  assert.equal(b.impactIsHltv, false);
  assert.equal(b.scale, 4000);
  assert.equal(b.baseElo, 375);
});

test("the award name comes from the stored message, unescaped", () => {
  assert.equal(
    awardNameFromMessage("You were awarded <b>Test - Player of the Month</b>."),
    "Test - Player of the Month",
  );
  assert.equal(
    awardNameFromMessage("You were awarded <b>Tom &amp; Jerry&#39;s &lt;Cup&gt;</b>."),
    "Tom & Jerry's <Cup>",
  );
  assert.equal(awardNameFromMessage("You were awarded."), null);
  assert.equal(awardNotificationPath(null), "/awards");
});
