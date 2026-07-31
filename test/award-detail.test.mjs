import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  activeAwardHolders,
  awardDetailStats,
  occurrenceContext,
} from "../utilities/awardDetail.ts";

const detailPage = () =>
  readFile(new URL("../pages/awards/[id].vue", import.meta.url), "utf8");

const catalogPage = () =>
  readFile(new URL("../pages/awards/index.vue", import.meta.url), "utf8");

const recurringAward = {
  id: "award-1",
  name: "DEAFCS Player of the Year",
  tier: "special",
  occurrences: [
    {
      id: "2027",
      effective_at: "2027-12-31T12:00:00Z",
      event_id: "event-2027",
      event: { id: "event-2027", name: "DEAFCS Awards 2027" },
      recipients: [
        {
          id: "grant-a-2027",
          player_steam_id: "100",
          player: { steam_id: "100", name: "Player A" },
        },
        {
          id: "grant-team-2027",
          team_id: "team-1",
          team: { id: "team-1", name: "Team One" },
        },
      ],
    },
    {
      id: "2028",
      effective_at: "2028-12-31T12:00:00Z",
      elo_season_id: "season-2028",
      elo_season: { id: "season-2028", number: 2028 },
      recipients: [
        {
          id: "grant-a-2028",
          player_steam_id: "100",
          player: { steam_id: "100", name: "Player A" },
        },
        {
          id: "revoked",
          player_steam_id: "200",
          revoked_at: "2029-01-01T00:00:00Z",
          player: { steam_id: "200", name: "Revoked Player" },
        },
      ],
    },
  ],
};

test("route queries exactly one award by id using nested occurrences", async () => {
  const page = await detailPage();
  assert.match(page, /query PublicAwardDetail\(\$id: uuid!\)/);
  assert.match(page, /awards_by_pk\(id: \$id\)/);
  assert.match(page, /occurrences\(order_by:/);
  assert.match(page, /occurrences[\s\S]*recipients\(/);
  assert.doesNotMatch(page, /mutation\s/);
});

test("keeps multiple occurrences across different years newest first", () => {
  const holders = activeAwardHolders(recurringAward);
  assert.deepEqual(
    holders.map(({ occurrence }) => occurrence.id),
    ["2028", "2027", "2027"],
  );
  assert.equal(occurrenceContext(holders[0].occurrence).label, "ELO Season 2028");
  assert.equal(occurrenceContext(holders[1].occurrence).label, "DEAFCS Awards 2027");
});

test("counts active grants and excludes revoked recipients", () => {
  const holders = activeAwardHolders(recurringAward);
  assert.equal(holders.length, 3);
  assert.equal(holders.some(({ recipient }) => recipient.id === "revoked"), false);
  assert.equal(awardDetailStats(recurringAward).totalActiveGrants, 3);
});

test("deduplicates repeated player and team identities", () => {
  const duplicateTeam = structuredClone(recurringAward);
  duplicateTeam.occurrences[1].recipients.push({
    id: "grant-team-2028",
    team_id: "team-1",
    team: { id: "team-1", name: "Team One" },
  });
  const stats = awardDetailStats(duplicateTeam);
  assert.equal(stats.totalActiveGrants, 4);
  assert.equal(stats.uniqueActiveHolders, 2);
});

test("represents both player and team holders", () => {
  const holders = activeAwardHolders(recurringAward);
  assert.deepEqual(new Set(holders.map(({ kind }) => kind)), new Set(["player", "team"]));
});

test("renders a no-holder state", async () => {
  assert.deepEqual(activeAwardHolders({ ...recurringAward, occurrences: [] }), []);
  assert.match(await detailPage(), /No holders yet/);
});

test("query excludes revoked recipients before loading active history", async () => {
  const page = await detailPage();
  assert.match(
    page,
    /recipients\([\s\S]*where:\s*\{\s*revoked_at:\s*\{\s*_is_null:\s*true/,
  );
});

test("catalog cards use a full-card native detail link", async () => {
  const page = await catalogPage();
  assert.match(page, /<a[\s\S]*?v-for="award in group\.awards"/);
  assert.match(page, /:href="awardHref\(award\.id\)"/);
  assert.match(page, /@keydown\.space\.prevent="openAward\(award\.id\)"/);
  assert.match(page, /cursor-pointer/);
  assert.match(page, /focus-visible:ring-2/);
});
