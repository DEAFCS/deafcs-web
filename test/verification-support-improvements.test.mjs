import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Task 7: approver attribution, real player badges, real reply authors, and
// clickable DEAFCS match links on the Verification Applications and Support
// Requests admin pages.

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const applicationsList = await read(
  "../pages/verification-applications/index.vue",
);
const applicationDetail = await read(
  "../pages/verification-applications/[id].vue",
);
const requestsList = await read("../pages/support-requests/index.vue");
const requestDetail = await read("../pages/support/[id].vue");
const linkify = await read("../components/LinkifyText.vue");
const playerDisplay = await read("../components/PlayerDisplay.vue");

// --- 1. Approver attribution --------------------------------------------

test("the applications list queries reviewed_by, not a synthesized field", () => {
  assert.match(applicationsList, /reviewed_by\s*\{/);
  assert.match(applicationsList, /status === 'approved' && application\.reviewed_by/);
});

test("a rejected or pending application never renders the reviewer as an approver", () => {
  // rejectVerificationApplication also sets reviewed_by_steam_id (see
  // api-deafcs), so gating the "approved by" cell on status === 'approved'
  // is the only thing standing between it and mislabeling a rejection's
  // reviewer as the approver.
  const start = applicationsList.indexOf("application.reviewed_by");
  assert.notEqual(start, -1);
  const surrounding = applicationsList.slice(
    applicationsList.lastIndexOf("<TableCell>", start),
    start,
  );
  assert.match(surrounding, /application\.status === 'approved'/);
});

test("the application detail page shows the approver only when approved, and handles a missing reviewer", () => {
  assert.match(applicationDetail, /application\.status === 'approved'/);
  assert.match(applicationDetail, /reviewed_by\s*\{/);
  assert.match(applicationDetail, /approver_unknown/);
});

// --- 2. Real player badges, not a generic info icon ----------------------

test("both lists query the player's role so PlayerDisplay's existing role badge can render", () => {
  for (const source of [applicationsList, requestsList]) {
    const playerBlock = source.slice(
      source.indexOf("player {"),
      source.indexOf("}", source.indexOf("player {")),
    );
    assert.match(playerBlock, /role/);
  }
});

test("both lists make the player name clickable via the existing linkable prop", () => {
  assert.match(applicationsList, /<PlayerDisplay :player="application\.player"[^>]*linkable/);
  assert.match(requestsList, /<PlayerDisplay :player="request\.player"[^>]*linkable/);
});

test("no new/duplicate badge system is introduced -- PlayerDisplay is reused as-is", () => {
  for (const source of [applicationsList, requestsList, applicationDetail, requestDetail]) {
    assert.doesNotMatch(source, /class="[^"]*badge-icon-custom/);
  }
});

// --- 3. Real reply authors -------------------------------------------------

test("verification application messages query the real sender, and the generic admin label is gone", () => {
  assert.match(applicationDetail, /sender\s*\{/);
  assert.doesNotMatch(
    applicationDetail,
    /message\.is_admin \? \$t\("pages\.verify\.status\.admin"\) : application\.player\.name/,
  );
});

test("support request messages query the real sender, and the literal 'DEAFCS Admin' label is gone", () => {
  assert.match(requestDetail, /sender\s*\{/);
  assert.doesNotMatch(requestDetail, /"DEAFCS Admin"/);
});

test("a missing sender falls back to a neutral 'Unknown author' label, never a staff claim or the viewer's own name", () => {
  assert.match(applicationDetail, /unknown_author/);
  assert.match(requestDetail, /Unknown author/);
});

test("Task 7.1: the separate 'Staff reply' label is removed -- the real role badge is enough", () => {
  for (const source of [applicationDetail, requestDetail]) {
    assert.doesNotMatch(source, /Staff reply/);
  }
});

test("message.is_admin is still read (styling/permissions), even with the visible label gone", () => {
  // Task 7.1 explicitly requires the stored is_admin value to keep driving
  // internal behavior (here: the amber left-border/indent that visually
  // groups official replies) -- only the separate text label was removed.
  for (const source of [applicationDetail, requestDetail]) {
    assert.match(source, /message\.is_admin/);
  }
});

// --- 4. Clickable match links ----------------------------------------------

test("LinkifyText never uses the v-html directive and only links http(s) URLs", () => {
  assert.doesNotMatch(linkify, /v-html=/);
  assert.match(linkify, /url\.protocol !== "http:" && url\.protocol !== "https:"/);
});

test("LinkifyText prefers internal navigation for this site's own match URLs", () => {
  assert.match(linkify, /name: 'matches-id'/);
  assert.match(linkify, /NuxtLink/);
});

test("support request detail renders related match and evidence through LinkifyText", () => {
  assert.match(requestDetail, /<LinkifyText[^>]*request\.related_match_reference/);
  assert.match(requestDetail, /<LinkifyText[^>]*request\.report_evidence/);
});

// Exercises the exact URL-classification logic LinkifyText.vue runs, by
// copying its pure toSegment() decision tree here (TS-free, so it can run
// directly under node --test without a Vue/TS toolchain). Any change to
// that logic in the component should be mirrored here.
function toSegment(raw, webDomain) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { type: "text", value: raw };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { type: "text", value: raw };
  }
  const isOwnDomain =
    !!webDomain &&
    (url.hostname === webDomain || url.hostname === `www.${webDomain}`);
  if (isOwnDomain) {
    const match = url.pathname.match(/^\/matches\/([0-9a-fA-F-]+)\/?$/);
    if (match) {
      return { type: "internal", value: raw, matchId: match[1] };
    }
  }
  return { type: "external", value: raw, href: url.toString() };
}

test("a valid DEAFCS match URL classifies as internal, keyed by the match id", () => {
  const segment = toSegment(
    "https://deafcs.net/matches/11111111-1111-1111-1111-111111111111",
    "deafcs.net",
  );
  assert.equal(segment.type, "internal");
  assert.equal(segment.matchId, "11111111-1111-1111-1111-111111111111");
});

test("an external http(s) URL classifies as external, not internal", () => {
  const segment = toSegment("https://youtube.com/watch?v=abc123", "deafcs.net");
  assert.equal(segment.type, "external");
  assert.equal(segment.href, "https://youtube.com/watch?v=abc123");
});

test("a non-DEAFCS-match path on this site's own domain still classifies as external, not internal", () => {
  const segment = toSegment("https://deafcs.net/players/76561198000000000", "deafcs.net");
  assert.equal(segment.type, "external");
});

test("an unsafe scheme (javascript:) never becomes a link", () => {
  const segment = toSegment("javascript:alert(1)", "deafcs.net");
  assert.equal(segment.type, "text");
});

test("plain, non-URL text is never linked", () => {
  const segment = toSegment("not a url at all", "deafcs.net");
  assert.equal(segment.type, "text");
});

// --- Task 7.1: compact/aligned identity layout ------------------------------

test("dense is a new opt-in PlayerDisplay prop, defaulting to false so unrelated pages are unaffected", () => {
  assert.match(playerDisplay, /dense:\s*\{\s*type:\s*Boolean,\s*default:\s*false,?\s*\}/);
});

test("dense centers the identity row against the avatar instead of changing the default grid for every consumer", () => {
  // items-center is applied only via the dense class binding, not as a
  // static class on the root grid -- every other PlayerDisplay usage keeps
  // its current (unaligned) default behavior untouched.
  assert.doesNotMatch(playerDisplay, /class="grid[^"]*items-center/);
  assert.match(playerDisplay, /'items-center':\s*dense/);
});

test("all six identity locations opt into the dense layout", () => {
  const sites = [
    [applicationsList, /application\.player"[^>]*linkable compact dense/],
    [applicationsList, /application\.reviewed_by"[\s\S]{0,200}dense/],
    [applicationDetail, /application\.reviewed_by"[\s\S]{0,200}dense/],
    [applicationDetail, /message\.sender"[\s\S]{0,200}dense/],
    [requestsList, /request\.player"[^>]*linkable compact dense/],
    [requestDetail, /request\.player"[\s\S]{0,200}dense/],
    [requestDetail, /message\.sender"[\s\S]{0,200}dense/],
  ];
  for (const [source, pattern] of sites) {
    assert.match(source, pattern);
  }
});
