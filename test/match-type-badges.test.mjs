import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MATCH_TYPE_RGB,
  matchTypeColorStyle,
} from "../utilities/matchTypeColors.ts";

const badge = await readFile(
  new URL("../components/MatchTypeBadge.vue", import.meta.url),
  "utf8",
);
const matchTableRow = await readFile(
  new URL("../components/MatchTableRow.vue", import.meta.url),
  "utf8",
);
const compactTournament = await readFile(
  new URL(
    "../components/tournament/TournamentCompactCard.vue",
    import.meta.url,
  ),
  "utf8",
);
const featureTournament = await readFile(
  new URL(
    "../components/tournament/TournamentFeatureCard.vue",
    import.meta.url,
  ),
  "utf8",
);
const homepageResults = await readFile(
  new URL(
    "../components/home/HomeLatestResultsPreview.vue",
    import.meta.url,
  ),
  "utf8",
);
const matchDetail = await readFile(
  new URL("../pages/matches/[id]/index.vue", import.meta.url),
  "utf8",
);

test("mode badges use the existing RGB mappings", () => {
  assert.deepEqual(MATCH_TYPE_RGB, {
    Competitive: "249 158 47",
    Wingman: "217 70 239",
    Duel: "34 211 238",
  });
  assert.deepEqual(matchTypeColorStyle("Competitive"), {
    "--mode-rgb": MATCH_TYPE_RGB.Competitive,
  });
  assert.deepEqual(matchTypeColorStyle("Wingman"), {
    "--mode-rgb": MATCH_TYPE_RGB.Wingman,
  });
  assert.deepEqual(matchTypeColorStyle("Duel"), {
    "--mode-rgb": MATCH_TYPE_RGB.Duel,
  });
});

test("unknown badge types remain neutral instead of using the Competitive fallback", () => {
  assert.match(badge, /hasKnownColor/);
  assert.match(badge, /Object\.prototype\.hasOwnProperty\.call\(MATCH_TYPE_RGB/);
  assert.match(
    badge,
    /'border-border\/70 bg-muted\/35 text-foreground'/,
  );
  assert.match(badge, /hasKnownColor \? matchTypeColorStyle\(type\) : undefined/);
});

test("match rows keep mode and BO pills at the same full row size", () => {
  assert.equal((matchTableRow.match(/<MatchTypeBadge/g) || []).length, 2);
  assert.equal((matchTableRow.match(/size="default"/g) || []).length, 2);
  assert.equal((matchTableRow.match(/match\.options\?\.best_of/g) || []).length, 2);
  assert.equal((matchTableRow.match(/:class="matchTypePillClasses"/g) || []).length, 2);
});

test("match detail uses the status-sized mode badge variant", () => {
  assert.match(matchDetail, /<MatchTypeBadge[\s\S]*size="detail"/);
  assert.match(matchDetail, /const statusBaseClasses =/);
});

test("tournament cards render actual mode names through the shared badge", () => {
  for (const source of [compactTournament, featureTournament]) {
    assert.match(source, /<MatchTypeBadge v-if="matchType" :type="matchType"/);
    assert.doesNotMatch(source, /matchTypeLabel/);
  }
});

test("tournament card mode badges use the same 'default' size as /matches, not the smaller 'compact' variant", () => {
  // TournamentCompactCard backs RecentTournaments (recent/finished cards)
  // and TournamentFeatureCard backs the live/registration/upcoming and
  // filtered-results cards on /tournaments -- both are the single shared
  // source for their respective card's mode badge, so fixing size here
  // fixes every card that renders through them.
  for (const source of [compactTournament, featureTournament]) {
    assert.match(
      source,
      /<MatchTypeBadge v-if="matchType" :type="matchType" size="default" \/>/,
    );
    assert.doesNotMatch(
      source,
      /<MatchTypeBadge v-if="matchType" :type="matchType" size="compact" \/>/,
    );
  }
  // Matches MatchTableRow's own size="default" usage exactly -- same badge
  // component, same size prop, so height/padding/font/radius/tracking are
  // pixel-identical by construction (badgeClasses only branches on `size`).
  assert.equal((matchTableRow.match(/size="default"/g) || []).length, 2);
});

test("homepage results keep mode badge and map context separate", () => {
  assert.match(homepageResults, /function mapContextFor\(match: MatchResult\)/);
  assert.match(homepageResults, /<MatchTypeBadge[\s\S]*:type="match\.options\.type"/);
  assert.match(homepageResults, /{{ mapContextFor\(match\) }}/);
  assert.ok(
    homepageResults.indexOf("<MatchTypeBadge") <
      homepageResults.indexOf("BO{{ match.options?.best_of ?? 1 }}"),
  );
  assert.match(homepageResults, /flex min-w-0 flex-wrap items-center gap-2/);
  assert.doesNotMatch(homepageResults, /function matchContextFor/);
});
