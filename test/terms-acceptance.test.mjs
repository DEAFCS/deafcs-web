import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the Terms-acceptance page and the auth.global.ts gate that routes
// authenticated-but-unaccepted players to it: checkbox defaults unchecked,
// the Accept button is gated on it, Privacy is a separate notice (not part
// of the agreement wording), the middleware exempts the page itself (no
// redirect loop) and reuses isPublicRoute as the exemption list, and the
// live acceptance state is sourced from the me/player subscription data,
// not a one-off fetch.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const pageSource = await read("../pages/terms-acceptance.vue");
const middleware = await read("../middleware/auth.global.ts");
const authStore = await read("../stores/AuthStore.ts");
const meGraphql = await read("../graphql/meGraphql.ts");
const enLocale = JSON.parse(await read("../i18n/locales/en.json"));
const copy = enLocale.pages.terms_acceptance;

test("the page exists with the expected copy keys", () => {
  assert.ok(copy, "pages.terms_acceptance is missing from en.json");
  for (const key of [
    "title",
    "intro",
    "checkbox_label",
    "terms_of_service",
    "general_rules",
    "matchmaking_rules",
    "tournament_rules",
    "privacy_notice",
    "privacy_policy",
    "accept_button",
    "logout",
    "error",
  ]) {
    assert.ok(copy[key], `missing pages.terms_acceptance.${key}`);
  }
});

test("the checkbox is not pre-checked", () => {
  assert.match(pageSource, /const agreed = ref\(false\)/);
  assert.doesNotMatch(pageSource, /agreed = ref\(true\)/);
});

test("the Accept button is disabled until the checkbox is checked, and shows a loading state", () => {
  assert.match(pageSource, /:disabled="!agreed \|\| submitting"/);
  assert.match(pageSource, /submitting/);
});

test("Terms of Service and the three rules pages are linked", () => {
  for (const to of [
    "/terms-of-service",
    "/general-rules",
    "/matchmaking-rules",
    "/tournament-rules",
  ]) {
    assert.match(pageSource, new RegExp(`to="${to.replace("/", "\\/")}"`));
  }
});

test("Privacy Policy is a separate notice, not inside the agreement checkbox wording", () => {
  // The checkbox's own label text must not mention Privacy at all --
  // Privacy is surfaced via its own i18n-t block referencing privacy_notice.
  assert.doesNotMatch(copy.checkbox_label, /privacy/i);
  assert.match(pageSource, /pages\.terms_acceptance\.privacy_notice/);
  assert.match(pageSource, /to="\/privacy-policy"/);
});

test("only one legal checkbox exists on the page", () => {
  assert.equal((pageSource.match(/<Checkbox/g) ?? []).length, 1);
});

test("a failed acceptance mutation shows an inline, retryable error and stays on the page", () => {
  assert.match(pageSource, /catch \(error: any\)/);
  assert.match(pageSource, /errorMessage\.value = error\?\.message/);
  assert.doesNotMatch(pageSource, /catch[\s\S]{0,80}navigateTo/);
});

test("a successful acceptance forces a real refetch (not the short-circuiting getMe) before redirecting", () => {
  // getMe() returns the stale cached value once hasCheckedSession is true
  // (true from initial page load) instead of refetching -- only fetchMe()
  // forces a network-only refetch, so the middleware's
  // hasAcceptedCurrentTerms check on the next navigation is guaranteed
  // current rather than racing the live subscription's socket round trip.
  assert.match(pageSource, /acceptTerms: \[\{\}, \{ success: true \}\]/);
  assert.match(pageSource, /useAuthStore\(\)\.fetchMe\(\)/);
  assert.doesNotMatch(pageSource, /useAuthStore\(\)\.getMe\(\)/);
  assert.match(pageSource, /decoded\.startsWith\("\/"\) && !decoded\.startsWith\("\/\/"\)/);
  // fetchMe must run to completion (awaited) before navigateTo fires.
  assert.match(
    pageSource,
    /await useAuthStore\(\)\.fetchMe\(\);\s*\n\s*await navigateTo/,
  );
});

test("AuthStore exposes fetchMe (not just the short-circuiting getMe) so callers can force a real refetch", () => {
  assert.match(authStore, /fetchMe,/);
  assert.match(authStore, /function fetchMe\(\): Promise<boolean>/);
});

test("logout remains available on the page", () => {
  assert.match(pageSource, /logout: \[\{\}, \{ success: true \}\]/);
  assert.match(pageSource, /useAuthStore\(\)\.clearMe\(\)/);
});

test("has_accepted_current_terms is requested in the shared me/player field selection", () => {
  assert.match(meGraphql, /has_accepted_current_terms: true/);
});

test("AuthStore exposes a hasAcceptedCurrentTerms computed sourced from live me data", () => {
  assert.match(
    authStore,
    /hasAcceptedCurrentTerms = computed\(\s*\(\) => me\.value\?\.has_accepted_current_terms === true,?\s*\)/,
  );
  assert.match(authStore, /hasAcceptedCurrentTerms,/);
});

test("the middleware gates authenticated-unaccepted players to /terms-acceptance, reusing isPublicRoute as the exemption list", () => {
  assert.match(middleware, /to\.path !== "\/terms-acceptance"/);
  assert.match(middleware, /!isPublicRoute\(to\.path\)/);
  assert.match(middleware, /useAuthStore\(\)\.hasAcceptedCurrentTerms/);
  assert.match(middleware, /navigateTo\(\s*`\/terms-acceptance/);
});

test("no redirect loop: the terms gate explicitly excludes its own route", () => {
  const gateBlock = middleware.slice(middleware.indexOf("Terms re-acceptance gate"));
  assert.match(gateBlock, /to\.path !== "\/terms-acceptance"/);
});

test("legal/public routes referenced by the acceptance page remain in the public allowlist", () => {
  for (const path of [
    "/terms-of-service",
    "/privacy-policy",
    "/general-rules",
    "/matchmaking-rules",
    "/tournament-rules",
    "/account-data",
    "/contact",
  ]) {
    assert.match(middleware, new RegExp(`["']${path.replace("/", "\\/")}["']`));
  }
});

test("no em dashes in the new Terms-acceptance copy", () => {
  assert.doesNotMatch(JSON.stringify(copy), /—/);
});
