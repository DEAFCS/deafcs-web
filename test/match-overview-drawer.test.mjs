import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const drawer = await readFile(
  new URL("../components/match/MatchOverviewDrawer.vue", import.meta.url),
  "utf8",
);

const lookupMatch = drawer.match(
  /historicalEloChangeForPlayer\(lineupPlayer: any\) \{([\s\S]*?)\n    \},\n    getKDRatio/,
);
assert.ok(lookupMatch, "expected the drawer's historical ELO lookup method");

const lookupHistoricalElo = new Function(
  "lineupPlayer",
  lookupMatch[1].replace(/\(eloChange: any\)/g, "eloChange"),
);

function lookupFor(type) {
  return lookupHistoricalElo.call(
    {
      match: { options: { type } },
      matchStats: {
        elo_changes: [
          {
            player_steam_id: "76561198000000001",
            type: "Competitive",
            current_elo: 5100,
            updated_elo: 5150,
          },
          {
            player_steam_id: "76561198000000001",
            type: "Wingman",
            current_elo: 5200,
            updated_elo: 5250,
          },
          {
            player_steam_id: "76561198000000001",
            type: "Duel",
            current_elo: 5300,
            updated_elo: 5350,
          },
          {
            player_steam_id: "76561198000000002",
            type: "Duel",
            current_elo: 9999,
            updated_elo: 9999,
          },
        ],
      },
      getLineupPlayerDisplayPlayer(lineupPlayer) {
        return lineupPlayer.player;
      },
    },
    { player: { steam_id: "76561198000000001", elo: { duel: 7000 } } },
  );
}

test("the on-open query requests the existing historical eloFields relation", () => {
  assert.match(
    drawer,
    /import \{ eloFields \} from "~\/graphql\/eloFields";/,
  );
  assert.match(drawer, /elo_changes: \[\{\}, eloFields\],/);
});

test("historical ELO lookup matches both player_steam_id and match.options.type", () => {
  assert.match(
    lookupMatch[1],
    /String\(eloChange\.player_steam_id\) === String\(steamId\)/,
  );
  assert.match(lookupMatch[1], /eloChange\.type === matchType/);

  assert.equal(lookupFor("Competitive").current_elo, 5100);
  assert.equal(lookupFor("Wingman").current_elo, 5200);
  assert.equal(lookupFor("Duel").current_elo, 5300);
  assert.notEqual(lookupFor("Duel").current_elo, 5100);
});

test("the visible value uses current_elo and missing history cannot fall back to live player.elo", () => {
  assert.match(
    drawer,
    /:historical-elo="\s*historicalEloChangeForPlayer\(lineupPlayer\)\s*\?\.current_elo\s*"/,
  );
  assert.match(
    drawer,
    /:show-elo="\s*historicalEloChangeForPlayer\(lineupPlayer\)\s*\?\.current_elo != null\s*"/,
  );
  assert.doesNotMatch(lookupMatch[1], /updated_elo|player\.elo/);

  const missing = lookupHistoricalElo.call(
    {
      match: { options: { type: "Duel" } },
      matchStats: { elo_changes: [] },
      getLineupPlayerDisplayPlayer: (lineupPlayer) => lineupPlayer.player,
    },
    { player: { steam_id: "76561198000000001", elo: { duel: 7000 } } },
  );
  assert.equal(missing, null);
});

test("existing current active-season ELO hover remains enabled", () => {
  assert.doesNotMatch(drawer, /:elo-interactive="false"/);
  assert.match(drawer, /<PlayerDisplay[\s\S]*?:historical-elo=/);
});

test("all three per-map groups prefer map.label and retain separate map rows", () => {
  const labelFirstExpressions =
    drawer.match(
      /cleanMapName\(\s*match_map\.map\?\.label \|\| match_map\.map\?\.name \|\| "",\s*\)/g,
    ) ?? [];
  assert.equal(labelFirstExpressions.length, 3);
  assert.doesNotMatch(drawer, /cleanMapName\(match_map\.map\.name\)/);
  assert.match(drawer, /getLineupPicks\(\s*match\.lineup_1\.id/);
  assert.match(drawer, /getDeciderMaps\(\)/);
  assert.match(drawer, /getLineupPicks\(\s*match\.lineup_2\.id/);
});

test("the drawer uses the shared default-sized MatchTypeBadge", () => {
  assert.match(
    drawer,
    /import MatchTypeBadge from "~\/components\/MatchTypeBadge\.vue";/,
  );
  assert.match(
    drawer,
    /<MatchTypeBadge\s+v-if="match\.options\?\.type"\s+:type="match\.options\.type"\s+size="default"\s*\/>/,
  );
  assert.doesNotMatch(drawer, /<span>\{\{ match\.options\.type \}\}<\/span>/);
});

test("Full Page, player stats, and roster-aware avatars remain in place", () => {
  assert.match(drawer, /\$t\("match\.full_page"\)/);
  for (const stat of ["k", "d", "a", "total_damage", "kd"]) {
    assert.match(drawer, new RegExp(`<StatLabel stat="${stat}"`));
  }
  assert.match(drawer, /:avatar-override=/);
  assert.match(drawer, /:allow-roster-image="isTournamentMatch"/);
  assert.match(drawer, /size="sm"/);
});
