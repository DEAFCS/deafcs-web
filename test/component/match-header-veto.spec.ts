import { beforeAll, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { mapVetoOrder } from "../../utilities/vetoOrder";
import { mapVetoSteps, viewerSlot } from "../../utilities/vetoLineups";
import { vetoBoardUp } from "../../utilities/vetoStage";

// The header's veto rail (5Stack WEB 85b4f0f9). DEAFCS reads the order from
// the api's map_veto_sequence instead of 5Stack's TypeScript copy of its own
// (different) veto rules.
const picksResult = ref<any>(null);
const useQuery = vi.fn((_query: any, _vars: any, options: any) => {
  useQuery.lastOptions = options;
  return { result: picksResult };
}) as any;
vi.mock("@vue/apollo-composable", () => ({ useQuery: (...args: any[]) => useQuery(...args) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => ({ me: { steam_id: "7" } }) }));
vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiDomain: "api.test" } }));

// A best of 3 on a seven-map pool, as get_map_veto_sequence returns it.
const sequence = [
  { index: 0, type: "Ban", team: 1 },
  { index: 1, type: "Ban", team: 2 },
  { index: 2, type: "Pick", team: 1 },
  { index: 3, type: "Side", team: 2 },
  { index: 4, type: "Pick", team: 2 },
  { index: 5, type: "Side", team: 1 },
  { index: 6, type: "Ban", team: 2 },
  { index: 7, type: "Ban", team: 1 },
  { index: 8, type: "Decider", team: 1 },
];
const pool = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id, name: `de_${id}`, label: id.toUpperCase() }));
const match = (extra: any = {}) => ({
  id: "m",
  status: "Live",
  source: "5stack",
  lineup_1_id: "l1",
  lineup_2_id: "l2",
  lineup_1: { name: "Alpha", lineup_players: [{ steam_id: "7" }] },
  lineup_2: { name: "Bravo", lineup_players: [] },
  options: { map_veto: true, best_of: 3, map_pool: { maps: pool } },
  map_veto_sequence: sequence,
  is_server_online: true,
  match_maps: [{ id: "mm1", order: 1, status: "Live", map: { id: "c" } }],
  ...extra,
});

let MatchHeaderVeto: any;
beforeAll(async () => {
  MatchHeaderVeto = (await import("../../components/match/MatchHeaderVeto.vue")).default;
});

describe("veto order from the api", () => {
  it("follows map_veto_sequence step for step, the decider closing itself", () => {
    const order = mapVetoOrder(match());
    expect(order.map((s) => s.type)).toEqual(sequence.map((s) => s.type));
    expect(order.map((s) => s.lineup)).toEqual([1, 2, 1, 2, 2, 1, 2, 1, null]);
  });

  it("is empty when the api has no valid veto", () => {
    expect(mapVetoOrder(match({ map_veto_sequence: null }))).toEqual([]);
  });

  it("fills the steps with the picks made so far", () => {
    const steps = mapVetoSteps(match(), [
      { map: { id: "a" }, type: "Ban", match_lineup_id: "l1" },
      { map: { id: "b" }, type: "Ban", match_lineup_id: "l2" },
    ]);
    expect(steps[0].record).toMatchObject({ itemId: "a", lineup: 1 });
    expect(steps[1].record).toMatchObject({ itemId: "b", lineup: 2 });
    expect(steps[2].record).toBeNull();
  });

  it("knows which lineup the viewer plays on", () => {
    expect(viewerSlot(match(), "7")).toBe(1);
    expect(viewerSlot(match(), "8")).toBeNull();
  });

  it("leaves the veto itself to the veto view", () => {
    expect(vetoBoardUp(match({ status: "Veto" }))).toBe(true);
    expect(vetoBoardUp(match())).toBe(false);
  });
});

describe("MatchHeaderVeto", () => {
  it("shows the order of play once the veto is over, without asking for auto_picked", async () => {
    picksResult.value = {
      match_map_veto_picks: [{ id: "p1", map: { id: "a" }, side: null, type: "Ban", match_lineup_id: "l1" }],
    };
    const w = mount(MatchHeaderVeto, { props: { match: match() } });
    await flushPromises();
    expect(w.text()).toContain("match.header.veto");
    expect(w.findAll(".vb-railstep")).toHaveLength(sequence.length);
    const query = String(useQuery.mock.calls.at(-1)[0].loc?.source?.body ?? "");
    expect(query).toContain("match_map_veto_picks");
    expect(query).not.toContain("auto_picked");
  });

  it("stays away during the veto and for a match with no map veto", async () => {
    picksResult.value = { match_map_veto_picks: [{ id: "p1", map: { id: "a" }, type: "Ban", match_lineup_id: "l1" }] };
    for (const m of [match({ status: "Veto" }), match({ options: { map_veto: false, best_of: 3, map_pool: { maps: pool } } })]) {
      const w = mount(MatchHeaderVeto, { props: { match: m } });
      await flushPromises();
      expect(w.text()).not.toContain("match.header.veto");
    }
  });
});
