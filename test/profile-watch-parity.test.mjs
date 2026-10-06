import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Player profile Highlights / Tournaments and the /watch finished card,
// aligned with 5Stack WEB b4b83f23.

const read = async (path) =>
  (await readFile(new URL(path, import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const highlights = await read("../components/clips/PlayerHighlights.vue");
const recent = await read("../components/tournament/RecentTournaments.vue");
const card = await read("../components/tournament/TournamentCard.vue");
const simple = await read("../components/tournament/SimpleTournamentDisplay.vue");
const watchCard = await read("../components/watch/WatchTournamentCard.vue");
const profile = await read("../pages/players/[id].vue");
const en = JSON.parse(await read("../i18n/locales/en.json"));

test("profile highlights use the shared ClipTile with the playlist queue", () => {
  assert.match(highlights, /import ClipTile from "~\/components\/clips\/ClipTile\.vue";/);
  assert.doesNotMatch(highlights, /HighlightCard/);
  assert.match(highlights, /<ClipTile\s+:clip="c"\s+:queue="clips"\s+:queue-scope="clipQueueScope"\s+hide-player/);
  assert.match(highlights, /import \{ clipQueueItem \} from "~\/utilities\/clipDisplay";/);
  // Newest first, matching the /highlights default.
  assert.match(highlights, /order_by: \[\{ created_at: order_by\.desc \}\]/);
  assert.match(highlights, /class="w-96 shrink-0 snap-start"/);
});

test("profile tournaments use the 5Stack simple tiles, see-all dialog and description", () => {
  const block = profile.slice(profile.indexOf("<RecentTournaments"), profile.indexOf("/>", profile.indexOf("<RecentTournaments")));
  assert.match(block, /card="simple"/);
  assert.match(block, /see-all-as-modal/);
  assert.match(block, /horizontal/);
  assert.match(block, /:section-description=/);
  assert.match(block, /:player-steam-id="playerId"/);
  assert.match(block, /e_tournament_status_enum\.CheckInReview/);
  assert.equal(en.pages.players.detail.tournaments_section_label, "TOURNAMENTS");
  assert.equal(en.pages.players.detail.tournaments_description, "Tournaments this player has competed in.");
});

test("RecentTournaments renders TournamentCard and keeps the DEAFCS Awards data", () => {
  assert.match(recent, /import TournamentCard from "~\/components\/tournament\/TournamentCard\.vue";/);
  assert.doesNotMatch(recent, /<TournamentCompactCard|<TournamentFeatureCard/);
  assert.equal((recent.match(/:award-occurrences="occurrencesByTournamentId\[tournament\.id\] \|\| \[\]"/g) ?? []).length, 3);
  // Awards system, not the upstream tournaments.awards relation.
  assert.match(recent, /award_occurrences: \[/);
  assert.match(recent, /tournament_award_slots: \[/);
  assert.doesNotMatch(recent, /\n\s+awards: \[/);
  assert.match(recent, /current_stage: true,/);
  assert.match(recent, /async function openSeeAll\(\)/);
  assert.match(recent, /<Dialog v-if="seeAllAsModal" v-model:open="seeAllOpen">/);
  // Callers that predate `card` keep their card.
  assert.match(recent, /props\.card \?\? \(props\.compact \? "compact" : "feature"\)/);
});

test("TournamentCard routes variants and passes award data to the compact card", () => {
  assert.match(card, /<TournamentCompactCard\s+v-if="variant === 'compact'"[\s\S]*:award-occurrences="awardOccurrences"/);
  assert.match(card, /<SimpleTournamentDisplay\s+v-else-if="variant === 'simple'"/);
  assert.match(card, /<TournamentFeatureCard\s+v-else/);
});

test("simple tile: player rank, current stage, DEAFCS mode colour, Random player count", () => {
  assert.match(simple, /tournamentPlayerRankLabel\(this\.tournament\)/);
  assert.match(simple, /tournamentCurrentStage\(this\.tournament\)/);
  assert.match(simple, /tournament\.stage\.stage_tab/);
  assert.match(simple, /:style="matchTypeColorStyle\(tournament\.options\?\.type\)"/);
  assert.match(simple, /tournamentCardCount\(tournament\)\.unit === 'players'/);
});

test("/watch finished card: champion only, no inline 2nd/3rd", () => {
  assert.doesNotMatch(watchCard, /podium/);
  assert.doesNotMatch(watchCard, /result\.rank/);
  assert.match(watchCard, /pages\.watch\.tournaments\.champion/);
});

test("/watch Details/Results is a dark-grey secondary button; Register stays amber", () => {
  const block = watchCard.slice(watchCard.indexOf('data-testid="watch-tournament-secondary-action"') - 200);
  assert.match(block, /variant="secondary"/);
  assert.doesNotMatch(block.slice(0, 400), /variant="ghost"/);
  assert.match(watchCard, /pages\.watch\.tournaments\.results/);
  assert.match(watchCard, /pages\.watch\.tournaments\.details/);
  assert.match(watchCard, /:class="\['hit h-8', primaryClasses\]"/);
});
