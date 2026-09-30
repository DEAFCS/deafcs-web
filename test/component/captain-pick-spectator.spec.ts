import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import fs from "node:fs";
import path from "node:path";
import { draftAfter, makeDraft } from "./fixtures/captainPick";

vi.mock("~/components/draft-games/DraftTeamPanel.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).TeamPanel,
}));
vi.mock("~/components/draft-games/DraftPlayerCard.vue", async () => ({
  default: (await import("./fixtures/captainPickScreenStubs")).PlayerCard,
}));
import CaptainPickProgressPanel from "../../components/match/CaptainPickProgress.vue";
import { createCaptainPickProgress } from "../../composables/useCaptainPickProgress";

class PublicStream {
  static streams: PublicStream[] = [];
  closed = false;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    PublicStream.streams.push(this);
  }
  close() {
    this.closed = true;
  }
  send(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
const picking = { id: "m1", status: "PickingPlayers" };
const payload = (progress = makeDraft(), matchId = "m1") => ({
  matchId,
  active: true,
  completed: false,
  progress,
});
let feed: ReturnType<typeof createCaptainPickProgress>;
beforeEach(() => {
  vi.stubGlobal("EventSource", PublicStream);
  PublicStream.streams = [];
  feed = createCaptainPickProgress("api.example");
});
afterEach(() => {
  feed.stop();
  vi.unstubAllGlobals();
});

describe("Captain Pick public observation", () => {
  it("shows both teams, current turn and remaining players from live updates without actions", async () => {
    // No auth store, private matchmaking state or credentials are involved.
    feed.update(picking);
    const stream = PublicStream.streams[0];
    expect(stream.url).toBe(
      "https://api.example/matchmaking/captain-pick/m1/progress",
    );
    stream.send(payload());
    const wrapper = mount(CaptainPickProgressPanel, {
      props: { progress: feed.state.progress! },
      global: {
        mocks: {
          $t: (key: string, args?: unknown) =>
            `${key}:${JSON.stringify(args ?? {})}`,
        },
      },
    });
    expect(wrapper.get('[data-testid="spectator-team-1"]').text()).toContain(
      "Player 2",
    );
    expect(wrapper.get('[data-testid="spectator-team-2"]').text()).toContain(
      "Player 1",
    );
    expect(wrapper.get('[data-testid="spectator-turn"]').text()).toContain(
      "Player 2",
    );
    expect(wrapper.get('[data-testid="spectator-available"]').text()).toContain(
      "(8)",
    );
    stream.send(payload(draftAfter([{ steam_id: "3" }])));
    await wrapper.setProps({ progress: feed.state.progress! });
    expect(wrapper.get('[data-testid="spectator-team-1"]').text()).toContain(
      "Player 3",
    );
    expect(wrapper.get('[data-testid="spectator-turn"]').text()).toContain(
      "Player 1",
    );
    stream.send(payload(draftAfter([{ steam_id: "3" }, { steam_id: "4" }])));
    await wrapper.setProps({ progress: feed.state.progress! });
    expect(wrapper.get('[data-testid="spectator-team-2"]').text()).toContain(
      "Player 4",
    );
    expect(wrapper.get('[data-testid="spectator-available"]').text()).toContain(
      "(6)",
    );
    expect(wrapper.findAll("button,textarea,input")).toHaveLength(0);
    await wrapper.get('[data-testid="spectator-team-1"]').trigger("click");
    expect(wrapper.emitted("pick")).toBeUndefined();
    expect(wrapper.find('[data-testid="captain-pick-chat"]').exists()).toBe(
      false,
    );
    expect(
      wrapper
        .findAllComponents({ name: "DraftTeamPanel" })
        .every(
          (team) =>
            !team.attributes("removable") &&
            !team.attributes("addable") &&
            !team.attributes("self-steam-id"),
        ),
    ).toBe(true);
    wrapper.unmount();
  });

  it("isolates routes, clears stale data on disconnect, and accepts reconnect snapshots", async () => {
    feed.update(picking);
    const old = PublicStream.streams[0];
    old.send(payload());
    old.onerror!();
    expect(feed.state.progress).toBeNull();
    old.send(payload(draftAfter([{ steam_id: "3" }])));
    expect(feed.state.progress?.available).toHaveLength(7);
    old.send(payload(makeDraft(), "other"));
    expect(feed.state.progress?.available).toHaveLength(7);
    feed.update({ ...picking, id: "m2" });
    expect(old.closed).toBe(true);
    old.send(payload());
    expect(feed.state.progress).toBeNull();
    PublicStream.streams[1].send(payload(makeDraft(), "m2"));
    await nextTick();
    expect(feed.state.matchId).toBe("m2");
    expect(feed.state.progress).not.toBeNull();
  });

  it("clears deleted/completed drafts and leaves PickingPlayers on the same match", () => {
    feed.update(picking);
    const stream = PublicStream.streams[0];
    stream.send(payload());
    stream.send({
      matchId: "m1",
      active: false,
      completed: false,
      progress: null,
    });
    expect(feed.state.progress).toBeNull();
    stream.send(payload());
    stream.send({
      matchId: "m1",
      active: false,
      completed: true,
      progress: null,
    });
    expect(feed.state.progress).toBeNull();
    expect(feed.state.matchId).toBe("m1");
    expect(stream.closed).toBe(true);
    feed.update({ id: "m1", status: "Veto" });
    expect(feed.state.matchId).toBeNull();
    expect(PublicStream.streams).toHaveLength(1);
    feed.update({ id: "ordinary", status: "Live" });
    expect(PublicStream.streams).toHaveLength(1);
  });

  it("supersedes only match tabs and restores their current behavior without private components", () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, "../../pages/matches/[id]/index.vue"),
      "utf8",
    );
    expect(page).toMatch(
      /<CaptainPickProgress v-if="publicCaptainPick\.progress"[^>]*\/>\s*<MatchTabs v-else/,
    );
    expect(page).toContain("this.publicProgress.update(this.match)");
    expect(page).toContain("this.publicProgress?.stop()");
    const panel = fs.readFileSync(
      path.resolve(__dirname, "../../components/match/CaptainPickProgress.vue"),
      "utf8",
    );
    expect(panel).not.toMatch(
      /ChatLobby|CaptainPickChat|camera|socket|@pick|@click|@remove/,
    );
  });
});
