import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import test from "node:test";

// Promotional video added to the guest homepage hero (the right column,
// alongside the unchanged welcome heading / description / Steam login
// button). Source clip: a DEAFCS community member signing on a black
// background, 3840x2160 @ 50fps, 723MB. Inspected with ffprobe/cropdetect
// (via a jrottenberg/ffmpeg Docker container, since no native ffmpeg/ffprobe
// was available) across the full ~168s duration to find the widest bounds
// hand gestures ever reach, then cropped to that safe envelope (plus a
// margin) and re-encoded at 720x684, 30fps, muted, no audio track --
// 8.9MB, a >98% size reduction, verified in a real browser to autoplay,
// loop seamlessly, and never clip a hand/gesture.
//
// Follow-up pass: added Play/Pause + Fullscreen controls (bottom-right of
// the frame, dark/subtle with amber hover) and trimmed the hero section's
// padding. Verified in a real browser: clicking (and real Tab-focused
// keyboard activation reaching the buttons -- Enter/Space activation itself
// couldn't be exercised because this sandbox's key-dispatch doesn't trigger
// Chromium's native button default-action, a tool limitation reproduced on
// a pre-existing, unrelated button elsewhere on the page, not a defect in
// these buttons, which are plain native <button> elements) toggles
// play/pause and swaps the icon; fullscreen couldn't be entered inside the
// embedded preview pane (`requestFullscreen()` rejects with "Permissions
// check failed", a Permissions-Policy restriction on that iframe) but the
// call path, its iOS fallback, and the fullscreenchange listener were all
// verified directly.
//
// Second follow-up pass: fullscreen dropped the frame's aspect-square/glow
// in favor of a plain black backdrop -- verified by forcing
// document.fullscreenElement to the frame and dispatching fullscreenchange,
// then reading the resulting class list back. Controls are hidden by
// default on hover-capable (desktop) pointers and revealed on real mouse
// hover or real Tab-key focus (both verified live); the
// `[@media(hover:hover)]` gate is skipped on coarse/touch pointers so
// mobile keeps the controls visible unconditionally (verified under mobile
// emulation). The text column was narrowed (max-w-3xl -> max-w-2xl) and the
// video frame widened (lg:w-72 xl:w-80 -> a single lg:w-80) -- confirmed
// live at a 1280px viewport: text column 672px, frame 320px square
// (previously 768px / 288px).
//
// Third follow-up pass: the square frame is gone. The video contains sign
// language, so cropping (object-cover) is no longer acceptable at any
// aspect ratio wider than the source's near-square crop -- it would risk
// cutting off raised hands. The frame is now a fixed ~480x340 rectangle
// (aspect-[480/340], lg:w-[30rem]) and the <video> is unconditionally
// object-contain (in both inline and fullscreen, so the fullscreen/inline
// ternary was removed as dead code): the full signer always stays visible,
// with any leftover space letterboxed by the frame's own subtle dark
// background rather than cropped. The text column was narrowed again
// (max-w-2xl -> max-w-xl) to give the wider frame room. Live verification
// of this pass was blocked by a sandbox network regression (DNS resolution
// for the app's external API/WS hosts failed outright -- net::
// ERR_NAME_NOT_RESOLVED -- worse than the earlier degraded-but-reachable
// state, and reproduced identically on an unrelated route (/teams), so it
// is an environment condition, not a defect in this change); Vite HMR did
// apply the edit without any compile/template error, and the change was
// confirmed by the regex-based tests below plus a production build.
//
// Fourth follow-up pass fixed a real visual bug live testing then caught:
// the frame's background was `bg-background/60` (translucent), and the
// section's decorative amber blur-glow circle (`-right-24 -top-32 -z-10
// h-80 w-80 blur-3xl`) overlaps the frame's right half at this width --
// confirmed via getBoundingClientRect on both elements -- so it bled
// through the letterboxed area as a brownish tint, worse on the right
// where the overlap is largest. Fixed by making the frame's background a
// plain, fully-opaque `bg-black` in both inline and fullscreen (previously
// only fullscreen had opaque black; inline kept the translucent
// background purely for its own sake). Verified live: computed
// `backgroundColor` on the frame is `rgb(0, 0, 0)`, and screenshots (both
// desktop, on hover, and mobile) show clean solid-black pillarboxing with
// no tint, the signer centered, un-stretched, and un-cropped.
const homeIndex = await readFile(
  new URL("../pages/index.vue", import.meta.url),
  "utf8",
);

