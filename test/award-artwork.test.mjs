import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  resolveAwardArtwork,
  resolveAwardImageUrl,
} from "../utilities/awardArtwork.ts";

const builtIns = [
  ["tournament_gold", "gold", 1],
  ["tournament_silver", "silver", 2],
  ["tournament_bronze", "bronze", 3],
  ["tournament_mvp", "mvp", 0],
];

const source = (path) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("custom artwork overrides recognized built-in artwork", () => {
  const resolved = resolveAwardArtwork(
    {
      id: "award-id",
      name: "Tournament Runner-Up",
      tier: "silver",
      system_key: "tournament_silver",
      silhouette: 3,
      image_url: "awards/runner-up.webp",
    },
    "api.deafcs.test",
  );

  assert.equal(resolved.kind, "custom-image");
  assert.equal(
    resolved.imageUrl,
    "https://api.deafcs.test/avatars/awards/runner-up.webp",
  );
  assert.equal(resolved.altText, "Tournament Runner-Up award artwork");
});

for (const [systemKey, tier, placement] of builtIns) {
  test(`${systemKey} resolves to the shared tier fallback like season awards`, () => {
    const definition = {
      id: `${systemKey}-id`,
      name: systemKey.replaceAll("_", " "),
      tier,
      system_key: systemKey,
    };
    const pickerResolution = resolveAwardArtwork(definition);
    const catalogResolution = resolveAwardArtwork({ ...definition });

    assert.deepEqual(catalogResolution, pickerResolution);
    assert.equal(pickerResolution.kind, "tier-fallback");
    assert.equal(pickerResolution.placement, placement);
    assert.equal(pickerResolution.seed, definition.id);
  });
}

test("an explicit silhouette uses detailed artwork for a custom definition", () => {
  const resolved = resolveAwardArtwork({
    id: "custom-silver",
    name: "2v2 Cup Runner-Up",
    tier: "silver",
    silhouette: 2,
  });

  assert.equal(resolved.kind, "silhouette");
  assert.equal(resolved.placement, 2);
  assert.equal(resolved.silhouette, 2);
  assert.equal(resolved.seed, "custom-silver");
});

