import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import cleanMapName from "../utilities/cleanMapName.ts";

// Regression coverage for the completed "Map Veto" section showing a raw
// Steam Workshop map ID (e.g. 3539217452) instead of its resolved name.
//
// The live veto UI (MatchMapVeto.vue) subscribes to match_map_veto_picks
// with `map: { id, name, label, patch, poster }` and passes those picks down
// to MatchPicksDisplay via the `:picks` prop, so `label` is always present
// there. The completed-match page mounts MatchPicksDisplay *without* a
// `:picks` prop, so it falls back to its own internal Apollo query -- which
// was missing `label`, even though the render expression
// (`pick.map?.label || cleanMapName(pick.map.name)`) is identical in both
// places. For workshop maps, `map.name` is the raw numeric workshop ID and
// `map.label` holds the real title; without `label` in the query, the
// fallback silently returns the numeric ID unchanged.
const componentSource = await readFile(
  new URL("../components/match/MatchPicksDisplay.vue", import.meta.url),
  "utf8",
);

// The exact expression MatchPicksDisplay.vue uses to resolve a pick's
// display name (mirrors the live veto UI's MapDisplay.vue and every other
// label-resolution site in the codebase).
function resolvedMapLabel(map) {
  return map?.label || (map?.name && cleanMapName(map.name));
}

test("MatchPicksDisplay's own fallback query now selects map.label, matching the live veto subscription", () => {
  // What matters is that `map: { ... }` in the component's own query
  // includes `label: true` alongside `name`.
  const mapSelection = componentSource.match(
    /map:\s*\{\s*id:\s*true,\s*name:\s*true,\s*label:\s*true,\s*patch:\s*true,\s*poster:\s*true,\s*\}/,
  );
  assert.ok(
    mapSelection,
    "the map selection in MatchPicksDisplay's own query must include label: true",
  );
});

test("a completed workshop veto pick displays its resolved map name, not the numeric workshop ID", () => {
  const workshopPick = {
    map: { id: "map-1", name: "3539217452", label: "Overpass Reimagined" },
  };

  const label = resolvedMapLabel(workshopPick.map);

  assert.equal(label, "Overpass Reimagined");
  assert.notEqual(label, "3539217452");
  assert.doesNotMatch(String(label), /^\d+$/);
});

test("a second workshop map (different numeric ID) also resolves via its label", () => {
  const workshopPick = {
    map: { id: "map-2", name: "3408790618", label: "Anubis Community Remix" },
  };

  assert.equal(resolvedMapLabel(workshopPick.map), "Anubis Community Remix");
});

test("built-in maps still resolve their display name without a label", () => {
  const builtInPick = {
    map: { id: "map-3", name: "de_dust2", label: null },
  };

  assert.equal(resolvedMapLabel(builtInPick.map), "Dust2");
});

test("cleanMapName alone would regress a workshop ID to itself (the bug this guards against)", () => {
  // Documents *why* label must be present: without it, the fallback chain
  // has nothing else to clean a purely numeric workshop ID into.
  assert.equal(cleanMapName("3539217452"), "3539217452");
});
