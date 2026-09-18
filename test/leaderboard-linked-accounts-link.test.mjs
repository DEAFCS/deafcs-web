import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const externalRankLeaderboard = await read(
  "components/leaderboard/ExternalRankLeaderboard.vue",
);
const leaderboardPage = await read("pages/leaderboard.vue");
const english = JSON.parse(await read("i18n/locales/en.json"));

test("the Linked Accounts helper link only exists in the FACEIT/PREMIER leaderboard component", () => {
  assert.match(externalRankLeaderboard, /to="\/settings\/linked-accounts"/);
  assert.doesNotMatch(leaderboardPage, /\/settings\/linked-accounts/);
});

test("it is a real internal NuxtLink, not a window.open popup", () => {
  const linkBlock = externalRankLeaderboard.match(
    /<NuxtLink\s+to="\/settings\/linked-accounts"[\s\S]*?<\/NuxtLink>/,
  )?.[0];
  assert.ok(linkBlock, "NuxtLink to linked-accounts not found");
  assert.doesNotMatch(externalRankLeaderboard, /window\.open/);
});

test("it reuses the existing Linked Accounts translation key, not a new duplicate string", () => {
  assert.match(
    externalRankLeaderboard,
    /t\("pages\.settings\.account\.linked_accounts"\)/,
  );
  assert.equal(english.pages.settings.account.linked_accounts, "Linked Accounts");
});

test("it matches the Stats Guide link's subtle text-link style (size, color, dotted underline, hover)", () => {
  const linkBlock = externalRankLeaderboard.match(
    /<NuxtLink\s+to="\/settings\/linked-accounts"[\s\S]*?<\/NuxtLink>/,
  )?.[0];
  assert.match(linkBlock, /text-xs/);
  assert.match(linkBlock, /text-muted-foreground/);
  assert.match(linkBlock, /underline/);
  assert.match(linkBlock, /decoration-dotted/);
  assert.match(linkBlock, /underline-offset-4/);
  assert.match(linkBlock, /hover:text-foreground/);
  // 3.5px icon, matching the Stats Guide ExternalLink icon's h-3 w-3 sizing.
  assert.match(linkBlock, /<Link class="h-3 w-3" \/>/);
});

test("the helper description is present but collapses on small screens, leaving only the link", () => {
  assert.match(
    externalRankLeaderboard,
    /pages\.leaderboard\.external_ranks_linked_accounts_hint/,
  );
  const hintBlock = externalRankLeaderboard.match(
    /<span class="hidden text-xs text-muted-foreground\/70 sm:inline">[\s\S]*?<\/span>/,
  )?.[0];
  assert.ok(hintBlock, "responsive hint span not found");
  assert.match(hintBlock, /hidden/);
  assert.match(hintBlock, /sm:inline/);
  assert.equal(
    english.pages.leaderboard.external_ranks_linked_accounts_hint,
    "Link your accounts for faster and more accurate leaderboard data.",
  );
});