test("definitions without an image or recognized artwork use a tier fallback", () => {
  const resolved = resolveAwardArtwork({
    id: "plain-bronze",
    name: "Community Third",
    tier: "bronze",
  });

  assert.equal(resolved.kind, "tier-fallback");
  assert.equal(resolved.imageUrl, null);
  assert.match(resolved.tierColor, /^hsl\(/);
});

test("a failed custom image falls back to the shared tier fallback", () => {
  const definition = {
    id: "runner-up",
    name: "Tournament Runner-Up",
    tier: "silver",
    system_key: "tournament_silver",
    image_url: "awards/missing.webp",
  };

  assert.equal(resolveAwardArtwork(definition).kind, "custom-image");
  const fallback = resolveAwardArtwork(definition, null, { ignoreImage: true });
  assert.equal(fallback.kind, "tier-fallback");
  assert.equal(fallback.seed, "runner-up");
});

test("award and legacy trophy image paths retain their correct endpoints", () => {
  assert.equal(
    resolveAwardImageUrl("image.webp", "api.deafcs.test"),
    "https://api.deafcs.test/avatars/awards/image.webp",
  );
  assert.equal(
    resolveAwardImageUrl("image.webp", "api.deafcs.test", "trophies"),
    "https://api.deafcs.test/trophies/image.webp",
  );
  assert.equal(
    resolveAwardImageUrl("trophies/cup.webp", "api.deafcs.test"),
    "https://api.deafcs.test/trophies/cup.webp",
  );
});

test("all award-definition surfaces render through AwardArtwork", async () => {
  const [picker, catalog, detail, management, component] = await Promise.all([
    source("../components/tournament/TournamentAwardPicker.vue"),
    source("../pages/awards/index.vue"),
    source("../pages/awards/[id].vue"),
    source("../pages/awards/manage.vue"),
    source("../components/award/AwardArtwork.vue"),
  ]);

  for (const page of [picker, catalog, detail, management]) {
    assert.match(page, /import AwardArtwork/);
    assert.match(page, /<AwardArtwork/);
  }
  assert.match(catalog, /silhouette[\s\S]*image_url[\s\S]*system_key/);
  assert.match(detail, /tier[\s\S]*silhouette[\s\S]*image_url[\s\S]*system_key/);
  assert.match(component, /resolveAwardArtwork/);
  assert.match(component, /data-award-artwork="artwork\.kind"/);
});

test("the tier-fallback icon keeps consistent padding at every size", async () => {
  const component = await source("../components/award/AwardArtwork.vue");

  // Derived from the box, not a parallel table. The old table drifted between
  // 0.67 and 0.78 of the box, so the same trophy sat with visibly different
  // margins depending on the size it was asked for.
  assert.match(component, /const FALLBACK_ICON_RATIO = 5 \/ 7/);
  assert.match(component, /const fallbackIconPixels = computed\(/);
  assert.doesNotMatch(component, /fallbackIconClasses/);

  // Reproduce the component's own arithmetic over its own box sizes.
  const boxes = { xs: 32, sm: 56, md: 112, hero: 144, lg: 192 };
  const iconFor = (box) => Math.round((box * (5 / 7)) / 2) * 2;

  const ratios = [];
  for (const [size, box] of Object.entries(boxes)) {
    const icon = iconFor(box);
    const margin = (box - icon) / 2;

    assert.ok(icon < box, `${size}: the icon must fit inside its box`);
    assert.ok(margin >= 4, `${size}: needs breathing room, got ${margin}px`);
    assert.equal(margin % 1, 0, `${size}: must centre on whole pixels`);
    ratios.push(icon / box);
  }

  // Every size lands on comparable proportional margins, so gold (sm on a
  // tournament card) and silver/bronze (xs on the runner-up rows) read the
  // same rather than one looking tighter than the others.
  assert.ok(
    Math.max(...ratios) - Math.min(...ratios) < 0.04,
    `fallback icon ratios drifted: ${ratios.join(", ")}`,
  );

  // The two sizes that already read correctly are untouched.
  assert.equal(iconFor(boxes.sm), 40);
  assert.equal(iconFor(boxes.md), 80);

  // `xs` sits in dense last-in-container rows (the compact card's 3rd-place
  // row is the final child of a fixed-height overflow-hidden card), where the
  // trophy's bottom stroke straddled the clip edge by ~0.5px. One pixel up
  // clears it while staying inside the box. Larger sizes must not move.
  assert.match(component, /props\.size === "xs" \? "translateY\(-1px\)" : undefined/);
  assert.match(component, /transform: fallbackIconTransform,/);

  // The nudge must keep the icon fully inside its box at xs: 22px icon in a
  // 32px box leaves 5px, and lucide's trophy insets its ink by 1/24 of the
  // icon, so a 1px shift still clears both edges.
  const xsIcon = iconFor(boxes.xs);
  const xsInk = (1 / 24) * xsIcon;
  const xsMargin = (boxes.xs - xsIcon) / 2;
  assert.ok(xsMargin + xsInk - 1 > 0, "xs ink must clear the box bottom");
  assert.ok(xsMargin + xsInk + 1 < boxes.xs, "xs ink must clear the box top");

  // Custom images and explicit silhouettes are unaffected: they never reach
  // this branch, and neither renderer is sized or transformed from it.
  assert.match(component, /class="h-full w-full object-contain/);
  assert.match(component, /:size="size"/);
  const fallbackBranch = component.slice(component.indexOf("<Trophy"));
  assert.match(fallbackBranch, /transform: fallbackIconTransform/);
  const beforeFallback = component.slice(0, component.indexOf("<Trophy"));
  assert.doesNotMatch(beforeFallback, /transform: fallbackIconTransform/);
});

test("broken images are replaced by an accessible fallback", async () => {
  const [component, badge] = await Promise.all([
    source("../components/award/AwardArtwork.vue"),
    source("../components/award/AwardBadge.vue"),
  ]);

  assert.match(component, /@error="markImageUnavailable"/);
  assert.match(component, /ignoreImage: failedImage\.value === props\.award\.image_url/);
  assert.match(component, /:alt="decorative \? '' : artwork\.altText"/);
  assert.match(component, /:aria-label="decorative \? undefined : artwork\.altText"/);
  assert.match(badge, /resolveAwardImageUrl/);
  assert.match(badge, /systemKeyForTournamentAwardPlacement\(props\.placement\)/);
  assert.match(badge, /@error="imageLoadFailed = true"/);
});
