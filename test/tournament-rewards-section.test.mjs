import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Consolidates the old standalone Prize Distribution section, the
// MatchOptionsDisplay "Awards" yes/no row, and the separate
// TournamentAwardShowcase into one public "Tournament Rewards" section
// (components/tournament/TournamentRewards.vue). Award artwork for
// Champion/Runner-up/Third Place rides inside the SAME #1/#2/#3 placement
// card as the prize money (no separate award-card row underneath) --
// static source-inspection tests, matching this suite's existing pattern.

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

test("the header no longer repeats the total prize-pool amount -- the summary bar above the section already shows it", () => {
  assert.doesNotMatch(rewardsSource, /formatPrizePool/);
  assert.doesNotMatch(rewardsSource, /from "~\/utilities\/prizePool"/);
  assert.doesNotMatch(rewardsSource, /const pool = computed/);

  const headerBlock = rewardsSource.slice(
    rewardsSource.indexOf('{{ $t("tournament.rewards.title") }}'),
    rewardsSource.indexOf('<template v-if="hasStandings">'),
  );
  assert.doesNotMatch(headerBlock, /\{\{ pool \}\}/);
  assert.doesNotMatch(headerBlock, /text-\[hsl\(var\(--tac-amber\)\)\]">\s*\{\{ pool/);
});

test("the header's right side renders only the MVP block -- nothing else -- and is absent entirely when there's no MVP", () => {
  const headerBlock = rewardsSource.slice(
    rewardsSource.indexOf('{{ $t("tournament.rewards.title") }}'),
    rewardsSource.indexOf('<template v-if="hasStandings">'),
  );
  assert.match(headerBlock, /<div v-if="mvpAward" class="ml-auto flex items-center gap-2">/);
  // Only one ml-auto element -- not a wrapper plus a separate sibling span.
  const mlAutoMatches = headerBlock.match(/ml-auto/g) ?? [];
  assert.equal(mlAutoMatches.length, 1);
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
  assert.match(hasAwardsBlock, /standingEntries\.value\.some\(\(entry\) => !!entry\.award\)/);
  assert.match(hasAwardsBlock, /!!mvpAward\.value/);
});

test("MVP is computed separately from the standing placements and only renders in the header", () => {
  const mvpBlock = rewardsSource.slice(
    rewardsSource.indexOf("const mvpAward"),
    rewardsSource.indexOf("const mvpAward") + 150,
  );
  assert.match(mvpBlock, /mvpEnabled\.value \? awardForId\(selection\.value\[0\]\) : null/);

  // bodyPlacements (used to pair awards with podium ranks) explicitly
  // excludes placement 0 (MVP).
  const bodyPlacementsBlock = rewardsSource.slice(
    rewardsSource.indexOf("const bodyPlacements"),
    rewardsSource.indexOf("const bodyPlacements") + 150,
  );
  assert.match(bodyPlacementsBlock, /config\.placement !== 0/);

  // Header renders mvpAward via AwardArtwork.
  const headerBlock = rewardsSource.slice(
    rewardsSource.indexOf('{{ $t("tournament.rewards.title") }}'),
    rewardsSource.indexOf('<template v-if="hasStandings">'),
  );
  assert.match(headerBlock, /v-if="mvpAward"/);
  assert.match(headerBlock, /<AwardArtwork :award="mvpAward" size="xs" decorative \/>/);

  // The standing-card block (podium ranks) never references mvpAward.
  const standingsBlock = rewardsSource.slice(
    rewardsSource.indexOf('<template v-if="hasStandings">'),
    rewardsSource.indexOf("</template>", rewardsSource.indexOf('<template v-if="hasStandings">')),
  );
  assert.doesNotMatch(standingsBlock, /mvpAward/);
});

test("reuses the shared award placement config/resolver instead of a second hardcoded hierarchy", () => {
  assert.match(rewardsSource, /from "~\/utilities\/tournamentAwardPicker";/);
  assert.match(rewardsSource, /TOURNAMENT_AWARD_PLACEMENTS/);
  assert.match(rewardsSource, /effectiveTournamentAwardSelection/);
  assert.match(
    rewardsSource,
    /tournamentMvpEnabled\(props\.matchType, props\.minPlayersPerLineup\)/,
  );
  // No second copy of the placement labels/tiers array.
  assert.doesNotMatch(rewardsSource, /shortLabel:\s*["']Champion["']/);
});

test("only one award query pair exists (no duplicate GraphQL query from the old showcase)", () => {
  const definitionQueries = rewardsSource.match(/query \w*AwardDefinitions/g) ?? [];
  const slotQueries = rewardsSource.match(/query \w*AwardSlots/g) ?? [];
  assert.equal(definitionQueries.length, 1);
  assert.equal(slotQueries.length, 1);
});

test("award artwork for Champion/Runner-up/Third Place rides inside the same #1/#2/#3 card as the prize money -- no separate award-card row", () => {
  // Exactly one placement-card v-for -- the merged standingEntries loop --
  // not two separate loops (money cards + award cards).
  const cardLoops = rewardsSource.match(/v-for="entry in standingEntries"/g) ?? [];
  assert.equal(cardLoops.length, 1);

  // The old separate award-grid loop/classes are gone entirely.
  assert.doesNotMatch(rewardsSource, /v-for="entry in bodyEntries"/);
  assert.doesNotMatch(rewardsSource, /sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(rewardsSource, /awards_showcase\.team/);

  // The dashed divider that only ever separated money from the old award
  // row is gone (the extras list's own dashed divider is unrelated and
  // still present -- checked separately below).
  assert.doesNotMatch(rewardsSource, /hasPrizes \? 'border-t border-dashed border-border pt-4' : ''/);

  // Award artwork is rendered from inside the standing-card block, using
  // the compact "xs" size (same as the header MVP badge), not the larger
  // "md" size the old separate row used.
  const standingsBlock = rewardsSource.slice(
    rewardsSource.indexOf('<template v-if="hasStandings">'),
    rewardsSource.indexOf("</template>", rewardsSource.indexOf('<template v-if="hasStandings">')),
  );
  assert.match(standingsBlock, /<AwardArtwork v-if="entry\.award" :award="entry\.award" size="xs" \/>/);
  assert.doesNotMatch(standingsBlock, /size="md"/);

  // No award name text rendered inside the card (keeps card height stable).
  assert.doesNotMatch(standingsBlock, /entry\.award\.name/);
});

test("the extras list (prize rows beyond the top 3) keeps its own dashed divider, unaffected", () => {
  assert.match(
    rewardsSource,
    /v-if="extras\.length > 0"[\s\S]{0,40}class="flex flex-col divide-y divide-border\/60 border-t border-dashed border-border pt-1"/,
  );
});

test("placement card container classes are unchanged -- same dimensions as before", () => {
  assert.match(
    rewardsSource,
    /'relative overflow-hidden rounded-lg border border-border bg-card\/40 px-4 py-4 text-center \[backdrop-filter:blur\(6px\)\]'/,
  );
  // TIERS drives per-rank accent/frame/order exactly as before -- three
  // entries, same class strings, keyed by entry.index (not v-for position)
  // so a skipped middle rank still resolves the correct tier.
  assert.match(rewardsSource, /TIERS\[entry\.index\]\.frame/);
  assert.match(rewardsSource, /TIERS\[entry\.index\]\.order/);
  assert.match(rewardsSource, /TIERS\[entry\.index\]\.label/);
  assert.match(rewardsSource, /TIERS\[entry\.index\]\.amount/);
  assert.match(rewardsSource, /TIERS\[entry\.index\]\.bar/);
});

test("money-only rendering is unchanged: the amount is still the standalone content when no award is configured for that rank", () => {
  const block = rewardsSource.slice(
    rewardsSource.indexOf('<div class="mt-1 flex items-center justify-center gap-2">'),
    rewardsSource.indexOf('<div class="mt-1 flex items-center justify-center gap-2">') + 500,
  );
  assert.match(block, /v-if="entry\.prize"/);
  assert.match(block, /\{\{ entry\.prize\.prize \}\}/);
});

test("the amount and award artwork stay on the same items-center row, with a tight line-height plus a small optical nudge -- no margin/card-height changes", () => {
  const rowBlock = rewardsSource.slice(
    rewardsSource.indexOf('<div class="mt-1 flex items-center justify-center gap-2">'),
    rewardsSource.indexOf('<div class="mt-1 flex items-center justify-center gap-2">') + 500,
  );
  // Row itself: unchanged flex/items-center/justify-center, no height/margin added.
  assert.match(rowBlock, /^<div class="mt-1 flex items-center justify-center gap-2">/);

  // Amount keeps its existing tight line-height and gets a minimal (1px)
  // optical nudge only -- not a margin or the row/card dimensions.
  assert.match(rowBlock, /'translate-y-px font-sans text-\[1\.35rem\] font-bold leading-none tabular-nums'/);

  // The artwork itself is untouched -- still the compact "xs" size, no
  // extra wrapper or size bump introduced to fix alignment.
  assert.match(rowBlock, /<AwardArtwork v-if="entry\.award" :award="entry\.award" size="xs" \/>/);
});

test("no empty placement card renders when a rank has neither prize money nor a configured award", () => {
  const standingEntriesBlock = rewardsSource.slice(
    rewardsSource.indexOf("const standingEntries"),
    rewardsSource.indexOf("const hasStandings"),
  );
  assert.match(standingEntriesBlock, /if \(!prize && !award\) continue;/);
});

test("standingEntries pairs podium rank with the same-index Champion/Runner-up/Third Place placement", () => {
  const block = rewardsSource.slice(
    rewardsSource.indexOf("const standingEntries"),
    rewardsSource.indexOf("const hasStandings"),
  );
  assert.match(block, /const prize = podium\.value\[index\] \?\? null;/);
  assert.match(block, /const placementConfig = bodyPlacements\[index\];/);
  assert.match(block, /props\.awardsEnabled && placementConfig/);
});
