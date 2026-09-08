import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the read-only admin "Terms Acceptances" page: who can see it, where
// it lives, that the current Terms version is resolved dynamically (never
// hardcoded), and that no mutation/edit/delete controls exist -- the
// acceptance table is evidence and this page must never write to it.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/terms-acceptances/index.vue");
const leftNav = await read("../layouts/components/LeftNav.vue");
const settingsStore = await read("../stores/ApplicationSettings.ts");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const copy = enLocale.pages.terms_acceptances;

test("the Administration menu links administrators to /terms-acceptances", () => {
  assert.match(leftNav, /:to="\{ name: 'terms-acceptances' \}"/);
  assert.match(
    leftNav,
    /\{\{ \$t\("layouts\.app_nav\.administration\.terms_acceptances"\) \}\}/,
  );
  assert.ok(
    enLocale.layouts.app_nav.administration.terms_acceptances,
    "layouts.app_nav.administration.terms_acceptances is missing from en.json",
  );
  assert.ok(
    enLocale.layouts.app_nav.tooltips.terms_acceptances,
    "layouts.app_nav.tooltips.terms_acceptances is missing from en.json",
  );
});

test("the menu item and the page both gate on isAdmin, matching every other Administration-only entry", () => {
  const itemStart = leftNav.indexOf("name: 'terms-acceptances'");
  const itemBlock = leftNav.slice(
    leftNav.lastIndexOf("<SidebarMenuItem", itemStart),
    itemStart,
  );
  assert.match(itemBlock, /v-if="isAdmin"/);
  assert.match(pageSource, /middleware: "admin"/);
});

test("the route is the file-based /terms-acceptances page, following the same convention as Regions and Manage Application", () => {
  // Nuxt derives the route name from the file path; this is the file that
  // must exist for route name 'terms-acceptances' to resolve.
  assert.ok(pageSource.length > 0);
});

test("the current Terms version is read from the shared settings store, never hardcoded", () => {
  assert.doesNotMatch(pageSource, /2026-08-23/);
  assert.match(pageSource, /useApplicationSettingsStore\(\)\.currentTermsVersion/);
  assert.match(
    settingsStore,
    /currentTermsVersion = computed\(/,
  );
  assert.match(settingsStore, /public\.terms_version/);
  assert.doesNotMatch(pageSource, /["']public\.terms_version["']/);
});

test("registered players are the base scope, excluding Steam-only ghost profiles", () => {
  assert.match(pageSource, /last_sign_in_at:\s*\{\s*_is_null:\s*false\s*\}/);
});

test("accepted vs not-accepted status renders from the players computed field", () => {
  assert.match(pageSource, /has_accepted_current_terms:\s*true/);
  assert.match(pageSource, /player\.has_accepted_current_terms/);
  assert.match(pageSource, /pages\.terms_acceptances\.status\.accepted/);
  assert.match(pageSource, /pages\.terms_acceptances\.status\.not_accepted/);
});

test("search matches by name or, only when numeric, by exact Steam ID", () => {
  assert.match(pageSource, /name:\s*\{\s*_ilike/);
  assert.match(pageSource, /\/\^\\d\+\$\//);
  assert.match(pageSource, /steam_id:\s*\{\s*_eq:\s*query\s*\}/);
});

test("status filter tabs are all, accepted, and not_accepted", () => {
  assert.match(pageSource, /const STATUS_TABS = \["all", "accepted", "not_accepted"\]/);
});

test("the page is strictly read-only: no mutation, delete, or reset controls", () => {
  assert.doesNotMatch(pageSource, /generateMutation/);
  assert.doesNotMatch(pageSource, /\$apollo\.mutate/i);
  assert.doesNotMatch(pageSource, /mutation\s+\w*/i);
  assert.doesNotMatch(pageSource, /<Dialog/);
  assert.doesNotMatch(pageSource, /delete_player_terms_acceptances/);
  assert.doesNotMatch(pageSource, /update_players/);
});

test("the page exists with the expected copy keys", () => {
  assert.ok(copy, "pages.terms_acceptances is missing from en.json");
  for (const key of ["title", "search_placeholder", "empty"]) {
    assert.ok(copy[key], `missing pages.terms_acceptances.${key}`);
  }
  for (const key of ["player", "steam_id", "status", "version", "accepted_at"]) {
    assert.ok(copy.columns[key], `missing pages.terms_acceptances.columns.${key}`);
  }
  for (const key of ["all", "accepted", "not_accepted"]) {
    assert.ok(copy.status[key], `missing pages.terms_acceptances.status.${key}`);
  }
});

test("no em dashes in the new Terms Acceptances copy", () => {
  assert.doesNotMatch(JSON.stringify(copy), /—/);
});

test("the page waits for the canonical current Terms version before fetching or rendering acceptance data", () => {
  // No unconditional mounted() fetch -- the only trigger is the
  // currentTermsVersion watcher below, so a blank/unresolved version can
  // never race the initial query.
  assert.doesNotMatch(pageSource, /mounted\(\)\s*\{\s*this\.fetchPlayers\(\)/);
  assert.match(
    pageSource,
    /currentTermsVersion:\s*\{\s*\n\s*immediate:\s*true,/,
  );
  assert.match(pageSource, /handler\(version: string \| null\)\s*\{\s*\n\s*if \(version\)\s*\{\s*\n\s*this\.fetchPlayers\(\);/);
  assert.match(
    pageSource,
    /async fetchPlayers\(\)\s*\{\s*\n(?:[^\n]*\n)*?\s*if \(!this\.currentTermsVersion\)\s*\{\s*\n\s*return;/,
  );
});
