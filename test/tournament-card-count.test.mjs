import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { tournamentCardCount } from "../utilities/tournamentCardCount.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const signups = (n, status = "Registered") =>
  Array.from({ length: n }, () => ({ status }));
const random = (status, { players = 0, teams = 0, removed = 0 } = {}) => ({
  status,
  options: { individual_registration_enabled: true },
  teams_aggregate: { aggregate: { count: teams } },
  individual_signups: [...signups(players), ...signups(removed, "Removed")],
});
const cup = (status, teams) => ({
  status,
  options: { individual_registration_enabled: false },
  teams_aggregate: { aggregate: { count: teams } },
  individual_signups: [],
});

test("Random tournament, registration open: 23 registered players => 23 Players", () => {
  assert.deepEqual(tournamentCardCount(random("RegistrationOpen", { players: 23 })), {
    unit: "players",
    count: 23,
  });
});

test("removed sign-ups are not counted; waitlisted are (same as the Players tab)", () => {
  const t = random("RegistrationOpen", { players: 2, removed: 3 });
  t.individual_signups.push({ status: "Waitlisted" });
  assert.deepEqual(tournamentCardCount(t), { unit: "players", count: 3 });
});

test("Random tournament, registration closed: real team count, even 0 while teams are generated", () => {
  for (const status of ["RegistrationClosed", "Live", "Finished"]) {
    assert.deepEqual(tournamentCardCount(random(status, { players: 23, teams: 4 })), {
      unit: "teams",
      count: 4,
    });
  }
  assert.deepEqual(tournamentCardCount(random("RegistrationClosed", { players: 23 })), {
    unit: "teams",
    count: 0,
  });
});

test("regular team tournaments keep counting teams in every status", () => {
  assert.deepEqual(tournamentCardCount(cup("RegistrationOpen", 0)), { unit: "teams", count: 0 });
  assert.deepEqual(tournamentCardCount(cup("RegistrationOpen", 4)), { unit: "teams", count: 4 });
  assert.deepEqual(tournamentCardCount(cup("Live", 4)), { unit: "teams", count: 4 });
});

test("missing data degrades to 0 teams", () => {
  assert.deepEqual(tournamentCardCount(undefined), { unit: "teams", count: 0 });
});

test("singular/plural labels", async () => {
  const en = JSON.parse(await read("i18n/locales/en.json"));
  assert.equal(en.tournament.card_count.players, "Player | Players");
  assert.equal(en.tournament.card_count.teams, "Team | Teams");
});

test("cards use the shared helper with pluralized labels", async () => {
  for (const file of [
    "components/tournament/TournamentFeatureCard.vue",
    "components/tournament/TournamentCompactCard.vue",
  ]) {
    const src = await read(file);
    assert.match(src, /const cardCount = computed\(\(\) => tournamentCardCount\(props\.tournament\)\);/);
    assert.match(src, /\$t\(`tournament\.card_count\.\$\{cardCount\.unit\}`, cardCount\.count\)/);
  }
  for (const file of [
    "components/tournament/TournamentTableRow.vue",
    "components/tournament/SimpleTournamentDisplay.vue",
  ]) {
    const src = await read(file);
    assert.match(src, /v-if="tournamentCardCount\(tournament\)\.unit === 'players'"/);
    assert.match(src, /tournament\.table\.teams_joined/);
  }
});

test("card query fetches non-removed individual sign-ups", async () => {
  const fields = await read("graphql/simpleTournamentFields.ts");
  assert.match(
    fields,
    /individual_signups: \[\s*\{\s*where: \{\s*status: \{ _neq: e_tournament_individual_signup_status_enum\.Removed \},/,
  );
});
