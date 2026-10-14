import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const utilitySource = await source("utilities/playerModeElo.ts");
const transpiledUtility = ts.transpileModule(utilitySource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const utility = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledUtility).toString("base64")}`
);

const draftRoom = await source("components/draft-games/DraftRoom.vue");
const draftTeamPanel = await source(
  "components/draft-games/DraftTeamPanel.vue",
);
const draftBackupsPanel = await source(
  "components/draft-games/DraftBackupsPanel.vue",
);
const draftPlayerCard = await source(
  "components/draft-games/DraftPlayerCard.vue",
);
const playerRanks = await source("components/draft-games/PlayerRanks.vue");
const draftOpenSlot = await source(
  "components/draft-games/DraftOpenSlot.vue",
);
const draftSettingsBar = await source(
  "components/draft-games/DraftSettingsBar.vue",
);
// /play's draft rooms are 5Stack's PlayDraftRooms (the old DraftGames list
// and DraftGameCard were removed with that port).
const playDraftRooms = await source("components/play/PlayDraftRooms.vue");
const playDraftRoomRow = await source("components/play/PlayDraftRoomRow.vue");
const draftRoomRow = await source("components/play/draftRoomRow.ts");
const draftRequestQueue = await source(
  "components/draft-games/DraftRequestQueue.vue",
);
const scheduledMatchCreate = await source("pages/matches/create.vue");

test("mode helper selects Competitive, Wingman, and Duel independently", () => {
  const elo = { competitive: 5100, wingman: 6200, duel: 7300 };
  assert.equal(utility.activeSeasonEloForMode(elo, "Competitive"), 5100);
  assert.equal(utility.activeSeasonEloForMode(elo, "Wingman"), 6200);
  assert.equal(utility.activeSeasonEloForMode(elo, "Duel"), 7300);
});

test("missing active-season mode uses 5000 and never another mode's lifetime value", () => {
  assert.equal(utility.ACTIVE_SEASON_ELO_FALLBACK, 5000);
  assert.equal(
    utility.activeSeasonEloForMode({ competitive: 4905 }, "Duel"),
    5000,
  );
  assert.equal(utility.activeSeasonEloForMode(undefined, "Wingman"), 5000);
});

test("average helper includes every supplied player with the mode fallback", () => {
  const entries = [
    { elo: { duel: 6000 } },
    { elo: { competitive: 9000 } },
    { elo: { duel: 7000 } },
  ];
  assert.equal(
    utility.averageActiveSeasonEloForMode(
      entries,
      "Duel",
      (entry) => entry.elo,
    ),
    6000,
  );
});

test("DraftRoom uses room.type for internal ELO while preserving Premier and Faceit", () => {
  assert.match(draftRoom, /eloSource\.value === "cs2"\s*\? "Premier"/);
  assert.match(draftRoom, /eloSource\.value === "faceit"\s*\? "Faceit"/);
  assert.match(draftRoom, /: props\.room\.type,/);
});

test("Draft team, backup, player-rank, and add-player paths receive the Draft type", () => {
  const teamPanels = draftRoom.match(/<DraftTeamPanel[\s\S]*?\/>/g) ?? [];
  assert.equal(teamPanels.length, 4);
  for (const panel of teamPanels) {
    assert.match(panel, /:match-type="rankMatchType"/);
    assert.match(panel, /:elo-type="room\.type"/);
  }

  const backupPanels =
    draftRoom.match(/<DraftBackupsPanel[\s\S]*?<\/DraftBackupsPanel>/g) ?? [];
  assert.equal(backupPanels.length, 3);
  for (const panel of backupPanels) {
    assert.match(panel, /:match-type="rankMatchType"/);
    assert.match(panel, /:elo-type="room\.type"/);
  }

  assert.match(draftTeamPanel, /:match-type="matchType"/);
  assert.match(draftTeamPanel, /:elo-type="eloType"/);
  assert.match(draftBackupsPanel, /:elo-type="eloType"/);
  assert.match(
    draftPlayerCard,
    /<PlayerRanks\s+:player="member\.player"\s+:match-type="eloType"\s*\/>/,
  );
  assert.match(playerRanks, /:type="matchType \?\? undefined"/);
  assert.match(draftOpenSlot, /:match-type="matchType \?\? undefined"/);
  assert.match(draftTeamPanel, /<DraftOpenSlot[\s\S]*?:match-type="eloType"/);
  assert.match(draftRoom, /<DraftOpenSlot[\s\S]*?:match-type="room\.type"/);
});

test("scheduled-match lineups pass their existing mode through every DraftTeamPanel ELO path", () => {
  const teamPanels =
    scheduledMatchCreate.match(/<DraftTeamPanel[\s\S]*?\/>/g) ?? [];
  assert.equal(teamPanels.length, 1);
  assert.match(teamPanels[0], /:match-type="matchType"/);
  assert.match(teamPanels[0], /:elo-type="matchType"/);

  assert.match(
    draftTeamPanel,
    /averageActiveSeasonEloForMode\([\s\S]*props\.eloType/,
  );
  assert.match(
    draftTeamPanel,
    /<DraftPlayerCard[\s\S]*?:match-type="matchType"[\s\S]*?:elo-type="eloType"/,
  );
  assert.match(draftTeamPanel, /<DraftOpenSlot[\s\S]*?:match-type="eloType"/);
});

test("overall and team Draft averages use active-season mode ELO without snapshots", () => {
  assert.match(
    draftSettingsBar,
    /p\.status === "Accepted"[\s\S]*averageActiveSeasonEloForMode\([\s\S]*accepted\.value,[\s\S]*props\.room\.type,[\s\S]*eloForPlayer\(member\.player\)/,
  );
  assert.match(
    draftTeamPanel,
    /averageActiveSeasonEloForMode\([\s\S]*props\.players,[\s\S]*props\.eloType,[\s\S]*eloForPlayer\(member\.player\)/,
  );
  assert.doesNotMatch(draftSettingsBar, /elo_snapshot/);
  assert.doesNotMatch(draftTeamPanel, /elo_snapshot/);
});

test("Play-page Draft rooms and rank filtering share active-season mode ELO", () => {
  // The room's average and one player's rating come from the room's own
  // type, over accepted players, through the active-season resolver.
  assert.match(
    draftRoomRow,
    /averageActiveSeasonEloForMode\(\s*acceptedPlayers\(game\),\s*game\?\.type,/,
  );
  assert.match(
    draftRoomRow,
    /activeSeasonEloForMode\(eloFor\(row\?\.player\), game\?\.type\)/,
  );
  assert.match(draftRoomRow, /p\.status === "Accepted"/);

  // Filtering, sorting, the meta line, host rating and face order all pass
  // the viewer's resolver, so none falls back to join-time snapshots.
  assert.match(playDraftRooms, /usePlayerActiveSeasonElo\(\)/);
  assert.match(
    playDraftRooms,
    /filterDraftRooms\(rooms\.value, filters\.value, eloForPlayer\)/,
  );
  assert.match(playDraftRoomRow, /usePlayerActiveSeasonElo\(\)/);
  assert.match(
    playDraftRoomRow,
    /draftMetaParts\(props\.draftGame, t, locale\.value, eloForPlayer\)/,
  );
  assert.match(playDraftRoomRow, /draftPlayerElo\(props\.draftGame, row, eloForPlayer\)/);
  assert.doesNotMatch(playDraftRoomRow, /elo_snapshot|elo\?\.competitive/);
  assert.doesNotMatch(playDraftRooms, /elo_snapshot/);
});

test("Draft request display, filter, and sort use current Draft-mode ELO", () => {
  assert.match(
    draftRequestQueue,
    /activeSeasonEloForMode\(eloForPlayer\(request\.player\), props\.matchType\)/,
  );
  assert.match(draftRequestQueue, /requestElo\(r\) >= min/);
  assert.match(draftRequestQueue, /requestElo\(r\) <= max/);
  assert.match(draftRequestQueue, /requestElo\(a\) - requestElo\(b\)/);
  assert.match(draftRequestQueue, /requestElo\(b\) - requestElo\(a\)/);
  assert.match(draftRequestQueue, /Math\.round\(requestElo\(request\)\)/);
  assert.match(draftRoom, /<DraftRequestQueue[\s\S]*?:match-type="room\.type"/);
  assert.doesNotMatch(draftRequestQueue, /elo_snapshot/);
});

test("current Draft and Play-Draft paths never opt into historical match ELO", () => {
  const currentUi = [
    draftRoom,
    draftTeamPanel,
    draftBackupsPanel,
    draftPlayerCard,
    playerRanks,
    draftOpenSlot,
    draftSettingsBar,
    playDraftRooms,
    playDraftRoomRow,
    draftRoomRow,
    draftRequestQueue,
  ].join("\n");
  assert.doesNotMatch(currentUi, /historical[-_A-Za-z]*elo/i);
});

console.log("Draft/Play mode-specific ELO checks passed");
