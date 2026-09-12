import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeIndex = await readFile(
  new URL("../pages/index.vue", import.meta.url),
  "utf8",
);
const showcase = await readFile(
  new URL("../components/home/HomeExploreShowcase.vue", import.meta.url),
  "utf8",
);
const mediaFrame = await readFile(
  new URL("../components/home/HomeShowcaseMediaFrame.vue", import.meta.url),
  "utf8",
);
const playerOverview = await readFile(
  new URL("../components/home/HomePlayerOverview.vue", import.meta.url),
  "utf8",
);
const authMiddleware = await readFile(
  new URL("../middleware/auth.global.ts", import.meta.url),
  "utf8",
);

// ---------------------------------------------------------------------------
// Guest-only placement: pages/index.vue only, above Why DEAFCS, and never in
// the authenticated HomePlayerOverview branch.
// ---------------------------------------------------------------------------

test("HomeExploreShowcase is only wired into the logged-out branch of pages/index.vue, not the authenticated homepage", () => {
  assert.match(
    homeIndex,
    /import HomeExploreShowcase from "~\/components\/home\/HomeExploreShowcase\.vue";/,
  );
  assert.match(homeIndex, /<HomeExploreShowcase \/>/);

  // <HomeExploreShowcase /> must sit inside the guest `<main v-else>` branch,
  // after the v-else-if="showLoggedInHome" authenticated branch closes.
  const authenticatedBranch = homeIndex.indexOf('v-else-if="showLoggedInHome"');
  const guestMain = homeIndex.indexOf("<main v-else");
  const showcaseUsage = homeIndex.indexOf("<HomeExploreShowcase />");
  assert.ok(authenticatedBranch > -1 && guestMain > authenticatedBranch);
  assert.ok(showcaseUsage > guestMain);

  assert.doesNotMatch(playerOverview, /HomeExploreShowcase/);
});

test("the showcase renders immediately above the existing Why DEAFCS section, which is otherwise untouched", () => {
  const showcaseUsage = homeIndex.indexOf("<HomeExploreShowcase />");
  const whyDeafcsSection = homeIndex.indexOf('aria-labelledby="why-deafcs-title"');
  assert.ok(showcaseUsage > -1 && whyDeafcsSection > showcaseUsage);

  // Why DEAFCS content is unchanged: still 6 cards, same heading and kicker.
  assert.match(homeIndex, /Built with purpose/);
  assert.match(homeIndex, /Why DEAFCS/);
  const featuresBlock = homeIndex.match(
    /const whyDeafcsFeatures = \[([\s\S]*?)\n\];/,
  )?.[1];
  assert.ok(featuresBlock);
  assert.equal((featuresBlock.match(/title:/g) || []).length, 6);
});

test("the existing guest hero (Welcome to DEAFCS / Sign in with Steam) is untouched", () => {
  assert.match(homeIndex, /Welcome to DEAFCS/);
  assert.match(
    homeIndex,
    /DEAFCS is the home of competitive Counter-Strike for the deaf and\s*\n\s*hard-of-hearing community\./,
  );
  assert.match(homeIndex, /Sign in with Steam/);
  assert.match(homeIndex, /href="https:\/\/5stack\.gg\/auth\/steam"|loginLinks\.steam/);
});

// ---------------------------------------------------------------------------
// Config-driven slides
// ---------------------------------------------------------------------------

