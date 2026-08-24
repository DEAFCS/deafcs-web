import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Bracket cards carry two timestamps that mean opposite things:
//
//   scheduled_at  - a real committed schedule (organizer dialog, league
//                   fixture, accepted negotiated time)
//   scheduled_eta - a projection recomputed across the whole tournament by
//                   calculate_tournament_bracket_start_times whenever anything
//                   moves, and only while the tournament is Live
//
// The projection used to render as "Scheduled for / in 1 hour", which reads as
// a promise. With auto start on, the match actually begins the moment its
// feeders resolve. These tests pin the three-case display rule and, crucially,
// that genuinely empty future cards stay blank.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const matchSource = await read("../components/tournament/TournamentMatch.vue");
const embedSource = await read(
  "../pages/embed/tournaments/[tournamentId]/bracket.vue",
);
const detailSource = await read("../components/tournament/TournamentDetail.vue");
const bracketViewerSource = await read(
  "../components/tournament/TournamentBracketViewer.vue",
);
const swissViewerSource = await read(
  "../components/tournament/SwissBracketViewer.vue",
);
const etaFunctionSource = await read(
  "../../api-deafcs/hasura/functions/tournaments/tournament_bracket_eta.sql",
);
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));

// Mirrors the component's predicates so the matrix can be exercised directly.
// Kept in lockstep with the source by the assertions in the first test.
const hasProjectedEta = (b) => !b.match && !b.scheduled_at && !!b.scheduled_eta;
const participantsKnown = (b) => !!b.team_1 && !!b.team_2;
const showWaitingForTeams = (b, t) =>
  hasProjectedEta(b) && !!t?.auto_start && !participantsKnown(b);
const showProjectedEta = (b, t) => hasProjectedEta(b) && !t?.auto_start;
const showRealSchedule = (b) => !!b.scheduled_at && !b.match;

// What the card renders, as one of four outcomes.
const render = (b, t) => {
  if (showRealSchedule(b)) return "scheduled";
  if (showWaitingForTeams(b, t)) return "waiting";
  if (showProjectedEta(b, t)) return "eta";
  return "blank";
};

const AUTO = { auto_start: true };
const MANUAL = { auto_start: false };
const TEAMS = { team_1: { id: "a" }, team_2: { id: "b" } };

// --- the predicates in the component match the ones modelled here ------------

test("the component defines the same three predicates", () => {
  assert.match(
    matchSource,
    /const hasProjectedEta = \(bracket: Bracket\) =>\s*\n\s*!bracket\.match && !bracket\.scheduled_at && !!bracket\.scheduled_eta;/,
  );
  assert.match(
    matchSource,
    /const participantsKnown = \(bracket: Bracket\) =>\s*\n\s*!!bracket\.team_1 && !!bracket\.team_2;/,
  );
  assert.match(
    matchSource,
    /showWaitingForTeams[\s\S]{0,180}hasProjectedEta\(bracket\)[\s\S]{0,120}auto_start[\s\S]{0,80}!participantsKnown\(bracket\)/,
  );
  assert.match(
    matchSource,
    /showProjectedEta[\s\S]{0,120}hasProjectedEta\(bracket\)[\s\S]{0,80}!props\.tournament\?\.auto_start/,
  );
});

// --- the test matrix ---------------------------------------------------------

test("1. pre-start, no schedule, participants unknown -> blank", () => {
  // Before the tournament is Live the ETA function returns early, so no
  // projection exists. The card must stay empty, not say "Waiting for teams".
  assert.equal(render({}, AUTO), "blank");
  assert.equal(render({ team_1: { id: "a" } }, AUTO), "blank");
});

test("2. pre-start explicit organizer schedule -> real countdown", () => {
  assert.equal(render({ scheduled_at: "2026-01-01T18:00:00Z" }, AUTO), "scheduled");
});

test("3. auto start, projection, participants unknown -> waiting for teams", () => {
  assert.equal(
    render({ scheduled_eta: "2026-01-01T19:00:00Z" }, AUTO),
    "waiting",
  );
});

test("4. auto start, projection, one team known -> waiting for teams", () => {
  assert.equal(
    render(
      { scheduled_eta: "2026-01-01T19:00:00Z", team_1: { id: "a" } },
      AUTO,
    ),
    "waiting",
  );
});

test("5. auto start, projection, both teams known -> blank, real status takes over", () => {
  assert.equal(
    render({ scheduled_eta: "2026-01-01T19:00:00Z", ...TEAMS }, AUTO),
    "blank",
  );
});

test("6. explicit schedule with participants unknown -> real countdown", () => {
  // A real schedule is meaningful even before the feeders resolve.
  assert.equal(
    render(
      { scheduled_at: "2026-01-01T18:00:00Z", scheduled_eta: "2026-01-01T19:00:00Z" },
      AUTO,
    ),
    "scheduled",
  );
});

