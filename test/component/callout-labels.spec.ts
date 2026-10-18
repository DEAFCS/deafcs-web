import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoUtilityName, calloutLabel } from "~/utilities/mapCallouts";
import type { MapCallout } from "~/utilities/mapCallouts";

// DEAFCS: administrators rename callouts. The label is shown wherever the
// callout's name is; the original name stays the key and the boxes are never
// touched. An api without the labels table must still give the callouts.
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("~/graphql/getGraphqlClient", () => ({
  default: () => ({ query: state.query }),
}));

const read = (file: string) =>
  readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const box = { min: [0, 0, 0], max: [100, 100, 100] } as MapCallout["boxes"][number];
const t = (key: string, values?: Record<string, unknown>) =>
  key.endsWith("same")
    ? `${values?.to} ${values?.type}`
    : key.endsWith("Smoke")
      ? "Smoke"
      : `${key}:${JSON.stringify(values)}`;

describe("calloutLabel", () => {
  const callouts: MapCallout[] = [
    { name: "Connector", boxes: [box], label: "Jungle" },
    { name: "BombsiteA", boxes: [box], label: null },
    { name: "TopofMid", boxes: [box], label: "   " },
  ];

  it("prefers the administrator's label", () => {
    expect(calloutLabel("Connector", callouts)).toBe("Jungle");
  });

  it("falls back to the humanised original name", () => {
    expect(calloutLabel("BombsiteA", callouts)).toBe("A Site");
    expect(calloutLabel("TopofMid", callouts)).toBe("Top of Mid");
    expect(calloutLabel("Palace", callouts)).toBe("Palace");
    expect(calloutLabel("Palace")).toBe("Palace");
    expect(calloutLabel(null, callouts)).toBe("");
  });

  it("names a throw with the label", () => {
    expect(
      autoUtilityName({
        utilityType: "Smoke" as never,
        origin: { x: 50, y: 50, z: 50 },
        landing: { x: 50, y: 50, z: 50 },
        callouts: [callouts[0]],
        t,
      }),
    ).toBe("Jungle Smoke");
  });
});

describe("loadMapCallouts", () => {
  beforeEach(() => {
    vi.resetModules();
    state.query.mockReset();
  });

  const calloutsResult = {
    data: {
      map_callouts: [
        { name: "Connector", boxes: [box] },
        { name: "Window", boxes: [box] },
      ],
    },
  };

  it("merges labels into the callouts", async () => {
    state.query.mockImplementation(async ({ variables, query }: any) => {
      const source = query?.loc?.source?.body ?? "";
      expect(variables).toEqual({ mapName: "de_mirage" });
      return source.includes("map_callout_labels")
        ? { data: { map_callout_labels: [{ name: "Connector", label: "Jungle" }] } }
        : calloutsResult;
    });
    const { loadMapCallouts } = await import("~/composables/useMapCallouts");

    expect(await loadMapCallouts("de_mirage")).toEqual([
      { name: "Connector", boxes: [box], label: "Jungle" },
      { name: "Window", boxes: [box], label: null },
    ]);
  });

  it("still gives the callouts when the labels query fails", async () => {
    state.query.mockImplementation(async ({ query }: any) => {
      if ((query?.loc?.source?.body ?? "").includes("map_callout_labels")) {
        throw new Error("field 'map_callout_labels' not found in type: 'query_root'");
      }
      return calloutsResult;
    });
    const { loadMapCallouts } = await import("~/composables/useMapCallouts");

    expect((await loadMapCallouts("de_mirage")).map((c) => c.name)).toEqual([
      "Connector",
      "Window",
    ]);
  });
});

describe("where labels show and who edits them", () => {
  it("shows labels on the radar and the review tile", () => {
    expect(read("components/common/RadarCallouts.vue")).toMatch(
      /calloutLabel\(callout\.name, \[callout\]\)/,
    );
    expect(read("components/utility/UtilityReviewTile.vue")).toMatch(
      /calloutLabel\(calloutAt\(landing\.value\), callouts\.value\)/,
    );
  });

  it("puts the editor on the administrator-only Utility settings page", () => {
    expect(read("pages/settings/application/utility.vue")).toContain(
      "<UtilityCalloutLabelsPanel />",
    );
    expect(read("middleware/application-settings.global.ts")).toMatch(
      /isRoleAbove\(e_player_roles_enum\.administrator\)/,
    );
    // Not on the public Utility Library pages.
    expect(read("pages/utility/index.vue")).not.toContain("CalloutLabels");
  });

  it("never edits the callout itself", () => {
    const panel = read("components/utility/UtilityCalloutLabelsPanel.vue");
    expect(panel).not.toMatch(/insert_map_callouts|update_map_callouts|delete_map_callouts/);
    const documents = read("graphql/mapCalloutLabels.ts");
    expect(documents).toMatch(/update_columns: \[label\]/);
  });

  it("has English copy without em dashes", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    const copy = en.pages.settings.application.utility.callout_labels;
    expect(copy.title).toBe("Callout names");
    for (const value of Object.values(copy)) {
      expect(value).not.toContain("—");
    }
  });
});
