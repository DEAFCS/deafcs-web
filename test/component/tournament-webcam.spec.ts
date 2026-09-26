import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";

// --- socket mock: records listeners so tests can emit presence events ---
const socketListeners = new Map<string, Set<(data: any) => void>>();
vi.mock("~/web-sockets/Socket", () => ({
  default: {
    listen: (event: string, cb: (data: any) => void) => {
      if (!socketListeners.has(event)) socketListeners.set(event, new Set());
      socketListeners.get(event)!.add(cb);
      return { stop: () => socketListeners.get(event)?.delete(cb) };
    },
  },
}));
function emit(event: string, data: any) {
  socketListeners.get(event)?.forEach((cb) => cb(data));
}

vi.mock("~/components/match/WhepPlayer.vue", () => ({
  default: defineComponent({
    props: ["whepUrl"],
    setup: (props) => () => h("div", { class: "whep", "data-url": props.whepUrl }),
  }),
}));

const read = (p: string) =>
  fs.readFileSync(path.resolve(__dirname, "../..", p), "utf8");

const ME = "76561190000000001";
const OTHER = "76561190000000002";
const T1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  socketListeners.clear();
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { apiDomain: "api.test", webDomain: "web.test" },
  }));
  vi.stubGlobal("useAuthStore", () => ({ me: { steam_id: ME } }));
  vi.stubGlobal("useWebsiteRestrictionStore", () => ({ isRestricted: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("webcam room adapters", () => {
  it("tournament room uses the tournament-call API and tournament channel", async () => {
    const { createTournamentWebcamRoom, tournamentWebcamPopoutPath } = await import(
      "../../composables/useWebcamRoomApi"
    );
    const room = createTournamentWebcamRoom(T1);
    expect(room.kind).toBe("tournament");
    expect(room.channel).toBe(`lobby:tournament:${T1}`);
    expect(room.pollParticipantsMs).toBe(15_000);
    expect(room.peerWhepUrl(OTHER)).toBe(
      `https://api.test/matches/camera/tournament-call/${T1}/${OTHER}/whep`,
    );
    expect(room.playerWhipUrl("tok")).toBe(
      "https://api.test/matches/camera/tournament-call/player/tok/whip",
    );
    expect(room.joinPageUrl("tok")).toBe(`https://web.test/tournament-call/${T1}/tok`);
    expect(typeof room.kick).toBe("function");
    expect(tournamentWebcamPopoutPath(T1)).toBe(`/tournaments/webcam/${T1}`);
  });

  it("lobby room keeps the exact same lobby-call URLs and channel (regression)", async () => {
    const api = await import("../../composables/useLobbyCallApi");
    const { createLobbyWebcamRoom } = await import("../../composables/useWebcamRoomApi");
    const room = createLobbyWebcamRoom("lobby-1");
    expect(room.channel).toBe("lobby:matchmaking:lobby-1");
    expect(room.pollParticipantsMs).toBeUndefined();
    expect(room.kick).toBeUndefined();
    expect(room.peerWhepUrl(OTHER)).toBe(api.lobbyCallPeerWhepUrl("lobby-1", OTHER));
    expect(room.playerWhipUrl("tok")).toBe(api.lobbyCallPlayerWhipUrl("tok"));
    expect(room.playerStatusUrl("tok")).toBe(api.lobbyCallPlayerStatusUrl("tok"));
    expect(room.playerHangupUrl("tok")).toBe(api.lobbyCallPlayerHangupUrl("tok"));
    expect(room.playerPeerWhepUrl("tok", OTHER)).toBe(
      api.lobbyCallPlayerPeerWhepUrl("tok", OTHER),
    );
    expect(room.joinPageUrl("tok")).toBe(api.lobbyCallJoinUrl("lobby-1", "tok"));
  });
});

function fakeRoom(overrides: Record<string, any> = {}) {
  return {
    kind: "tournament",
    roomId: T1,
    channel: `lobby:tournament:${T1}`,
    joinPageUrl: (t: string) => `join/${t}`,
    playerWhipUrl: (t: string) => `whip/${t}`,
    playerStatusUrl: (t: string) => `status/${t}`,
    playerHangupUrl: (t: string) => `hangup/${t}`,
    playerPeerWhepUrl: (t: string, s: string) => `pwhep/${t}/${s}`,
    peerWhepUrl: (s: string) => `whep/${s}`,
    fetchParticipantsForToken: vi.fn(async () => []),
    fetchParticipants: vi.fn(async () => ({
      participants: [
        { steamId: ME, name: "Me", avatarUrl: null },
        { steamId: OTHER, name: "Other", avatarUrl: null },
      ],
      canKick: false,
    })),
    join: vi.fn(async () => ({ token: "tok", participants: [], canKick: false })),
    kick: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

async function mountRoom(room: any) {
  const { default: WebcamCallRoom } = await import(
    "../../components/webcam/WebcamCallRoom.vue"
  );
  const wrapper = mount(WebcamCallRoom, {
    props: { room },
    global: {
      mocks: {
        $t: (key: string, fallback?: any, params?: any) =>
          typeof fallback === "string"
            ? fallback.replace("{count}", String(params?.count ?? ""))
            : key,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("WebcamCallRoom (tournament)", () => {
  it("shows the server's friendly full message and does not join a 6th person", async () => {
    const room = fakeRoom({
      fetchParticipants: vi.fn(async () => ({ participants: [], canKick: false })),
      join: vi.fn(async () => ({ error: "Webcam room is full (5/5)." })),
    });
    const wrapper = await mountRoom(room);
    expect(wrapper.text()).toContain("Webcam room is full (5/5).");
    expect(wrapper.text()).not.toContain("Connect with");
  });

  it("shows Remove on other people's tiles only for viewers who can kick", async () => {
    const plain = await mountRoom(fakeRoom());
    expect(plain.findAll('[data-testid="webcam-kick"]')).toHaveLength(0);

    const room = fakeRoom({
      fetchParticipants: vi.fn(async () => ({
        participants: [
          { steamId: ME, name: "Me", avatarUrl: null },
          { steamId: OTHER, name: "Other", avatarUrl: null },
        ],
        canKick: true,
      })),
    });
    const mod = await mountRoom(room);
    const kickButtons = mod.findAll('[data-testid="webcam-kick"]');
    // Only OTHER's tile, never my own.
    expect(kickButtons).toHaveLength(1);
    await kickButtons[0].trigger("click");
    await flushPromises();
    expect(room.kick).toHaveBeenCalledWith(OTHER);
    expect(mod.findAll('[data-testid="webcam-kick"]')).toHaveLength(0);
  });

  it("a lobby room never shows Remove (no kick support)", async () => {
    const room = fakeRoom({
      kind: "lobby",
      kick: undefined,
      fetchParticipants: vi.fn(async () => ({
        participants: [
          { steamId: ME, name: "Me", avatarUrl: null },
          { steamId: OTHER, name: "Other", avatarUrl: null },
        ],
        canKick: true,
      })),
    });
    const wrapper = await mountRoom(room);
    expect(wrapper.findAll('[data-testid="webcam-kick"]')).toHaveLength(0);
  });

  it("presence events update the grid, and being kicked resets to a rejoinable state", async () => {
    const room = fakeRoom();
    const wrapper = await mountRoom(room);
    emit(`lobby:tournament:${T1}:call-left`, { steamId: OTHER });
    await nextTick();
    expect(wrapper.findAll(".whep").map((w) => w.attributes("data-url"))).not.toContain(
      `whep/${OTHER}`,
    );

    emit(`lobby:tournament:${T1}:call-left`, { steamId: ME, kicked: true });
    await nextTick();
    expect(wrapper.text()).toContain("You were removed from the webcam room.");
  });

  it("refreshes participants on the room's poll interval (drops ghosts)", async () => {
    vi.useFakeTimers();
    const room = fakeRoom({ pollParticipantsMs: 15_000 });
    await mountRoom(room);
    const before = room.fetchParticipants.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(room.fetchParticipants.mock.calls.length).toBe(before + 1);
  });
});

describe("tournament chat header status", () => {
  it("counts participants from the API and presence events; nothing opens by itself", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        participants: [{ steamId: OTHER, name: "Other", avatarUrl: null }],
        canKick: false,
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);

    const { useTournamentWebcamStatus } = await import(
      "../../composables/useTournamentWebcamStatus"
    );
    const id = ref<string | null>(T1);
    let state: any;
    mount(
      defineComponent({
        setup() {
          state = useTournamentWebcamStatus(id);
          return () => h("div");
        },
      }),
    );
    await flushPromises();
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://api.test/matches/camera/tournament-call/${T1}/participants`,
    );
    expect(state.participants.value).toHaveLength(1);

    emit(`lobby:tournament:${T1}:call-joined`, { steamId: "3", name: "Three" });
    expect(state.participants.value).toHaveLength(2);
    emit(`lobby:tournament:${T1}:call-left`, { steamId: OTHER });
    expect(state.participants.value).toHaveLength(1);
    expect(openSpy).not.toHaveBeenCalled();

    id.value = null;
    await nextTick();
    expect(state.participants.value).toHaveLength(0);
  });
});

describe("no call popup / ring / push for the tournament webcam", () => {
  it("the site-wide incoming-call popup only listens on the matchmaking lobby channel", () => {
    const notifier = read("components/matchmaking-lobby/GlobalLobbyCallNotifier.vue");
    expect(notifier).toContain("lobby:matchmaking:");
    expect(notifier).not.toContain("lobby:tournament:");
  });

  it("tournament webcam code has no ring, vibrate, push, tab-flash or auto-open paths", () => {
    for (const file of [
      "composables/useTournamentWebcamStatus.ts",
      "composables/useWebcamRoomApi.ts",
      "pages/tournaments/webcam/[tournamentId].vue",
      "pages/tournament-call/[tournamentId]/[token].vue",
    ]) {
      // Code only: comments may mention window.open() for context.
      const src = read(file)
        .split("\n")
        .filter((line) => !/^\s*(\/\/|\*|<!--)/.test(line))
        .join("\n");
      expect(src).not.toMatch(/vibrate|Notification\(|showNotification|useTabFlash|PhoneIncoming|window\.open/);
    }
  });

  it("the header button opens the room only on click and does not pulse", () => {
    const panel = read("components/hub/ChatPanel.vue");
    const button = panel.slice(
      panel.indexOf('data-testid="tournament-webcam-button"'),
      panel.indexOf("</TooltipTrigger>", panel.indexOf('data-testid="tournament-webcam-button"')),
    );
    expect(button).toContain('@click="openTournamentWebcamWindow"');
    expect(button).not.toContain("animate-pulse");
    expect(panel).toContain("useTournamentWebcamStatus(activeTournamentId)");
  });

  it("the phone/QR route is reachable without login, like /lobby-call", () => {
    const auth = read("middleware/auth.global.ts");
    expect(auth).toContain('if (path.startsWith("/tournament-call")) {');
  });
});
