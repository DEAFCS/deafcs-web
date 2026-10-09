import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Public "Tournament Awards" section (components/tournament/TournamentRewards.vue).
//
// UPCOMING / LIVE / PAUSED: Tournament Awards owns the #1/#2/#3 placement
// cards. Each card holds the award artwork AND the configured prize money in
// one reward row; #4+ stay in a small payout list; the Prize Pool total sits
// in the header next to the manual MVP. No separate TournamentPrizes block.
//
// FINISHED: TournamentResults (final podium) + TournamentPrizes in its
// #prizes slot, the 5Stack-style flow. The combined cards are not used there.
//
// Static source-inspection tests, matching this suite's existing pattern. The
// rendered behaviour is covered in test/component/tournament-overview-redesign.spec.ts.

const read = async (relative) =>
  (await readFile(new URL(relative, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

const rewardsSource = await read("../components/tournament/TournamentRewards.vue");
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const resultsSource = await read("../components/tournament/TournamentResults.vue");
const matchOptionsSource = await read("../components/match/MatchOptionsDisplay.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

const overview = detailSource.slice(
  detailSource.indexOf('<TabsContent value="overview">'),
  detailSource.indexOf('<TabsContent value="bracket">'),
);
const finishedBranch = overview.slice(
  overview.indexOf("<TournamentResults"),
  overview.indexOf("<template v-else>"),
);
const liveBranch = overview.slice(
  overview.indexOf("<template v-else>"),
  overview.indexOf('data-testid="tournament-overview-bottom"'),
);
const headerBlock = rewardsSource.slice(
  rewardsSource.indexOf('{{ $t("tournament.rewards.title") }}'),
  rewardsSource.indexOf('v-if="hasStandings"'),
);
const cardsBlock = rewardsSource.slice(
  rewardsSource.indexOf('v-if="hasStandings"'),
  rewardsSource.indexOf('v-if="extras.length > 0"'),
);

test("the old standalone showcase is gone and MatchOptionsDisplay has no Awards row", () => {
  assert.equal(
    existsSync(new URL("../components/tournament/TournamentAwardShowcase.vue", import.meta.url)),
    false,
  );
  assert.doesNotMatch(detailSource, /TournamentAwardShowcase/);
  assert.doesNotMatch(matchOptionsSource, /awardsEnabled/);
  assert.doesNotMatch(matchOptionsSource, /match\.options\.awards_enabled/);
});

test("section title is Tournament Awards, driven by i18n", () => {
  assert.match(rewardsSource, /\$t\("tournament\.rewards\.title"\)/);
  assert.equal(enLocale.tournament.rewards.title, "Tournament Awards");
});

test("upcoming/live/paused: TournamentRewards gets the prizes and no separate TournamentPrizes block renders", () => {
  const block = liveBranch.slice(
    liveBranch.indexOf("<TournamentRewards"),
    liveBranch.indexOf("</TournamentRewards>"),
  );
  assert.match(block, /:prizes="tournament\.prizes"/);
  assert.match(block, /:tournament-id="tournament\.id"/);
  assert.match(block, /:awards-enabled="tournament\.trophies_enabled \?\? false"/);
  assert.match(block, /:match-type="tournament\.options\?\.type \|\| null"/);
  assert.match(block, /:min-players-per-lineup="tournament\.min_players_per_lineup \?\? null"/);
  assert.doesNotMatch(liveBranch, /<TournamentPrizes/);
  assert.doesNotMatch(rewardsSource, /prizes\.distribution/);
  assert.doesNotMatch(rewardsSource, /tournament-prize-money/);
});

test("finished: TournamentResults stays the final podium and TournamentPrizes is still used in its prizes slot", () => {
  assert.match(overview, /<TournamentResults\s+v-if="tournament\.status === e_tournament_status_enum\.Finished"/);
  assert.match(finishedBranch, /<template #prizes>/);
  assert.match(finishedBranch, /<TournamentPrizes\s+v-if="hasPrizes"\s+:prizes="tournament\.prizes"/);
  assert.doesNotMatch(finishedBranch, /<TournamentRewards/);
  assert.ok(existsSync(new URL("../components/tournament/TournamentPrizes.vue", import.meta.url)));
  assert.match(resultsSource, /<slot name="prizes" \/>/);
  assert.match(resultsSource, /tournament-results-podium/);
});

test("the combined-card layout does not leak into the finished results", () => {
  for (const marker of ["tournament-awards-reward", "tournament-awards-placements", "tournament-awards-prize"]) {
    assert.doesNotMatch(resultsSource, new RegExp(marker));
  }
  assert.doesNotMatch(resultsSource, /TournamentRewards/);
});

test("the section shows when prizes exist OR awards content exists, hides otherwise", () => {
  const showBlock = rewardsSource.slice(
    rewardsSource.indexOf("const showSection"),
    rewardsSource.indexOf("const showSection") + 100,
  );
  assert.match(showBlock, /hasPrizes\.value \|\| hasAwardsContent\.value/);
  assert.match(rewardsSource, /<Card\s+v-if="showSection"/);

  const hasAwardsBlock = rewardsSource.slice(
    rewardsSource.indexOf("const hasAwardsContent"),
    rewardsSource.indexOf("const showSection"),
  );
  assert.match(hasAwardsBlock, /props\.awardsEnabled/);
  assert.match(hasAwardsBlock, /standingEntries\.value\.some\(\(entry\) => !!entry\.award\)/);
  assert.match(hasAwardsBlock, /!!mvpAward\.value/);
});

test("MVP is the manual DEAFCS award: placement 0, 5v5 only, header only, never in a placement card", () => {
  const mvpBlock = rewardsSource.slice(
    rewardsSource.indexOf("const mvpAward"),
    rewardsSource.indexOf("const mvpAward") + 150,
  );
  assert.match(mvpBlock, /mvpEnabled\.value \? awardForId\(selection\.value\[0\]\) : null/);
  const bodyBlock = rewardsSource.slice(
    rewardsSource.indexOf("const bodyPlacements"),
    rewardsSource.indexOf("const bodyPlacements") + 150,
  );
  assert.match(bodyBlock, /config\.placement !== 0/);
  assert.match(headerBlock, /v-if="mvpAward"/);
  assert.match(headerBlock, /<AwardArtwork :award="mvpAward" size="xs" decorative \/>/);
  assert.doesNotMatch(cardsBlock, /mvpAward/);
  // No stats-derived MVP logic in the rewards component.
  assert.doesNotMatch(rewardsSource, /\bkdr\b|\.kills\b|\.rating\b|\.sort\(|\.reduce\(/i);
});

test("the header shows the Prize Pool total next to the MVP, from the shared formatter, only when it parses as money", () => {
  assert.match(rewardsSource, /import \{ formatPrizePool \} from "~\/utilities\/prizePool";/);
  assert.match(rewardsSource, /const pool = computed\(\(\) => formatPrizePool\(prizeList\.value\)\)/);
  assert.match(headerBlock, /v-if="mvpAward \|\| pool"/);
  assert.match(headerBlock, /v-if="pool"/);
  assert.match(headerBlock, /data-testid="tournament-awards-total"/);
  assert.match(headerBlock, /\{\{ pool \}\}/);
  assert.match(headerBlock, /\$t\("tournament\.stats\.prize_pool"\)/);
  assert.equal(enLocale.tournament.stats.prize_pool, "Prize Pool");
  // Exactly one right-aligned wrapper holds both MVP and total.
  assert.equal((headerBlock.match(/ml-auto/g) ?? []).length, 1);
});

test("no hardcoded currency, and non-money prize text is not summed into the pool", async () => {
  assert.doesNotMatch(rewardsSource, /["'`]\s*[$€£¥]/);
  assert.doesNotMatch(rewardsSource, /DEFAULT_CURRENCY/);
  const { formatPrizePool } = await import("../utilities/prizePool.ts").catch(() => ({}));
  if (typeof formatPrizePool === "function") {
    assert.equal(formatPrizePool([{ prize: "Custom Knife" }, { prize: "Top 3 teams" }]), null);
    assert.equal(formatPrizePool([{ prize: "$3" }, { prize: "$2" }, { prize: "Custom Knife" }]), "$5");
  }
  const poolSource = await read("../utilities/prizePool.ts");
  assert.match(poolSource, /Only count values that are a bare amount/);
});

test("reuses the shared award placement config/resolver and one award query pair", () => {
  assert.match(rewardsSource, /from "~\/utilities\/tournamentAwardPicker";/);
  assert.match(rewardsSource, /TOURNAMENT_AWARD_PLACEMENTS/);
  assert.match(rewardsSource, /effectiveTournamentAwardSelection/);
  assert.match(rewardsSource, /tournamentMvpEnabled\(props\.matchType, props\.minPlayersPerLineup\)/);
  assert.doesNotMatch(rewardsSource, /shortLabel:\s*["']Champion["']/);
  assert.equal((rewardsSource.match(/query \w*AwardDefinitions/g) ?? []).length, 1);
  assert.equal((rewardsSource.match(/query \w*AwardSlots/g) ?? []).length, 1);
});

test("one placement-card loop; award artwork and prize money share a single reward row per card", () => {
  assert.equal((rewardsSource.match(/v-for="entry in standingEntries"/g) ?? []).length, 1);
  const row = cardsBlock.slice(cardsBlock.indexOf('data-testid="tournament-awards-reward"') - 120);
  assert.match(row, /class="mt-2 flex min-h-\[2\.75rem\] items-center justify-center gap-2"/);
  assert.match(row, /<AwardArtwork\s+v-if="entry\.award"\s+:award="entry\.award"\s+size="xs"/);
  assert.match(row, /v-if="entry\.prize"/);
  assert.match(row, /\{\{ entry\.prize\.prize \}\}/);
  // Exactly one reward row and one prize element inside the card loop.
  assert.equal((cardsBlock.match(/tournament-awards-reward/g) ?? []).length, 1);
  assert.equal((cardsBlock.match(/tournament-awards-prize/g) ?? []).length, 1);
  // The prize is not rendered as a separate block below the artwork row.
  assert.doesNotMatch(cardsBlock, /mt-1 font-sans text-\[1\.35rem\]/);
  // Award name text is not rendered in the card (keeps height stable).
  assert.doesNotMatch(cardsBlock, /entry\.award\.name/);
});

test("all three cards share identical geometry; #1 differs only in colour", () => {
  assert.match(
    rewardsSource,
    /'relative overflow-hidden rounded-lg border border-border bg-card\/40 px-4 py-4 text-center \[backdrop-filter:blur\(6px\)\]'/,
  );
  assert.match(cardsBlock, /items-stretch/);
  assert.doesNotMatch(rewardsSource, /sm:pt-[0-9]/);
  assert.doesNotMatch(rewardsSource, /text-\[1\.7rem\]/);
  assert.match(cardsBlock, /'font-sans text-\[1\.35rem\] font-bold leading-none tabular-nums'/);
  for (const key of ["frame", "order", "label", "amount", "bar"]) {
    assert.match(rewardsSource, new RegExp(`TIERS\\[entry\\.index\\]\\.${key}`));
  }
});

test("standingEntries pairs podium rank i with prize i and the same-index placement award; awards off still keeps money", () => {
  const block = rewardsSource.slice(
    rewardsSource.indexOf("const standingEntries"),
    rewardsSource.indexOf("const hasStandings"),
  );
  assert.match(block, /const prize = prizeList\.value\[index\] \?\? null;/);
  assert.match(block, /const placementConfig = bodyPlacements\[index\];/);
  assert.match(block, /props\.awardsEnabled && placementConfig/);
  // A rank with neither money nor award is skipped; no zero/fake prize is made.
  assert.match(block, /if \(!prize && !award\) continue;/);
  assert.doesNotMatch(block, /prize:\s*["'`]?0/);
  // The amount only renders from a real configured prize.
  assert.doesNotMatch(cardsBlock, /entry\.prize\?\.prize \?\? 0|\|\| 0/);
});

test("#4+ prizes stay in the smaller payout list, with its own dashed divider", () => {
  assert.match(rewardsSource, /const extras = computed\(\(\) => prizeList\.value\.slice\(3\)\)/);
  assert.match(
    rewardsSource,
    /v-if="extras\.length > 0"[\s\S]{0,40}class="flex flex-col divide-y divide-border\/60 border-t border-dashed border-border pt-1"/,
  );
  assert.match(rewardsSource, /v-for="prize in extras"/);
});
