import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
import { createI18n } from "vue-i18n";
import ChatMessageReactions from "../../components/chat/ChatMessageReactions.vue";
import {
  chatMessagePermissions,
  chatReactionChoices,
  heldChatReactions,
} from "../../utilities/chatMessageActions";
import ChatMessage from "../../components/chat/ChatMessage.vue";
import ChatMessageActionsMenu from "../../components/chat/ChatMessageActionsMenu.vue";
import socket from "../../web-sockets/Socket";
import { CHAT_REACTIONS } from "../../utils/chatReactions";

const messageId = "123e4567-e89b-42d3-a456-426614174000";
const message = {
  id: messageId,
  from: {
    steam_id: "76561190000000456",
    name: "Other",
    role: "verified_user",
  },
  message: "Hello",
  timestamp: "2026-09-24T12:00:00.000Z",
};

describe("Chat Hub message reactions", () => {
  const handles: Array<{ leave: () => void }> = [];
  let reactionListener: { stop: () => void } | undefined;
  let connection: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.stubGlobal("useAuthStore", () => ({
      me: { steam_id: "76561190000000123" },
      isRoleAbove: () => false,
    }));
    const socketInternals = socket as any;
    connection = { send: vi.fn() };
    socketInternals.connected = true;
    socketInternals.connection = connection;
  });

  afterEach(() => {
    reactionListener?.stop();
    reactionListener = undefined;
    for (const handle of handles.splice(0)) handle.leave();
    const socketInternals = socket as any;
    socketInternals.connected = false;
    socketInternals.connection = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mountMessage(
    props: Record<string, unknown> = {},
    options: { attachTo?: Element } = {},
  ) {
    return mount(ChatMessage, {
      props: {
        message,
        chatType: "global",
        ...props,
      },
      ...options,
      global: {
        mocks: {
          $t: (key: string, fallback?: string) => fallback ?? key,
        },
        stubs: {
          TimeAgo: true,
          PlayerDisplay: true,
          FiveStackToolTip: true,
          ChatMessageActionsMenu: true,
        },
      },
    });
  }

  const actionsMenu = (wrapper: ReturnType<typeof mountMessage>) =>
    wrapper.findComponent(ChatMessageActionsMenu);

  it("exposes exactly 24 upstream choices without the historical duplicate", () => {
    expect(CHAT_REACTIONS).toHaveLength(24);
    expect(new Set(CHAT_REACTIONS.map((x) => x.id)).size).toBe(24);
    expect(CHAT_REACTIONS.find((x) => x.id === "party")).toBeUndefined();
    expect(CHAT_REACTIONS.find((x) => x.id === "tada")?.emoji).toBe("🎉");
  });
  it("does not offer reactions for blocked, unstable, gagged or read-only messages", () => {
    for (const patch of [
      { message: { ...message, blocked: true } },
      { message: { ...message, id: "old" } },
      { viewerGagged: true },
      { canPost: false },
    ]) {
      expect(
        chatMessagePermissions({
          message,
          viewerSteamId: "76561190000000123",
          canPost: true,
          canModerate: false,
          roomType: "global",
          ...patch,
        }).canReact,
      ).toBe(false);
    }
  });
  it("keeps administrator moderation separate from reaction access", () => {
    expect(
      chatMessagePermissions({
        message,
        viewerSteamId: "76561190000000123",
        canPost: false,
        canModerate: true,
        roomType: "global",
      }),
    ).toMatchObject({
      canSanction: true,
      canDelete: true,
      canEdit: false,
      canReact: false,
    });
  });
  it("keeps viewer membership for party and tada independently", () => {
    const choices = chatReactionChoices(
      {
        ...message,
        reactions: [
          { reaction: "party", count: 2, reacted: true },
          { reaction: "tada", count: 1, reacted: false },
        ],
      },
      "76561190000000123",
      { canReact: true, canAddReaction: true },
    );
    expect(choices.find((x) => x.id === "party")).toBeUndefined();
    expect(
      heldChatReactions(
        { ...message, reactions: { party: ["76561190000000123"] } },
        "76561190000000123",
      ).has("party"),
    ).toBe(true);
    expect(choices.find((x) => x.id === "tada")?.mine).toBe(false);
  });
  it("renders positive counts and selected pills in the upstream layout", () => {
    const w = mount(ChatMessageReactions, {
      props: {
        message: {
          ...message,
          reactions: [
            { reaction: "heart", count: 3, reacted: true },
            { reaction: "party", count: 2, reacted: true },
            { reaction: "unknown", count: 99 },
          ],
        },
        room: { type: "global", id: "global" },
        permissions: { canReact: true, canAddReaction: true },
        viewerSteamId: "76561190000000123",
      },
      global: {
        plugins: [
          createI18n<Record<string, unknown>, "en">({
            legacy: false,
            locale: "en",
            messages: {
              en: {
                chat: {
                  react_with_count: "React with {emoji} ({count})",
                  reacted_by_count: "{count} players",
                },
              },
            },
          }),
        ],
        stubs: {
          Fold: { template: "<div><slot /></div>" },
          FiveStackToolTip: { template: "<div><slot name='trigger'/></div>" },
          ChatReactionPicker: true,
        },
      },
    });
    const pill = w.get('button[aria-label="React with ❤️ (3)"]');
    expect(pill.attributes("aria-pressed")).toBe("true");
    expect(pill.classes()).toContain("h-6");
    expect(w.findAll("button")).toHaveLength(2);
    pill.trigger("click");
    expect(w.emitted("toggle")?.[0]).toEqual(["heart"]);
    const historical = w.get('button[data-reaction="party"]');
    expect(historical.attributes("aria-pressed")).toBe("true");
    historical.trigger("click");
    expect(w.emitted("toggle")?.[1]).toEqual(["party"]);
    w.unmount();
  });
  it("reacts through the correlated upstream event and blocks overlapping toggles", async () => {
    const first = socket.react("global", "global", messageId, "fire");
    const frame = JSON.parse(connection.send.mock.calls.at(-1)![0]);
    expect(frame.event).toBe("lobby:react");
    expect(frame.data).toMatchObject({ messageId, reaction: "fire" });
    const calls = connection.send.mock.calls.length;
    await socket.react("global", "global", messageId, "fire");
    expect(connection.send.mock.calls).toHaveLength(calls);
    socket.emit("chat:ack", {
      requestId: frame.data.requestId,
      action: "react",
      messageId,
    });
    await first;
  });

  it("protects a newer reaction event from an older history snapshot and sends a dedicated event", () => {
    const instance = `reaction-test-${Date.now()}`;
    const lobby = socket.joinLobby(instance, "global", "global");
    handles.push(lobby);
    const historyEvents: boolean[] = [];
    lobby.on("lobby:messages", (_messages, isHistorySnapshot = false) => {
      historyEvents.push(isHistorySnapshot);
    });

    const initialJoin = JSON.parse(connection.send.mock.calls.at(-1)![0]);
    socket.emit("lobby:global:global:messages", {
      messages: [message],
      historyRequestId: initialJoin.data.historyRequestId,
    });

    reactionListener = socket.listenChatReaction("global", "global", () => {});
    socket.join("lobby", { id: "global", type: "global" });
    const refreshJoin = JSON.parse(connection.send.mock.calls.at(-1)![0]);
    socket.emit("lobby:global:global:reaction", {
      messageId,
      reaction: "heart",
      count: 1,
      active: true,
      actorSteamId: "76561190000000123",
    });
    socket.emit("lobby:global:global:reaction", {
      messageId,
      reaction: "heart",
      count: 2,
      active: true,
      actorSteamId: "76561190000000456",
    });
    expect(historyEvents.at(-1)).toBe(false);

    socket.emit("lobby:global:global:messages", {
      messages: [message],
      historyRequestId: refreshJoin.data.historyRequestId,
    });
    expect(historyEvents.at(-1)).toBe(true);
    expect(lobby.messages[0].reactions).toEqual([
      { reaction: "heart", count: 2, reacted: true },
    ]);

    socket.reactToChatMessage("global", "global", messageId, "heart");
    expect(JSON.parse(connection.send.mock.calls.at(-1)![0])).toEqual({
      event: "lobby:chat:reaction",
      data: {
        type: "global",
        id: "global",
        messageId,
        reaction: "heart",
      },
    });
  });

  it("keeps reaction UI scoped to Chat Hub and hides only match-page attachment inputs", () => {
    const read = (relativePath: string) =>
      fs.readFileSync(path.resolve(__dirname, "../..", relativePath), "utf8");
    const lobby = read("components/chat/ChatLobby.vue");
    const matchPage = read("pages/matches/[id]/index.vue");
    const chatPanel = read("components/hub/ChatPanel.vue");
    const chatPopout = read("pages/chat/[tabId].vue");

    expect(CHAT_REACTIONS).toHaveLength(24);
    expect(CHAT_REACTIONS.map(({ id }) => id)).not.toContain("party");
    expect(lobby).toMatch(/reactionsEnabled:\s*\{[\s\S]*?default:\s*false/);
    expect(lobby).toMatch(/allowChatAttachments:\s*\{[\s\S]*?default:\s*true/);
    // The match page's inline chats were removed (the Chat Hub has both
    // rooms), so it has no attachment inputs left to hide.
    expect(matchPage).not.toContain("<ChatLobby");
    expect(chatPanel).toContain(':reactions-enabled="true"');
    expect(chatPopout).toContain(':reactions-enabled="true"');
    expect(matchPage).not.toContain(':reactions-enabled="true"');
  });
});
