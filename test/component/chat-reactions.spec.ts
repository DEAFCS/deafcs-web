import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import fs from "node:fs";
import path from "node:path";
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

  it("keeps reactions opt-in and hides React for blocked or unstable messages", () => {
    const disabled = mountMessage({
      message: { ...message, reactions: [{ reaction: "heart", count: 1 }] },
    });
    // Match-page style (reactions disabled, non-admin): no menu, no chips.
    expect(actionsMenu(disabled).exists()).toBe(false);
    expect(disabled.find('[aria-label="React"]').exists()).toBe(false);
    expect(disabled.findAll("button")).toHaveLength(0);
    disabled.unmount();

    const blocked = mountMessage({
      reactionsEnabled: true,
      message: { ...message, blocked: true },
    });
    expect(actionsMenu(blocked).exists()).toBe(false);
    expect(blocked.find('[aria-label="React"]').exists()).toBe(false);
    blocked.unmount();

    const unstable = mountMessage({
      reactionsEnabled: true,
      message: { ...message, id: "old-message-id" },
    });
    expect(actionsMenu(unstable).exists()).toBe(false);
    expect(unstable.find('[aria-label="React"]').exists()).toBe(false);
    unstable.unmount();
  });

  it("shows a standalone React button (not inside \"...\") but no reaction row when a message has zero reactions", () => {
    const wrapper = mountMessage({ reactionsEnabled: true });
    // No edit/delete/mute rights on someone else's message -- "..." itself
    // shouldn't render, only the quick-react button next to it.
    expect(actionsMenu(wrapper).exists()).toBe(false);
    expect(wrapper.find('[aria-label="React"]').exists()).toBe(true);
    expect(wrapper.findAll("button")).toHaveLength(1);
    expect(wrapper.find(".reaction-chip").exists()).toBe(false);
    wrapper.unmount();
  });

  it("offers a quick React button next to \"...\" for normal users without exposing Mute/Delete", async () => {
    const wrapper = mountMessage({ reactionsEnabled: true });
    expect(actionsMenu(wrapper).exists()).toBe(false);
    expect(wrapper.find('[aria-label="React"]').exists()).toBe(true);

    (wrapper.vm as any).toggleReaction("fire");
    expect(wrapper.emitted("toggle-reaction")?.[0]?.[0]).toEqual({
      messageId,
      reaction: "fire",
    });
    wrapper.unmount();
  });

  it("keeps administrator Mute/Delete (no Edit) and shows the React button only where reactions are enabled", () => {
    vi.stubGlobal("useAuthStore", () => ({
      me: { steam_id: "76561190000000123" },
      isRoleAbove: () => true,
    }));
    const hub = mountMessage({ reactionsEnabled: true });
    expect(actionsMenu(hub).props("canMute")).toBe(true);
    expect(actionsMenu(hub).props("canDelete")).toBe(true);
    expect(actionsMenu(hub).props("canEdit")).toBe(false);
    expect(hub.find('[aria-label="React"]').exists()).toBe(true);
    hub.unmount();

    const matchPage = mountMessage({ chatType: "match" });
    expect(actionsMenu(matchPage).props("canDelete")).toBe(true);
    expect(matchPage.find('[aria-label="React"]').exists()).toBe(false);
    matchPage.unmount();
  });

  it("the quick React popover offers exactly the five reactions and emits the stable ID", async () => {
    const wrapper = mountMessage(
      { reactionsEnabled: true },
      { attachTo: document.body },
    );
    await wrapper.get('[aria-label="React"]').trigger("click");
    await wrapper.vm.$nextTick();

    // PopoverContent teleports out of the wrapper's own DOM tree.
    const choices = Array.from(
      document.querySelectorAll('[aria-label^="React with"]'),
    );
    expect(choices.map((el) => el.textContent)).toEqual([
      "👍",
      "❤️",
      "😂",
      "🔥",
      "🎉",
    ]);
    (document.querySelector('[aria-label="React with 🔥"]') as HTMLElement)?.click();
    expect(wrapper.emitted("toggle-reaction")?.[0]?.[0]).toEqual({
      messageId,
      reaction: "fire",
    });
    wrapper.unmount();
  });

  it("renders only known positive counts and marks the viewer's selected reaction", () => {
    const wrapper = mountMessage({
      reactionsEnabled: true,
      message: {
        ...message,
        reactions: [
          { reaction: "heart", count: 3, reacted: true },
          { reaction: "party", count: 0, reacted: false },
          { reaction: "unknown", count: 99, reacted: false },
        ],
      },
    });
    const chips = wrapper.findAll('button[aria-label="❤️ 3"]');
    expect(chips).toHaveLength(1);
    expect(chips[0].attributes("aria-pressed")).toBe("true");
    // Compact badge, not a button-sized pill.
    expect(chips[0].classes()).toEqual(
      expect.arrayContaining(["h-4", "px-1", "text-[9px]", "border-primary/70"]),
    );
    expect(chips[0].classes()).not.toContain("min-h-7");
    expect(wrapper.find('button[aria-label="🎉 0"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="unknown 99"]').exists()).toBe(false);
    wrapper.unmount();
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

    expect(CHAT_REACTIONS.map(({ id }) => id)).toEqual([
      "thumbsup",
      "heart",
      "laugh",
      "fire",
      "party",
    ]);
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
