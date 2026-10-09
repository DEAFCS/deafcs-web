import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string, v?: any) => (v ? `${k}:${JSON.stringify(v)}` : k) }),
}));

import TournamentMatchSetup from "../../components/tournament/TournamentMatchSetup.vue";

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8").replace(/\r\n/g, "\n");

const MatchOptionsDisplayStub = {
  name: "MatchOptionsDisplay",
  props: ["options", "substitutes", "showDetailsByDefault", "minRole"],
  template: "<div data-testid='options-display' :data-substitutes='String(substitutes)' />",
};

const pool = (id: string, n: number) => ({
  id,
  maps: Array.from({ length: n }, (_, i) => ({ id: `${id}-${i}`, name: `de_map${i}` })),
});

const tournament = (over: Record<string, any> = {}) => ({
  id: "t1",
  substitutes_enabled: true,
  min_players_per_lineup: 5,
  max_players_per_lineup: 7,
  min_role: null,
  options: { type: "Competitive", best_of: 1, map_veto: true, number_of_substitutes: 2, map_pool: pool("p", 7) },
  stages: [{ id: "s1", order: 1, type: "SingleElimination", e_tournament_stage_type: { description: "Single Elimination" }, default_best_of: 1, decider_best_of: null, options: null }],
  ...over,
});

const mountSetup = (t: any, format = "Single Elimination - BO1") =>
  mount(TournamentMatchSetup, {
    props: { tournament: t, format },
    global: {
      mocks: { $t: (k: string, v?: any) => (v ? `${k}:${JSON.stringify(v)}` : k) },
      stubs: { MatchOptionsDisplay: MatchOptionsDisplayStub },
    },
  });

const $ = (w: any, id: string) => w.find(`[data-testid="${id}"]`);

describe("Overview Match Setup", () => {
  const withRulesSlot = (t: any) =>
    mount(TournamentMatchSetup, {
      props: { tournament: t, format: "Single Elimination - BO1" },
      global: {
        mocks: { $t: (k: string, v?: any) => (v ? `${k}:${JSON.stringify(v)}` : k) },
        stubs: {
          MatchOptionsDisplay: {
            name: "MatchOptionsDisplay",
            props: ["options", "substitutes", "showDetailsByDefault", "minRole"],
            template:
              "<div data-testid='options-display' :data-substitutes='String(substitutes)'><slot name='actions' /></div>",
          },
          NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" },
        },
      },
    });

  it("no longer repeats Mode, Format, Best Of, Map veto or Substitutes", () => {
    const w = mountSetup(tournament());
    for (const id of [
      "tournament-match-setup-mode",
      "tournament-match-setup-best-of",
      "tournament-match-setup-substitutes",
      "tournament-match-setup-stages",
    ]) {
      expect($(w, id).exists()).toBe(false);
    }
    const text = w.text();
    for (const label of ["match_setup.mode", "match_setup.format", "match_setup.best_of", "match_setup.map_veto", "match_setup.substitutes"]) {
      expect(text).not.toContain(label);
    }
    expect(w.find("dl").exists()).toBe(false);
    expect(text).not.toContain("Single Elimination - BO1");
  });

  it("keeps the map pool and Show Advanced Settings (MatchOptionsDisplay) with the Tournament Rules action beside it", () => {
    const w = withRulesSlot(tournament());
    expect($(w, "options-display").exists()).toBe(true);
    const rules = $(w, "tournament-overview-rules");
    expect(rules.exists()).toBe(true);
    expect(rules.attributes("href")).toBe("/tournament-rules");
    expect(rules.text()).toBe("tournament.page.tournament_rules_action");
    // Rendered inside the display's actions slot, i.e. next to its toggle.
    expect($(w, "options-display").find('[data-testid="tournament-overview-rules"]').exists()).toBe(true);
  });

  it("substitutes ON: the advanced settings get the effective 2", () => {
    expect($(mountSetup(tournament()), "options-display").attributes("data-substitutes")).toBe("2");
  });

  it("substitutes OFF: the advanced settings show 0, not the global allowance", () => {
    const w = mountSetup(tournament({ substitutes_enabled: false, max_players_per_lineup: 5 }));
    expect($(w, "options-display").attributes("data-substitutes")).toBe("0");
  });

  it("Duel: 0 substitutes in the advanced settings", () => {
    const w = mountSetup(
      tournament({
        min_players_per_lineup: 1,
        max_players_per_lineup: 1,
        options: { type: "Duel", best_of: 1, map_veto: true, number_of_substitutes: 2, map_pool: pool("p", 5) },
      }),
    );
    expect($(w, "options-display").attributes("data-substitutes")).toBe("0");
  });
});

describe("Substitutes Enabled wiring", () => {
  const edit = read("components/tournament/TournamentMatchOptionsForm.vue");
  const wizard = read("components/tournament/TournamentCreateWizard.vue");
  const display = read("components/match/MatchOptionsDisplay.vue");
  const detail = read("components/tournament/TournamentDetail.vue");

  it("create and edit expose one ON/OFF switch, hidden for Duel, defaulting to on", () => {
    for (const src of [edit, wizard]) {
      expect(src).toContain('name="substitutes_enabled"');
      expect(src).toContain("v-if=\"form.values.type !== 'Duel'\"");
      expect(src).toContain("substitutes_enabled: z.boolean().default(true),");
      // No second, tournament-specific count field.
      expect(src).not.toMatch(/name="number_of_substitutes"/);
    }
    // A NEW tournament takes the global allowance; EDITING one keeps its own.
    expect(wizard).toContain("newTournamentSubstituteAllowance(");
    expect(wizard).toContain("useApplicationSettingsStore().teamMaxSubs,");
    expect(edit).not.toContain("useApplicationSettingsStore().teamMaxSubs");
    expect(edit).toContain(':keep-substitute-allowance="true"');
    expect(wizard).toContain("substitutes_enabled: form.substitutes_enabled ?? true,");
    expect(edit).toContain('substitutes_enabled: $("substitutes_enabled", "Boolean!"),');
  });

  it("edit locks turning it OFF after registration closes, like the API trigger", () => {
    expect(edit).toMatch(/substitutesLocked\(\) \{\n\s+return \(\n\s+this\.tournament\.substitutes_enabled !== false &&\n\s+!\[\n\s+e_tournament_status_enum\.Setup,\n\s+e_tournament_status_enum\.RegistrationOpen,\n\s+\]\.includes\(this\.tournament\.status\)/);
    expect(edit).toContain(':disabled="substitutesLocked"');
    expect(edit).toContain('tournament.form.substitutes_enabled.locked');
  });

  it("settings show the effective substitutes, falling back to the match options outside tournaments", () => {
    expect(display).toContain("substitutes ?? options.number_of_substitutes");
    // The public settings live in Overview > Match Setup (the separate
    // "Tournament Settings" tab was removed); it passes the effective count.
    const setup = read("components/tournament/TournamentMatchSetup.vue");
    expect(setup).toContain(':substitutes="isDuel ? 0 : effectiveSubstitutes"');
    expect(detail).not.toContain('value="match-settings"');
    expect(detail).toContain("substitutes_enabled: true,");
    expect(detail.match(/<TournamentMatchSetup/g)).toHaveLength(1);
  });

  it("copy has no em dashes", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    const copy = JSON.stringify([en.tournament.form.substitutes_enabled, en.tournament.page.match_setup]);
    expect(copy).not.toContain("—");
  });
});
