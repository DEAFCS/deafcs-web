import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { reactive, nextTick } from "vue";
import { makeDraft } from "./fixtures/captainPick";
const mocks = vi.hoisted(() => ({ store: null as any, replace: vi.fn() }));
vi.mock("~/stores/MatchmakingStore", () => ({ useMatchmakingStore: () => mocks.store }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import Page from "../../pages/play/captain-pick.vue";
const wrappers: ReturnType<typeof mount>[] = [];
function render(draft: any = makeDraft()) {
  mocks.store = reactive({ joinedMatchmakingQueues: { confirmation: draft ? { captainPick: draft } : null } });
  const w = mount(Page, { global: { config: { globalProperties: { $t: (key: string) => key } } } });
  wrappers.push(w); return w;
}
beforeEach(() => { vi.useFakeTimers(); mocks.replace.mockClear(); vi.stubGlobal("useHead", () => {}); vi.stubGlobal("useRouter", () => ({ replace: mocks.replace })); });
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("Captain Pick loading fallback", () => {
  it("routes to the shell while still Drafting", () => { render(makeDraft({ matchId: "m1" })); expect(mocks.replace).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/matches/m1"); });
  it("shows only loading without a shell, then redirects once", async () => {
    const w = render(); expect(w.find('[data-testid="captain-pick-loading"]').exists()).toBe(true);
    expect(w.find('[data-testid="match-overview"]').exists()).toBe(false); expect(w.find('[data-stub="chat"]').exists()).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
    mocks.store.joinedMatchmakingQueues.confirmation.captainPick = makeDraft({ matchId: "m1" }); await nextTick();
    mocks.store.joinedMatchmakingQueues.confirmation.captainPick = makeDraft({ matchId: "m1", phase: "MatchCreated" }); await nextTick();
    expect(mocks.replace).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/matches/m1");
  });
  it("allows refresh restoration", async () => {
    render(null); await vi.advanceTimersByTimeAsync(3000);
    mocks.store.joinedMatchmakingQueues.confirmation = { captainPick: makeDraft({ matchId: "m1" }) }; await nextTick();
    await vi.advanceTimersByTimeAsync(8000); expect(mocks.replace).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/matches/m1");
  });
  it("leaves after grace period without state", async () => { render(null); await vi.advanceTimersByTimeAsync(8000); expect(mocks.replace).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/play"); });
  it("leaves when unfinished draft disappears", async () => { render(); mocks.store.joinedMatchmakingQueues.confirmation = null; await nextTick(); expect(mocks.replace).toHaveBeenCalledOnce(); expect(mocks.replace).toHaveBeenCalledWith("/play"); });
});
