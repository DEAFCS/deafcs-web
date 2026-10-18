import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeDutyNames,
  orderActiveDutyFirst,
  splitActiveDuty,
} from "~/utilities/activeDutyMaps";

// DEAFCS: Active Duty maps (maps.active_pool) come first in the Utility Library
// and the Pracc picker. Other maps stay one choice away, nothing is removed.
const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const rows = [
  { name: "de_ancient", active_pool: true },
  { name: "de_dust2", active_pool: true },
  { name: "de_mirage", active_pool: true },
  { name: "de_overpass", active_pool: false },
  { name: "de_train", active_pool: false },
  { name: "de_vertigo", active_pool: null },
  // A Wingman row of an Active Duty map with the flag off does not demote it.
  { name: "de_mirage", active_pool: false },
];

describe("activeDutyMaps", () => {
  it("collects the names flagged active_pool on any row", () => {
    expect([...activeDutyNames(rows)].sort()).toEqual([
      "de_ancient",
      "de_dust2",
      "de_mirage",
    ]);
  });

  it("splits without dropping anything and keeps each group's order", () => {
    const items = [
      "de_ancient",
      "de_dust2",
      "de_mirage",
      "de_overpass",
      "de_train",
      "de_vertigo",
    ].map((name) => ({ name }));
    const { active, other } = splitActiveDuty(items, activeDutyNames(rows));

    expect(active.map((m) => m.name)).toEqual([
      "de_ancient",
      "de_dust2",
      "de_mirage",
    ]);
    expect(other.map((m) => m.name)).toEqual([
      "de_overpass",
      "de_train",
      "de_vertigo",
    ]);
    expect(active.length + other.length).toBe(items.length);
  });

  it("orders Active Duty first", () => {
    const items = [{ name: "de_train" }, { name: "de_mirage" }, { name: "de_overpass" }];
    expect(orderActiveDutyFirst(items, activeDutyNames(rows)).map((m) => m.name)).toEqual([
      "de_mirage",
      "de_train",
      "de_overpass",
    ]);
  });

  it("puts everything in Other maps when no map is flagged", () => {
    const { active, other } = splitActiveDuty([{ name: "de_mirage" }], new Set());
    expect(active).toEqual([]);
    expect(other).toHaveLength(1);
  });
});

describe("where the groups show", () => {
  it("asks for active_pool in the Utility Library and the Pracc tile", () => {
    expect(read("composables/useUtilityMaps.ts")).toMatch(/active_pool: true/);
    expect(read("components/play/PlayPracticeTile.vue")).toMatch(
      /name: true, active_pool: true/,
    );
  });

  it("offers Active Duty and Other maps in the Utility Library", () => {
    const page = read("pages/utility/index.vue");
    expect(page).toContain('data-testid="utility-map-groups"');
    expect(page).toContain("pages.utility.picker.active_duty");
    expect(page).toContain("pages.utility.picker.other_maps");
    expect(page).toMatch(/v-for="tile of shownTiles"/);
  });

  it("groups the Pracc map picker", () => {
    const tile = read("components/play/PlayPracticeTile.vue");
    expect(tile).toMatch(/<SelectLabel[^>]*>\s*\{\{ \$t\("pages\.utility\.picker\.active_duty"\) \}\}/);
    expect(tile).toMatch(/v-for="map in otherMaps"/);
  });

  it("has English labels", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    expect(en.pages.utility.picker.active_duty).toBe("Active Duty");
    expect(en.pages.utility.picker.other_maps).toBe("Other maps");
  });
});
