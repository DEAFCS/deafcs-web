// Presentation-only bridge: Redis history and the API's existing payloads stay
// untouched. Do not invent reactor identities from count-only snapshots.
import type { LobbyMessage } from "~/web-sockets/Socket";

export function normalizeChatMessage(
  message: Record<string, any>,
): LobbyMessage {
  const normalized: LobbyMessage = {
    ...message,
    message: message.message ?? "",
    source: message.source === "website" ? "web" : message.source,
  };
  if (message.blocked)
    return {
      ...normalized,
      attachments: [],
      gif: null,
      attachment: undefined,
      gifUrl: undefined,
      media: undefined,
      reactions: [],
    };
  if (!normalized.attachments && message.attachment?.id) {
    const attachment = message.attachment;
    normalized.attachments = [
      {
        ...attachment,
        kind: attachment.contentType?.startsWith("video/") ? "video" : "image",
        mime_type: attachment.contentType,
        name: attachment.name ?? "Attachment",
        size: attachment.size ?? 0,
      },
    ];
  }
  if (!normalized.gif && message.gifUrl)
    normalized.gif = { id: "legacy", url: message.gifUrl, width: 0, height: 0 };
  return normalized;
}

export function reactionSummary(message: Record<string, any>, id: string) {
  const reaction = Array.isArray(message.reactions)
    ? message.reactions.find((item: any) => item.reaction === id)
    : undefined;
  return reaction && Number.isInteger(reaction.count) && reaction.count > 0
    ? reaction
    : null;
}