test("7. negotiated/accepted time is a real schedule -> real countdown", () => {
  // Negotiated acceptance writes bracket.scheduled_at, the same column the
  // organizer dialog writes, so it takes the same branch.
  assert.equal(render({ scheduled_at: "2026-01-01T20:00:00Z" }, AUTO), "scheduled");
});

test("8. explicitly scheduled 3rd/4th place -> real countdown", () => {
  assert.equal(
    render({ scheduled_at: "2026-01-01T23:00:00Z", path: "LB" }, AUTO),
    "scheduled",
  );
});

test("9. auto start OFF -> existing projection display unchanged", () => {
  assert.equal(
    render({ scheduled_eta: "2026-01-01T19:00:00Z" }, MANUAL),
    "eta",
  );
  assert.equal(
    render({ scheduled_eta: "2026-01-01T19:00:00Z", ...TEAMS }, MANUAL),
    "eta",
  );
  // A real schedule still wins with auto start off.
  assert.equal(
    render({ scheduled_at: "2026-01-01T18:00:00Z" }, MANUAL),
    "scheduled",
  );
});

test("10. deeper bracket: only projected cards change, empty ones stay blank", () => {
  const round2Projected = { scheduled_eta: "2026-01-01T19:00:00Z" };
  const round3Empty = {};
  const finalEmpty = {};
  assert.equal(render(round2Projected, AUTO), "waiting");
  assert.equal(render(round3Empty, AUTO), "blank");
  assert.equal(render(finalEmpty, AUTO), "blank");
});

test("a materialized match never shows either timing line", () => {
  // Once bracket.match exists the card shows real match status instead.
  assert.equal(
    render({ match: { id: "m" }, scheduled_eta: "2026-01-01T19:00:00Z" }, AUTO),
    "blank",
  );
  assert.equal(
    render({ match: { id: "m" }, scheduled_at: "2026-01-01T18:00:00Z" }, AUTO),
    "blank",
  );
});

// --- presentation ------------------------------------------------------------

test("the copy is the dependency, with no timer and no fake time", () => {
  assert.equal(enLocale.tournament.match.waiting_for_teams, "Waiting for teams");
  const block = matchSource.slice(
    matchSource.indexOf('v-else-if="showWaitingForTeams(bracket)"'),
    matchSource.indexOf('v-else-if="showProjectedEta(bracket)"'),
  );
  assert.match(block, /tournament\.match\.waiting_for_teams/);
  // No countdown rendered in that branch.
  assert.doesNotMatch(block, /TimeAgo/);
  // Not the green a real schedule uses.
  assert.doesNotMatch(block, /text-green/);
  assert.match(block, /text-blue-400/);
});

test("banned wording is absent from the new copy", () => {
  const copy = enLocale.tournament.match.waiting_for_teams;
  assert.doesNotMatch(copy, /asap/i);
  assert.doesNotMatch(copy, /\bin \d/i);
  assert.doesNotMatch(copy, /\bhour/i);
  assert.doesNotMatch(copy, /scheduled/i);
  // The existing projection label is untouched for the auto-start-off case.
  assert.equal(enLocale.tournament.match.scheduled_for, "Scheduled for");
  assert.equal(enLocale.common.scheduled, "Scheduled");
});

test("the real-schedule branch is untouched", () => {
  const block = matchSource.slice(
    matchSource.indexOf('v-if="hasRealSchedule(bracket) && !bracket.match"'),
    matchSource.indexOf('v-else-if="showWaitingForTeams(bracket)"'),
  );
  assert.match(block, /common\.scheduled/);
  assert.match(block, /text-green-400/);
  assert.match(block, /<TimeAgo :date="bracket\.scheduled_at">/);
});

// --- shared across formats ---------------------------------------------------

test("one shared card serves every bracket format", () => {
  // Single/Double Elimination and placement brackets render through
  // TournamentBracketViewer; Swiss through SwissBracketViewer. Both use the
  // same TournamentMatch card, so this is one fix, not per-format patches.
  for (const source of [bracketViewerSource, swissViewerSource]) {
    assert.match(source, /import TournamentMatch from/);
    assert.match(source, /:tournament="tournament"/);
  }
});

test("auto_start is available wherever the card renders", () => {
  // Both surfaces that mount the viewers must query it, or the gate silently
  // falls back to the old projection display.
  assert.match(detailSource, /auto_start: true/);
  assert.match(embedSource, /auto_start: true/);
});

// --- the backend distinction this relies on ----------------------------------

test("scheduled_eta really is a recomputed projection, not a commitment", () => {
  // Wiped and recomputed for the whole tournament, and only while Live --
  // which is why the misleading text only appeared after the tournament
  // started, and why pre-start cards are blank.
  assert.match(etaFunctionSource, /IF tournament_status != 'Live' THEN\s*\n\s*RETURN;/);
  assert.match(etaFunctionSource, /UPDATE tournament_brackets\s*\n\s*SET scheduled_eta = NULL/);
});
