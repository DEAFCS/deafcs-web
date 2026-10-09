import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { reactive, ref } from "vue";
import { readFileSync } from "node:fs";
import path from "node:path";

const t = (key: string) => key;
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t }) }));
vi.mock("~/graphql/getGraphqlClient", () => ({ default: () => ({ mutate: vi.fn() }) }));
vi.mock("~/graphql/graphqlGen", () => ({ generateMutation: () => ({}) }));
vi.mock("~/stores/NotificationStore", () => ({
  useNotificationStore: () => ({ draft_invites: [], team_invites: [], tournament_team_invites: [] }),
}));
vi.mock("~/stores/DraftGamesStore", () => ({ useDraftGamesStore: () => ({ respondInvite: vi.fn() }) }));
const pendingFriends = ref<any[]>([]);
vi.mock("~/composables/useInvites", () => ({
  useInvites: () => ({ pendingFriends, lobbyInvites: ref([]) }),
}));
vi.mock("~/composables/useRightSidebar", () => ({ useRightSidebar: () => ({ rightSidebarOpen: ref(false) }) }));
const auth = { me: null as null | { steam_id: string } };
vi.mock("~/stores/AuthStore", () => ({ useAuthStore: () => auth }));
const lobbyStore = reactive({ myMatches: [] as any[] });
vi.mock("~/stores/MatchLobbyStore", () => ({ useMatchLobbyStore: () => lobbyStore }));

import ActionToasts from "../../components/notification/ActionToasts.vue";
import { matchActions, onActionPage } from "../../utilities/matchActionToasts";

const route = reactive({ path: "/" });
const navigateTo = vi.fn();

