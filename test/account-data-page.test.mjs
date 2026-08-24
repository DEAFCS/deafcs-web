import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The Account & Data page went from a "coming soon" placeholder to a real,
// player-friendly explanation of how accounts, Steam identity, verification,
// and competitive history fit together -- see the DEAFCS Account & Data
// investigation and content-implementation tasks. This locks in the facts
// that matter: no false self-service delete/deactivate claims, competitive
// history framed as separate from account access, verification privacy
// stated accurately, and the placeholder text is gone for good.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/account-data.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const accountData = enLocale.pages.info.account_data;
const faqAccount = enLocale.pages.info.faq.categories.account.items;

test("the placeholder 'coming soon' text is gone", () => {
  assert.doesNotMatch(accountData.intro, /coming soon/i);
  assert.doesNotMatch(JSON.stringify(accountData), /coming soon/i);
});

test("all eight intended sections exist with a title", () => {
  const expected = [
    "your_account",
    "steam_identity",
    "profile_data",
    "verification",
    "competitive_history",
    "access_restrictions",
    "returning",
    "data_requests",
  ];
  for (const key of expected) {
    assert.ok(accountData.sections[key], `missing section: ${key}`);
    assert.ok(
      accountData.sections[key].title,
      `section ${key} has no title`,
    );
    assert.match(pageSource, new RegExp(`sections\\.${key}\\.title`));
  }
});

test("Competitive History section lists the concrete record types", () => {
  const section = accountData.sections.competitive_history;
  const allText = JSON.stringify(section).toLowerCase();
  for (const term of [
    "match",
    "tournament",
    "roster",
    "statistic",
    "elo",
    "standings",
    "award",
    "no-show",
  ]) {
    assert.match(allText, new RegExp(term));
  }
});

test("Competitive History explicitly separates account access from historical records", () => {
  const section = accountData.sections.competitive_history;
  const body = `${section.body_2} ${section.body_3}`;
  assert.match(body, /does not erase/i);
  assert.match(body, /restrict|clos/i);
  // Must not imply that leaving/closing an account wipes stats/history.
  assert.doesNotMatch(body, /erases (your )?(stats|history|matches)/i);
});

test("Steam identity continuity wording exists (one Steam ID = one competitive identity, no fresh reset)", () => {
  const section = accountData.sections.steam_identity;
  const body = `${section.body_1} ${section.body_2}`;
  assert.match(body, /one .*steam account.*one.*(competitive )?identity/i);
  assert.match(body, /clean slate|start over|fresh (stats|elo)/i);
});

test("no false self-service delete/deactivate claims anywhere on the page", () => {
  const allText = JSON.stringify(accountData).toLowerCase();
  // The page must never claim a working delete/deactivate button/feature.
  assert.doesNotMatch(allText, /you can delete your account/);
  assert.doesNotMatch(allText, /click .*deactivate/);
  assert.doesNotMatch(allText, /self-service (account )?(deletion|deactivation)/);
});

test("access restrictions are phrased conceptually, not as a literal feature", () => {
  const section = accountData.sections.access_restrictions;
  const body = `${section.body_1} ${section.body_2}`;
  assert.doesNotMatch(body, /account closure feature/i);
  assert.match(body, /restrict|sanction|ban/i);
});

test("verification section states privacy correctly: private application, public verified status, no fake auto-deletion promise", () => {
  const section = accountData.sections.verification;
  const allText = `${section.body_1} ${section.body_2} ${section.body_3} ${section.body_4}`;
  assert.match(allText, /visible only to you and .*administrators/i);
  assert.match(allText, /shown publicly on your profile/i);
  // Must not promise a retention period or automatic deletion -- not true today.
  assert.doesNotMatch(allText, /deleted after/i);
  assert.doesNotMatch(allText, /automatically (delete|remove|purge)/i);
  assert.doesNotMatch(allText, /not kept longer than necessary/i);
});

test("Data & Privacy Requests is honest about manual handling, no fake self-service export/deletion", () => {
  const section = accountData.sections.data_requests;
  const allText = `${section.body_1} ${section.body_2}`;
  assert.match(allText, /manually/i);
  assert.doesNotMatch(allText, /export your data/i);
  assert.doesNotMatch(allText, /request deletion/i);
});

test("no unsupported legal-certainty phrases anywhere on the page", () => {
  const allText = JSON.stringify(accountData).toLowerCase();
  for (const phrase of [
    "gdpr requires",
    "legal right to",
    "legitimate interest",
    "you waive",
  ]) {
    assert.doesNotMatch(allText, new RegExp(phrase));
  }
});

test("Last Updated is wired through InfoPage the same way as the other Info pages", () => {
  assert.match(pageSource, /:last-updated="\$t\('pages\.info\.account_data\.last_updated_date'\)"/);
  assert.equal(accountData.last_updated_date, "22 August 2026");
});

test("expected internal links exist: General Rules, Matchmaking Rules, Tournament Rules, Contact, Privacy Policy", () => {
  assert.match(pageSource, /to="\/general-rules"/);
  assert.match(pageSource, /to="\/matchmaking-rules"/);
  assert.match(pageSource, /to="\/tournament-rules"/);
  assert.match(pageSource, /to="\/contact"/);
  assert.match(pageSource, /to="\/privacy-policy"/);
});

test("no em dashes in the new Account & Data copy", () => {
  assert.doesNotMatch(JSON.stringify(accountData), /—/);
});

test("styling reuses the shared InfoPage + tactical section pattern, no new component invented", () => {
  assert.match(pageSource, /InfoPage/);
  assert.match(pageSource, /tacticalSectionLabelClasses/);
  assert.match(pageSource, /tacticalSectionTickClasses/);
});

test("FAQ's deactivate_account answer no longer promises a self-service feature that doesn't exist", () => {
  assert.doesNotMatch(faqAccount.deactivate_account.a, /^Yes\./);
  assert.match(faqAccount.deactivate_account.a, /no self-service/i);
});

test("FAQ's historical_records and return_later answers remain consistent with the new page (untouched, already accurate)", () => {
  assert.match(faqAccount.historical_records.a, /historical/i);
  assert.match(faqAccount.return_later.a, /sign back in/i);
});

test("Contact page's Account & Data card description is still accurate (not touched, already matches new content)", () => {
  const contactDescription =
    enLocale.pages.info.contact.account_data.description;
  assert.doesNotMatch(contactDescription, /coming soon/i);
  assert.match(contactDescription, /deactivation|historical|returning/i);
});
