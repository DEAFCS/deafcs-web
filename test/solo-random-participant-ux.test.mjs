import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the Solo Random players-tab follow-up: participant row identity
// (profile link, real flag, tournament-mode ELO), the organizer check-in and
// remove actions, self-leave, and the incorrect team roster-size copy that
// was being shown on the individual-registration join drawer.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const individualPlayersSource = await read(
  "../components/tournament/TournamentIndividualPlayers.vue",
);
const rowActionsSource = await read(
  "../components/tournament/TournamentIndividualPlayerActions.vue",
);
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const memberRowSource = await read(
  "../components/tournament/TournamentTeamMemberRow.vue",
);
const signupsMetadata = await read(
  "../../api-deafcs/hasura/metadata/databases/default/tables/public_tournament_individual_signups.yaml",
);
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

// --- Row identity: profile link, flag, mode ELO ------------------------------

test("the signup query uses the shared playerFields fragment, not a hand-rolled subset", () => {
  // This was the root cause of the globe-only flags, the dead profile link and
  // the missing ELO: the row was handed a player object with three fields.
  const block = detailSource.slice(
    detailSource.indexOf("individual_signups: ["),
    detailSource.indexOf("individual_signups: [") + 1400,
  );
  assert.match(block, /player: playerFields/);
  assert.doesNotMatch(block, /player: \{\s*\n\s*name: true/);
  assert.match(detailSource, /import \{ playerFields \} from "~\/graphql\/playerFields"/);
});

test("playerFields actually carries country, steam_id and elo", async () => {
  const fields = await read("../graphql/playerFields.ts");
  assert.match(fields, /country: true/);
  assert.match(fields, /steam_id: true/);
  assert.match(fields, /elo: true/);
});

test("every player row is linkable and mode-scoped, reusing PlayerDisplay", () => {
  // PlayerDisplay already owns avatar resolution, the country flag, the
  // profile link and PlayerElo -- no duplicated profile URL or flag logic.
  assert.match(individualPlayersSource, /import PlayerDisplay from/);
  const rows = individualPlayersSource.match(/<PlayerDisplay[\s\S]*?\/>/g) ?? [];
  assert.ok(rows.length >= 3, "expected registered, waitlisted and removed rows");
  for (const row of rows) {
    assert.match(row, /:linkable="true"/);
    assert.match(row, /:match-type="tournament\?\.options\?\.type"/);
  }
  // No bespoke flag or profile-link handling in this component.
  assert.doesNotMatch(individualPlayersSource, /players-id/);
  assert.doesNotMatch(individualPlayersSource, /TimezoneFlag/);
});

// --- Row actions -------------------------------------------------------------

test("row actions mirror the existing team member-row pattern", () => {
  // Same trigger, same destructive styling, so participant management reads
  // identically across tournament types.
  assert.match(memberRowSource, /<MoreVertical/);
  assert.match(rowActionsSource, /<MoreVertical/);
  assert.match(rowActionsSource, /DropdownMenuTrigger/);
  assert.match(rowActionsSource, /class="text-destructive"/);
});

test("the actions menu cannot trigger profile navigation", () => {
  // The menu sits outside PlayerDisplay's NuxtLink, and the trigger stops the
  // click regardless.
  assert.match(rowActionsSource, /@click\.stop\.prevent/);
  const rowBlock = individualPlayersSource.slice(
    individualPlayersSource.indexOf("<PlayerDisplay"),
    individualPlayersSource.indexOf("</li>"),
  );
  assert.ok(
    rowBlock.indexOf("<PlayerDisplay") <
      rowBlock.indexOf("TournamentIndividualPlayerActions"),
    "actions must be a sibling after the player link, not nested inside it",
  );
});

test("nothing renders for a viewer with no available action", () => {
  assert.match(rowActionsSource, /v-if="hasActions"/);
  assert.match(
    rowActionsSource,
    /hasActions = computed\(\(\) => props\.canCheckIn \|\| props\.canRemove\)/,
  );
});

test("organizer check-in respects the same window rule as self check-in", () => {
  const canCheckIn = individualPlayersSource.slice(
    individualPlayersSource.indexOf("canCheckIn(signup: any)"),
    individualPlayersSource.indexOf("canRemove(signup: any)"),
  );
  assert.match(canCheckIn, /if \(signup\.checked_in_at\) return false/);
  assert.match(canCheckIn, /if \(!this\.checkInWindowOpen\) return false/);
  assert.match(canCheckIn, /this\.isOrganizer \|\| this\.isSelf\(signup\)/);
  // Window state comes from the shared helper, not a local re-derivation.
  assert.match(
    individualPlayersSource,
    /attendanceCheckInOpen\(this\.tournament as any\)/,
  );
});

test("checking yourself in uses the player's own action, not the organizer one", () => {
  const method = individualPlayersSource.slice(
    individualPlayersSource.indexOf("async checkInPlayer"),
    individualPlayersSource.indexOf("promptRemove(signup: any)"),
  );
  assert.match(method, /this\.isSelf\(signup\)\s*\n?\s*\?\s*generateMutation\(\{\s*\n?\s*checkIntoTournament/);
  assert.match(method, /checkInTournamentIndividualPlayer: \[/);
});

test("remove/leave is gated on the cutoff and on finalized participants", () => {
  const canRemove = individualPlayersSource.slice(
    individualPlayersSource.indexOf("canRemove(signup: any)"),
    individualPlayersSource.indexOf("async checkInPlayer"),
  );
  // The cutoff and finalized-participant gates now live in the shared
  // canLeaveIndividualTournament helper, which the header Leave button uses
  // too -- same rules, one definition. Asserted there in
  // tournament-schedule-lock.test.mjs.
  assert.match(
    canRemove,
    /canLeaveIndividualTournament\(signup, this\.tournament as any\)/,
  );
  assert.match(canRemove, /this\.isOrganizer \|\| this\.isSelf\(signup\)/);
});

test("both remove directions go through the one backend action", () => {
  assert.match(individualPlayersSource, /removeTournamentIndividualPlayer: \[/);
  // No direct Hasura delete from this component.
  assert.doesNotMatch(
    individualPlayersSource,
    /delete_tournament_individual_signups/,
  );
});

test("destructive removal is confirmed, reusing the AlertDialog pattern", () => {
  assert.match(individualPlayersSource, /<AlertDialog/);
  assert.match(individualPlayersSource, /promptRemove\(signup\)/);
  assert.match(individualPlayersSource, /confirmRemove/);
  // Wording differs for leaving vs removing someone else.
  assert.match(individualPlayersSource, /tournament\.players\.confirm_leave/);
  assert.match(
    individualPlayersSource,
    /tournament\.players\.confirm_remove_player/,
  );
});

test("organizer viewing their own row sees one destructive item, not two", () => {
  // canRemove covers both directions; the label switches on isSelf, so the
  // menu never offers "Remove player" and "Leave tournament" together.
  const removeItem = rowActionsSource.slice(
    rowActionsSource.indexOf('v-if="canRemove"'),
    rowActionsSource.indexOf("</DropdownMenuContent>"),
  );
  assert.match(removeItem, /isSelf\s*\n?\s*\?\s*\$t\("tournament\.team\.leave_tournament"\)/);
  assert.match(removeItem, /\$t\("tournament\.players\.remove_player"\)/);
  // Exactly two menu items exist at all: check-in and the single destructive
  // one whose label switches on isSelf.
  assert.equal(
    (rowActionsSource.match(/<DropdownMenuItem/g) ?? []).length,
    2,
  );
});

// --- Backend guard mirrored in metadata --------------------------------------

test("the direct self-delete permission cannot bypass the cutoff guard", () => {
  const block = signupsMetadata.slice(signupsMetadata.indexOf("delete_permissions:"));
  assert.match(block, /_eq: X-Hasura-User-Id/);
  assert.match(block, /status:\s*\n\s*_in:\s*\n\s*- Registered\s*\n\s*- Waitlisted/);
  assert.match(block, /tournament:\s*\n\s*status:\s*\n\s*_eq: RegistrationOpen/);
});

// --- Join drawer copy --------------------------------------------------------

test("the join drawer no longer shows a team roster-size requirement for Solo Random", () => {
  const sheet = detailSource.slice(
    detailSource.indexOf("<SheetDescription>"),
    detailSource.indexOf("</SheetDescription>"),
  );
  assert.match(sheet, /individual_registration_enabled/);
  assert.match(sheet, /tournament\.join\.individual\.sheet_description/);
  // The team rule is still there, just behind the branch.
  assert.match(sheet, /tournament\.join\.requirements/);
});

test("Solo Random join copy explains individual sign-up without a player count", () => {
  const copy = enLocale.tournament.join.individual.sheet_description;
  assert.ok(copy);
  assert.doesNotMatch(copy, /at least/i);
  assert.doesNotMatch(copy, /\d+ players/i);
  assert.match(copy, /no team needed/i);
  assert.match(copy, /generated automatically/i);
  assert.match(copy, /ELO/);
  // The team-tournament rule is untouched.
  assert.equal(
    enLocale.tournament.join.requirements,
    "You need at least {count} players to join this tournament",
  );
});

test("DEAFCS writing style: no em dashes in the new user-facing copy", () => {
  const players = enLocale.tournament.players;
  const copy = JSON.stringify([
    enLocale.tournament.join.individual.sheet_description,
    players.check_in_player,
    players.check_in_player_success,
    players.check_in_player_failed,
    players.remove_player,
    players.confirm_remove_player,
    players.remove_player_description,
    players.remove_player_success,
    players.remove_player_failed,
    players.confirm_leave,
    players.leave_description,
    players.leave_success,
    players.leave_failed,
  ]);
  assert.doesNotMatch(copy, /—/);
});
