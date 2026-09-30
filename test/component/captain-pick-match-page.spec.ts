import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { computed, defineComponent, h, reactive } from "vue";
import fs from "node:fs";
import path from "node:path";

// Nuxt auto-imports some of the imported components' modules call at load.
vi.hoisted(() => {
  const g = globalThis as any;
  g.useRuntimeConfig = () => ({ public: {} });
  g.useAuthStore = () => ({ me: { steam_id: "1", role: "administrator" } });
});

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (data: any) => void>(),
  sent: [] as Array<{ event: string; data: any }>,
  hubCalls: [] as string[],
}));

vi.mock("~/web-sockets/Socket", () => ({
  default: {
    listen: (event: string, cb: (data: any) => void) => {
      mocks.listeners.set(event, cb);
      return { stop: () => mocks.listeners.delete(event) };
    },
    event: (event: string, data: any) => mocks.sent.push({ event, data }),
  },
}));
vi.mock("~/composables/useHubState", () => ({
  setActiveHub: (hub: string) => mocks.hubCalls.push(hub),
}));
vi.mock("~/stores/MatchLobbyStore", () => ({
  useMatchLobbyStore: () => ({ myMatches: [] }),
}));

import {
  CAPTAIN_PICK_STATUS_ATTEMPTS,
  CAPTAIN_PICK_STATUS_RETRY_MS,
  createCaptainPickMatchStatus,
  isCaptainPickChatParticipant,
  isCaptainPickLineupLocked,
} from "../../composables/useCaptainPickMatchStatus";
import {
  captainPickChatHubContext,
  matchChatHubContext,
  useChatHubContext,
  type ChatHubContext,
} from "../../composables/useChatHubContext";
import { useChatTabs } from "../../composables/useChatTabs";
import { useRightSidebar } from "../../composables/useRightSidebar";
import { makeDraft } from "./fixtures/captainPick";
import LineupOverviewRow from "../../components/match/LineupOverviewRow.vue";
import LineupOverview from "../../components/match/LineupOverview.vue";
import MatchInfo from "../../components/match/MatchInfo.vue";
import MatchTabs from "../../components/match/MatchTabs.vue";

const STATUS_EVENT = "matchmaking:captain-pick:match-status";
const t = (key: string) => key;
const answer = (data: any) => mocks.listeners.get(STATUS_EVENT)!(data);

const read = (p: string) =>
  fs
    .readFileSync(path.resolve(__dirname, "../..", p), "utf8")
    .split("\r\n")
    .join("\n");

const picking = { id: "m1", status: "PickingPlayers" };

beforeEach(() => {
  mocks.sent.length = 0;
  mocks.hubCalls.length = 0;
  localStorage.clear();
  useChatTabs().clearAll();
  useRightSidebar().setRightSidebarOpen(false);
});

