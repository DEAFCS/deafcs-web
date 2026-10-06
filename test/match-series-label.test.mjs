import assert from "node:assert/strict";
import test from "node:test";
import { matchSeriesLabel } from "../utilities/matchSeriesLabel.ts";

test("best-of labels are explicit and deterministic", () => {
  assert.equal(matchSeriesLabel(1), "BO1");
  assert.equal(matchSeriesLabel(3), "BO3");
  assert.equal(matchSeriesLabel(5), "BO5");
  assert.equal(matchSeriesLabel(null), "BO1");
});
