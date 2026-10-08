import { describe, expect, it, vi, beforeAll } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { canManageTournamentStages, tournamentManageSection, tournamentManageSections } from "../../utilities/tournamentManage";
import { useBracketView } from "../../composables/useBracketView";
import { visibleBracketRounds, visibleBracketTarget } from "../../utilities/bracketVisibleRounds";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const mutate = vi.fn().mockResolvedValue({ data: {} });
vi.stubGlobal("useNuxtApp", () => ({ $apollo: { mutate } }));
vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
vi.mock("~/components/ui/toast", () => ({ toast: vi.fn() }));

const children = ["TournamentInformationForm", "TournamentMatchOptionsForm", "TournamentPrizesManage", "TournamentAwardPicker", "TournamentMvpChooser", "TournamentOrganizers", "TournamentNotifications", "TournamentStagesManage", "TournamentJoinForm", "TournamentInvites", "TournamentInviteLinks", "TournamentCheckInReview", "TournamentFreeAgents", "TournamentIndividualPlayers", "TournamentTeam", "TournamentNotSelectedSection"];
let Manage: any;
let Stages: any;
beforeAll(async () => {
  vi.doMock("~/components/tournament/TournamentStageForm.vue", () => ({ default: defineComponent({ name: "TournamentStageForm", props: ["stage", "order", "tournament"], emits: ["updated"], setup: (p) => () => h("div", { "data-stage-form": p.order }) }) }));
  Stages = (await import("../../components/tournament/TournamentStagesManage.vue")).default;
  for (const name of children) {
    vi.doMock(`~/components/tournament/${name}.vue`, () => ({ default: defineComponent({ name, props: ["tournament", "part", "team", "tournamentId", "matchType", "finished", "trophiesEnabled"], setup: (p) => () => h("div", { "data-panel": name, "data-part": p.part, "data-id": p.tournamentId || p.tournament?.id }) }) }));
  }
  Manage = (await import("../../components/tournament/TournamentManage.vue")).default;
});
const fixture = (extra: any = {}) => ({ id: "t", status: "Setup", is_organizer: true, registration_version: 2, registration_type: "both", teams: [], stages: [], options: { type: "Competitive" }, ...extra });
const mocks = { $t: (key: string) => key };

describe("dedicated tournament Manage", () => {
  it.each([
    ["details", "TournamentInformationForm"], ["registration", "TournamentInformationForm"],
    ["teams", "TournamentFreeAgents"], ["stages", "TournamentStagesManage"],
    ["match-rules", "TournamentMatchOptionsForm"], ["prizes", "TournamentPrizesManage"],
    ["awards", "TournamentAwardPicker"], ["organizers", "TournamentOrganizers"], ["discord", "TournamentNotifications"],
  ])("renders %s using the existing DEAFCS panel", (section, panel) => {
    const w = mount(Manage, { props: { tournament: fixture(), registration: null, checkInTeams: [], checkInReviewVisible: false, section }, global: { mocks } });
    expect(w.find(`[data-panel='${panel}']`).exists()).toBe(true);
    expect(w.findAll("nav button")).toHaveLength(9);
    expect(w.find("[aria-current='page']").text()).toBe(tournamentManageSections.find(s => s.key === section)?.label);
    w.unmount();
  });
  it("offers the manual MVP choice next to the awards, for organizers only", () => {
    const w = mount(Manage, { props: { tournament: fixture({ status: "Finished" }), registration: null, checkInTeams: [], checkInReviewVisible: false, section: "awards" }, global: { mocks } });
    expect(w.find("[data-panel='TournamentAwardPicker']").exists()).toBe(true);
    expect(w.find("[data-panel='TournamentMvpChooser']").exists()).toBe(true);
    w.unmount();
    const other = mount(Manage, { props: { tournament: fixture({ status: "Finished" }), registration: null, checkInTeams: [], checkInReviewVisible: false, section: "details" }, global: { mocks } });
    expect(other.find("[data-panel='TournamentMvpChooser']").exists()).toBe(false);
    other.unmount();
  });
  it("never mounts management forms for a non-organizer", () => {
    const w = mount(Manage, { props: { tournament: fixture({ is_organizer: false }), registration: null, checkInTeams: [], checkInReviewVisible: false, section: "details" }, global: { mocks } });
    expect(w.find("nav").exists()).toBe(false);
    expect(w.find("[data-panel]").exists()).toBe(false);
  });
  it("switches sections and normalizes invalid routes", async () => {
    const w = mount(Manage, { props: { tournament: fixture(), registration: null, checkInTeams: [], checkInReviewVisible: false, section: "invalid" }, global: { mocks } });
    await w.findAll("nav button")[3].trigger("click");
    expect(w.emitted("update:section")).toEqual([["stages"]]);
    expect(tournamentManageSection(["stages"])).toBe("details");
    expect(w.find("[data-part='details']").exists()).toBe(true);
  });
  it("keeps v1 Random players and v2 free agents separate", async () => {
    const w = mount(Manage, { props: { tournament: fixture({ registration_version: 1, options: { individual_registration_enabled: true } }), registration: null, checkInTeams: [], checkInReviewVisible: false, section: "teams" }, global: { mocks } });
    expect(w.find("[data-panel='TournamentIndividualPlayers']").exists()).toBe(true);
    expect(w.find("[data-panel='TournamentFreeAgents']").exists()).toBe(false);
    expect(w.find("[data-panel='TournamentInviteLinks']").exists()).toBe(false);
    await w.setProps({ tournament: fixture({ registration_type: "free_agents" }) });
    expect(w.find("[data-panel='TournamentFreeAgents']").exists()).toBe(true);
    expect(w.find("[data-panel='TournamentJoinForm']").exists()).toBe(false);
    expect(w.find("[data-panel='TournamentInviteLinks']").exists()).toBe(true);
  });
});