beforeEach(() => {
  auth.me = { steam_id: "11" };
  lobbyStore.myMatches = [];
  pendingFriends.value = [];
  route.path = "/";
  navigateTo.mockClear();
  window.localStorage.clear();
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("navigateTo", navigateTo);
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const players = (ids: string[], checked: string[] = []) =>
  ids.map((steam_id) => ({ steam_id, checked_in: checked.includes(steam_id) }));
// The viewer (11) plays for Alpha.
const match = (extra: Record<string, any> = {}) => ({
  id: "m1",
  status: "WaitingForCheckIn",
  is_in_lineup: true,
  can_check_in: true,
  draft_games: [],
  lineup_1: { name: "Alpha", is_on_lineup: true, is_ready: false, can_pick_map_veto: false, can_pick_region_veto: false, lineup_players: players(["11", "12"]) },
  lineup_2: { name: "Bravo", is_on_lineup: false, is_ready: false, can_pick_map_veto: false, can_pick_region_veto: false, lineup_players: players(["21", "22"]) },
  ...extra,
});
const withLineup = (n: 1 | 2, patch: Record<string, any>, extra: Record<string, any> = {}) => {
  const m: any = match(extra);
  m[`lineup_${n}`] = { ...m[`lineup_${n}`], ...patch };
  return m;
};

describe("who gets a match action, from the server's own flags", () => {
  it("check-in: an eligible player who has not checked in, while the team still needs it", () => {
    expect(matchActions([match()], "11")).toEqual([
      { id: "match-check_in:m1", matchId: "m1", kind: "check_in", target: "/matches/m1" },
    ]);
    // Already checked in, or the team is already ready.
    expect(matchActions([withLineup(1, { lineup_players: players(["11", "12"], ["11"]) })], "11")).toEqual([]);
    expect(matchActions([withLineup(1, { is_ready: true })], "11")).toEqual([]);
    // Not allowed to (Captains check-in for a non-captain, Admin check-in).
    expect(matchActions([match({ can_check_in: false })], "11")).toEqual([]);
    // Not open yet / over.
    expect(matchActions([match({ status: "Scheduled" })], "11")).toEqual([]);
    expect(matchActions([match({ status: "Live" })], "11")).toEqual([]);
  });

  it("unrelated users, organizers and signed-out viewers get nothing", () => {
    expect(matchActions([match({ is_in_lineup: false })], "11")).toEqual([]);
    // The viewer is not one of the lineup's players.
    expect(matchActions([match()], "99")).toEqual([]);
    expect(matchActions([match()], null)).toEqual([]);
  });

  it("a veto turn is not an action popup: the corner notification is the only one", () => {
    const veto = (patch: any) => withLineup(1, patch, { status: "Veto" });
    expect(matchActions([veto({ can_pick_map_veto: true })], "11")).toEqual([]);
    expect(matchActions([veto({ can_pick_region_veto: true })], "11")).toEqual([]);
    expect(matchActions([withLineup(2, { can_pick_map_veto: true }, { status: "Veto" })], "11")).toEqual([]);
  });

  it("a draft-created match opens its draft room; the action page is where it is shown", () => {
    const [action] = matchActions([match({ draft_games: [{ id: "d1" }] })], "11");
    expect(action.target).toBe("/draft-room/d1");
    expect(onActionPage(action, "/draft-room/d1")).toBe(true);
    expect(onActionPage(action, "/matches/m1?tab=lifecycle")).toBe(true);
    expect(onActionPage(action, "/matches/m2")).toBe(false);
    expect(onActionPage(action, "/")).toBe(false);
  });
});

describe("ActionToasts", () => {
  const mountToasts = () =>
    mount(ActionToasts, {
      global: { config: { globalProperties: { $t: t } as any }, stubs: { ClientOnly: { template: "<div><slot /></div>" } } },
    });
  const toasts = (w: any) => w.findAll('[data-testid^="action-toast-"]');

  it("one check-in popup with Open Match to that match's Overview; no Decline", async () => {
    lobbyStore.myMatches = [match()];
    const wrapper = mountToasts();
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(1);
    const toast = wrapper.get('[data-testid="action-toast-match-check_in:m1"]');
    expect(toast.text()).toContain("layouts.notifications.toast.match_check_in");
    expect(toast.text()).toContain("Alpha vs Bravo");
    expect(toast.text()).toContain("layouts.notifications.toast.match_check_in_action");
    const buttons = toast.findAll("button").filter((b) => b.text());
    expect(buttons.map((b) => b.text())).toEqual(["layouts.notifications.toast.open_match"]);
    // Shown on phones too (invites stay desktop-only).
    expect(wrapper.get('[data-testid="action-toasts"]').classes()).toContain("flex");
    await buttons[0].trigger("click");
    expect(navigateTo).toHaveBeenCalledWith("/matches/m1");
  });

  it("repeated subscription updates of the same state never add a second popup", async () => {
    lobbyStore.myMatches = [match()];
    const wrapper = mountToasts();
    await flushPromises();
    for (let i = 0; i < 3; i++) {
      lobbyStore.myMatches = [match()];
      await flushPromises();
    }
    expect(toasts(wrapper)).toHaveLength(1);
  });

  it("nothing while the viewer is already on that match page (or its draft room)", async () => {
    lobbyStore.myMatches = [match()];
    route.path = "/matches/m1";
    const wrapper = mountToasts();
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(0);
    // Leaving the page with the action still open shows it.
    route.path = "/play";
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(1);
  });

  it("unrelated users get none", async () => {
    auth.me = { steam_id: "99" };
    lobbyStore.myMatches = [match({ is_in_lineup: false })];
    const wrapper = mountToasts();
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(0);
  });

  it("renders no veto popup (the old orange map veto notice), while check-in still shows", async () => {
    lobbyStore.myMatches = [withLineup(1, { can_pick_map_veto: true }, { status: "Veto" })];
    const wrapper = mountToasts();
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(0);
    expect(wrapper.find('[data-testid="action-toast-match-map_veto:m1"]').exists()).toBe(false);
    lobbyStore.myMatches = [withLineup(1, { can_pick_region_veto: true }, { status: "Veto" })];
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(0);
    // Check-in is a different notification and stays.
    lobbyStore.myMatches = [match()];
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(1);
  });

  it("dismissed stays dismissed for that action; once it is done, the next action pops up again", async () => {
    lobbyStore.myMatches = [match()];
    const wrapper = mountToasts();
    await flushPromises();
    await wrapper.get('[data-testid="action-toast-match-check_in:m1"] .toast-dismiss').trigger("click");
    expect(toasts(wrapper)).toHaveLength(0);
    // Same action, more updates: still dismissed.
    lobbyStore.myMatches = [match()];
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(0);
    // The action is done (checked in), then it is needed again: a new popup.
    lobbyStore.myMatches = [withLineup(1, { lineup_players: players(["11", "12"], ["11"]) })];
    await flushPromises();
    lobbyStore.myMatches = [match()];
    await flushPromises();
    expect(toasts(wrapper)).toHaveLength(1);
  });

  it("a dismissed friend request stays dismissed even when another notification source loads later", async () => {
    // Friend request arrives and gets dismissed before any other source has
    // loaded -- the realistic order on a fresh page load.
    pendingFriends.value = [{ steam_id: "77", name: "NOBOXEEE" }];
    const wrapper = mountToasts();
    await flushPromises();
    await wrapper.get('[data-testid="action-toast-friend:77"] .toast-dismiss').trigger("click");
    expect(toasts(wrapper)).toHaveLength(0);

    // A completely unrelated notification source (a match check-in) now
    // loads. This must not resurrect the already-dismissed friend request:
    // the friend item never left `items`, so there was nothing to clear.
    lobbyStore.myMatches = [match()];
    await flushPromises();
    expect(toasts(wrapper).map((w: any) => w.attributes("data-testid"))).toEqual([
      "action-toast-match-check_in:m1",
    ]);

    // The friend request is actually resolved elsewhere: now it's fine to
    // forget the dismissal, so a later re-request from the same person
    // shows up again instead of being silently suppressed forever.
    pendingFriends.value = [];
    await flushPromises();
    pendingFriends.value = [{ steam_id: "77", name: "NOBOXEEE" }];
    await flushPromises();
    expect(toasts(wrapper).map((w: any) => w.attributes("data-testid"))).toEqual(
      expect.arrayContaining(["action-toast-friend:77", "action-toast-match-check_in:m1"]),
    );
  });

  it("the existing invite toasts keep their Accept/Decline and stay desktop-only", () => {
    const source = readFileSync(path.resolve(__dirname, "../../components/notification/ToastCard.vue"), "utf8");
    expect(source).toContain(`item.acceptLabel ?? $t("draft_games.room.accept_invite")`);
    expect(source).toContain('v-if="!item.hideDecline"');
    const toastsSource = readFileSync(path.resolve(__dirname, "../../components/notification/ActionToasts.vue"), "utf8");
    expect(toastsSource).toContain(`entry.item.mobile ? '' : 'hidden md:block'`);
  });
});
