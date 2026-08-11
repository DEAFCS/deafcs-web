import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), "utf8");

const awardFieldsSource = await read("graphql/awardFields.ts");
const teamSource = await read("pages/teams/[id].vue");
const playerSource = await read("pages/players/[id].vue");
const podiumSource = await read("components/tournament/TournamentResults.vue");
const detailSource = await read("components/tournament/TournamentDetail.vue");
const teamsListSource = await read("pages/teams/index.vue");
const recentTournamentsSource = await read(
  "components/tournament/RecentTournaments.vue",
);
const compactCardSource = await read(
  "components/tournament/TournamentCompactCard.vue",
);

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

// Teams list: reads award_recipients (team-only, via the shared awardFields
// selector) + tournament_award_slots directly, no dependency on the legacy
// tournament_trophies compatibility view, and resolves artwork through the
// same mapAwardRecipientToTrophy/resolveAwardArtwork chain as the team
// profile and podium surfaces.
assert.match(teamsListSource, /award_recipients: \[/);
assert.match(teamsListSource, /awardFields/);
assert.match(teamsListSource, /tournament_award_slots: \[/);
assert.match(teamsListSource, /mapAwardRecipientToTrophy/);
assert.doesNotMatch(teamsListSource, /tournament_trophies/);

// Team-only filter preserved exactly: a player-recipient row must never
// surface here, matching the prior tournament_trophies filter's intent.
assert.match(
  teamsListSource,
  /player_steam_id:\s*\{\s*_is_null:\s*true\s*,?\s*\}/,
);

// Grouping keys off award_recipients.team_id (the real, direct team FK —
// exactly one of player_steam_id/team_id is non-null per
// award_recipients_exactly_one_recipient), not the legacy
// tournament_team.team_id hop.
assert.match(teamsListSource, /const teamId = t\.team_id;/);

// Recent tournaments (/watch, /tournaments): reads award_occurrences (with
// recipients) + tournament_award_slots directly, batched across the
// currently-loaded cards, no dependency on the legacy tournament_trophies /
// tournament_trophy_configs relations or trophies_enabled toggle.
assert.match(recentTournamentsSource, /award_occurrences: \[/);
assert.match(recentTournamentsSource, /tournament_award_slots: \[/);
assert.match(recentTournamentsSource, /tournamentAwardSlotLookupFields/);
assert.doesNotMatch(recentTournamentsSource, /tournament_trophies/);
assert.doesNotMatch(recentTournamentsSource, /\btrophies:\s*\[/);

// TournamentCompactCard (rendered by RecentTournaments for both /watch and
// /tournaments): consumes award_occurrences/award_slots props and resolves
// artwork through the same resolveAwardArtwork chain as the podium and
// teams-list surfaces, with no lingering trophy_configs/trophies_enabled
// reads off the raw tournament object.
assert.match(compactCardSource, /resolveAwardArtwork/);
assert.match(compactCardSource, /awardOccurrences\?:\s*any\[\]/);
assert.match(compactCardSource, /awardSlots\?:\s*any\[\]/);
assert.doesNotMatch(compactCardSource, /tournament\?\.trophies\b/);
assert.doesNotMatch(compactCardSource, /tournament\?\.trophy_configs/);
assert.doesNotMatch(compactCardSource, /tournament\?\.trophies_enabled/);
assert.doesNotMatch(compactCardSource, /trophiesEnabled/);
assert.doesNotMatch(compactCardSource, /tournament_trophies/);

console.log("award surface query wiring checks passed");
