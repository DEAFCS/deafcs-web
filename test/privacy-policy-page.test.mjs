import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The Privacy Policy went from a "coming soon" placeholder to a real policy
// grounded in the actual DEAFCS verification/data-inventory audits. This
// locks in the facts that matter: no false retention/self-service claims,
// verification privacy stated accurately, consistency with Account & Data
// on Steam identity/competitive-history framing, and only the third-party
// services actually integrated are named.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/privacy-policy.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const privacy = enLocale.pages.info.privacy_policy;
const accountData = enLocale.pages.info.account_data;
const generalRulesVerification =
  enLocale.pages.info.general_rules.sections.verification;

test("the placeholder 'coming soon' text is gone", () => {
  assert.doesNotMatch(privacy.intro, /coming soon/i);
  assert.doesNotMatch(JSON.stringify(privacy), /coming soon/i);
});

test("all twelve intended sections exist with a title", () => {
  const expected = [
    "who_we_are",
    "information_we_collect",
    "how_we_use_information",
    "verification",
    "competitive_history",
    "public_information",
    "third_party_services",
    "data_retention",
    "your_choices",
    "security",
    "changes",
    "contact",
  ];
  for (const key of expected) {
    assert.ok(privacy.sections[key], `missing section: ${key}`);
    assert.ok(privacy.sections[key].title, `section ${key} has no title`);
    assert.match(pageSource, new RegExp(`sections\\.${key}\\.title`));
  }
});

test("sections render in strict numeric order in the template (1 through 12), not just exist", () => {
  // A prior layout bug paired Security (10) with Public Information (6) for
  // visual balance without checking numeric order, so Security rendered
  // between sections 6 and 7 even though the title text itself says "10.".
  // Presence alone doesn't catch that -- assert each section's first
  // reference in the template source appears strictly after the previous
  // section's, in numeric order.
  const orderedKeys = [
    "who_we_are",
    "information_we_collect",
    "how_we_use_information",
    "verification",
    "competitive_history",
    "public_information",
    "third_party_services",
    "data_retention",
    "your_choices",
    "security",
    "changes",
    "contact",
  ];
  let previousIndex = -1;
  let previousKey = null;
  for (const key of orderedKeys) {
    const marker = `sections.${key}.title`;
    const index = pageSource.indexOf(marker);
    assert.notEqual(index, -1, `no reference to ${marker} found in template`);
    assert.ok(
      index > previousIndex,
      `section "${key}" (numbered after "${previousKey}") renders before it in the template -- expected strictly increasing source position`,
    );
    previousIndex = index;
    previousKey = key;
  }
});

test("verification section states the private/public distinction accurately", () => {
  const section = privacy.sections.verification;
  const allText = Object.values(section).join(" ");
  assert.match(allText, /visible only to you and to authorized/i);
  assert.match(allText, /may be shown publicly on your profile/i);
  assert.match(allText, /application details themselves are never made public/i);
});

test("verification section makes no false automatic-deletion or video-storage promise", () => {
  const allText = Object.values(privacy.sections.verification).join(" ");
  assert.doesNotMatch(allText, /automatically (delete|remove|purge)/i);
  assert.doesNotMatch(allText, /deleted after/i);
  assert.doesNotMatch(allText, /not kept longer than necessary/i);
  assert.doesNotMatch(allText, /only the final status is (retained|stored|kept)/i);
  assert.doesNotMatch(allText, /video|webcam recording/i);
  assert.match(allText, /retained unless an administrator manually removes/i);
});

test("Competitive & Historical Records section exists and matches Account & Data's framing", () => {
  const section = privacy.sections.competitive_history;
  const allText = Object.values(section).join(" ").toLowerCase();
  for (const term of ["match", "tournament", "roster", "statistic", "elo", "standings", "award"]) {
    assert.match(allText, new RegExp(term));
  }
  assert.match(allText, /do(es)? not automatically erase/i);
  assert.match(allText, /reset its history and start over|start over/i);
});

