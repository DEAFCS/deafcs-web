import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The tournament-specific manual award grant/revoke dialog and form used to
// be mounted here; TournamentAwardsManage.vue was removed from tournament
// management (its import and <TournamentAwardsManage> mount were deleted
// from TournamentDetail.vue). This file now guards against it silently
// coming back, rather than asserting on the removed component's internals.
const detailUrl = new URL(
  "../components/tournament/TournamentDetail.vue",
  import.meta.url,
);

test("an organizer can no longer open a manual award form from tournament management", async () => {
  const detail = await readFile(detailUrl, "utf8");

  assert.doesNotMatch(detail, /TournamentAwardsManage/);
  assert.doesNotMatch(detail, /startAdd\(\)/);
  assert.doesNotMatch(detail, /tournament\.trophies_manage\.add_award/);
});
