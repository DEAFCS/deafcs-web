import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { makeDraft, draftAfter } from "./fixtures/captainPick";
import { Log } from "./fixtures/captainPickScreenStubs";
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("~/components/draft-games/DraftTeamPanel.vue", async () => ({ default: (await import("./fixtures/captainPickScreenStubs")).TeamPanel }));
vi.mock("~/components/draft-games/DraftPlayerCard.vue", async () => ({ default: (await import("./fixtures/captainPickScreenStubs")).PlayerCard }));
vi.mock("~/components/draft-games/DraftLog.vue", async () => ({ default: (await import("./fixtures/captainPickScreenStubs")).Log }));
vi.mock("~/components/match/overview/OverviewVeto.vue", () => ({ default: { template: '<div data-testid="veto" />' } }));
vi.mock("~/components/match/overview/OverviewPreMatch.vue", () => ({ default: { render: () => null } }));
vi.mock("~/components/match/MatchRegionVeto.vue", () => ({ default: { render: () => null } }));
vi.mock("~/composables/useCaptainPickPlayers", async () => { const { ref } = await import("vue"); return { useCaptainPickPlayers: () => ({ players: ref({}) }) }; });
import Overview from "../../components/match/overview/MatchOverview.vue";
const wrappers: ReturnType<typeof mount>[] = [];
function render(self: string | null = "2", overrides = {}) {
  vi.stubGlobal("useAuthStore", () => ({ me: self ? { steam_id: self } : null }));
  const draft = makeDraft({ matchId: "m1", ...overrides });
  const w = mount(Overview, {
    props: { match: { id: "m1", status: "PickingPlayers", options: {} }, stage: "captain-pick", captainPickProgress: draft, participantDraft: self ? draft : null },
    global: { stubs: { NuxtLink: { props: ["to"], template: '<a><slot /></a>' } }, config: { globalProperties: { $t: (key: string) => key } } },
  }); wrappers.push(w); return w;
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-29T20:00:00Z")); });
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("canonical Captain Pick Overview", () => {
  it.each(["2", "1", "3", "admin", null])("keeps banner, teams, pool and log for %s", self => {
    const w = render(self); expect(w.findAll('[data-stub="team"]')).toHaveLength(2);
    expect(w.get('[data-testid="overview-middle"]').classes()).toContain("min-[1400px]:order-2");
    expect(w.find('[data-testid="spectator-available"]').exists()).toBe(true); expect(w.find('[data-stub="log"]').exists()).toBe(true);
    expect(w.find('[data-stub="chat"]').exists()).toBe(false); expect(w.findComponent({ name: "OverviewActionBar" }).exists()).toBe(true);
  });
  it("emits existing request once and settles on server state", async () => {
    const w = render(); const card = () => w.get('[data-testid="captain-pick-player-3"]');
    await card().trigger("click"); await card().trigger("click");
    expect(w.emitted("pick")).toEqual([[{ confirmationId: "draft-1", steamId: "3", pickIndex: 0 }]]);
    const next = { ...draftAfter([{ steam_id: "3" }]), matchId: "m1" }; await w.setProps({ participantDraft: next, captainPickProgress: next });
    expect(w.get('[data-testid="captain-pick-player-4"]').attributes("role")).toBeUndefined();
    expect(w.findAll('[data-stub="team"]')[0].text()).toContain("Player 3");
  });
  it.each(["1", "3", "admin", null])("cannot pick as %s", async self => { const w = render(self); await w.get('[data-testid="captain-pick-player-3"]').trigger("click"); expect(w.emitted("pick")).toBeUndefined(); });
  it("rejects spoofed authority, different match and finalization", async () => {
    for (const [self, override] of [["3", { pickingCaptainSteamId: "3" }], ["2", { matchId: "other" }], ["2", { phase: "CreatingMatch" }]] as const) {
      const w = render(self, override); await w.get('[data-testid="captain-pick-player-3"]').trigger("click"); expect(w.emitted("pick")).toBeUndefined();
    }
  });
  it("blocks timeout clicks between clock ticks", async () => {
    const w = render(); vi.setSystemTime(new Date("2026-09-29T20:00:30.001Z"));
    await w.get('[data-testid="captain-pick-player-3"]').trigger("click"); expect(w.emitted("pick")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(250); expect(w.get('[data-testid="captain-pick-player-3"]').attributes("role")).toBeUndefined();
  });
  it("keeps actual server auto-picks in chronological Draft Log", () => {
    const w = render("2", { ...draftAfter([{ steam_id: "3", auto: true }, { steam_id: "4" }]), matchId: "m1" });
    const log = w.getComponent(Log); expect(log.props("showAutoPickLabel")).toBe(true);
    expect(log.props("picks").map((pick: any) => pick.auto_picked)).toEqual([true, false]);
  });
  it("continues into veto in same Overview", async () => {
    const w = render(); await w.setProps({ stage: "veto", participantDraft: null, captainPickProgress: null, match: { id: "m1", status: "MapVeto", options: {} } });
    expect(w.find('[data-testid="veto"]').exists()).toBe(true); expect(w.findAll('[data-stub="team"]')).toHaveLength(2);
  });
});