describe("Captain Pick status of the match on screen", () => {
  let status: ReturnType<typeof createCaptainPickMatchStatus>;
  const requests = () => mocks.sent.filter((s) => s.event === STATUS_EVENT);
  const locked = (match = picking) =>
    isCaptainPickLineupLocked(match, status.state);
  const participant = (match = picking) =>
    isCaptainPickChatParticipant(match, status.state);

  beforeEach(() => {
    vi.useFakeTimers();
    status = createCaptainPickMatchStatus();
  });
  afterEach(() => {
    status.stop();
    vi.useRealTimers();
  });

  it("keeps the lineups locked and the chat closed while the answer is pending", () => {
    status.update(picking);

    expect(requests()).toEqual([{ event: STATUS_EVENT, data: { matchId: "m1" } }]);
    expect(status.state.resolved).toBe(false);
    expect(locked()).toBe(true);
    expect(participant()).toBe(false);
  });

  it("is locked even before anything was asked for a picking match", () => {
    expect(locked()).toBe(true);
    expect(participant()).toBe(false);
  });

  it("stays locked on a positive answer and stops asking", async () => {
    status.update(picking);
    answer({ matchId: "m1", active: true, participant: true });

    expect(locked()).toBe(true);
    expect(participant()).toBe(true);
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS * 5);
    expect(requests()).toHaveLength(1);
  });

  it("gives Match Chat only on the API's positive participant answer", () => {
    status.update(picking);
    answer({ matchId: "m1", active: true, participant: false });
    expect(locked()).toBe(true);
    expect(participant()).toBe(false);
  });

  it("unlocks an ordinary picking match once the bounded retries all say no", async () => {
    status.update(picking);
    answer({ matchId: "m1", active: false, participant: false });
    // One "no" isn't believed yet: the shell may be ahead of its mapping.
    expect(locked()).toBe(true);

    for (let i = 1; i < CAPTAIN_PICK_STATUS_ATTEMPTS; i++) {
      await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS);
      answer({ matchId: "m1", active: false, participant: false });
    }

    expect(requests()).toHaveLength(CAPTAIN_PICK_STATUS_ATTEMPTS);
    expect(status.state.resolved).toBe(true);
    expect(locked()).toBe(false);
    expect(participant()).toBe(false);

    // Bounded: no more asking after that.
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS * 10);
    expect(requests()).toHaveLength(CAPTAIN_PICK_STATUS_ATTEMPTS);
  });

  it("catches the mapping race: a first no, then yes on the retry", async () => {
    status.update(picking);
    answer({ matchId: "m1", active: false, participant: false });

    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS);
    expect(requests()).toHaveLength(2);
    answer({ matchId: "m1", active: true, participant: true });

    expect(locked()).toBe(true);
    expect(participant()).toBe(true);
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS * 5);
    expect(requests()).toHaveLength(2);
  });

  it("asks at most a bounded number of times when no answer comes", async () => {
    status.update(picking);
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS * 20);

    expect(requests()).toHaveLength(CAPTAIN_PICK_STATUS_ATTEMPTS);
    // Still unknown, so still locked; a late answer is still accepted.
    expect(locked()).toBe(true);
    answer({ matchId: "m1", active: true, participant: false });
    expect(status.state.resolved).toBe(true);
  });

  it("cancels a pending retry when the match changes or leaves PickingPlayers", async () => {
    status.update(picking);
    status.update({ id: "m1", status: "Veto" });
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS * 5);
    expect(requests()).toHaveLength(1);
    expect(locked({ id: "m1", status: "Veto" })).toBe(false);

    mocks.sent.length = 0;
    status.update({ id: "m2", status: "PickingPlayers" });
    status.update({ id: "m3", status: "PickingPlayers" });
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS);
    // m2's retry is gone; only m3 is still being asked about.
    expect(requests().map((r) => r.data.matchId)).toEqual(["m2", "m3", "m3"]);
  });

  it("cancels a pending retry when disposed", async () => {
    status.update(picking);
    status.stop();
    await vi.advanceTimersByTimeAsync(CAPTAIN_PICK_STATUS_RETRY_MS * 5);
    expect(requests()).toHaveLength(1);
  });

  it("only trusts the answer for the match it asked about", () => {
    status.update(picking);
    answer({ matchId: "other", active: true, participant: true });
    expect(status.state.resolved).toBe(false);
    expect(participant()).toBe(false);
  });

  it("drops the lock as soon as the match leaves PickingPlayers (no permanent lock)", () => {
    status.update(picking);
    answer({ matchId: "m1", active: true, participant: true });

    const veto = { id: "m1", status: "Veto" };
    status.update(veto);

    expect(locked(veto)).toBe(false);
    expect(participant(veto)).toBe(false);
  });

  it("never locks matches outside PickingPlayers", () => {
    for (const s of ["Scheduled", "Veto", "Live", "Finished", "Canceled"]) {
      expect(locked({ id: "m9", status: s })).toBe(false);
    }
  });
});