describe("stage administration before the draw", () => {
  it.each(["Live", "Paused", "Finished", "Cancelled", "RegistrationClosed", "CheckInReview"])("locks structural edits in %s", status => {
    expect(canManageTournamentStages(fixture({ status }))).toBe(false);
  });
  it("protects already assigned brackets and rejects non-organizers", () => {
    expect(canManageTournamentStages(fixture({ stages: [{ brackets: [{ team_1: { id: "historical" } }] }] }))).toBe(false);
    expect(canManageTournamentStages(fixture({ is_organizer: false }))).toBe(false);
    expect(canManageTournamentStages(fixture({ status: "RegistrationOpen" }))).toBe(true);
  });
  it("adds the first stage, closes its form, then assigns the next order", async () => {
    const w = mount(Stages, { props: { tournament: fixture() }, global: { mocks } });
    await w.findAll("button").find(b => b.text().includes("add_first_stage"))!.trigger("click");
    expect(w.find("[data-stage-form='1']").exists()).toBe(true);
    w.findComponent({ name: "TournamentStageForm" }).vm.$emit("updated");
    await flushPromises();
    expect(w.find("[data-stage-form]").exists()).toBe(false);
    await w.setProps({ tournament: fixture({ stages: [{ id: "s", order: 1, default_best_of: 3 }] }) });
    await w.findAll("button").find(b => b.text().includes("add_another"))!.trigger("click");
    expect(w.find("[data-stage-form='2']").exists()).toBe(true);
  });
  it("closes an open editor when the tournament locks", async () => {
    const w = mount(Stages, { props: { tournament: fixture({ stages: [{ id: "s", order: 1 }] }) }, global: { mocks } });
    await w.findAll("button").find(b => b.text().includes("common.edit"))!.trigger("click");
    expect(w.find("[data-stage-form]").exists()).toBe(true);
    await w.setProps({ tournament: fixture({ status: "Live", stages: [{ id: "s", order: 1 }] }) });
    expect(w.find("[data-stage-form]").exists()).toBe(false);
    expect(w.findAll("button").some(b => b.text().includes("common.edit"))).toBe(false);
  });
});

describe("shared bracket controls", () => {
  it("hides bye cards while retaining historical winner/loser destinations", () => {
    const historical = { id: "bye", bye: true, parent_bracket: { id: "semi" }, team_1: { id: "old-team", roster: [{ player: { name: "Historical player" } }] } };
    const rounds = new Map([[1, [historical, { id: "real", bye: false }]], [2, [{ id: "semi", bye: false }]]]);
    expect(visibleBracketRounds(rounds).get(1).map((b: any) => b.id)).toEqual(["real"]);
    expect(visibleBracketTarget("bye", rounds)).toBe("semi");
    expect(visibleBracketTarget("other-group", rounds)).toBe("other-group");
    expect(rounds.get(1)![0]).toBe(historical);
    expect(historical.team_1.roster[0].player.name).toBe("Historical player");
    expect(visibleBracketRounds(new Map([[1, [historical]]])).size).toBe(0);
  });
  it("does not loop on malformed historical bye paths", () => {
    expect(visibleBracketTarget("loop", new Map([[1, [{ id: "loop", bye: true, parent_bracket: { id: "loop" } }]]]))).toBeUndefined();
  });
  it("zooms from fit, clamps bounds, and restores fit without losing Follow Team", () => {
    const v = useBracketView();
    v.currentFitZoom.value = 0.5; v.resetZoom(); v.followTeamId.value = "historical-team";
    v.zoomIn(); expect(v.manualZoom.value).toBeCloseTo(0.6);
    for (let n = 0; n < 50; n++) v.zoomIn();
    expect(v.manualZoom.value).toBe(v.MAX_ZOOM);
    for (let n = 0; n < 50; n++) v.zoomOut();
    expect(v.manualZoom.value).toBe(v.MIN_ZOOM);
    v.resetZoom(); expect(v.autoFit.value).toBe(true);
    expect(v.followTeamId.value).toBe("historical-team");
    v.followTeamId.value = null;
  });
});
