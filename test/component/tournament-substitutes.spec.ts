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
  it("shows the mode with the DEAFCS mode colour, BO, veto and map count", () => {
    const w = mountSetup(tournament());
    const mode = $(w, "tournament-match-setup-mode");
    expect(mode.text()).toBe("Competitive");
    expect(mode.attributes("style")).toContain("--mode-rgb: 249 158 47");
    expect($(w, "tournament-match-setup-best-of").text()).toContain("BO1");
    expect(w.text()).toContain('tournament.page.match_setup.maps:{"count":7}');
    expect(w.text()).toContain("Single Elimination - BO1");
  });

  it("substitutes ON: Enabled, never an invented count; settings get the effective 2", () => {
    const w = mountSetup(tournament());
    expect($(w, "tournament-match-setup-substitutes").text()).toBe("tournament.page.match_setup.enabled");
    expect($(w, "options-display").attributes("data-substitutes")).toBe("2");
  });

  it("substitutes OFF: Off, and the settings show 0 substitutes, not the global allowance", () => {
    const w = mountSetup(tournament({ substitutes_enabled: false, max_players_per_lineup: 5 }));
    expect($(w, "tournament-match-setup-substitutes").text()).toBe("tournament.page.match_setup.disabled");
    expect($(w, "options-display").attributes("data-substitutes")).toBe("0");
  });

  it("Duel: no substitutes row and 0 in the settings", () => {
    const w = mountSetup(
      tournament({
        min_players_per_lineup: 1,
        max_players_per_lineup: 1,
        options: { type: "Duel", best_of: 1, map_veto: true, number_of_substitutes: 2, map_pool: pool("p", 5) },
      }),
    );
    expect($(w, "tournament-match-setup-substitutes").exists()).toBe(false);
    expect($(w, "tournament-match-setup-mode").attributes("style")).toContain("--mode-rgb: 34 211 238");
    expect($(w, "options-display").attributes("data-substitutes")).toBe("0");
  });

  it("multi-stage: one accurate row per stage (BO, decider, own map pool)", () => {
    const w = mountSetup(
      tournament({
        stages: [
          { id: "b", order: 2, type: "SingleElimination", e_tournament_stage_type: { description: "Playoffs" }, default_best_of: 3, decider_best_of: 5, options: { map_pool: pool("q", 3) } },
          { id: "a", order: 1, type: "Swiss", e_tournament_stage_type: { description: "Swiss" }, default_best_of: null, decider_best_of: null, options: null },
        ],
      }),
      "2 stages",
    );
    const rows = $(w, "tournament-match-setup-stages").findAll("li").map((li: any) => li.text().replace(/\s+/g, " "));
    expect(rows[0]).toContain('tournament.page.match_setup.stage:{"number":1} · Swiss');
    expect(rows[0]).toContain("BO1");
    expect(rows[1]).toContain("Playoffs");
    expect(rows[1]).toContain("BO3");
    expect(rows[1]).toContain('decider:{"best_of":5}');
    expect(rows[1]).toContain('own_map_pool:{"count":3}');
    // No single BO number when stages differ.
    expect($(w, "tournament-match-setup-best-of").exists()).toBe(false);
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
      // No second, tournament-specific count: the allowance stays global.
      expect(src).toContain('"number_of_substitutes",\n          useApplicationSettingsStore().teamMaxSubs,');
      expect(src).not.toMatch(/name="number_of_substitutes"/);
    }
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
    expect(detail).toContain(':substitutes="tournamentEffectiveSubstitutes"');
    expect(detail).toContain("substitutes_enabled: true,");
    expect(detail.match(/<TournamentMatchSetup/g)).toHaveLength(1);
  });

  it("copy has no em dashes", () => {
    const en = JSON.parse(read("i18n/locales/en.json"));
    const copy = JSON.stringify([en.tournament.form.substitutes_enabled, en.tournament.page.match_setup]);
    expect(copy).not.toContain("—");
  });
});
