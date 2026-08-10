import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

const awardFieldsSource = await read("graphql/awardFields.ts");
const teamSource = await read("pages/teams/[id].vue");
const playerSource = await read("pages/players/[id].vue");
const podiumSource = await read("components/tournament/TournamentResults.vue");
const detailSource = await read("components/tournament/TournamentDetail.vue");

// Shared selector now reads through the modern award_recipients type, not
// the legacy tournament_trophies compatibility view.
assert.match(awardFieldsSource, /Selector\("award_recipients"\)/);
assert.doesNotMatch(awardFieldsSource, /tournament_trophies/);
assert.match(awardFieldsSource, /award:\s*\{\s*image_url: true,/);

// Team profile: scoped by team_id, no dependency on the legacy view.
assert.match(teamSource, /award_recipients: \[/);
assert.match(teamSource, /team_id: \{\s*_eq: \$\("teamId", "uuid!"\)/);
assert.doesNotMatch(teamSource, /tournament_trophies/);

// Player profile: scoped by player_steam_id, no dependency on the legacy view.
assert.match(playerSource, /award_recipients: \[/);
assert.match(
  playerSource,
  /player_steam_id: \{\s*_eq: \$\("steam_id", "bigint"\)/,
);
assert.doesNotMatch(playerSource, /tournament_trophies/);

// Podium: reads award_occurrences (with recipients) and tournament_award_slots
// directly, no dependency on tournament.trophies / tournament.trophy_configs.
assert.match(podiumSource, /award_occurrences: \[/);
assert.match(podiumSource, /tournament_award_slots: \[/);
assert.doesNotMatch(podiumSource, /tournament\.trophies|tournament\.trophy_configs/);
assert.doesNotMatch(podiumSource, /\(this\.tournament as any\)\?\.trophies/);
assert.doesNotMatch(podiumSource, /\(this\.tournament as any\)\?\.trophy_configs/);

// Multi-recipient placements: podium folds every recipient's player into the
// entry rather than only taking the first one.
assert.match(podiumSource, /recipients\s*\.map\(\(r: any\) => r\.player\)/);

// No lingering legacy trophies/trophy_configs selections left in the big
// tournament query now that TournamentResults fetches its own award data.
assert.doesNotMatch(detailSource, /\btrophies:\s*\[/);
assert.doesNotMatch(detailSource, /\btrophy_configs:\s*\[/);

// Guest/anonymous loading: none of the new subscriptions gate on an
// authenticated viewer (unlike e.g. playerTeamMemberships, which does).
for (const [label, source, blockPattern] of [
  ["podium awardOccurrences", podiumSource, /awardOccurrences: \{[\s\S]*?skip: function \(\) \{([\s\S]*?)\},/],
  ["podium tournamentAwardSlots", podiumSource, /tournamentAwardSlots: \{[\s\S]*?skip: function \(\) \{([\s\S]*?)\},/],
]) {
  const match = source.match(blockPattern);
  assert.ok(match, `expected a skip() guard for ${label}`);
  assert.doesNotMatch(match[1], /useAuthStore/);
}

console.log("award surface query wiring checks passed");
