import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The team card's decorative hover corners were positioned with negative
// offsets (-left-[1px]/-top-[1px] and -bottom-[1px]/-right-[1px]) -- meant
// to sit exactly on the card's own border. But the card itself has
// overflow-hidden (for its rounded corners and the fade-in/slide-in entry
// animation), which clips anything positioned even 1px outside its box.
// The negative offsets pushed the corner brackets partly outside the card,
// so overflow-hidden silently cut them off -- confirmed in a real browser
// (production build): before the fix, opacity flips to 1 on hover but the
// brackets render nowhere near the rounded corners; after, both sit
// cleanly inset (verified via getBoundingClientRect: 5px from each edge,
// well within the card's bounds) and are visible on hover.
const tableSource = await readFile(
  new URL("../components/TeamsTable.vue", import.meta.url),
  "utf8",
);

test("the card itself still clips overflow (the reason the corners must stay inside its box, not outside it)", () => {
  assert.match(
    tableSource,
    /class="group team-card relative flex flex-col gap-3 overflow-hidden rounded-lg/,
  );
});

test("the top-left hover corner is positioned inside the card (left-1 top-1), not outside it with a negative offset", () => {
  assert.match(
    tableSource,
    /class="pointer-events-none absolute left-1 top-1 h-3 w-3 border-l-2 border-t-2 border-\[hsl\(var\(--tac-amber\)\/0\.55\)\] opacity-0 transition-opacity duration-200 group-hover:opacity-100"/,
  );
  assert.doesNotMatch(tableSource, /-left-\[1px\]/);
  assert.doesNotMatch(tableSource, /-top-\[1px\]/);
});

test("the bottom-right hover corner is positioned inside the card (bottom-1 right-1), not outside it with a negative offset", () => {
  assert.match(
    tableSource,
    /class="pointer-events-none absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2 border-\[hsl\(var\(--tac-amber\)\/0\.55\)\] opacity-0 transition-opacity duration-200 group-hover:opacity-100"/,
  );
  assert.doesNotMatch(tableSource, /-bottom-\[1px\]/);
  assert.doesNotMatch(tableSource, /-right-\[1px\]/);
});

test("hover-trigger mechanics (group / group-hover / opacity-0 / transition) are untouched -- only the position changed", () => {
  const cornersBlock = tableSource.slice(
    tableSource.indexOf('class="group team-card'),
    tableSource.indexOf('<!-- Header:'),
  );
  assert.equal(
    (cornersBlock.match(/aria-hidden="true"/g) || []).length,
    2,
    "expected exactly the two decorative corner spans",
  );
  assert.equal(
    (cornersBlock.match(/opacity-0/g) || []).length,
    2,
  );
  assert.equal(
    (cornersBlock.match(/group-hover:opacity-100/g) || []).length,
    2,
  );
  assert.equal(
    (cornersBlock.match(/pointer-events-none/g) || []).length,
    2,
  );
});
