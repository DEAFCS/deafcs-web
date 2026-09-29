import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
// Joining/sending is the socket's and server's job; this only records which
// rooms the sidebar asks for.
vi.mock("~/components/chat/ChatLobby.vue", async () => {
  const vue = await import("vue");
  return {
    default: vue.defineComponent({
      name: "ChatLobby",
      props: ["instance", "type", "lobbyId"],
      setup(props) {
        return () =>
          vue.h("div", {
            "data-stub": "lobby",
            "data-type": props.type,
            "data-lobby": props.lobbyId,
          });
      },
    }),
  };
});
vi.mock("~/components/FiveStackToolTip.vue", async () => {
  const vue = await import("vue");
  return {
    default: vue.defineComponent({
      name: "FiveStackToolTip",
      setup:
        (_p, { slots }) =>
        () =>
          vue.h("div", [slots.trigger?.(), slots.default?.()]),
    }),
  };
});

import CaptainPickChat from "../../components/matchmaking/captain-pick/CaptainPickChat.vue";

const Lobby = { name: "ChatLobby" };
const wrappers: ReturnType<typeof mount>[] = [];

const mountChat = (myLineup: 1 | 2 | null) => {
  const wrapper = mount(CaptainPickChat, {
    props: { draftId: "draft-1", myLineup },
    global: { mocks: { $t: (key: string) => key } },
  });
  wrappers.push(wrapper);
  return wrapper;
};

const lobbies = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAllComponents(Lobby).map((lobby) => lobby.props());

const tabButton = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper
    .findAll('[data-testid="captain-pick-chat-tabs"] button')
    .find((button) => button.text().includes(label))!;

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

describe("Captain Pick chat sidebar", () => {
  it("stays compact and visible on phones (the rooms scroll inside)", () => {
    const root = mountChat(1).find('[data-testid="captain-pick-chat"]');

    expect(root.classes()).not.toContain("hidden");
    // No forced height below xl: just the tabs and the fixed-height room.
    expect(root.classes().filter((c) => /^min-h-/.test(c))).toEqual([]);
    // From xl it fills the sticky right sidebar, as before.
    expect(root.classes()).toContain("xl:flex-1");
  });

  it("always offers DEAFCS Global Chat", () => {
    for (const lineup of [null, 1, 2] as const) {
      const wrapper = mountChat(lineup);
      expect(lobbies(wrapper)[0]).toEqual({
        instance: "captain-pick",
        type: "global",
        lobbyId: "global",
      });
      expect(
        wrapper
          .find('[data-testid="captain-pick-global-chat"]')
          .attributes("style"),
      ).toBeUndefined();
    }
  });

  it("locks Team chat for a player nobody has picked yet", async () => {
    const wrapper = mountChat(null);
    const team = tabButton(wrapper, "chat.team_chat");

    expect(team.attributes("disabled")).toBeDefined();
    expect(
      wrapper.find('[data-testid="captain-pick-team-locked"]').text(),
    ).toBe("matchmaking.captain_pick.team_chat_locked");
    await team.trigger("click");
    // No team room at all, so nothing to join or read.
    expect(lobbies(wrapper)).toHaveLength(1);
    expect(
      wrapper.find('[data-testid="captain-pick-team-chat"]').exists(),
    ).toBe(false);
  });

  it("opens the captain's own team room straight away, never the other one", async () => {
    const wrapper = mountChat(2);
    const team = tabButton(wrapper, "chat.team_chat");

    expect(team.attributes("disabled")).toBeUndefined();
    await team.trigger("click");

    expect(lobbies(wrapper)).toEqual([
      { instance: "captain-pick", type: "global", lobbyId: "global" },
      {
        instance: "captain-pick",
        type: "captain_pick_team",
        lobbyId: "draft-1:2",
      },
    ]);
    expect(wrapper.find('[data-lobby="draft-1:1"]').exists()).toBe(false);
    expect(
      wrapper
        .find('[data-testid="captain-pick-team-chat"]')
        .attributes("style"),
    ).toBeUndefined();
    expect(
      wrapper
        .find('[data-testid="captain-pick-global-chat"]')
        .attributes("style"),
    ).toContain("display: none");
  });

  it("unlocks Team chat as soon as the server puts the player on a team", async () => {
    const wrapper = mountChat(null);
    expect(lobbies(wrapper)).toHaveLength(1);

    await wrapper.setProps({ myLineup: 1 });

    expect(
      tabButton(wrapper, "chat.team_chat").attributes("disabled"),
    ).toBeUndefined();
    expect(lobbies(wrapper).map((lobby) => lobby.lobbyId)).toEqual([
      "global",
      "draft-1:1",
    ]);
    expect(
      wrapper.find('[data-testid="captain-pick-team-locked"]').exists(),
    ).toBe(false);
  });

  it("keeps one of each room while switching tabs", async () => {
    const wrapper = mountChat(1);

    await tabButton(wrapper, "chat.team_chat").trigger("click");
    await tabButton(wrapper, "chat.global_chat").trigger("click");
    await tabButton(wrapper, "chat.team_chat").trigger("click");

    expect(lobbies(wrapper)).toHaveLength(2);
  });

  it("falls back to Global if the team is gone", async () => {
    const wrapper = mountChat(1);
    await tabButton(wrapper, "chat.team_chat").trigger("click");

    await wrapper.setProps({ myLineup: null });

    expect(lobbies(wrapper)).toHaveLength(1);
    expect(
      wrapper
        .find('[data-testid="captain-pick-global-chat"]')
        .attributes("style"),
    ).toBeUndefined();
  });
});
