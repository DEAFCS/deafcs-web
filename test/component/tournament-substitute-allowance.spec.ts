import { describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

// Saving a tournament's match settings must keep the substitute allowance the
// tournament already has. A tournament created with 0 (every Random / Free
// Agent event so far) must stay at 0; only a NEW tournament takes the current
// global allowance (see the create wizard).
const toast = vi.hoisted(() => vi.fn());
vi.mock("~/components/ui/toast", () => ({ toast }));
vi.mock("~/stores/ApplicationSettings", () => ({
  useApplicationSettingsStore: () => ({ availableRegions: [], settings: [], teamMaxSubs: 2 }),
}));
vi.mock("~/stores/AuthStore", () => ({
  useAuthStore: () => ({ isAdmin: true, isRoleAbove: () => true }),
}));

// Nuxt auto-imports used inside the form.
vi.stubGlobal("useApplicationSettingsStore", () => ({
  availableRegions: [],
  settings: [],
  teamMaxSubs: 2,
}));
vi.stubGlobal("useAuthStore", () => ({ isAdmin: true, isRoleAbove: () => true }));

import Form from "../../components/tournament/TournamentMatchOptionsForm.vue";

const pool = "00000000-0000-4000-8000-000000000003";

const tournament = (allowance: number) => ({
  id: "t1",
  is_organizer: true,
  status: "Setup",
  auto_start: false,
  scheduling_mode: "auto",
  min_role: null,
  substitutes_enabled: true,
  options: {
    id: "options-1",
    type: "Competitive",
    mr: 12,
    best_of: 1,
    overtime: true,
    knife_round: true,
    coaches: false,
    number_of_substitutes: allowance,
    map_veto: true,
    region_veto: true,
    regions: [],
    tv_delay: 115,
    timeout_setting: "Admin",
    tech_timeout_setting: "Admin",
    ready_setting: "Players",
    check_in_setting: "Players",
    match_mode: "auto",
    default_models: false,
    prefer_dedicated_server: false,
    auto_cancellation: false,
    auto_cancel_duration: 5,
    live_match_timeout: 30,
    map_pool: { id: pool, maps: [] },
  },
});

function mountForm(allowance: number) {
  const mutate = vi.fn().mockResolvedValue({ data: {} });
  const wrapper = shallowMount(Form as any, {
    props: { tournament: tournament(allowance) },
    global: {
      plugins: [
        createI18n({
          legacy: true,
          locale: "en",
          missingWarn: false,
          fallbackWarn: false,
          messages: { en: {} },
        }),
      ],
      config: { globalProperties: { $apollo: { mutate } } as any },
    },
  });
  return { wrapper, mutate };
}

const optionsUpdate = (mutate: ReturnType<typeof vi.fn>) =>
  mutate.mock.calls
    .map((call) => call[0])
    .find((arg) => arg?.variables && "number_of_substitutes" in arg.variables);

describe("editing tournament match options keeps the substitute allowance", () => {
  it.each([0, 1, 2, 3])("an existing allowance of %i is saved unchanged", async (allowance) => {
    const { wrapper, mutate } = mountForm(allowance);
    const vm = wrapper.vm as any;
    expect(vm.form.values.number_of_substitutes).toBe(allowance);

    await vm.save();

    const update = optionsUpdate(mutate);
    expect(update).toBeDefined();
    expect(update.variables.number_of_substitutes).toBe(allowance);
    wrapper.unmount();
  });

  it("a Random / Free Agent style tournament with 0 substitutes stays at 0 even though the global allowance is 2", async () => {
    const { wrapper, mutate } = mountForm(0);
    await (wrapper.vm as any).save();
    expect(optionsUpdate(mutate).variables.number_of_substitutes).toBe(0);
    wrapper.unmount();
  });

  it("the shared MatchOptions component only follows the global allowance when it is not told to keep the tournament's own", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(
      resolve(__dirname, "../../components/MatchOptions.vue"),
      "utf8",
    );
    expect(source).toContain("keepSubstituteAllowance");
    expect(
      (source.match(/lockSubstitutes && !this\.keepSubstituteAllowance/g) ?? []).length,
    ).toBe(2);
  });
});

import { newTournamentSubstituteAllowance } from "../../utilities/tournamentSubstituteAllowance";

describe("a NEW tournament's substitute allowance", () => {
  it("normal premade-team tournaments take the global default", () => {
    expect(newTournamentSubstituteAllowance({ registration_type: "teams" }, 2)).toBe(2);
    expect(newTournamentSubstituteAllowance({}, 3)).toBe(3);
  });

  it("'both' (premade teams plus free agents) takes the global default", () => {
    expect(newTournamentSubstituteAllowance({ registration_type: "both" }, 2)).toBe(2);
  });

  it("Random (individual registration) starts at 0", () => {
    expect(
      newTournamentSubstituteAllowance(
        { individual_registration_enabled: true, registration_type: "free_agents" },
        2,
      ),
    ).toBe(0);
    expect(newTournamentSubstituteAllowance({ individual_registration_enabled: true }, 5)).toBe(0);
  });

  it("Free Agent tournaments start at 0", () => {
    expect(newTournamentSubstituteAllowance({ registration_type: "free_agents" }, 2)).toBe(0);
  });

  it("the create wizard applies it at submit, and editing never does", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
    expect(read("components/tournament/TournamentCreateWizard.vue")).toContain(
      "newTournamentSubstituteAllowance(",
    );
    expect(read("components/tournament/TournamentMatchOptionsForm.vue")).not.toContain(
      "newTournamentSubstituteAllowance",
    );
  });
});
