import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Tab switching on the tournament page used to blank the whole content area
// for ~half a second. Cause: reka-ui's TabsContent unmounts inactive tab
// content (unmountOnHide defaults to true), so every tab switch mounted a
// fresh PageTransition -- which renders `v-show="visible"` with visible
// false until onMounted, collapsing the area to display:none and then
// fading in over 520ms from opacity-0/translate-y-5.
//
// The fix keeps the page-level entrance transition (header + tab strip) and
// renders tab CONTENT directly, so switching tabs paints immediately. These
// are static source-inspection tests, matching this suite's pattern.

const detailSource = await readFile(
  new URL("../components/tournament/TournamentDetail.vue", import.meta.url),
  "utf8",
);
const pageTransitionSource = await readFile(
  new URL("../components/ui/transitions/PageTransition.vue", import.meta.url),
  "utf8",
);

// Everything between the first <TabsContent and the end of the tab region is
// the content that remounts on every tab switch.
const tabRegion = detailSource.slice(detailSource.indexOf("<TabsContent"));

test("no tab CONTENT is wrapped in a mount-gated PageTransition", () => {
  assert.equal(
    tabRegion.includes("<PageTransition"),
    false,
    "a PageTransition inside TabsContent re-runs its hidden->fade-in cycle on every tab switch, blanking the content area",
  );
  assert.equal(tabRegion.includes("</PageTransition>"), false);
});

test("the page-level entrance transition is preserved (header/tab strip only)", () => {
  const header = detailSource.slice(0, detailSource.indexOf("<TabsContent"));
  assert.match(header, /<PageTransition>/);
  assert.match(header, /<\/PageTransition>/);
  // Exactly one page-level pair, and nothing further down.
  assert.equal((detailSource.match(/<PageTransition/g) || []).length, 1);
  assert.equal((detailSource.match(/<\/PageTransition>/g) || []).length, 1);
});

test("PageTransition itself is unchanged: still mount-gated, so it must stay out of remounting subtrees", () => {
  // This is the property that makes it unsuitable inside TabsContent. If this
  // ever stops being true, the constraint above can be revisited -- but the
  // shared component is used app-wide and is deliberately not modified here.
  assert.match(pageTransitionSource, /const clientMounted = ref\(false\)/);
  assert.match(
    pageTransitionSource,
    /visible = computed\(\(\) => props\.show && \(import\.meta\.server \|\| clientMounted\.value\)\)/,
  );
  assert.match(pageTransitionSource, /v-show="visible"/);
});

test("tab content is not hidden behind a loading/null gate that would blank the area", () => {
  // The tournament subscription data stays mounted across tab changes; tabs
  // must not be individually gated on a loading flag.
  assert.doesNotMatch(tabRegion, /<TabsContent[^>]*v-if="\s*!?\s*loading/);
  assert.doesNotMatch(tabRegion, /<TabsContent[^>]*v-if="tournament\s*(==|===)\s*null/);
});

test("tabs still unmount inactive content (no forced full mount of every tab)", () => {
  // The fix deliberately does NOT set unmount-on-hide=false, which would
  // mount every tab (and fire their queries) on page load.
  assert.doesNotMatch(detailSource, /unmount-on-hide/);
  assert.doesNotMatch(detailSource, /unmountOnHide/);
});

test("team cards keep their v-for keying after the wrapper change", () => {
  assert.match(detailSource, /v-for="team of visibleTeams"\s+:key="team\.id"/);
});
