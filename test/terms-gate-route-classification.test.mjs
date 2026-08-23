import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Regression test for a real production incident: an authenticated player
// who had NOT accepted the current Terms version reached /play and was able
// to click Join Queue -- the frontend gate never redirected them to
// /terms-acceptance at all, so the first sign of anything wrong was the
// backend's raw matchmaking rejection. Root cause: the Terms gate in
// middleware/auth.global.ts reused isPublicRoute as its exemption list.
// isPublicRoute answers "can a guest reach this without logging in", which
// correctly includes /play, /watch, /tournaments, etc. (pages guests may
// browse) -- but those same pages also host real authenticated actions for
// logged-in players, so exempting them from the Terms gate too let an
// unaccepted player reach and use them. It was never a race condition: the
// middleware already awaits the session fetch before deciding anything --
// the exemption list itself was simply wrong for those routes. The fix
// introduces a second, narrow isTermsExemptRoute allowlist containing only
// the routes explicitly approved as reachable without accepting terms.
//
// This suite executes the REAL isAuthTransportRoute / isPublicRoute /
// isTermsExemptRoute functions extracted from the actual middleware source
// (not hand-copied duplicates that could silently drift from it), so a
// future edit that widens isTermsExemptRoute back into isPublicRoute's
// territory -- or reintroduces the same mistake for a new mixed page --
// fails here.

const middlewareSource = await readFile(
  new URL("../middleware/auth.global.ts", import.meta.url),
  "utf8",
);

// Extracts a top-level `function name(...) { ... }` block by brace-matching
// from the real source, then strips the handful of simple TS type
// annotations this file actually uses so it can run as plain JS.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `function ${name} not found in middleware source`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  let end = braceStart;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return source
    .slice(start, end + 1)
    .replace(/\(path: string\)/g, "(path)")
    .replace(/\): boolean/g, ")");
}

const loadedSource = [
  extractFunction(middlewareSource, "isAuthTransportRoute"),
  extractFunction(middlewareSource, "isPublicRoute"),
  extractFunction(middlewareSource, "isTermsExemptRoute"),
  "return { isAuthTransportRoute, isPublicRoute, isTermsExemptRoute };",
].join("\n");

const { isPublicRoute, isTermsExemptRoute } = new Function(loadedSource)();

test("the real isTermsExemptRoute does NOT exempt mixed guest/authenticated pages that isPublicRoute does", () => {
  for (const path of ["/play", "/watch", "/forum", "/tournaments", "/teams"]) {
    assert.equal(
      isPublicRoute(path),
      true,
      `expected isPublicRoute(${path}) to stay true (guests must still reach it)`,
    );
    assert.equal(
      isTermsExemptRoute(path),
      false,
      `expected isTermsExemptRoute(${path}) to be false -- this is the exact bug: ` +
        `an authenticated-unaccepted player reaching ${path} without a Terms redirect`,
    );
  }
});

test("the real isTermsExemptRoute exempts exactly the approved legal/public routes, plus auth transport", () => {
  for (const path of [
    "/terms-of-service",
    "/privacy-policy",
    "/general-rules",
    "/matchmaking-rules",
    "/tournament-rules",
    "/account-data",
    "/contact",
    "/logout",
    "/auth/steam",
  ]) {
    assert.equal(isTermsExemptRoute(path), true, `expected ${path} to be exempt`);
  }
});

// Which classifier function actually gates the Terms redirect, read live
// out of the real middleware source rather than assumed -- this is the
// piece that must be derived, not hardcoded, or this whole suite would
// stay green even if the real call site regressed back to isPublicRoute.
const gateBlock = middlewareSource.slice(
  middlewareSource.indexOf("Terms re-acceptance gate"),
);
const gateFunctionMatch = gateBlock.match(/!(\w+)\(to\.path\)/);
assert.ok(
  gateFunctionMatch,
  "could not find the Terms gate's exemption-check call in the real middleware source",
);
const gateFunctionName = gateFunctionMatch[1];
const gateClassifiers = { isPublicRoute, isTermsExemptRoute };
assert.ok(
  gateClassifiers[gateFunctionName],
  `Terms gate calls ${gateFunctionName}(), which this test doesn't know how to load`,
);
const liveGateExemption = gateClassifiers[gateFunctionName];

