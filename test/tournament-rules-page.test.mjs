import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tournament Rules was audited against the current tournament implementation
// (attendance check-in, Solo Random generation, waitlist/"Not selected",
// schedule lock, Auto Start/projected bracket times, prizes/awards) and
// updated to describe it accurately. These tests pin the sections/copy that
// must not silently disappear or regress.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/tournament-rules.vue");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const sections = enLocale.pages.info.tournament_rules.sections;

test("Tournament Check-In & Attendance is its own section, separate from Match Check-In", () => {
  assert.ok(sections.attendance, "attendance section must exist");
  assert.match(sections.attendance.title, /Attendance/);
  assert.match(sections.attendance.body_1, /separate from Match Check-In/i);
  assert.match(sections.check_in.body_1, /separate from Tournament Attendance/i);
  assert.match(pageSource, /sections\.attendance\.title/);
  assert.match(pageSource, /sections\.check_in\.title/);
});

test("Solo Random Tournaments section exists and covers individual registration", () => {
  assert.ok(sections.solo_random, "solo_random section must exist");
  assert.match(sections.solo_random.title, /Solo Random/);
  assert.match(sections.solo_random.body_1, /without needing a premade team/i);
  assert.match(pageSource, /sections\.solo_random\.title/);
});

test("generated teams and individual signup are described without a separate team check-in", () => {
  assert.match(sections.solo_random.body_3, /automatically grouped into new teams/i);
  assert.match(sections.solo_random.body_3, /don't need a separate team check-in/i);
});

test("Solo Random ELO balancing is described", () => {
  assert.match(sections.solo_random.body_4, /ELO/);
});

test("'Not selected' is distinguished from no-show", () => {
  assert.match(sections.solo_random.item_3, /Not selected/);
  assert.match(sections.solo_random.item_3, /isn't a no-show/i);
  assert.match(sections.cancellation.body_3, /is not a no-show/i);
  assert.match(sections.cancellation.body_3, /Solo Random/);
});

test("waitlist promotion before finalization is explained", () => {
  assert.match(sections.solo_random.item_2, /waitlist/i);
  assert.match(sections.solo_random.item_2, /promoted/i);
});

test("schedule lock explanation exists", () => {
  assert.match(
    sections.scheduling.body_3,
    /check-in window has opened.*can no longer be changed/i,
  );
});

test("Auto Start / projected bracket time clarification exists", () => {
  assert.match(sections.scheduling.body_4, /Auto Start/);
  assert.match(sections.scheduling.body_4, /projected|estimate/i);
});

test("Prizes & Awards section exists and covers authoritative per-tournament config", () => {
  assert.match(sections.awards.title, /Prizes/);
  assert.match(sections.awards.body_4, /tournament page is the authoritative source/i);
  assert.match(sections.awards.body_5, /final official result/i);
});

test("Check This Tournament's Settings lists the new configurable options", () => {
  const items = Object.entries(sections.settings_note)
    .filter(([key]) => key.startsWith("item_"))
    .map(([, value]) => value);
  assert.ok(items.some((item) => /Solo Random/.test(item)));
  assert.ok(items.some((item) => /attendance window/i.test(item)));
  assert.ok(items.some((item) => /Auto Start/.test(item)));
  assert.ok(items.some((item) => /Prizes/i.test(item)));
});

test("section titles are sequentially numbered with no gaps or duplicates", () => {
  const titles = Object.values(sections).map((section) => section.title);
  const numbers = titles.map((title) => Number(title.match(/^(\d+)\./)[1]));
  assert.deepEqual(numbers, Array.from({ length: numbers.length }, (_, i) => i + 1));
});

test("no em dashes in tournament rules copy", () => {
  const flat = JSON.stringify(sections);
  assert.doesNotMatch(flat, /—/);
  assert.doesNotMatch(enLocale.pages.info.tournament_rules.intro, /—/);
  assert.doesNotMatch(enLocale.pages.info.tournament_rules.intro_2, /—/);
});

test("last updated date was bumped", () => {
  assert.equal(enLocale.pages.info.tournament_rules.last_updated_date, "10 October 2026");
});

test("every $t/i18n-t key referenced by the page exists in en.json", () => {
  const keyPattern = /pages\.info\.tournament_rules\.sections\.([a-z_]+)\.([a-z0-9_]+)/g;
  const missing = [];
  for (const match of pageSource.matchAll(keyPattern)) {
    const [, section, field] = match;
    if (!sections[section] || sections[section][field] === undefined) {
      missing.push(`${section}.${field}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("Roster Images section renders with an anchor for the profile link", () => {
  assert.ok(sections.roster_images, "roster_images section must exist");
  assert.match(sections.roster_images.title, /Roster Images/);
  assert.match(pageSource, /sections\.roster_images\.title/);
  assert.match(pageSource, /id="roster-images"/);
  // Placed after Substitutes and before Tournament Check-In & Attendance.
  assert.ok(
    pageSource.indexOf("sections.substitutes.title") <
      pageSource.indexOf("sections.roster_images.title") &&
      pageSource.indexOf("sections.roster_images.title") <
        pageSource.indexOf("sections.attendance.title"),
  );
});

test("Roster Images rule states what is required, prohibited, allowed and enforced", () => {
  const ri = sections.roster_images;
  assert.match(ri.body_1, /Use an image of yourself/);
  assert.match(ri.body_2, /another person's face/);
  assert.match(ri.body_2, /celebrity or professional player/);
  assert.match(ri.body_2, /AI-generated or fake identity/);
  assert.match(ri.body_3, /cropping.*background removal.*allowed/i);
  assert.match(ri.body_4, /staff may remove roster images/i);
});

test("Roster Images and profile hint copy contain no em dash", () => {
  const copy = JSON.stringify([
    sections.roster_images,
    enLocale.avatar.roster_rules_hint,
  ]);
  assert.doesNotMatch(copy, /—/);
});
