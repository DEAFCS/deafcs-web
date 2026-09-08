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

// Regression coverage for the production incident: the page queried
// players_aggregate in the same request as players. administrator is only
// ever used as an inherited role (hasura/metadata/inherited_roles.yaml), and
// Hasura does not expose _aggregate root fields for inherited roles even
// though the plain players field works fine -- confirmed against a real
// Hasura instance, reproducing the exact production error verbatim: "field
// 'players_aggregate' not found in type: 'query_root'". Because the query
// threw and nothing caught it, `players` was never reassigned from its `[]`
// initial value, so the page silently rendered "No registered players
// found" instead of any error.
test("the page no longer queries players_aggregate (inherited roles don't expose it)", () => {
  // Matches the GraphQL field-selection usage specifically (players_aggregate
  // as a query key), not the word appearing in an explanatory code comment.
  assert.doesNotMatch(pageSource, /players_aggregate:\s*\[/);
  assert.doesNotMatch(pageSource, /\bplayers_aggregate\s*\{/);
});

test("pagination uses a fetch-one-extra-row pattern instead of a total count", () => {
  assert.match(pageSource, /limit:\s*this\.perPage \+ 1/);
  assert.match(
    pageSource,
    /this\.hasNextPage = rows\.length > this\.perPage;/,
  );
  assert.match(pageSource, /this\.players = rows\.slice\(0, this\.perPage\);/);
  // The old total-count-driven Pagination.vue component required
  // players_aggregate's count; it's gone, replaced by manual Previous/Next.
  assert.doesNotMatch(pageSource, /~\/components\/Pagination\.vue/);
  assert.doesNotMatch(pageSource, /<Pagination\b/);
  assert.match(pageSource, /\{\{ \$t\("common\.previous"\) \}\}/);
  assert.match(pageSource, /\{\{ \$t\("common\.next"\) \}\}/);
  assert.match(pageSource, /:disabled="page === 1 \|\| loading"/);
  assert.match(pageSource, /:disabled="!hasNextPage \|\| loading"/);
});

test("a fetchPlayers query error sets an error state instead of masquerading as an empty result", () => {
  assert.match(pageSource, /error: null as Error \| null/);
  // error is reset at the start of every fetch, so a retry can clear a
  // previous failure.
  assert.match(pageSource, /this\.error = null;/);
  assert.match(
    pageSource,
    /catch \(caught\) \{\s*\n\s*if \(token === this\.searchToken\) \{\s*\n\s*this\.error =/,
  );
  // On error, players is explicitly cleared -- combined with the template
  // ordering check below, this proves the error branch is what renders, not
  // the plain "no players" branch falling through on stale/empty data.
  assert.match(
    pageSource,
    /this\.error =\s*\n?\s*caught instanceof Error[\s\S]{0,80}this\.players = \[\];/,
  );
});

test("the error state renders before the empty state in the template, so a query failure can never be mistaken for zero results", () => {
  const errorBranch = pageSource.indexOf('v-else-if="error"');
  const emptyBranch = pageSource.indexOf('v-else-if="!players.length"');
  assert.ok(errorBranch > 0, "error branch not found");
  assert.ok(emptyBranch > 0, "empty branch not found");
  assert.ok(
    errorBranch < emptyBranch,
    "error branch must appear before the empty-results branch",
  );
  assert.match(pageSource, /pages\.terms_acceptances\.error_title/);
  assert.match(pageSource, /pages\.terms_acceptances\.error_description/);
  assert.match(pageSource, /pages\.terms_acceptances\.retry/);
  // Retry re-runs the same fetch, not a page reload or a different method.
  assert.match(pageSource, /@click="fetchPlayers"/);
});

test("a fetchAcceptances failure degrades Accepted At gracefully instead of failing the whole page", () => {
  const fetchAcceptancesSrc = pageSource.slice(
    pageSource.indexOf("async fetchAcceptances("),
    pageSource.indexOf("},\n  },\n};"),
  );
  assert.match(fetchAcceptancesSrc, /try \{/);
  assert.match(fetchAcceptancesSrc, /catch \(caught\) \{/);
  // It must not set the page-level `error` -- only clear the accepted-at map.
  assert.doesNotMatch(fetchAcceptancesSrc, /this\.error =/);
});

test("error/empty copy keys exist and carry no em dashes", () => {
  for (const key of ["error_title", "error_description", "retry"]) {
    assert.ok(copy[key], `missing pages.terms_acceptances.${key}`);
  }
  assert.doesNotMatch(JSON.stringify(copy), /—/);
});