describe("Match Chat on the match page while players are picked", () => {
  const match = {
    id: "m1",
    status: "PickingPlayers",
    label: null,
    lineup_1: { id: "l1", name: "Team 1" },
    lineup_2: { id: "l2", name: "Team 2" },
  };
  const statusFor = (active: boolean, participant: boolean) =>
    reactive({ matchId: "m1", resolved: true, active, participant });
  // The page's own gate: canJoinLobby || server-confirmed participant.
  const canUseMatchChat = (
    canJoinLobby: boolean,
    s: ReturnType<typeof statusFor>,
  ) => canJoinLobby || isCaptainPickChatParticipant(match, s);

  const mountPage = (context: ChatHubContext | null) =>
    mount(
      defineComponent({
        setup() {
          useChatHubContext(() => context);
          return () => h("div");
        },
      }),
    );

  it("a draft player opening the match page gets the same Match Chat, and the Hub opens on it", () => {
    // Not seated, not an organizer: canJoinLobby is false.
    const context = matchChatHubContext(
      match,
      canUseMatchChat(false, statusFor(true, true)),
      null,
      t,
    )!;
    expect(context.rooms).toEqual([
      { type: "match", lobbyId: "m1", label: "Team 1 vs Team 2" },
    ]);

    // Exactly the room /play/captain-pick uses for this match.
    const draftRoom = captainPickChatHubContext(
      { ...makeDraft(), matchId: "m1" },
      "3",
      t,
    )!.rooms[0];
    expect(`${draftRoom.type}:${draftRoom.lobbyId}`).toBe("match:m1");

    const wrapper = mountPage(context);
    expect(useRightSidebar().rightSidebarOpen.value).toBe(true);
    expect(useChatTabs().activeTabId.value).toBe("match:m1");
    expect(useChatTabs().tabs.value.map((tab) => tab.id)).toEqual(["match:m1"]);
    wrapper.unmount();
  });

  it("nobody gets participant Match Chat while the answer is unresolved", () => {
    const pending = reactive({
      matchId: "m1",
      resolved: false,
      active: false,
      participant: false,
    });
    expect(
      matchChatHubContext(match, canUseMatchChat(false, pending), null, t),
    ).toBeNull();
  });

  it("a spectator gets no Match Chat", () => {
    expect(
      matchChatHubContext(match, canUseMatchChat(false, statusFor(true, false)), null, t),
    ).toBeNull();
  });

  it("an admin observer gets Match Chat only, no Team Chat", () => {
    const context = matchChatHubContext(
      match,
      canUseMatchChat(true, statusFor(true, false)),
      null,
      t,
    )!;
    expect(context.rooms.map((r) => r.type)).toEqual(["match"]);
  });

  it("the page uses that gate for the inline chat and the Hub, and keeps Team Chat on the lineup rule", () => {
    const page = read("pages/matches/[id]/index.vue");
    expect(page).toContain('<div v-if="canUseMatchChat" class="flex flex-col gap-2">');
    // Labelled Match Chat (only this match), not the site-wide Global Chat,
    // and still the ordinary match room.
    const start = page.indexOf('<div v-if="canUseMatchChat"');
    const inline = page.slice(start, page.indexOf("</div>", start));
    expect(inline).toContain('{{ $t("chat.match_chat") }}');
    expect(inline).not.toContain("chat.global_chat");
    expect(inline).toContain('type="match"');
    expect(inline).toContain(':lobby-id="match.id"');
    expect(page).toContain('<div v-if="canJoinLobby && myLineupChatId"');
    expect(page).toMatch(/matchChatHubContext\(\s*this\.match,\s*this\.canUseMatchChat,/);
  });
});

describe("drafted lineups can't be edited by hand while players are picked", () => {
  const lock = (locked: boolean) => computed(() => locked);

  const rowThis = (locked: boolean, overrides: Record<string, unknown> = {}) => {
    const ctx: any = {
      captainPickLineupsLocked: lock(locked),
      lineup: { id: "l1", can_update_lineup: true },
      match: {
        status: "PickingPlayers",
        lineup_1_id: "l1",
        lineup_2_id: "l2",
        lineup_1: { lineup_players: [] },
        lineup_2: { lineup_players: [] },
        max_players_per_lineup: 5,
      },
      member: { steam_id: "1" },
      me: { steam_id: "1" },
      ...overrides,
    };
    const c = (LineupOverviewRow as any).computed;
    ctx.lineupsLocked = c.lineupsLocked.call(ctx);
    ctx.canManageLineup = c.canManageLineup.call(ctx);
    return { ctx, c };
  };

  it("hides promote captain, switch side, remove and leave on an active Captain Pick match", () => {
    const { ctx, c } = rowThis(true);
    expect(ctx.canManageLineup).toBe(false);
    expect(c.canSwitchTeams.call(ctx)).toBe(false);
    expect(c.canLeaveLineup.call(ctx)).toBe(false);
  });

  it("keeps them for an ordinary custom match being set up", () => {
    const { ctx, c } = rowThis(false);
    expect(ctx.canManageLineup).toBe(true);
    expect(c.canSwitchTeams.call(ctx)).toBe(true);
    expect(c.canLeaveLineup.call(ctx)).toBe(true);
  });

  it("hides adding players to either lineup", () => {
    const add = (LineupOverview as any).methods.canAddToLineupFor;
    const lp = { can_update_lineup: true, lineup_players: [] };
    expect(add.call({ captainPickLineupsLocked: lock(true), maxPlayers: 5 }, lp)).toBe(false);
    expect(add.call({ captainPickLineupsLocked: lock(false), maxPlayers: 5 }, lp)).toBe(true);
  });

  it("hides randomize/swap teams", () => {
    const adjust = (MatchTabs as any).computed.canAdjustLineups;
    const match = {
      status: "PickingPlayers",
      is_organizer: true,
      min_players_per_lineup: 1,
      lineup_1: { lineup_players: [{}] },
      lineup_2: { lineup_players: [{}] },
    };
    expect(adjust.call({ captainPickLineupsLocked: lock(true), match })).toBe(false);
    expect(adjust.call({ captainPickLineupsLocked: lock(false), match })).not.toBe(false);
  });

  it("hides coach assignment", () => {
    const locked = (MatchInfo as any).computed.lineupsLocked;
    expect(locked.call({ captainPickLineupsLocked: lock(true) })).toBe(true);
    expect(locked.call({ captainPickLineupsLocked: lock(false) })).toBe(false);
    expect(read("components/match/MatchInfo.vue")).toContain(
      'v-if="lineup.can_update_lineup && !lineupsLocked"',
    );
  });

  it("is unlocked wherever the match page doesn't provide the lock", () => {
    for (const component of [LineupOverviewRow, LineupOverview, MatchInfo, MatchTabs]) {
      expect((component as any).inject.captainPickLineupsLocked.default).toBe(false);
    }
  });

  it("the match page provides the lock from the server's answer", () => {
    const page = read("pages/matches/[id]/index.vue");
    expect(page).toContain("[CAPTAIN_PICK_LINEUP_LOCK]: computedRef(");
    expect(page).toContain(
      "return isCaptainPickLineupLocked(this.match, this.captainPickMatch);",
    );
  });
});
