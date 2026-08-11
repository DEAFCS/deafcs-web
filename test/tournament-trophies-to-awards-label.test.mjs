import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The tournament page's "Trophies" tab (and the same-keyed Results-tab
// podium header) should visibly say "Awards" -- terminology only. The
// internal tab id (value="trophies") and the tab query param must not
// change, matching the established precedent already used for the
// leaderboard's own "trophies" filter category (internal key "trophies",
// display value "Awards").

const enLocale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);
const tournamentDetail = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const tournamentResults = await readFile(
  new URL("../components/tournament/TournamentResults.vue", import.meta.url),
  "utf8",
);
const createWizard = await readFile(
  new URL(
    "../components/tournament/TournamentCreateWizard.vue",
    import.meta.url,
  ),
  "utf8",
);

test("en.json's trophies.title now reads Awards", () => {
  assert.equal(enLocale.trophies.title, "Awards");
});

test("the established internal-key/display-value precedent (leaderboard categories.trophies) is unaffected", () => {
  assert.equal(enLocale.pages.leaderboard.categories.trophies, "Awards");
});

test("TournamentDetail's internal tab id/value remains 'trophies', unchanged", () => {
  const occurrences = (tournamentDetail.match(/value="trophies"/g) || [])
    .length;
  assert.equal(
    occurrences,
    2,
    "expected both the TabsTrigger and TabsContent value=\"trophies\" to remain",
  );
  assert.match(tournamentDetail, /\{\{ \$t\("trophies\.title"\) \}\}/);
});

test("TournamentResults' podium header (sharing the same key) is unaffected by this change -- it inherits the new value automatically", () => {
  assert.match(tournamentResults, /\{\{ \$t\("trophies\.title"\) \}\}/);
});

test("TournamentCreateWizard's hardcoded toast text now says Awards, while the internal tab query value stays 'trophies'", () => {
  assert.match(createWizard, /Open the Awards tab to review/);
  assert.doesNotMatch(createWizard, /Open the Trophies tab/);
  assert.match(createWizard, /tab: "trophies"/);
});

console.log("tournament trophies-to-awards label checks passed");
