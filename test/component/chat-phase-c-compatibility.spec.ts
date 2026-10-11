import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeChatMessage } from "../../utilities/chatMessageCompatibility";
import { heldChatReactions } from "../../utilities/chatMessageActions";
import { chatEnterAction } from "../../utilities/chatInputKeys";
import socket from "../../web-sockets/Socket";

const id = "123e4567-e89b-42d3-a456-426614174000";
const legacy = {
  id,
  message: "hello @Friend",
  source: "website",
  mentions: [{ steam_id: "2", name: "Friend" }],
  from: { steam_id: "1" },
};

describe("legacy payload presentation", () => {
  it("preserves text, mentions, IDs and timestamps without mutating history", () => {
    const input = {
      ...legacy,
      timestamp: "2026-10-01T00:00:00Z",
      edited_at: "2026-10-01T00:01:00Z",
    };
    expect(normalizeChatMessage(input)).toEqual({ ...input, source: "web" });
    expect(input.source).toBe("website");
  });
  it("adapts a legacy attachment and GIF without changing upload IDs", () => {
    const message = normalizeChatMessage({
      ...legacy,
      attachment: { id: "private-file", contentType: "video/webm" },
      gifUrl: "https://media.giphy.com/test.gif",
    });
    expect(message.attachments?.[0]).toMatchObject({
      id: "private-file",
      kind: "video",
      mime_type: "video/webm",
    });
    expect(message.gif?.url).toBe("https://media.giphy.com/test.gif");
  });
  it("keeps video-only messages and their private media metadata", () => {
    const media = { id: "synthetic-video", type: "video", durationMs: 2000 };
    expect(
      normalizeChatMessage({ ...legacy, message: "", media }).media,
    ).toEqual(media);
  });
  it("removes all media and reaction variants from blocked payloads", () => {
    const message = normalizeChatMessage({
      ...legacy,
      blocked: true,
      attachment: { id: "hidden" },
      attachments: [{ id: "hidden" }],
      gifUrl: "https://hidden.test",
      gif: { id: "hidden" },
      media: { id: "hidden" },
      reactions: [{ reaction: "party", count: 1 }],
    });
    expect(message).toMatchObject({
      attachments: [],
      gif: null,
      attachment: undefined,
      gifUrl: undefined,
      media: undefined,
      reactions: [],
    });
  });
  it("restores count-only viewer membership without inventing reactor names", () => {
    const message = normalizeChatMessage({
      ...legacy,
      reactions: [
        { reaction: "party", count: 2, reacted: true },
        { reaction: "tada", count: 3, reacted: false },
      ],
    });
    expect([...heldChatReactions(message, "1")]).toEqual(["party"]);
    expect(message.reactions).toHaveLength(2);
  });
  it("uses upstream Enter/Shift/IME semantics", () => {
    expect(chatEnterAction({ shiftKey: true } as KeyboardEvent)).toBe(
      "newline",
    );
    expect(chatEnterAction({ isComposing: true } as KeyboardEvent)).toBe(
      "newline",
    );
    expect(chatEnterAction({} as KeyboardEvent)).toBe("send");
  });
});

describe("upstream correlated actions on the DEAFCS socket", () => {
  let send: ReturnType<typeof vi.fn>;
  const internals = socket as any;
  beforeEach(() => {
    vi.useFakeTimers();
    send = vi.fn();
    internals.connected = true;
    internals.connection = { send };
  });
  afterEach(() => {
    for (const pending of internals.pendingRequests.values())
      clearTimeout(pending.timer);
    internals.pendingRequests.clear();
    internals.reactionsInFlight.clear();
    internals.connected = false;
    internals.connection = undefined;
    vi.useRealTimers();
  });
  const frame = () => JSON.parse(send.mock.calls.at(-1)![0]);
  it("rejects offline edits immediately and never queues destructive actions", async () => {
    internals.connected = false;
    await expect(
      socket.editMessage("global", "global", id, "edit"),
    ).rejects.toMatchObject({ code: "offline", action: "edit" });
    expect(send).not.toHaveBeenCalled();
  });
  it("ignores an acknowledgement for the wrong action", async () => {
    const request = socket.deleteMessage("direct", "1:2", id),
      data = frame().data;
    socket.resolveChatRequest({ ...data, action: "edit" });
    expect(internals.pendingRequests.size).toBe(1);
    socket.resolveChatRequest({ ...data, action: "delete" });
    await request;
    expect(internals.pendingRequests.size).toBe(0);
  });
  it("returns authoritative permission refusals to the editor", async () => {
    const request = socket.editMessage("global", "global", id, "new"),
      data = frame().data;
    const failure = expect(request).rejects.toMatchObject({
      code: "not_allowed",
      action: "edit",
    });
    socket.rejectChatRequest({
      requestId: data.requestId,
      action: "edit",
      code: "not_allowed",
    });
    await failure;
  });
  it("times out at eight seconds and accepts late answers without replay", async () => {
    const request = socket.editMessage("global", "global", id, "new"),
      data = frame().data;
    const failure = expect(request).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(8000);
    await failure;
    expect(internals.pendingRequests.size).toBe(1);
    socket.resolveChatRequest({ requestId: data.requestId, action: "edit" });
    expect(internals.pendingRequests.size).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("expires unanswered late-answer records after another sixty seconds", async () => {
    const request = socket.deleteMessage("global", "global", id);
    const failure = expect(request).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(8000);
    await failure;
    await vi.advanceTimersByTimeAsync(60000);
    expect(internals.pendingRequests.size).toBe(0);
  });
  it("keeps the newest server edit across duplicate listeners and out-of-order events", () => {
    const lobby = socket.joinLobby("phase-c-edit", "global", "global");
    lobby.setMessages([{ ...legacy, message: "initial" }]);
    const a = socket.listenChatEdited("global", "global", () => {}),
      b = socket.listenChatEdited("global", "global", () => {});
    socket.emit("lobby:global:global:edited", {
      id,
      message: "newer",
      edited_at: "2026-10-01T00:02:00Z",
    });
    socket.emit("lobby:global:global:edited", {
      id,
      message: "older",
      edited_at: "2026-10-01T00:01:00Z",
    });
    expect(lobby.messages).toHaveLength(1);
    expect(lobby.messages[0].message).toBe("newer");
    a.stop();
    b.stop();
    lobby.leave();
  });
});
