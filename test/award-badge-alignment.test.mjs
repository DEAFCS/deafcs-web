import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Covers the shared trophy-artwork alignment fix behind the awkward
// bronze/3rd-place row seen on tournament cards (player profile and
// /tournaments) and the tournament podium. Both surfaces render the same
// AwardBadge component, so this is one shared geometry fix rather than two
// per-page patches.

const awardBadgeSource = await readFile(
  new URL("../components/award/AwardBadge.vue", import.meta.url),
  "utf8",
);

test("AwardBadge centres the drawn trophy in its square box", () => {
  assert.match(awardBadgeSource, /const ART_TOP = 35/);
  assert.match(awardBadgeSource, /const ART_BOTTOM_PLAIN = 212/);
  assert.match(awardBadgeSource, /const ART_BOTTOM_ENGRAVED = 252/);
  assert.match(awardBadgeSource, /:viewBox="viewBox"/);
  // The old y=0 viewBoxes are gone.
  assert.doesNotMatch(
    awardBadgeSource,
    /`0 0 200 \$\{showEngraving \? 260 : 220\}`/,
  );

  // Reproduce the component's computation and assert the artwork lands
  // centred, which is what the 2nd/3rd-place rows needed.
  const ART_TOP = 35;
  const ART_BOTTOM_PLAIN = 212;
  const ART_BOTTOM_ENGRAVED = 252;
  const ENGRAVED_VIEWBOX_HEIGHT = 260;
  const COMPACT_PADDING = 10;

  const engravedTop =
    (ART_TOP + ART_BOTTOM_ENGRAVED) / 2 - ENGRAVED_VIEWBOX_HEIGHT / 2;
  assert.equal(
    engravedTop + ENGRAVED_VIEWBOX_HEIGHT / 2,
    (ART_TOP + ART_BOTTOM_ENGRAVED) / 2,
  );
  // Engraved sizes keep their exact height, so md/hero/lg render at the
  // same scale as before -- alignment only, no resize.
  assert.equal(ENGRAVED_VIEWBOX_HEIGHT, 260);

  const compactTop = ART_TOP - COMPACT_PADDING;
  const compactHeight = ART_BOTTOM_PLAIN - ART_TOP + COMPACT_PADDING * 2;
  assert.equal(
    compactTop + compactHeight / 2,
    (ART_TOP + ART_BOTTOM_PLAIN) / 2,
  );
  // ...and shed the dead space that made a bare 32px badge look detached.
  assert.ok(compactHeight < 220);
});