test("guest hero's video panel autoplays muted/looped/inline with a poster fallback, and never sets an autoplay attribute directly", () => {
  assert.match(
    homeIndex,
    /<video\s+ref="heroVideoRef"[\s\S]*?poster="\/img\/home\/deafcs-hero-poster\.jpg"[\s\S]*?muted[\s\S]*?loop[\s\S]*?playsinline[\s\S]*?preload="metadata"[\s\S]*?>/,
  );
  assert.match(
    homeIndex,
    /<source src="\/videos\/home\/deafcs-hero\.mp4" type="video\/mp4" \/>/,
  );
  // autoplay is applied imperatively (onMounted) after checking
  // prefers-reduced-motion, never as a static HTML attribute -- otherwise
  // the browser would start playback before that check can run.
  assert.doesNotMatch(homeIndex, /<video[\s\S]*?autoplay[\s\S]*?>/);
});

test("prefers-reduced-motion skips play() entirely, leaving the poster image as the static fallback", () => {
  const start = homeIndex.indexOf("onMounted(() => {");
  const videoDeclStart = homeIndex.indexOf("const heroVideoRef");
  assert.ok(
    start > -1 && videoDeclStart > -1 && start > videoDeclStart,
    "hero video onMounted hook not found",
  );
  const end = homeIndex.indexOf("onBeforeUnmount(", start);
  const body = homeIndex.slice(start, end);

  assert.match(
    body,
    /window\.matchMedia\(\s*"\(prefers-reduced-motion: reduce\)",?\s*\)\.matches/,
  );
  assert.match(body, /if \(prefersReducedMotion\) return;/);
  assert.match(body, /video\.play\(\)\.catch\(/);
});

test("left column (heading, description, Steam login) is unchanged and still renders before the video panel", () => {
  assert.match(homeIndex, /Welcome to DEAFCS/);
  assert.match(
    homeIndex,
    /DEAFCS is the home of competitive Counter-Strike for the deaf and\s+hard-of-hearing community\./,
  );
  assert.match(
    homeIndex,
    /<a\s+:href="loginLinks\.steam"\s+aria-label="Sign in to DEAFCS with Steam"\s*>/,
  );
  const leftColumnIndex = homeIndex.indexOf("Welcome to DEAFCS");
  const videoIndex = homeIndex.indexOf('ref="heroVideoRef"');
  assert.ok(leftColumnIndex > -1 && videoIndex > -1);
  assert.ok(
    leftColumnIndex < videoIndex,
    "left column content should appear before the video panel in source order",
  );
});

test("video panel is responsive (stacks on mobile, sits beside a narrower text column on lg+) and decorative (aria-hidden, matches the tactical amber corner-bracket styling)", () => {
  assert.match(
    homeIndex,
    /class="flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12"/,
  );
  assert.match(homeIndex, /class="max-w-xl lg:flex-1"/);
  assert.doesNotMatch(homeIndex, /class="max-w-(?:2|3)xl lg:flex-1"/);

  assert.match(
    homeIndex,
    /ref="heroFrameRef"\s*\n\s*:class="\[\s*\n\s*'group relative mx-auto w-full max-w-xs shrink-0 overflow-hidden rounded-xl border border-\[hsl\(var\(--tac-amber\)\/0\.3\)\] bg-black sm:max-w-sm lg:mx-0 lg:w-\[30rem\] lg:max-w-none',/,
  );
  // No separate xl breakpoint override, and no old fixed lg:w-72/w-80 --
  // a single lg:w-[30rem] (480px) carries the frame's width from lg
  // upward, targeting ~480x340 via aspect-[480/340] below.
  assert.doesNotMatch(homeIndex, /xl:w-80/);
  assert.doesNotMatch(homeIndex, /lg:w-72\b/);
  assert.doesNotMatch(homeIndex, /lg:w-80\b/);

  assert.match(homeIndex, /<video\s+ref="heroVideoRef"[\s\S]*?aria-hidden="true"/);
});

test("lg:max-w-none cancels the mobile-first sm:max-w-sm cap, so the frame actually reaches its intended lg:w-[30rem] (480px) width instead of staying silently clamped to 384px", () => {
  // Regression: sm:max-w-sm sets max-width:384px starting at the sm
  // breakpoint and is never an lg-only rule, so it stayed active at lg+ too.
  // width and max-width don't override each other -- they combine -- so
  // lg:w-[30rem] (480px) was being clamped down to 384px by the still-active
  // max-width, even though the width utility itself was present and
  // correct. Caught live in production (getBoundingClientRect measured
  // 384px at both 1024px and 1920px viewports, confirmed via
  // getComputedStyle().width and cross-checked by directly clearing
  // max-width in devtools, which restored 480px) -- not visible from the
  // regex-only tests below, which only check that the right utility
  // classes are textually present, not what they resolve to once Tailwind
  // combines them.
  const frameClassStart = homeIndex.indexOf(
    ':class="[',
    homeIndex.indexOf('ref="heroFrameRef"'),
  );
  const frameBaseClassEnd = homeIndex.indexOf("',", frameClassStart);
  const frameBaseClass = homeIndex.slice(frameClassStart, frameBaseClassEnd);
  assert.match(frameBaseClass, /\blg:w-\[30rem\]\s+lg:max-w-none\b/);
});

test("the frame is a fixed ~480x340 rectangle (not a square) inline, drops that aspect ratio (but keeps its solid black fill) in fullscreen, and the <video> is unconditionally object-contain so a wider frame never crops the signer -- any leftover space is letterboxed by the frame's own OPAQUE black background instead", () => {
  const frameClassStart = homeIndex.indexOf(
    ':class="[',
    homeIndex.indexOf('ref="heroFrameRef"'),
  );
  const frameClassEnd = homeIndex.indexOf(']"', frameClassStart);
  const frameClassBody = homeIndex.slice(frameClassStart, frameClassEnd);
  // The frame's background is a plain, fully-opaque `bg-black` baked into
  // the base class string (present in both inline and fullscreen), not a
  // translucent `bg-background/60` -- a translucent fill let the section's
  // own decorative amber blur-glow (positioned top-right, `-z-10`, and
  // overlapping the frame's right half at this width) bleed through the
  // letterboxed area, showing up as a brownish tint instead of pure black.
  assert.match(frameClassBody, /'group relative mx-auto[^']*\bbg-black\b[^']*',/);
  assert.match(
    frameClassBody,
    /isHeroVideoFullscreen\s*\n\s*\? ''\s*\n\s*: 'aspect-\[480\/340\] shadow-\[0_0_40px_-14px_hsl\(var\(--tac-amber\)\/0\.4\)\]',/,
  );
  assert.doesNotMatch(frameClassBody, /aspect-square/);
  assert.doesNotMatch(frameClassBody, /bg-background\/60/);

  // The <video> no longer needs a fullscreen-vs-inline object-fit split --
  // it is always object-contain now, so it's a plain string, not a
  // computed :class ternary.
  assert.match(
    homeIndex,
    /<video\s*\n\s*ref="heroVideoRef"\s*\n\s*class="h-full w-full object-contain"/,
  );
  assert.doesNotMatch(homeIndex, /object-cover/);
});

test("hero section's top/bottom padding was trimmed (no longer py-14/py-20)", () => {
  assert.match(
    homeIndex,
    /class="homepage-entry relative isolate overflow-hidden rounded-xl border border-border\/70 bg-card\/45 px-5 py-8 sm:px-10 sm:py-12 lg:px-16 lg:py-14"/,
  );
  assert.doesNotMatch(homeIndex, /py-14 sm:px-10 sm:py-20/);
});

test("controls are hidden by default on hover-capable pointers, revealed on hover or keyboard focus-within, and left always-visible on touch/coarse pointers (no [@media(hover:hover)] gate applies there)", () => {
  const controlsClassStart = homeIndex.indexOf(
    'class="absolute bottom-2 right-2 z-20',
  );
  assert.ok(controlsClassStart > -1, "controls wrapper not found");
  const controlsClassEnd = homeIndex.indexOf('"', controlsClassStart + 7);
  const controlsClass = homeIndex.slice(controlsClassStart, controlsClassEnd);

  // Base (mobile-first / touch) state: fully visible, no hover required.
  assert.match(controlsClass, /\bopacity-100\b/);
  // Only hover-capable pointers get the hide-then-reveal treatment.
  assert.match(controlsClass, /\[@media\(hover:hover\)\]:opacity-0/);
  assert.match(
    controlsClass,
    /\[@media\(hover:hover\)\]:group-hover:opacity-100/,
  );
  assert.match(
    controlsClass,
    /\[@media\(hover:hover\)\]:group-focus-within:opacity-100/,
  );
});

test("the frame carries the `group` class the hover/focus-reveal controls key off of", () => {
  const frameClassStart = homeIndex.indexOf(
    ':class="[',
    homeIndex.indexOf('ref="heroFrameRef"'),
  );
  const line = homeIndex.slice(frameClassStart, frameClassStart + 200);
  assert.match(line, /'group relative mx-auto/);
});

test("Play/Pause and Fullscreen are plain native <button> elements (keyboard/touch-activatable by default) sitting bottom-right of the frame, with dark/subtle backgrounds and amber hover/focus styling", () => {
  const framestart = homeIndex.indexOf('ref="heroFrameRef"');
  const frameEnd = homeIndex.indexOf("</div>\n        </div>", framestart);
  const frame = homeIndex.slice(framestart, frameEnd);

  const buttonClassPattern =
    /class="flex h-9 w-9 items-center justify-center rounded-md border border-white\/10 bg-black\/55 text-white\/85 backdrop-blur-sm transition-colors hover:border-\[hsl\(var\(--tac-amber\)\/0\.6\)\] hover:bg-\[hsl\(var\(--tac-amber\)\/0\.18\)\] hover:text-\[hsl\(var\(--tac-amber\)\)\] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-\[hsl\(var\(--tac-amber\)\)\] focus-visible:ring-offset-1 focus-visible:ring-offset-background"/g;
  assert.equal(
    (frame.match(buttonClassPattern) || []).length,
    2,
    "expected both controls to share the same subtle-dark / amber-hover button styling",
  );
  assert.equal((frame.match(/<button\s+type="button"/g) || []).length, 2);
});

test("Play/Pause button reflects real playback state (via play/pause events, not an assumption) and swaps its icon and aria-label", () => {
  assert.match(
    homeIndex,
    /:aria-label="isHeroVideoPlaying \? 'Pause video' : 'Play video'"/,
  );
  assert.match(homeIndex, /:aria-pressed="isHeroVideoPlaying"/);
  assert.match(
    homeIndex,
    /<Pause v-if="isHeroVideoPlaying" class="h-4 w-4" aria-hidden="true" \/>\s*\n\s*<Play v-else class="h-4 w-4" aria-hidden="true" \/>/,
  );
  assert.match(homeIndex, /@click="toggleHeroVideoPlayback"/);

  assert.match(
    homeIndex,
    /video\.addEventListener\("play", \(\) => \{\s*\n\s*isHeroVideoPlaying\.value = true;\s*\n\s*\}\);/,
  );
  assert.match(
    homeIndex,
    /video\.addEventListener\("pause", \(\) => \{\s*\n\s*isHeroVideoPlaying\.value = false;\s*\n\s*\}\);/,
  );
});

test("toggleHeroVideoPlayback plays or pauses the real video element based on its own paused state", () => {
  const start = homeIndex.indexOf("function toggleHeroVideoPlayback()");
  const end = homeIndex.indexOf("\n}", start);
  const body = homeIndex.slice(start, end);
  assert.match(body, /if \(video\.paused\) \{\s*\n\s*video\.play\(\)\.catch\(\(\) => \{\}\);\s*\n\s*\} else \{\s*\n\s*video\.pause\(\);/);
});

test("Fullscreen targets the frame element (not just the <video>), tries the standard Fullscreen API first, and falls back to iOS's element-level video fullscreen when unsupported -- a click never throws even when the browser refuses it", () => {
  assert.match(
    homeIndex,
    /:aria-label="isHeroVideoFullscreen \? 'Exit fullscreen' : 'View fullscreen'"/,
  );
  assert.match(homeIndex, /:aria-pressed="isHeroVideoFullscreen"/);
  assert.match(
    homeIndex,
    /<Minimize v-if="isHeroVideoFullscreen" class="h-4 w-4" aria-hidden="true" \/>\s*\n\s*<Maximize v-else class="h-4 w-4" aria-hidden="true" \/>/,
  );
  assert.match(homeIndex, /@click="toggleHeroVideoFullscreen"/);

  assert.match(
    homeIndex,
    /async function toggleHeroVideoFullscreen\(\)\s*\{\s*\n\s*const frame = heroFrameRef\.value;/,
  );
  assert.match(
    homeIndex,
    /if \(!docFsSupported \|\| !el\.requestFullscreen\) \{\s*\n\s*toggleNativeHeroVideoFullscreen\(\);\s*\n\s*return;\s*\n\s*\}/,
  );
  assert.match(homeIndex, /webkitEnterFullscreen\?\.\(\);/);
  assert.match(
    homeIndex,
    /\} catch \{\s*\n\s*\/\/ no active user gesture, or the browser refused -- nothing to recover\s*\n\s*\}/,
  );
});

test("fullscreenchange (and its webkit-prefixed variant) are wired up on mount to keep isHeroVideoFullscreen in sync, and cleaned up on unmount", () => {
  assert.match(
    homeIndex,
    /document\.addEventListener\("fullscreenchange", onHeroVideoFullscreenChange\);/,
  );
  assert.match(
    homeIndex,
    /document\.addEventListener\(\s*\n\s*"webkitfullscreenchange",\s*\n\s*onHeroVideoFullscreenChange,\s*\n\s*\);/,
  );
  assert.match(
    homeIndex,
    /onBeforeUnmount\(\(\) => \{\s*\n\s*document\.removeEventListener\(\s*\n\s*"fullscreenchange",\s*\n\s*onHeroVideoFullscreenChange,\s*\n\s*\);\s*\n\s*document\.removeEventListener\(\s*\n\s*"webkitfullscreenchange",\s*\n\s*onHeroVideoFullscreenChange,\s*\n\s*\);\s*\n\s*\}\);/,
  );
});

test("bundled video and poster assets exist and the video is reasonably sized for the web (not the original 723MB source)", async () => {
  const videoPath = new URL(
    "../public/videos/home/deafcs-hero.mp4",
    import.meta.url,
  );
  const posterPath = new URL(
    "../public/img/home/deafcs-hero-poster.jpg",
    import.meta.url,
  );
  await access(videoPath);
  await access(posterPath);

  const { size } = await stat(videoPath);
  assert.ok(
    size < 20 * 1024 * 1024,
    `expected the optimized hero video to be under 20MB, got ${(size / 1024 / 1024).toFixed(2)}MB`,
  );
});