test("showcaseSlides is a config-driven array with all six slides in order, including the new Watch and Servers slides", () => {
  assert.match(showcase, /const showcaseSlides = \[/);
  const order = [
    "matchmaking",
    "player-stats",
    "watch",
    "servers",
    "tournaments",
    "leaderboard",
  ];
  let lastIndex = -1;
  for (const key of order) {
    const index = showcase.indexOf(`key: "${key}"`);
    assert.ok(index > lastIndex, `expected slide "${key}" after the previous one`);
    lastIndex = index;
  }
  assert.match(showcase, /title: "Matchmaking",/);
  assert.match(showcase, /title: "Player stats",/);
  assert.match(showcase, /title: "Watch",/);
  assert.match(showcase, /title: "Servers",/);
  assert.match(showcase, /title: "Tournaments",/);
  assert.match(showcase, /title: "Leaderboard",/);
});

test("every slide's description uses the simplified, plain-English copy", () => {
  assert.match(
    showcase,
    /"Queue solo or with your party and get into balanced matches faster\."/,
  );
  assert.match(
    showcase,
    /"Track your progress, match history, and performance over time\."/,
  );
  assert.match(
    showcase,
    /"Follow DEAFCS through live coverage, highlights, and live results\."/,
  );
  assert.match(
    showcase,
    /"Play on a system built for fair, visual-first competitive matches\."/,
  );
  assert.match(
    showcase,
    /"Join cups and events with structured brackets and competitive progression\."/,
  );
  assert.match(
    showcase,
    /"See who is rising, track ELO, and compete for the top spots\."/,
  );
});

test("every slide has exactly one CTA pointing at an existing public route (confirmed against middleware/auth.global.ts's isPublicRoute allowlist)", () => {
  assert.match(showcase, /cta: \{ label: "Explore matchmaking", to: "\/play" \}/);
  assert.match(showcase, /cta: \{ label: "Explore stats", to: "\/players" \}/);
  assert.match(showcase, /cta: \{ label: "Watch live", to: "\/watch" \}/);
  assert.match(showcase, /cta: \{ label: "Explore servers", to: "\/public-servers" \}/);
  assert.match(
    showcase,
    /cta: \{ label: "Explore tournaments", to: "\/tournaments" \}/,
  );
  assert.match(showcase, /cta: \{ label: "View leaderboard", to: "\/leaderboard" \}/);
});

test("the two new CTA routes (/watch and /public-servers) are genuinely guest-accessible per the global auth middleware's allowlist", () => {
  assert.match(authMiddleware, /"\/watch",/);
  assert.match(authMiddleware, /"\/public-servers",/);
});

test("every slide defines 3 feature points with an icon and label", () => {
  const blocks = showcase.match(/features: \[([\s\S]*?)\n {4}\],/g) || [];
  assert.equal(blocks.length, 6, "expected one features array per slide");
  for (const block of blocks) {
    assert.equal((block.match(/label:/g) || []).length, 3);
    assert.equal((block.match(/icon:/g) || []).length, 3);
  }
});

// ---------------------------------------------------------------------------
// Auto rotation: 5s interval, manual select restarts it, hover pauses/resumes,
// timers cleaned up on unmount.
// ---------------------------------------------------------------------------

test("auto rotation advances every 5 seconds via a single named constant", () => {
  assert.match(showcase, /const ROTATION_MS = 5000;/);
  assert.match(showcase, /}, ROTATION_MS\);/);
});

test("manual slide selection updates the active index and restarts the timer", () => {
  assert.match(
    showcase,
    /function selectSlide\(index: number\) \{\s*\n\s*activeIndex\.value = index;\s*\n\s*startRotationTimer\(\);\s*\n\s*\}/,
  );
  assert.match(showcase, /@click="selectSlide\(index\)"/);
});

test("hovering the section pauses rotation and leaving resumes it", () => {
  assert.match(showcase, /@mouseenter="pauseRotation"/);
  assert.match(showcase, /@mouseleave="resumeRotation"/);
  assert.match(showcase, /function pauseRotation\(\) \{\s*\n\s*clearRotationTimer\(\);\s*\n\s*\}/);
  assert.match(showcase, /function resumeRotation\(\) \{\s*\n\s*startRotationTimer\(\);\s*\n\s*\}/);
});

test("the rotation timer is cleared on unmount", () => {
  assert.match(showcase, /onBeforeUnmount\(\(\) => \{\s*\n\s*clearRotationTimer\(\);\s*\n\s*\}\);/);
});

