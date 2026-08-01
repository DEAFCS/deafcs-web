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
  test(`${systemKey} resolves to stable detailed built-in artwork`, () => {
    const definition = {
      id: `${systemKey}-id`,
      name: systemKey.replaceAll("_", " "),
      tier,
      system_key: systemKey,
    };
    const pickerResolution = resolveAwardArtwork(definition);
    const catalogResolution = resolveAwardArtwork({ ...definition });

    assert.deepEqual(catalogResolution, pickerResolution);
    assert.equal(pickerResolution.kind, "built-in");
    assert.equal(pickerResolution.placement, placement);
    assert.equal(pickerResolution.seed, systemKey);
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

test("a failed custom image falls back without changing built-in identity", () => {
  const definition = {
    id: "runner-up",
    name: "Tournament Runner-Up",
    tier: "silver",
    system_key: "tournament_silver",
    image_url: "awards/missing.webp",
  };

  assert.equal(resolveAwardArtwork(definition).kind, "custom-image");
  const fallback = resolveAwardArtwork(definition, null, { ignoreImage: true });
  assert.equal(fallback.kind, "built-in");
  assert.equal(fallback.seed, "tournament_silver");
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
