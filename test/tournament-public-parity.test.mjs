import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { externalTournamentHomepage } from "../utilities/tournamentHomepage.ts";

// Tournament public page / bracket parity with 5Stack WEB 25dbf95d, plus the
// Manage console navigation fix.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const detail = await read("../components/tournament/TournamentDetail.vue");
const managePage = await read("../pages/tournaments/[tournamentId]/index.vue");
const appVue = await read("../app.vue");
const match = await read("../components/tournament/TournamentMatch.vue");
const viewer = await read("../components/tournament/TournamentBracketViewer.vue");
const pair = await read("../components/tournament/BracketPair.vue");
const builder = await read("../components/tournament/TournamentStageBuilder.vue");
const en = JSON.parse(await read("../i18n/locales/en.json"));

const headerBlock = detail.slice(
  detail.indexOf("<header"),
  detail.indexOf("</header>"),
);

// --- homepage ---------------------------------------------------------------

test("homepage: DEAFCS itself never gets a Homepage link", () => {
  for (const value of [
    "deafcs.net",
    "https://deafcs.net",
    "http://www.deafcs.net/",
    "https://deafcs.net/tournaments/515d2892-b143-413a-82f5-937127c5a881",
    "WWW.DEAFCS.NET",
    "https://api.deafcs.net/whatever",
  ]) {
    assert.equal(externalTournamentHomepage(value), null, value);
  }
  // The current site's own host (local/staging) counts as internal too.
  assert.equal(
    externalTournamentHomepage("http://localhost.test/t/1", "localhost.test"),
    null,
  );
});

test("homepage: a real external site is linked, normalised to https", () => {
  assert.equal(
    externalTournamentHomepage("example-league.org/cup"),
    "https://example-league.org/cup",
  );
  assert.equal(
    externalTournamentHomepage("http://deaf-sports.example/event"),
    "http://deaf-sports.example/event",
  );
  // Look-alike hosts are not DEAFCS.
  assert.equal(
    externalTournamentHomepage("https://notdeafcs.net"),
    "https://notdeafcs.net/",
  );
});

test("homepage: unsafe or meaningless values are dropped", () => {
  for (const value of [
    "",
    "   ",
    null,
    undefined,
    "javascript:alert(1)",
    "data:text/html,hi",
    "ftp://example.org",
    "https://user:pass@example.org",
    "not a url",
    "localhost",
  ]) {
    assert.equal(externalTournamentHomepage(value), null, String(value));
  }
});