test("prefers-reduced-motion disables the auto-rotation timer and the crossfade transition duration is zeroed", () => {
  assert.match(
    showcase,
    /prefersReducedMotion\.value = window\.matchMedia\(\s*\n\s*"\(prefers-reduced-motion: reduce\)",\s*\n\s*\)\.matches;/,
  );
  assert.match(
    showcase,
    /function startRotationTimer\(\) \{\s*\n\s*clearRotationTimer\(\);\s*\n\s*if \(prefersReducedMotion\.value\) return;/,
  );
  assert.match(showcase, /motion-reduce:!duration-0/);
  assert.match(showcase, /motion-reduce:!translate-x-0/);
});

// ---------------------------------------------------------------------------
// Indicators: accessible buttons below the two-column layout.
// ---------------------------------------------------------------------------

test("indicators are accessible buttons rendered below the two-column showcase, with active/inactive styling and a visible focus state", () => {
  const gridIndex = showcase.indexOf('class="mt-8 grid min-w-0');
  const navIndex = showcase.indexOf('aria-label="Showcase slides"');
  assert.ok(gridIndex > -1 && navIndex > gridIndex);

  assert.match(showcase, /v-for="\(slide, index\) in showcaseSlides"/);
  assert.match(showcase, /type="button"/);
  assert.match(showcase, /:aria-label="`Show \$\{slide\.title\} slide`"/);
  assert.match(showcase, /:aria-current="index === activeIndex \? 'true' : undefined"/);
  assert.match(showcase, /focus-visible:ring-2/);
  assert.match(
    showcase,
    /index === activeIndex\s*\n\s*\? 'w-9 bg-\[hsl\(var\(--tac-amber\)\)\]'\s*\n\s*: 'w-5 bg-muted-foreground\/30/,
  );
});

// ---------------------------------------------------------------------------
// Media frame: reusable, supports image/video/placeholder, no broken assets.
// ---------------------------------------------------------------------------

test("HomeShowcaseMediaFrame supports image, video, and placeholder media types without inventing asset paths", () => {
  assert.match(
    mediaFrame,
    /mediaType: "image" \| "video" \| "placeholder";/,
  );
  assert.match(mediaFrame, /mediaSrc\?: string;/);
  assert.match(mediaFrame, /mediaPoster\?: string;/);
  assert.match(mediaFrame, /v-if="mediaType === 'video' && mediaSrc"/);
  assert.match(mediaFrame, /autoplay/);
  assert.match(mediaFrame, /muted/);
  assert.match(mediaFrame, /loop/);
  assert.match(mediaFrame, /playsinline/);
  assert.match(mediaFrame, /v-else-if="mediaType === 'image' && mediaSrc"/);
  assert.match(mediaFrame, /Preview coming soon/);
});

test("every slide currently uses the placeholder media type with no mediaSrc, so no broken image/video path can render", () => {
  const mediaBlocks = showcase.match(/mediaType: "placeholder" as const,/g) || [];
  assert.equal(mediaBlocks.length, 6);
  assert.equal((showcase.match(/mediaSrc: undefined,/g) || []).length, 6);
  assert.doesNotMatch(showcase, /mediaSrc:\s*"\/img\//);
});

test("HomeExploreShowcase passes the active slide's media fields through to the reusable frame component", () => {
  assert.match(showcase, /import HomeShowcaseMediaFrame from "~\/components\/home\/HomeShowcaseMediaFrame\.vue";/);
  assert.match(showcase, /:media-type="activeSlide\.mediaType"/);
  assert.match(showcase, /:media-src="activeSlide\.mediaSrc"/);
  assert.match(showcase, /:media-poster="activeSlide\.mediaPoster"/);
  assert.match(showcase, /:icon="activeSlide\.mediaIcon"/);
});

test("the media frame is wrapped in its own keyed Transition, matching the text column's timing, so text and media never show two different slides mid-swap", () => {
  const mediaColumn = showcase.slice(
    showcase.indexOf("lg:col-span-3"),
    showcase.indexOf("</Transition>", showcase.indexOf("lg:col-span-3")),
  );
  assert.match(mediaColumn, /<Transition/);
  assert.match(mediaColumn, /mode="out-in"/);
  assert.match(mediaColumn, /:key="activeSlide\.key"/);
  assert.match(mediaColumn, /duration-300 motion-reduce:!duration-0/);
});

// ---------------------------------------------------------------------------
// Styling: subtle orange outer glow on the section container and a stronger,
// still-clean glow/ring on the media frame, echoing (not copying) the
// matchmaking search/queue amber box-shadow language.
// ---------------------------------------------------------------------------

test("the showcase section has a subtle orange outer glow (dual-layer box-shadow: hairline ring + soft blur), not just a flat neutral border", () => {
  const sectionTagStart = showcase.indexOf("<section");
  const sectionOpenTag = showcase.slice(
    sectionTagStart,
    showcase.indexOf(">", sectionTagStart) + 1,
  );
  assert.match(
    sectionOpenTag,
    /shadow-\[0_0_0_1px_hsl\(var\(--tac-amber\)\/0\.1\),0_0_60px_-18px_hsl\(var\(--tac-amber\)\/0\.35\)\]/,
  );
});

test("the media frame's border/glow is stronger than a flat border: hairline amber ring + wider soft glow, matching the matchmaking-confirm dual-layer shadow pattern", () => {
  assert.match(
    mediaFrame,
    /border border-\[hsl\(var\(--tac-amber\)\/0\.4\)\]/,
  );
  assert.match(
    mediaFrame,
    /shadow-\[0_0_0_1px_hsl\(var\(--tac-amber\)\/0\.25\),0_0_44px_-8px_hsl\(var\(--tac-amber\)\/0\.4\)\]/,
  );
});

test("neither glow uses an oversized/unbounded blur radius (still 'clean', not an exaggerated neon halo)", () => {
  assert.doesNotMatch(showcase, /blur-3xl/);
  assert.doesNotMatch(mediaFrame, /blur-3xl/);
});
