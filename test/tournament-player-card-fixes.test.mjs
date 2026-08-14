import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tournament player cards previously always showed Competitive as the
// primary ELO (PlayerElo's :type/:match-type prop defaults to
// "competitive" when omitted) regardless of the tournament's actual match
// type, and fell back to a player's normal avatar even when a
// team-specific roster image existed for the real team (tournament_team_
// roster itself has no roster_image_url column -- only the real team's
// team_roster does). This covers the fix across every affected surface.

const tournamentTeamMemberRow = await readFile(
  new URL("../components/tournament/TournamentTeamMemberRow.vue", import.meta.url),
  "utf8",
);
const tournamentTeamInvite = await readFile(
  new URL("../components/tournament/TournamentTeamInvite.vue", import.meta.url),
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
const tournamentResults = await readFile(
  new URL("../components/tournament/TournamentResults.vue", import.meta.url),
  "utf8",
);
const stageStandings = await readFile(
  new URL("../components/tournament/StageStandings.vue", import.meta.url),
  "utf8",
);
const tournamentStage = await readFile(
  new URL("../components/tournament/TournamentStage.vue", import.meta.url),
  "utf8",
);
const tournamentDetail = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const tournamentTeamFields = await readFile(
  new URL("../graphql/tournamentTeamFields.ts", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// A. Every affected tournament PlayerDisplay call receives the tournament's
// match type, so the primary visible ELO follows Competitive/Wingman/Duel
// instead of always defaulting to Competitive.
// ---------------------------------------------------------------------------

test("TournamentTeamMemberRow passes tournament match type to PlayerDisplay", () => {
  assert.match(tournamentTeamMemberRow, /:match-type="tournamentMatchType"/);
  assert.match(
    tournamentTeamMemberRow,
    /tournamentMatchType\(\): string \| null \{\s*\n\s*return \(this\.tournament as any\)\?\.options\?\.type \?\? null;/,
  );
});

test("TournamentTeamInvite receives team/tournament context from its parent and passes match type", () => {
  // Parent wiring: TournamentTeam.vue must forward both props -- the invite
  // row had neither before this fix.
  assert.match(tournamentTeam, /<TournamentTeamInvite[\s\S]*?:team="team"[\s\S]*?:tournament="tournament"/);
  assert.match(tournamentTeamInvite, /:match-type="tournamentMatchType"/);
  assert.match(
    tournamentTeamInvite,
    /tournamentMatchType\(\): string \| null \{\s*\n\s*return \(this\.tournament as any\)\?\.options\?\.type \?\? null;/,
  );
});

test("TournamentJoinForm's lineup picker passes tournament match type to PlayerDisplay", () => {
  assert.match(tournamentJoinForm, /:match-type="tournamentMatchType"/);
  assert.match(
    tournamentJoinForm,
    /tournamentMatchType\(\): string \| null \{\s*\n\s*return \(this\.tournament as any\)\?\.options\?\.type \?\? null;/,
  );
});

test("TournamentResults passes tournament match type to the MVP card's PlayerDisplay", () => {
  assert.match(tournamentResults, /:match-type="tournamentMatchType"/);
  assert.match(
    tournamentResults,
    /tournamentMatchType\(\): string \| null \{\s*\n\s*return \(this\.tournament as any\)\?\.options\?\.type \?\? null;/,
  );
});

test("StageStandings receives tournament from both callers and passes match type to the roster panel", () => {
  assert.match(stageStandings, /:match-type="tournamentMatchType"/);
  assert.match(
    stageStandings,
    /tournamentMatchType\(\): string \| null \{\s*\n\s*return \(this\.tournament as any\)\?\.options\?\.type \?\? null;/,
  );
  // Both callers must forward the tournament they already have in scope.
  assert.match(tournamentResults, /<StageStandings[\s\S]*?:tournament="tournament"/);
  assert.match(tournamentStage, /<StageStandings[\s\S]*?:tournament="tournament"/);
});

// ---------------------------------------------------------------------------
// B. Current roster fields remain available pre-lock, while locked surfaces
// select the historical snapshot through the narrow GraphQL compatibility field.
// ---------------------------------------------------------------------------

test("tournamentTeamFields.ts exposes the real team's roster for team-specific image resolution", () => {
  assert.match(
    tournamentTeamFields,
    /team: \{[\s\S]*?\n {4}roster: \[\s*\n\s*\{\},\s*\n\s*\{\s*\n\s*player_steam_id: true,\s*\n\s*roster_image_url: true,/,
  );
  assert.match(tournamentTeamFields, /import \{ rosterImageSnapshotField \}/);
  assert.match(tournamentTeamFields, /\.\.\.rosterImageSnapshotField/);
});

test("TournamentDetail's stage results query also widens the real team's roster for standings", () => {
  const block = tournamentDetail.slice(
    tournamentDetail.indexOf("results: ["),
    tournamentDetail.indexOf("results: [") + 2400,
  );
  assert.match(block, /team:\s*\{\s*\n\s*id: true,\s*\n\s*name: true,\s*\n\s*avatar_url: true,\s*\n\s*[\s\S]*?roster: \[/);
  assert.match(tournamentDetail, /import \{ rosterImageSnapshotField \}/);
  assert.match(block, /\.\.\.rosterImageSnapshotField/);
});

test("current invite/join surfaces keep the canonical live roster resolver", () => {
  for (const [label, src] of [
    ["TournamentTeamInvite.vue", tournamentTeamInvite],
    ["TournamentJoinForm.vue", tournamentJoinForm],
  ]) {
    assert.match(
      src,
      /import \{ resolveRosterImageUrl \} from "~\/utilities\/rosterImage";/,
      `${label} must import the canonical resolver`,
    );
    assert.match(
      src,
      /:avatar-override="/,
      `${label} must feed a team-specific override into PlayerDisplay`,
    );
  }
});

test("locked tournament roster, standings, and results surfaces use the historical resolver", () => {
  for (const [label, src] of [
    ["TournamentTeamMemberRow.vue", tournamentTeamMemberRow],
    ["TournamentResults.vue", tournamentResults],
    ["StageStandings.vue", stageStandings],
  ]) {
    assert.match(
      src,
      /resolveTournamentPlayerAvatarUrl/,
      `${label} must use the historical-aware tournament resolver`,
    );
    assert.match(src, /tournamentAllowsCurrentRosterImage/);
    assert.match(src, /:avatar-override=/);
    assert.doesNotMatch(src, /:allow-roster-image="true"/);
  }
});

test("TournamentJoinForm queries roster_image_url (team-specific and general) and custom_avatar_url, and passes allow-roster-image", () => {
  const queryBlock = tournamentJoinForm.slice(
    tournamentJoinForm.indexOf("team_roster: ["),
    tournamentJoinForm.indexOf("team_roster: [") + 1300,
  );
  // Team-specific tier -- the team_roster row's own column.
  assert.match(queryBlock, /player_steam_id: true,/);
  assert.match(queryBlock, /status: true,/);
  assert.match(queryBlock, /coach: true,/);
  assert.match(
    queryBlock,
    /roster_image_url: true,/,
    "expected the team-specific roster_image_url column on the team_roster row",
  );
  // General/avatar tiers + ELO, on the nested player.
  assert.match(
    queryBlock,
    /player: \{[\s\S]*?roster_image_url: true,[\s\S]*?custom_avatar_url: true,[\s\S]*?elo: true,/,
    "expected general roster_image_url, custom_avatar_url, and elo on the nested player",
  );
  assert.match(tournamentJoinForm, /:allow-roster-image="true"/);
});

test("TournamentJoinForm's team-specific resolver passes the team_roster row itself (which carries its own roster_image_url), not a lookup by id", () => {
  assert.match(
    tournamentJoinForm,
    /teamRosterImageFor\(member: any\): string \| null \{\s*\n\s*return resolveRosterImageUrl\(member, member\?\.player \?\? null, this\.apiDomain\);/,
  );
});

// ---------------------------------------------------------------------------
// C. Lineup picker layout: one player per row at all widths.
// ---------------------------------------------------------------------------

test("the Join Tournament / Add Team lineup picker is single-column at every breakpoint", () => {
  assert.doesNotMatch(tournamentJoinForm, /sm:grid-cols-2/);
  assert.match(tournamentJoinForm, /<ul class="grid gap-1\.5">/);
});

test("checkbox, image/flag/nickname/ELO display, selection, and already-rostered label markup are preserved in the picker row", () => {
  const rowBlock = tournamentJoinForm.slice(
    tournamentJoinForm.indexOf('<ul class="grid gap-1.5">'),
    tournamentJoinForm.indexOf("</ul>", tournamentJoinForm.indexOf('<ul class="grid gap-1.5">')),
  );
  assert.match(rowBlock, /<Checkbox/);
  assert.match(rowBlock, /<PlayerDisplay/);
  assert.match(rowBlock, /@click="togglePlayer\(member\)"/);
  assert.match(rowBlock, /:disabled="/);
  assert.match(rowBlock, /tournament\.join\.already_rostered/);
  assert.match(rowBlock, /:class="rosterItemClass\(member\)"/);
});

test("Admin Add Team and Join Tournament share the exact same picker component (one fix covers both)", () => {
  assert.match(tournamentDetail, /<TournamentJoinForm[\s\S]{0,120}:tournament="tournament"/g);
  const occurrences = (
    tournamentDetail.match(/<TournamentJoinForm[\s\S]{0,200}?\/?>/g) || []
  ).length;
  assert.equal(
    occurrences,
    2,
    "expected exactly two TournamentJoinForm usages: the admin Add Team panel and the Join Tournament sheet",
  );
});

console.log("tournament player-card ELO/roster-image/layout checks passed");
