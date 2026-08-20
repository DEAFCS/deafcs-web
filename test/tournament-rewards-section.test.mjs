import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Consolidates the old standalone Prize Distribution section, the
// MatchOptionsDisplay "Awards" yes/no row, and the separate
// TournamentAwardShowcase into one public "Tournament Rewards" section
// (components/tournament/TournamentRewards.vue). Static source-inspection
// tests, matching this suite's existing pattern -- no component-mounting
// harness in this repo.

const rewardsPath = new URL(
  "../components/tournament/TournamentRewards.vue",
  import.meta.url,
);
const rewardsSource = await readFile(rewardsPath, "utf8");
const detailSource = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const matchOptionsSource = await readFile(
  new URL("../components/match/MatchOptionsDisplay.vue", import.meta.url),
  "utf8",
);
const enLocale = JSON.parse(
  await readFile(new URL("../i18n/locales/en.json", import.meta.url), "utf8"),
);

test("the old split components are gone -- folded into TournamentRewards.vue, not left as dead code", () => {
  assert.equal(
    existsSync(
      new URL("../components/tournament/TournamentPrizes.vue", import.meta.url),
    ),
    false,
  );
  assert.equal(
    existsSync(
      new URL(
        "../components/tournament/TournamentAwardShowcase.vue",
        import.meta.url,
      ),
    ),
    false,
  );
});

test("MatchOptionsDisplay no longer has an Awards yes/no row or an awardsEnabled prop", () => {
  assert.doesNotMatch(matchOptionsSource, /awardsEnabled/);
  assert.doesNotMatch(matchOptionsSource, /match\.options\.awards_enabled/);
});

test("TournamentDetail wires TournamentRewards into the overview tab with the tournament data it already has (no duplicate query)", () => {
  assert.doesNotMatch(detailSource, /TournamentPrizes\b/);
  assert.doesNotMatch(detailSource, /TournamentAwardShowcase/);
  assert.match(
    detailSource,
    /import TournamentRewards from "~\/components\/tournament\/TournamentRewards\.vue";/,
  );

  const block = detailSource.slice(
    detailSource.indexOf("<TournamentRewards"),
    detailSource.indexOf("</TournamentRewards>") + 1,
  );
  assert.match(block, /:prizes="tournament\.prizes"/);
  assert.match(block, /:tournament-id="tournament\.id"/);
  assert.match(block, /:awards-enabled="tournament\.trophies_enabled \?\? false"/);
  assert.match(block, /:match-type="tournament\.options\?\.type \|\| null"/);
  assert.match(
    block,
    /:min-players-per-lineup="tournament\.min_players_per_lineup \?\? null"/,
  );
});

test("the match-settings tab no longer passes awards-enabled to MatchOptionsDisplay", () => {
  const block = detailSource.slice(
    detailSource.indexOf("<MatchOptionsDisplay"),
    detailSource.indexOf("</MatchOptionsDisplay>") + 1,
  );
  assert.doesNotMatch(block, /awards-enabled/);
});

test("section title is Tournament Rewards, driven by i18n (not hardcoded)", () => {
  assert.match(rewardsSource, /\$t\("tournament\.rewards\.title"\)/);
  assert.equal(enLocale.tournament.rewards.title, "Tournament Rewards");
});

test("the section shows when prizes exist OR awards are enabled/configured, hides otherwise", () => {
  const showSectionBlock = rewardsSource.slice(
    rewardsSource.indexOf("const showSection"),
    rewardsSource.indexOf("const showSection") + 100,
  );
  assert.match(showSectionBlock, /hasPrizes\.value \|\| hasAwardsContent\.value/);
  assert.match(rewardsSource, /<Card v-if="showSection"/);

  const hasAwardsBlock = rewardsSource.slice(
    rewardsSource.indexOf("const hasAwardsContent"),
    rewardsSource.indexOf("const showSection"),
  );
  assert.match(hasAwardsBlock, /props\.awardsEnabled/);
  assert.match(hasAwardsBlock, /bodyEntries\.value\.length > 0/);
  assert.match(hasAwardsBlock, /!!mvpAward\.value/);
});

test("MVP is computed separately from the body placements and only renders in the header", () => {
  const mvpBlock = rewardsSource.slice(
    rewardsSource.indexOf("const mvpAward"),
    rewardsSource.indexOf("const mvpAward") + 150,
  );
  assert.match(mvpBlock, /mvpEnabled\.value \? awardForId\(selection\.value\[0\]\) : null/);

  // Body placements explicitly exclude placement 0 (MVP).
  const bodyPlacementsBlock = rewardsSource.slice(
    rewardsSource.indexOf("const bodyPlacements"),
    rewardsSource.indexOf("const bodyPlacements") + 150,
  );
  assert.match(bodyPlacementsBlock, /config\.placement !== 0/);

  // Header renders mvpAward via AwardArtwork; the body grid (bodyEntries)
  // never references mvpAward.
  const headerBlock = rewardsSource.slice(
    rewardsSource.indexOf('{{ $t("tournament.rewards.title") }}'),
    rewardsSource.indexOf('<template v-if="hasPrizes">'),
  );
  assert.match(headerBlock, /v-if="mvpAward"/);
  assert.match(headerBlock, /<AwardArtwork :award="mvpAward" size="xs" decorative \/>/);

  const bodyGridBlock = rewardsSource.slice(
    rewardsSource.indexOf('v-for="entry in bodyEntries"'),
    rewardsSource.indexOf('v-for="entry in bodyEntries"') + 600,
  );
  assert.doesNotMatch(bodyGridBlock, /mvpAward/);
  assert.match(bodyGridBlock, /<AwardArtwork :award="entry\.award" size="md" decorative \/>/);
});

test("reuses the shared award placement config/resolver instead of a second hardcoded hierarchy", () => {
  assert.match(
    rewardsSource,
    /from "~\/utilities\/tournamentAwardPicker";/,
  );
  assert.match(rewardsSource, /TOURNAMENT_AWARD_PLACEMENTS/);
  assert.match(rewardsSource, /effectiveTournamentAwardSelection/);
  assert.match(rewardsSource, /tournamentMvpEnabled\(props\.matchType, props\.minPlayersPerLineup\)/);
  // No second copy of the placement labels/tiers array.
  assert.doesNotMatch(rewardsSource, /shortLabel:\s*["']Champion["']/);
});

test("only one award query pair exists (no duplicate GraphQL query from the old showcase)", () => {
  const definitionQueries = rewardsSource.match(/query \w*AwardDefinitions/g) ?? [];
  const slotQueries = rewardsSource.match(/query \w*AwardSlots/g) ?? [];
  assert.equal(definitionQueries.length, 1);
  assert.equal(slotQueries.length, 1);
});

test("prize podium/extras markup is preserved from the old TournamentPrizes.vue", () => {
  assert.match(rewardsSource, /const podium = computed\(\(\) => props\.prizes\.slice\(0, 3\)\);/);
  assert.match(rewardsSource, /const extras = computed\(\(\) => props\.prizes\.slice\(3\)\);/);
  assert.match(rewardsSource, /v-for="\(prize, index\) in podium"/);
  assert.match(rewardsSource, /v-if="extras\.length > 0"/);
});

test("no empty award card renders for an unconfigured placement", () => {
  const bodyEntriesBlock = rewardsSource.slice(
    rewardsSource.indexOf("const bodyEntries"),
    rewardsSource.indexOf("const hasAwardsContent"),
  );
  assert.match(bodyEntriesBlock, /!!entry\.award/);
});