test("the hero uses the safe homepage helper", () => {
  assert.match(detail, /externalTournamentHomepage\(\s*this\.tournament\?\.homepage/);
  assert.match(headerBlock, /v-if="tournamentHomepage"/);
  assert.match(headerBlock, /rel="noopener noreferrer"/);
});

// --- header -----------------------------------------------------------------

test("hero order: status, mode, categories, then the title, then meta", () => {
  const status = headerBlock.indexOf('data-testid="tournament-status-badge"');
  const mode = headerBlock.indexOf('data-testid="tournament-mode-badge"');
  const categories = headerBlock.indexOf('v-for="category in tournamentCategories"');
  const title = headerBlock.indexOf("<h1");
  const meta = headerBlock.indexOf("<CalendarDays");
  assert.ok(status > 0 && status < mode, "status before mode");
  assert.ok(mode < categories, "mode before Online/LAN/location categories");
  assert.ok(categories < title, "badges before the title");
  assert.ok(title < meta, "meta row after the title");
});

test("mode badge keeps DEAFCS mode colours; status keeps tier colours", () => {
  assert.match(detail, /tournamentHeroModeTagClasses =\s*\n\s*"[^"]*rgb\(var\(--mode-rgb\)/);
  assert.match(detail, /open: "border-success\/55 bg-success\/15 text-success"/);
  assert.match(headerBlock, /:style="matchTypeColorStyle\(tournament\.options\?\.type\)"/);
});

test("no separate 'Organized by' block in the hero; compact avatars only", () => {
  assert.doesNotMatch(headerBlock, /\{\{\s*\$t\("tournament\.organizer\.organized_by"\)\s*\}\}/);
  assert.match(headerBlock, /organizersList\.slice\(0, 6\)/);
});

test("relative start stays in the hero; the stat bar has the exact date and clock", () => {
  assert.match(headerBlock, /<TimeAgo :date="tournament\.start" hide-icon \/>/);
});

// --- tabs, chat room, manage --------------------------------------------------

test("no public Tournament Settings tab", () => {
  assert.doesNotMatch(detail, /tabs\.push\("match-settings"\)/);
  assert.doesNotMatch(detail, /value="match-settings"/);
  // Its content is in Overview: Match Setup (which embeds the full match
  // options) plus the rules link, without a duplicate settings block.
  const overview = detail.slice(
    detail.indexOf('<TabsContent value="overview">'),
    detail.indexOf('<TabsContent value="bracket">'),
  );
  assert.match(overview, /<TournamentMatchSetup/);
  assert.match(overview, /to="\/tournament-rules"/);
  assert.doesNotMatch(overview, /<MatchOptionsDisplay/);
});

test("tabs use the 5Stack underline row, scrolling sideways on narrow screens", () => {
  assert.match(detail, /const tournamentHeroTabsClasses = "mt-4 border-t border-border px-2 sm:px-3";/);
  assert.match(detail, /const tournamentTabTriggerClasses = \[tacticalTabsTriggerClasses, "h-11 shrink-0"\];/);
  assert.match(headerBlock, /v-for="tab in publicTabs"/);
  assert.match(headerBlock, /flex-nowrap !justify-start overflow-x-auto/);
});

test("Chat Room is a header action, not a tab; Manage is a button group", () => {
  const tabs = headerBlock.slice(headerBlock.indexOf("<TabsList"));
  assert.doesNotMatch(tabs, /openChatRoom/);
  const actions = headerBlock.slice(0, headerBlock.indexOf("<TabsList"));
  assert.match(actions, /v-if="chatRoomTournament"[\s\S]{0,400}@click="openChatRoom"/);
  assert.match(actions, /<ButtonGroup v-if="tournament\?\.is_organizer">/);
  assert.match(actions, /data-testid="tournament-manage-menu"/);
});

test("public Manage menu only navigates; status actions stay in the console", () => {
  const publicMenu = headerBlock.slice(
    headerBlock.indexOf('v-if="!manageMode"\n                    class="w-60"'),
    headerBlock.indexOf('<DropdownMenuContent v-else'),
  );
  assert.match(publicMenu, /v-for="item in tournamentManageSections"/);
  assert.doesNotMatch(publicMenu, /updateTournamentStatus|openRegistration|deleteDialogOpen/);
  const consoleMenu = headerBlock.slice(headerBlock.indexOf("<DropdownMenuContent v-else"));
  assert.match(consoleMenu, /openRegistration/);
});

test("entry requirements sit under the header, above the tabs", () => {
  const area = detail.indexOf('data-testid="tournament-entry-area"');
  assert.ok(area > detail.indexOf("</header>"));
  assert.ok(area < detail.indexOf('<TabsContent value="overview">'));
  assert.match(detail, /<TournamentEntryGate :tournament="tournament"/);
});

// --- manage navigation ----------------------------------------------------------

test("Manage: ?section= does not change the page key (no remount)", () => {
  assert.match(managePage, /persistQueryKeys: \["section"\]/);
  // The key function honours persistQueryKeys.
  assert.match(appVue, /route\.meta\?\.persistQueryKeys/);
  assert.match(appVue, /<NuxtPage :page-key="pageKeyWithoutTabQuery" \/>/);
});

test("Manage: sections are history entries, and no-op switches are skipped", () => {
  const method = detail.slice(
    detail.indexOf("setManageSection(section: string) {"),
    detail.indexOf("openChatRoom() {"),
  );
  assert.match(method, /this\.\$router\.push\(/);
  assert.doesNotMatch(method, /this\.\$router\.replace\(/);
  assert.match(method, /if \(this\.\$route\.query\.section === next\) return;/);
  // Section is read from the route, so Back/Forward drive it.
  assert.match(detail, /manageSection\(\) \{ return tournamentManageSection\(this\.\$route\.query\.section\); \}/);
});

test("the new strings exist in English", () => {
  for (const key of [
    "button",
    "back",
    "sections_menu",
    "status_actions",
    "no_status_actions",
    "no_permission",
    "view_tournament",
  ]) {
    assert.equal(typeof en.tournament.manage[key], "string", key);
    assert.doesNotMatch(en.tournament.manage[key], /—/);
  }
  assert.equal(en.tournament.bracket.match_short, "Match {match}");
  assert.equal(en.tournament.bracket.round_number, "Round {round}");
});

// --- bracket ----------------------------------------------------------------------

test("bracket card: flat 5Stack card with header strip and slot rows", () => {
  assert.match(match, /class="tournament-match relative flex w-\[13\.5rem\]/);
  assert.match(match, /"bg-\[hsl\(240_6%_8%\)\]"/);
  assert.match(match, /border-dashed border-muted-foreground\/25 bg-\[hsl\(240_6%_6\.5%\)\]/);
  assert.match(match, /v-for="slot in SLOTS"/);
  assert.match(match, /<MatchLineupScoreDisplay/);
  assert.doesNotMatch(match, /bg-gray-600|bg-gray-800\/50|hover:shadow-blue-500/);
});

test("bracket card keeps DEAFCS schedule wording and negotiation", () => {
  assert.match(match, /v-if="hasRealSchedule\(bracket\) && !bracket\.match"/);
  assert.match(match, /v-else-if="showWaitingForTeams\(bracket\)"/);
  assert.match(match, /v-else-if="showProjectedEta\(bracket\)"/);
  assert.match(match, /<BracketNegotiation\s+v-if="negotiableBracket\(props\.tournament, bracket as any\)"/);
});

test("bracket viewer: flat round pills, 48px columns, quiet connectors", () => {
  assert.match(viewer, /grid grid-flow-col auto-cols-max gap-12 min-w-max/);
  assert.match(viewer, /rounded-\[5px\] bg-muted\/55 px-2 text-\[0\.72rem\]/);
  assert.doesNotMatch(viewer, /bg-gray-700/);
  assert.match(viewer, /const COLUMN_GAP = 48;/);
  // Hidden byes are still resolved through, as before.
  assert.match(viewer, /visibleBracketTarget\(bracket\.parent_bracket\?\.id, props\.rounds\)/);
});

test("upper/lower headers use the 5Stack gradient bar", () => {
  assert.match(pair, /bg-\[linear-gradient\(90deg,hsl\(var\(--tac-amber\)\/0\.1\),transparent_60%\)\]/);
  assert.match(pair, /bg-\[linear-gradient\(90deg,hsl\(var\(--destructive\)\/0\.1\),transparent_60%\)\]/);
  assert.doesNotMatch(pair, /border-l-2/);
});

test("public bracket never shows stage editing", () => {
  assert.match(builder, /<template v-if="tournament\.is_organizer && !readOnly">/);
  assert.match(builder, /<slot name="empty-action"><\/slot>/);
  assert.match(detail, /:read-only="true"\s*\n\s*>\s*\n\s*<template #empty-action>/);
});
