import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The Terms of Service went from a "coming soon" placeholder to real terms
// grounded in the same audited system behavior as Account & Data and
// Privacy Policy. This locks in the facts that matter: no invented legal
// boilerplate (age/CVR/governing law/arbitration), no fake self-service
// delete/deactivate workflow, sanctions don't erase history, prizes are
// organizer-provided (DEAFCS doesn't process payments), and rules pages are
// referenced rather than duplicated.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/terms-of-service.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const terms = enLocale.pages.info.terms_of_service;
const accountData = enLocale.pages.info.account_data;

test("the placeholder 'coming soon' text is gone", () => {
  assert.doesNotMatch(terms.intro, /coming soon/i);
  assert.doesNotMatch(JSON.stringify(terms), /coming soon/i);
});

test("all thirteen intended sections exist with a title", () => {
  const expected = [
    "acceptance",
    "eligibility_accounts",
    "steam_identity",
    "verification",
    "fair_play",
    "sanctions",
    "teams_tournaments",
    "prizes_awards",
    "content_you_provide",
    "competitive_history",
    "service_availability",
    "changes",
    "contact",
  ];
  for (const key of expected) {
    assert.ok(terms.sections[key], `missing section: ${key}`);
    assert.ok(terms.sections[key].title, `section ${key} has no title`);
    assert.match(pageSource, new RegExp(`sections\\.${key}\\.title`));
  }
});

test("Steam identity continuity wording exists and matches Account & Data", () => {
  const section = terms.sections.steam_identity;
  const allText = Object.values(section).join(" ");
  assert.match(allText, /one steam account corresponds to one deafcs competitive identity/i);
  assert.match(allText, /clean competitive reset/i);
  assert.match(allText, /do(es)? not create a fresh competitive record/i);
  // Consistency check against the committed Account & Data page.
  const accountText = Object.values(accountData.sections.steam_identity).join(" ");
  assert.match(accountText, /one dea?fcs competitive identity/i);
});

test("verification requires truthful information and references General Rules for consequences, without inventing a revoke workflow", () => {
  const section = terms.sections.verification;
  const allText = Object.values(section).join(" ");
  assert.match(allText, /must be truthful and accurate/i);
  assert.match(allText, /false or misleading/i);
  assert.match(allText, /apply sanctions/i);
  assert.doesNotMatch(allText, /revoked verification/i);
  assert.doesNotMatch(allText, /application (is|content is) (public|visible to other)/i);
});

test("rules are referenced, not duplicated: General/Matchmaking/Tournament Rules links exist", () => {
  assert.match(pageSource, /to="\/general-rules"/);
  assert.match(pageSource, /to="\/matchmaking-rules"/);
  assert.match(pageSource, /to="\/tournament-rules"/);
});

test("sanctions do not erase history and cannot be bypassed by an identity reset", () => {
  const section = terms.sections.sanctions;
  const allText = Object.values(section).join(" ");
  assert.match(allText, /do not erase historical competitive records/i);
  assert.match(allText, /can't be bypassed by attempting to reset/i);
  // Must not claim bans block Steam login -- that would be false.
  assert.doesNotMatch(allText, /block(s)? .*steam login|prevent(s)? .*sign(ing)? in/i);
});

test("Competitive & Historical Records section exists and matches Account & Data / Privacy framing", () => {
  const section = terms.sections.competitive_history;
  const allText = Object.values(section).join(" ").toLowerCase();
  for (const term of ["match", "tournament", "statistic", "elo", "standings", "award"]) {
    assert.match(allText, new RegExp(term));
  }
  assert.match(allText, /do(es)? not automatically erase/i);
  assert.match(allText, /cannot demand a competitive reset/i);
});

test("no fake self-service delete/deactivate workflow is promised anywhere on the page", () => {
  const allText = JSON.stringify(terms).toLowerCase();
  assert.doesNotMatch(allText, /you can (delete|deactivate) your account/);
  assert.doesNotMatch(allText, /self-service (account )?(deletion|deactivation)/);
});

test("no invented age/CVR/governing-law/arbitration/liability/warranty text", () => {
  const allText = JSON.stringify(terms).toLowerCase();
  for (const phrase of [
    "years of age",
    "years old",
    "minimum age",
    "cvr",
    "governing law",
    "jurisdiction",
    "arbitration",
    "indemnif",
    "warrant",
    "liability is limited",
    "limitation of liability",
  ]) {
    assert.doesNotMatch(allText, new RegExp(phrase));
  }
});

test("prizes wording does not promise payment processing or a financial guarantee", () => {
  const section = terms.sections.prizes_awards;
  const allText = Object.values(section).join(" ").toLowerCase();
  assert.match(allText, /organizer.*(responsible|providing)/);
  assert.match(allText, /does not process payments/);
  assert.doesNotMatch(allText, /deafcs guarantees/);
  assert.doesNotMatch(allText, /tax/);
  assert.doesNotMatch(allText, /payout deadline/);
});

test("content section covers only real upload types and doesn't invent a broad IP license clause", () => {
  const section = terms.sections.content_you_provide;
  const allText = Object.values(section).join(" ").toLowerCase();
  assert.match(allText, /avatar/);
  assert.doesNotMatch(allText, /irrevocable.*license|perpetual.*license|worldwide.*license/);
});

test("service availability wording exists and makes no extreme warranty-disclaimer claims", () => {
  const section = terms.sections.service_availability;
  const allText = Object.values(section).join(" ").toLowerCase();
  assert.match(allText, /downtime|maintenance/);
  assert.match(allText, /not guaranteed|isn't guaranteed/);
});

test("Privacy Policy, Account & Data, and Contact links exist", () => {
  assert.match(pageSource, /to="\/privacy-policy"/);
  assert.match(pageSource, /to="\/account-data"/);
  assert.match(pageSource, /to="\/contact"/);
});

test("Last Updated is wired through InfoPage the same way as the other Info pages", () => {
  assert.match(
    pageSource,
    /:last-updated="\$t\('pages\.info\.terms_of_service\.last_updated_date'\)"/,
  );
  assert.equal(terms.last_updated_date, "22 August 2026");
});

test("no em dashes in the new Terms copy", () => {
  assert.doesNotMatch(JSON.stringify(terms), /—/);
});

test("styling reuses the shared InfoPage + tactical section pattern, no new component invented", () => {
  assert.match(pageSource, /InfoPage/);
  assert.match(pageSource, /tacticalSectionLabelClasses/);
  assert.match(pageSource, /tacticalSectionTickClasses/);
});
