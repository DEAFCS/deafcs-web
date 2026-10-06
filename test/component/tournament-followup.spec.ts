import { describe, expect, it, vi } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import { reactive } from "vue";
import fs from "node:fs";
import path from "node:path";

const auth = reactive({ me: { steam_id: "p", role: "verified_user", elo: { competitive: 6000 } }, isAdmin: false });
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => auth }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string, v?: any) => v ? `${k}:${JSON.stringify(v)}` : k }) }));
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));
vi.stubGlobal("useAuthStore", () => auth);
vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));

import EntryGate from "../../components/tournament/TournamentEntryGate.vue";
import Team from "../../components/tournament/TournamentTeam.vue";
const t = (k: string, v?: any) => v ? `${k}:${JSON.stringify(v)}` : k;
const registration = { min_role: "verified_user", meets_min_role: true, min_elo: 5000 };
const cup = { id: "cup", status: "RegistrationOpen", is_organizer: false, options: { type: "Competitive" } };
const gate = (extra: any = {}) => mount(EntryGate, { props: { tournament: cup, registration: { ...registration, ...extra } }, global: { mocks: { $t: t }, stubs: { TournamentChip: { template: "<span><slot /></span>" } } } });

describe("entry requirements follow the server verdict", () => {
  it("requests the stored-role verdict in the actual live detail subscription", () => {
    const detail = fs.readFileSync(path.resolve(__dirname, "../../components/tournament/TournamentDetail.vue"), "utf8");
    const subscription = detail.slice(detail.indexOf("$subscribe:"));
    expect(subscription).toMatch(/can_join: true,\s+meets_min_role: true,/);
    expect(detail).toContain(':registration="tournament"');
  });
  it.each([1, 2].flatMap(version => ["teams", "free_agents", "both"].map(type => [version, type])))
    ("shows Dosia's failed stored role in v%i %s, then hides after a passing subscription update", async (version, type) => {
      auth.me.role = "user";
      const tournament = { ...cup, registration_version: version, registration_type: type };
      const w = gate({ meets_min_role: false });
      await w.setProps({ tournament });
      expect(w.text()).toContain("tournament.entry.blocked_chip");
      expect(w.text()).toContain('"role":"roles.verified_user"');
      expect(w.text()).toContain("tournament.entry.requirement_failed");
      expect(w.text()).not.toContain("tournament.entry.requirement_met");
      await w.setProps({ registration: { ...registration, meets_min_role: true } });
      expect(w.find("section").exists()).toBe(false);
      auth.me.role = "verified_user";
    });
  it("hides the whole panel when every requirement passes", () => {
    expect(gate().find("section").exists()).toBe(false);
  });
  it("shows only the failed role even when a cached profile still says verified", async () => {
    const w = gate();
    await w.setProps({ registration: { ...registration, meets_min_role: false } });
    expect(w.text()).toContain("tournament.entry.blocked_chip");
    expect(w.text()).toContain("tournament.entry.min_role");
    expect(w.text()).not.toContain("tournament.entry.elo_min");
    expect(w.text()).not.toContain("tournament.entry.requirement_met");
  });
  it("retains the invitation failure when role and ELO pass", () => {
    const w = gate({ invite_only: true, registration_unlocked: false });
    expect(w.text()).toContain("tournament.entry.invite_hint");
    expect(w.text()).toContain("tournament.entry.blocked_chip");
  });
});

describe("roster minimum differs from substitute capacity", () => {
  const render = (count: number, min = 5, max = 7) => shallowMount(Team, {
    props: { tournament: { ...cup, min_players_per_lineup: min, max_players_per_lineup: max, stages: [] }, team: { id: "team", name: "Team", eligible_at: count >= min ? "now" : null, can_manage: false, roster: Array.from({ length: count }, (_, i) => ({ player: { steam_id: String(i) } })), invites: [] } },
    data: () => ({ e_team_roles: [] }),
    global: { mocks: { $t: t }, renderStubDefaultSlot: true, stubs: { NuxtLink: true } },
  });
  it.each([[3,2],[4,1],[5,0],[6,0],[7,0]])("%i of 7 needs %i starters", (count, missing) => {
    const w = render(count);
    if (missing) expect(w.text()).toContain(`tournament.team.not_eligible:{"count":${missing}}`);
    else expect(w.text()).not.toContain("tournament.team.not_eligible");
    expect(w.text()).toContain("7");
  });
  it.each([[1,2,3,1],[2,2,3,0],[1,1,1,0]])("mode roster %i, minimum %i, capacity %i", (count,min,max,missing) => {
    const w = render(count,min,max);
    expect(w.text().includes("tournament.team.not_eligible")).toBe(missing > 0);
  });
  it("uses an accessible compact icon to collapse the roster", async () => {
    const w = render(5);
    const toggle = w.find('[aria-expanded="true"]');
    expect(toggle.attributes("aria-label")).toBe("tournament.teams_filter.collapse");
    await toggle.trigger("click");
    expect(w.find('[aria-expanded="false"]').attributes("aria-label")).toBe("tournament.teams_filter.expand");
  });
});
