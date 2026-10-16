import { beforeAll, describe, expect, it, vi } from "vitest";
import { print } from "graphql";
import { readFileSync } from "node:fs";
import path from "node:path";
import mapLabel from "../../utilities/mapLabel";

// A workshop map's `name` is its Workshop ID and is what game servers, the veto
// and match records use; people should only ever see its label. In production
// six Duel copies of workshop maps had no label (their Competitive rows did),
// because copying a map into another mode dropped it. 5Stack has the same copy.
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));
vi.stubGlobal("useApplicationSettingsStore", () => ({ settings: [], showSeparators: false }));
vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));

const read = (file: string) => readFileSync(path.resolve(__dirname, "../..", file), "utf8");

const aimRedline = {
  id: "9d5affa3",
  name: "3199551320",
  label: "aim_redline",
  type: "Competitive",
  workshop_map_id: "3199551320",
  poster: "https://images.steamusercontent.com/ugc/x/y/",
  patch: null,
  active_pool: false,
  enabled: true,
};

let MapPoolRow: any;
let MapPoolsPage: any;
beforeAll(async () => {
  MapPoolRow = (await import("../../components/map-pools/MapPoolRow.vue")).default;
  MapPoolsPage = (await import("../../pages/settings/application/map-pools/index.vue")).default;
});

describe("workshop map names", () => {
  it("mapLabel shows the label, never the Workshop ID, when there is one", () => {
    expect(mapLabel(aimRedline)).toBe("aim_redline");
    expect(mapLabel({ name: "de_ancient", label: null })).toBe("Ancient");
  });

  it("copying a map into another mode keeps its label, and leaves the Workshop ID alone", async () => {
    const mutate = vi.fn().mockResolvedValue({});
    await MapPoolRow.methods.togglePoolType.call(
      { $apollo: { mutate }, $t: (key: string) => key },
      { ...aimRedline, poolTypes: ["Competitive"] },
      "Duel",
    );
    const query = print(mutate.mock.calls[0][0].mutation);
    expect(query).toContain("insert_maps");
    expect(query).toMatch(/label:\s*"aim_redline"/);
    expect(query).toMatch(/name:\s*"3199551320"/);
    expect(query).toMatch(/workshop_map_id:\s*"3199551320"/);
    expect(query).toMatch(/type:\s*Duel/);
  });

  it("the map pools list shows a label from any of a map's rows", () => {
    const unlabeledDuel = { ...aimRedline, id: "598e0660", type: "Duel", label: null };
    for (const maps of [[unlabeledDuel, aimRedline], [aimRedline, unlabeledDuel]]) {
      const [row] = MapPoolsPage.computed.availableMaps.call({ maps, searchQuery: "" });
      expect(row.label).toBe("aim_redline");
      expect(row.name).toBe("3199551320");
      expect(row.poolTypes).toEqual(expect.arrayContaining(["Competitive", "Duel"]));
    }
  });

  it("match lists, buy types and the watch ticker read the label", () => {
    expect(read("components/MatchTableRow.vue")).not.toMatch(/cleanMapName\(match_map\.map\.name\)/);
    expect(read("components/MatchTableRow.vue")).toContain("mapLabel(match_map.map)");
    expect(read("components/match/LineupBuyTypes.vue")).toContain("displayMapLabel(match_map.map)");
    expect(read("components/charts/LastTenWinsAndLosses.vue")).not.toMatch(/cleanMapName\(map\.name\)/);
    // The match header, veto rail and map cards already go through mapLabel.
    expect(read("components/match/MatchMaps.vue")).toContain("mapLabel(matchMap.map)");
    expect(read("components/watch/watchTicker.ts")).toContain("if (mm?.map?.label) return mm.map.label;");
  });
});
