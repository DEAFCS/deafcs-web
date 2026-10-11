import { CHAT_REACTIONS as upstreamReactions } from "~/constants/chat";

// Existing DEAFCS consumers use emoji rather than upstream glyph.
export const CHAT_REACTIONS = upstreamReactions.map(({ id, glyph }) => ({
  id,
  emoji: glyph,
}));
export type { ChatReaction } from "~/constants/chat";

export function isStableChatMessageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
