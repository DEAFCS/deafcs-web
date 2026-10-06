import { describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
vi.mock("~/stores/ApplicationSettings", () => ({ useApplicationSettingsStore: () => ({ availableRegions: [], settings: [], teamMaxSubs: 2 }) }));
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => ({ isAdmin: true, isRoleAbove: () => true }) }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));
import StageForm from "../../components/tournament/TournamentStageForm.vue";
const pool = "00000000-0000-4000-8000-000000000003";
const stagePool = "00000000-0000-4000-8000-000000000004";
const tournament = { id: "t1", is_organizer: true, status: "Setup", options: { id: "o", type: "Competitive", tv_delay: 115, region_veto: true, regions: [], best_of: 1, map_pool: { id: pool, maps: [] }, check_in_setting: "Players", ready_setting: "Players", tech_timeout_setting: "Admin", match_mode: "auto" } };
function mount(stage?: any) {
  return shallowMount(StageForm, { props: { tournament, order: 1, stage }, global: { plugins: [createI18n({ legacy: true, locale: "en", missingWarn: false, fallbackWarn: false, messages: { en: {} } })], mocks: { $apollo: { mutate: vi.fn() }, $route: { params: { tournamentId: "wrong-route-id" } } } } });
}
describe("stage settings", () => {
  it("loads and preserves an existing stage map pool through option edits", async () => {
    const w = mount({ id: "s", type: "DoubleElimination", groups: 1, min_teams: 4, max_teams: 8, default_best_of: 3, decider_best_of: 1, options: { ...tournament.options, id: "stage-options", map_pool: { id: stagePool, maps: [] } } });
    const vm = w.vm as any;
    expect(vm.form.values.map_pool_id).toBe(stagePool);
    expect(vm.form.values.default_best_of).toBe("3");
    expect(vm.form.values.decider_best_of).toBe("1");
    expect(vm.hasAdvancedSettingsChanged()).toBe(true);
    const mutate = vi.fn().mockResolvedValue({ data: {} });
    await (StageForm as any).methods.updateMatchOptions.call({ tournament, $apollo: { mutate } }, "stage-options", vm.form.values);
    expect(mutate.mock.calls[0][0].variables.map_pool_id).toBe(stagePool);
    w.unmount();
  });
  it.each(["SingleElimination", "DoubleElimination", "RoundRobin", "Swiss"])("accepts %s with valid team counts and BO", async type => {
    const w = mount(); const vm = w.vm as any;
    vm.form.setValues({ stage_type: type, min_teams: "4", max_teams: "8", default_best_of: "3", groups: 1 });
    expect((await vm.form.validate()).valid).toBe(true);
    w.unmount();
  });
  it("rejects unsupported formats and best-of values before any mutation", async () => {
    const w = mount(); const vm = w.vm as any;
    vm.form.setValues({ stage_type: "Unsupported", min_teams: "4", max_teams: "8", default_best_of: "2" });
    const result = await vm.form.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.stage_type).toBeTruthy();
    expect(result.errors.default_best_of).toBeTruthy();
    w.unmount();
  });
});
