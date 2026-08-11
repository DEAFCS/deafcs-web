import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The Join Tournament / Admin Add Team lineup picker showed every player
// with the 🌍 default flag instead of their real country, because
// fetchTeamRoster()'s nested player selection never queried `country` --
// TimezoneFlag.vue itself is correct and falls back to 🌍 by design when
// its `country` prop is empty. This proves the query now supplies it.

const source = await readFile(
  new URL(
    "../components/tournament/TournamentJoinForm.vue",
    import.meta.url,
  ),
  "utf8",
);

test("fetchTeamRoster's nested player selection includes country", () => {
  const queryBlock = source.slice(
    source.indexOf("team_roster: ["),
    source.indexOf("team_roster: [") + 1300,
  );
  const playerBlock = queryBlock.slice(
    queryBlock.indexOf("player: {"),
    queryBlock.indexOf("},", queryBlock.indexOf("player: {")),
  );
  assert.match(playerBlock, /country: true,/);
  // Confirm the other fields fixed alongside this one are still present
  // (regression guard, not re-testing them in depth here).
  assert.match(playerBlock, /roster_image_url: true,/);
  assert.match(playerBlock, /custom_avatar_url: true,/);
  assert.match(playerBlock, /elo: true,/);
});

console.log("tournament join form country flag checks passed");