// Faithful replica of auth.global.ts's actual decision sequence (verified
// against the real file: it awaits the session fetch before hasMe is used
// anywhere, so "not loaded yet" is never treated as implicitly accepted).
// Deliberately calls liveGateExemption (resolved above from the real source)
// rather than hardcoding isTermsExemptRoute, so a regression that rewires
// the real call site back to isPublicRoute makes this decide() behave like
// the bug again and the tests below fail, instead of silently staying green
// because they exercised a function the middleware no longer actually uses.
async function decide({
  path,
  resolvesTo,
  resolveDelayMs = 0,
  hasAcceptedCurrentTerms,
}) {
  // Step 1: auth transport routes bypass everything (mirrors the early
  // return in the real middleware, before the session fetch even starts).
  const { isAuthTransportRoute } = new Function(
    extractFunction(middlewareSource, "isAuthTransportRoute") +
      "\nreturn { isAuthTransportRoute };",
  )();
  if (isAuthTransportRoute(path)) {
    return { action: "none" };
  }

  // Step 2: the middleware always awaits getMe() before deciding anything
  // else -- this simulates auth/me state being genuinely unresolved at the
  // moment navigation starts, then resolving asynchronously.
  const hasMe = await new Promise((resolve) =>
    setTimeout(() => resolve(resolvesTo), resolveDelayMs),
  );

  if (!hasMe && !isPublicRoute(path) && path !== "/login") {
    return { action: "redirect", target: "/login" };
  }
  if (hasMe && path === "/login") {
    return { action: "redirect", target: "/" };
  }
  if (hasMe && path !== "/terms-acceptance" && !liveGateExemption(path)) {
    if (!hasAcceptedCurrentTerms) {
      return { action: "redirect", target: "/terms-acceptance" };
    }
  }
  return { action: "allow" };
}

test("reproduces the production case: authenticated player, /me unresolved at navigation start, resolves to unaccepted, navigating to /play ends at /terms-acceptance", async () => {
  const result = await decide({
    path: "/play",
    resolvesTo: true,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: false,
  });
  assert.deepEqual(result, { action: "redirect", target: "/terms-acceptance" });
});

test("already-accepted authenticated player navigating to /play is allowed", async () => {
  const result = await decide({
    path: "/play",
    resolvesTo: true,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: true,
  });
  assert.deepEqual(result, { action: "allow" });
});

test("unaccepted authenticated player navigating directly to /terms-acceptance is allowed (no loop)", async () => {
  const result = await decide({
    path: "/terms-acceptance",
    resolvesTo: true,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: false,
  });
  assert.deepEqual(result, { action: "allow" });
});

test("logged-out visitor navigating to /play is unaffected (still allowed, per isPublicRoute)", async () => {
  const result = await decide({
    path: "/play",
    resolvesTo: false,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: false,
  });
  assert.deepEqual(result, { action: "allow" });
});

test("logged-out visitor navigating to a genuinely protected route is sent to /login, not /terms-acceptance", async () => {
  const result = await decide({
    path: "/settings",
    resolvesTo: false,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: false,
  });
  assert.deepEqual(result, { action: "redirect", target: "/login" });
});

test("legal/public routes remain reachable for an unaccepted authenticated player", async () => {
  for (const path of ["/terms-of-service", "/privacy-policy", "/general-rules", "/contact"]) {
    const result = await decide({
      path,
      resolvesTo: true,
      resolveDelayMs: 15,
      hasAcceptedCurrentTerms: false,
    });
    assert.deepEqual(result, { action: "allow" }, `expected ${path} to stay reachable`);
  }
});

test("logout then login as an unaccepted user still redirects to /terms-acceptance on the next protected navigation", async () => {
  // Simulates the reported repro exactly: log out (fresh unauthenticated
  // decide), log back in (fresh authenticated decide against the same
  // still-unaccepted account), land on /play.
  const loggedOut = await decide({
    path: "/play",
    resolvesTo: false,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: false,
  });
  assert.deepEqual(loggedOut, { action: "allow" });

  const loggedBackIn = await decide({
    path: "/play",
    resolvesTo: true,
    resolveDelayMs: 15,
    hasAcceptedCurrentTerms: false,
  });
  assert.deepEqual(loggedBackIn, { action: "redirect", target: "/terms-acceptance" });
});
