import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// DEAFCS: on the Utility Library index the whole radar sits inside its card.
// On desktop the map's name lies along the foot of the cell (absolute, about
// 2.6rem tall); the radar ends above it instead of running under it, so maps
// drawn to their image's edges (Overpass, Vertigo, Train) are not covered.
// Phones keep upstream's square with the name below it.
const tile = readFileSync(
  path.resolve(__dirname, "../../components/utility/UtilityMapPreviewTile.vue"),
  "utf8",
);

const radarClass = () => {
  const svg = tile.slice(tile.indexOf('ref="radar"'));
  return /class="([^"]+)"/.exec(svg)?.[1] ?? "";
};

describe("Utility Library map card radar", () => {
  it("keeps upstream's phone layout: a square with the name under it", () => {
    expect(radarClass()).toMatch(/(^| )absolute inset-\[7%\] h-\[86%\] w-\[86%\]( |$)/);
  });

  it("stops the desktop radar above the name bar", () => {
    const cls = radarClass();
    expect(cls).toContain("lg:top-[5%]");
    expect(cls).toContain("lg:h-[calc(95%-2.75rem)]");
    expect(cls).toContain("lg:max-w-[90%]");
    expect(cls).not.toContain("lg:h-[90%]");
  });

  it("still draws the full radar image, never a crop of it", () => {
    expect(tile).toMatch(/:viewBox="`0 0 \$\{CANVAS\} \$\{CANVAS\}`"/);
    expect(tile).toMatch(/:width="CANVAS"\s+:height="CANVAS"/);
  });
});
