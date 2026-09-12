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
// Guest-only placement: pages/index.vue only, followed directly by How It
// Works (Why DEAFCS is removed), and never in the authenticated
// HomePlayerOverview branch.
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

test("Why DEAFCS is removed entirely (not just visually hidden): no section, no heading, no whyDeafcsFeatures array, no card content", () => {
  assert.doesNotMatch(homeIndex, /why-deafcs-title/);
  assert.doesNotMatch(homeIndex, /Built with purpose/);
  assert.doesNotMatch(homeIndex, />Why DEAFCS</);
  assert.doesNotMatch(homeIndex, /whyDeafcsFeatures/);
  // The 6 removed cards' copy must not linger anywhere in the file.
  for (const title of [
    "Built for our community",
    "Sound-neutral game servers",
    "Accessible communication",
    "Ways to compete",
    "Your competitive home",
    "Earn awards",
  ]) {
    assert.doesNotMatch(homeIndex, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  // Icons that were only used by whyDeafcsFeatures are dropped from imports.
  for (const icon of ["MessageSquareText", "Sparkles"]) {
    assert.doesNotMatch(homeIndex, new RegExp(`\\b${icon}\\b`));
  }
});

test("How It Works now follows the showcase directly (Why DEAFCS no longer sits between them)", () => {
  const showcaseUsage = homeIndex.indexOf("<HomeExploreShowcase />");
  const howItWorksLabel = homeIndex.indexOf('aria-labelledby="how-it-works-title"');
  const howItWorksSectionStart = homeIndex.lastIndexOf("<section", howItWorksLabel);
  assert.ok(showcaseUsage > -1 && howItWorksSectionStart > showcaseUsage);

  // Nothing else (like a leftover section) sits between the two.
  const between = homeIndex.slice(
    showcaseUsage + "<HomeExploreShowcase />".length,
    howItWorksSectionStart,
  );
  assert.doesNotMatch(between, /<section/);
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

test("showcaseSlides is a config-driven array with all six slides in order, Watch renamed to Live coverage and Servers renamed to Game servers", () => {
  assert.match(showcase, /const showcaseSlides = \[/);
  const order = [
    "matchmaking",
    "player-stats",
    "live-coverage",
    "game-servers",
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
  assert.match(showcase, /title: "Live coverage",/);
  assert.match(showcase, /title: "Game servers",/);
  assert.match(showcase, /title: "Tournaments",/);
  assert.match(showcase, /title: "Leaderboard",/);

  // The old titles/keys are gone, not just renamed alongside leftovers.
  assert.doesNotMatch(showcase, /key: "watch"/);
  assert.doesNotMatch(showcase, /key: "servers"/);
  assert.doesNotMatch(showcase, /title: "Watch",/);
  assert.doesNotMatch(showcase, /title: "Servers",/);
});

test("every slide's description uses simple, plain English copy with no em dash or en dash", () => {
  assert.match(
    showcase,
    /"Queue solo or with your party and jump into balanced competitive matches\."/,
  );
  assert.match(
    showcase,
    /"Track your performance, review recent matches, and see how you improve over time\."/,
  );
  assert.match(
    showcase,
    /"Follow DEAFCS through live streaming, highlights, and live results\."/,
  );
  assert.match(
    showcase,
    /"Join cups and events with structured brackets and competitive progression\."/,
  );
  assert.match(
    showcase,
    /"Climb the rankings, compare players, and follow the season race\."/,
  );
  assert.doesNotMatch(showcase, /[–—]/);
});

test("every slide except Game servers has a CTA pointing at an existing public route (confirmed against middleware/auth.global.ts's isPublicRoute allowlist)", () => {
  assert.match(showcase, /cta: \{ label: "Join queue", to: "\/play" \}/);
  assert.match(showcase, /cta: \{ label: "Explore stats", to: "\/players" \}/);
  assert.match(showcase, /cta: \{ label: "Watch live", to: "\/watch" \}/);
  assert.match(
    showcase,
    /cta: \{ label: "View tournaments", to: "\/tournaments" \}/,
  );
  assert.match(showcase, /cta: \{ label: "View leaderboard", to: "\/leaderboard" \}/);
});

test("the Game servers slide's cta field is explicitly undefined (not omitted/truthy), so the v-if=\"activeSlide.cta\" button never renders for it, and it ships the longer sound-neutral explanation", () => {
  const gameServersBlock = showcase.slice(
    showcase.indexOf('key: "game-servers"'),
    showcase.indexOf('key: "tournaments"'),
  );
  assert.match(gameServersBlock, /cta: undefined,/);
  assert.equal((gameServersBlock.match(/label: "[^"]+", to: "/g) || []).length, 0);

  assert.match(
    gameServersBlock,
    /"DEAFCS game servers are built for fair, visual-first competition\. Almost all in-game sounds are removed, so matches focus on visual information and game awareness instead of headset-based audio advantages\."/,
  );
});

test("the /watch CTA route is genuinely guest-accessible per the global auth middleware's allowlist", () => {
  assert.match(authMiddleware, /"\/watch",/);
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
  const gridIndex = showcase.indexOf('class="mt-4 grid min-w-0');
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

test("the outer showcase container uses a neutral gray border with no amber glow, matching the plain border/bg treatment used elsewhere on the guest homepage (e.g. the hero section)", () => {
  const sectionTagStart = showcase.indexOf("<section");
  const sectionOpenTag = showcase.slice(
    sectionTagStart,
    showcase.indexOf(">", sectionTagStart) + 1,
  );
  assert.match(sectionOpenTag, /border border-border\/70 bg-card\/45/);
  assert.doesNotMatch(sectionOpenTag, /shadow-\[/);
  assert.doesNotMatch(sectionOpenTag, /tac-amber/);
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

// ---------------------------------------------------------------------------
// Compact layout: the static "Explore DEAFCS" heading is gone, the active
// slide's own title is promoted to be the section's main (h2) heading, and
// vertical rhythm is tightened.
// ---------------------------------------------------------------------------

test("the static 'Explore DEAFCS' big title is gone; only the small eyebrow kicker remains above the two-column layout", () => {
  assert.doesNotMatch(showcase, />Explore DEAFCS</);
  assert.doesNotMatch(showcase, /text-2xl font-bold tracking-tight sm:text-3xl/);
  assert.match(showcase, /Everything in one place/);
  assert.match(showcase, /:class="tacticalSectionLabelClasses"/);
});

test("the active slide's title is now the section's h2 heading (id=explore-showcase-title lives on the dynamic title, not a static element)", () => {
  assert.doesNotMatch(showcase, /<h3 class="text-xl font-bold/);
  assert.match(showcase, /<h2\s*\n\s*id="explore-showcase-title"/);
  // Exactly one heading element defines this id (no leftover static h2).
  assert.equal((showcase.match(/id="explore-showcase-title"/g) || []).length, 1);
});

test("every slide has a titleParts[white, orange] pair driving a white+orange split heading; Live coverage and Game servers now split cleanly on the word boundary, Tournaments keeps its existing TOUR+NAMENTS split unchanged", () => {
  assert.match(showcase, /titleParts: \["MATCH", "MAKING"\],/);
  assert.match(showcase, /titleParts: \["PLAYER", "STATS"\],/);
  assert.match(showcase, /titleParts: \["LIVE", "COVERAGE"\],/);
  assert.match(showcase, /titleParts: \["GAME", "SERVERS"\],/);
  assert.match(showcase, /titleParts: \["TOUR", "NAMENTS"\],/);
  assert.match(showcase, /titleParts: \["LEADER", "BOARD"\],/);

  // Rejoining each pair must reproduce the slide's uppercase title exactly,
  // so the split never drops or duplicates a letter.
  const pairs = [
    ["MATCH", "MAKING", "MATCHMAKING"],
    ["PLAYER", "STATS", "PLAYERSTATS"],
    ["LIVE", "COVERAGE", "LIVECOVERAGE"],
    ["GAME", "SERVERS", "GAMESERVERS"],
    ["TOUR", "NAMENTS", "TOURNAMENTS"],
    ["LEADER", "BOARD", "LEADERBOARD"],
  ];
  for (const [a, b, whole] of pairs) {
    assert.equal(a + b, whole);
  }
});

test("the split heading renders titleParts[0] in the foreground color and titleParts[1] in amber, large/bold/uppercase so it reads as the strongest element on the left column", () => {
  const h2Start = showcase.search(/<h2\s*\n\s*id="explore-showcase-title"/);
  assert.ok(h2Start > -1);
  const headingBlock = showcase.slice(h2Start, showcase.indexOf("</h2>", h2Start));
  assert.match(headingBlock, /font-black uppercase leading-\[0\.95\] tracking-tight/);
  assert.match(headingBlock, /text-3xl[\s\S]*sm:text-4xl[\s\S]*lg:text-5xl/);
  assert.match(
    headingBlock,
    /<span class="text-foreground">\{\{ activeSlide\.titleParts\[0\] \}\}<\/span/,
  );
  assert.match(
    headingBlock,
    /<span class="text-\[hsl\(var\(--tac-amber\)\)\]">\{\{[\s\S]*activeSlide\.titleParts\[1\][\s\S]*\}\}<\/span>/,
  );
});

test("vertical rhythm is tightened: section padding, the grid's top margin, the reserved left-column height, and the indicator row's top margin are all reduced from the previous pass", () => {
  const sectionTagStart = showcase.indexOf("<section");
  const sectionOpenTag = showcase.slice(
    sectionTagStart,
    showcase.indexOf(">", sectionTagStart) + 1,
  );
  assert.match(sectionOpenTag, /px-5 py-6 sm:px-8 sm:py-7 lg:px-10/);
  assert.doesNotMatch(sectionOpenTag, /py-10|py-12/);

  assert.match(showcase, /class="mt-4 grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-5 lg:gap-10"/);
  assert.match(showcase, /min-h-\[16rem\] min-w-0 lg:col-span-2/);
  assert.doesNotMatch(showcase, /min-h-\[19rem\]/);
  assert.match(showcase, /class="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start"/);
});

test("the two-column grid uses items-start (not items-center), so the left column's content sits at the top instead of being vertically centered against the taller media frame", () => {
  assert.doesNotMatch(showcase, /items-center gap-8 lg:grid-cols-5/);
  assert.match(showcase, /items-start gap-6 lg:grid-cols-5/);
});
