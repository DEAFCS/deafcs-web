import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tournament page -> My Team -> Invite Player (PlayerSearch.vue) always
// showed Competitive as the primary ELO for every search result,
// regardless of the tournament's actual match mode, because PlayerDisplay's
// matchType prop was never passed. Same class of bug already fixed for
// other tournament roster/player-card surfaces -- fixed here by threading
// an optional matchType prop through PlayerSearch (shared by 14 other,
// non-tournament consumers) instead of inventing new ELO logic.

const playerSearch = await readFile(
  new URL("../components/PlayerSearch.vue", import.meta.url),
  "utf8",
);
const tournamentTeam = await readFile(
  new URL("../components/tournament/TournamentTeam.vue", import.meta.url),
  "utf8",
);
const tournamentJoinForm = await readFile(
  new URL("../components/tournament/TournamentJoinForm.vue", import.meta.url),
  "utf8",
);

test("PlayerSearch declares an optional matchType prop that defaults to null", () => {
  assert.match(
    playerSearch,
    /matchType:\s*\{\s*\n\s*type: String,\s*\n\s*required: false,\s*\n\s*default: null,\s*\n\s*\},/,
  );
});

test("every PlayerDisplay call inside PlayerSearch receives matchType", () => {
  const bindings = playerSearch.match(/<PlayerDisplay[^/]*\/>/g) || [];
  assert.equal(
    bindings.length,
    6,
    "expected exactly six PlayerDisplay bindings in PlayerSearch.vue",
  );
  for (const binding of bindings) {
    assert.match(
      binding,
      /:match-type="matchType"/,
      `expected every PlayerDisplay binding to forward matchType, got: ${binding}`,
    );
  }
});

test("TournamentTeam's Invite Player PlayerSearch passes tournament.options?.type", () => {
  const block = tournamentTeam.slice(
    tournamentTeam.indexOf("<PlayerSearch"),
    tournamentTeam.indexOf("/>", tournamentTeam.indexOf("<PlayerSearch")),
  );
  assert.match(block, /:match-type="tournament\?\.options\?\.type"/);
});

test("TournamentJoinForm's team-owner PlayerSearch is also wired for consistency", () => {
  const block = tournamentJoinForm.slice(
    tournamentJoinForm.indexOf("<PlayerSearch"),
    tournamentJoinForm.indexOf(
      "v-if=",
      tournamentJoinForm.indexOf("<PlayerSearch"),
    ),
  );
  assert.match(block, /:match-type="tournamentMatchType"/);
});

test("matchType is optional -- other PlayerSearch consumers remain valid without passing it", () => {
  // A representative sample of PlayerSearch's other (non-tournament)
  // consumers -- none of these pass match-type, and none need to, since
  // the prop is optional/default-null and PlayerDisplay's own matchType
  // prop already defaults sensibly on its own.
  const otherConsumers = [
    "components/matchmaking-lobby/MatchLobby.vue",
    "components/draft-games/DraftOpenSlot.vue",
    "components/match/AssignPlayerToLineup.vue",
  ];
  return Promise.all(
    otherConsumers.map(async (path) => {
      const src = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
      assert.match(src, /<PlayerSearch/, `expected ${path} to still use PlayerSearch`);
      assert.doesNotMatch(
        src,
        /:match-type=/,
        `${path} should not need match-type -- confirms the prop is genuinely optional`,
      );
    }),
  );
});

console.log("tournament invite player ELO mode checks passed");
