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

test("a reply is only ever marked as staff when the stored is_admin flag confirms it, never by role alone", () => {
  for (const source of [applicationDetail, requestDetail]) {
    assert.match(source, /Staff reply<\/Badge>/);
    // The Badge must sit behind a v-if on message.is_admin specifically --
    // not on the sender's current role, which could differ from what they
    // held when the message was actually sent.
    const badgeLine = source
      .split("\n")
      .find((line) => line.includes("Staff reply"));
    assert.match(badgeLine, /v-if="message\.is_admin"/);
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
