export const CHAT_REACTIONS = [
  { id: "thumbsup", emoji: "👍" },
  { id: "heart", emoji: "❤️" },
  { id: "fire", emoji: "🔥" },
  { id: "party", emoji: "🎉" },
] as const;

export type ChatReaction = (typeof CHAT_REACTIONS)[number]["id"];

export function isStableChatMessageId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