test("no false self-service deletion, deactivation, or export promise anywhere on the page", () => {
  const allText = JSON.stringify(privacy).toLowerCase();
  // The one mention of these terms must be the honest denial, not an offer.
  assert.doesNotMatch(allText, /you can (delete|deactivate) your account/);
  assert.doesNotMatch(allText, /export your data/);
  assert.match(allText, /does not currently offer self-service account deletion, deactivation, or data export/);
});

test("retention wording is factual, not an invented fixed period, and flags no-automatic-schedule categories", () => {
  const section = privacy.sections.data_retention;
  const allText = Object.values(section).join(" ");
  assert.match(allText, /no automatic deletion schedule/i);
  assert.doesNotMatch(allText, /after \d+ (day|month|year)/i);
  // Chat's real ~24h TTL is the one confirmed exception -- must be stated, not a random number.
  assert.match(allText, /24 hours/);
});

test("no unsupported legal-certainty phrases anywhere on the page", () => {
  const allText = JSON.stringify(privacy).toLowerCase();
  for (const phrase of [
    "gdpr requires",
    "legitimate interest",
    "legal right to",
    "you waive",
    "industry-leading security",
    "100% secure",
  ]) {
    assert.doesNotMatch(allText, new RegExp(phrase));
  }
});

test("third-party services section names only services actually integrated, and excludes the confirmed non-integrations", () => {
  const section = privacy.sections.third_party_services;
  const allText = Object.values(section).join(" ").toLowerCase();
  for (const service of ["steam", "discord", "typesense", "backblaze", "web push", "twitch", "youtube", "kick", "google tag manager"]) {
    assert.match(allText, new RegExp(service));
  }
  for (const notIntegrated of ["one.com", "captcha", "google analytics", "plausible", "posthog"]) {
    assert.doesNotMatch(allText, new RegExp(notIntegrated));
  }
});

test("Google Tag Manager is described as admin-controlled, not broad tracking", () => {
  const allText = JSON.stringify(privacy.sections.third_party_services);
  assert.match(allText, /only active if enabled by DEAFCS administrators/);
});

test("Steam identity / competitive-history wording is consistent with Account & Data (no contradiction)", () => {
  const privacyText = Object.values(privacy.sections.competitive_history).join(" ");
  const accountText = Object.values(accountData.sections.competitive_history).join(" ");
  // Both must express the same "account changes don't erase history" principle.
  assert.match(privacyText, /do(es)? not automatically erase historical competition records/i);
  assert.match(accountText, /does not erase matches, tournament results/i);
});

test("Last Updated is wired through InfoPage the same way as the other Info pages", () => {
  assert.match(
    pageSource,
    /:last-updated="\$t\('pages\.info\.privacy_policy\.last_updated_date'\)"/,
  );
  assert.equal(privacy.last_updated_date, "23 August 2026");
});

test("discloses the new Terms acceptance record data category", () => {
  const section = privacy.sections.information_we_collect;
  assert.match(section.item_7, /Terms.*version.*accepted/i);
  assert.match(pageSource, /information_we_collect\.item_7/);
});

test("Contact and Account & Data links are wired structurally", () => {
  assert.match(pageSource, /to="\/contact"/);
  assert.match(pageSource, /to="\/account-data"/);
});

test("no em dashes in the new Privacy Policy copy", () => {
  assert.doesNotMatch(JSON.stringify(privacy), /—/);
});

test("styling reuses the shared InfoPage + tactical section pattern, no new component invented", () => {
  assert.match(pageSource, /InfoPage/);
  assert.match(pageSource, /tacticalSectionLabelClasses/);
  assert.match(pageSource, /tacticalSectionTickClasses/);
});

test("General Rules verification wording no longer contradicts reality (the false 'not kept longer than necessary' claim is removed)", () => {
  assert.doesNotMatch(generalRulesVerification.body_4, /not kept longer than necessary/i);
  // The minimal fix must not have deleted the surrounding, still-accurate sentence.
  assert.match(generalRulesVerification.body_4, /reviewed only by authorized staff/i);
  assert.match(generalRulesVerification.body_4, /remain private/i);
});
