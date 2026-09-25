import { toast } from "@/components/ui/toast";

// Mirrors api-deafcs chat.service.ts. The API is authoritative: these
// rules only decide which "..." actions to show, never what is allowed.
export const CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS = 10 * 60 * 1000;

// One product limit for website chat text (send and edit), same value
// and wording as the API. Over-length text is refused, never truncated.
export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_MESSAGE_TOO_LONG_ERROR =
  "Message can be up to 2,000 characters.";

export function isChatMessageTooLong(message: string) {
  return message.length > CHAT_MESSAGE_MAX_LENGTH;
}

export function showChatMessageTooLong() {
  toast({
    variant: "destructive",
    description: CHAT_MESSAGE_TOO_LONG_ERROR,
  });
}

export type ChatMessageActionPermissions = {
  canEdit: boolean;
  canDelete: boolean;
  canMute: boolean;
};

// Milliseconds until the self-service window closes, or null when the
// timestamp is missing/invalid or the window has already passed.
export function selfServiceTimeLeft(
  timestamp: unknown,
  now = Date.now(),
): number | null {
  if (typeof timestamp !== "string" && typeof timestamp !== "number") {
    return null;
  }
  const createdAt = new Date(timestamp).getTime();
  if (Number.isNaN(createdAt)) return null;
  const left = createdAt + CHAT_MESSAGE_SELF_SERVICE_WINDOW_MS - now;
  return left >= 0 ? left : null;
}

export function getChatMessageActionPermissions({
  message,
  chatType,
  viewerSteamId,
  isAdministrator,
  now = Date.now(),
}: {
  message: Record<string, any> | undefined;
  chatType: string;
  viewerSteamId: string | number | undefined | null;
  isAdministrator: boolean;
  now?: number;
}): ChatMessageActionPermissions {
  const none = { canEdit: false, canDelete: false, canMute: false };
  if (!message?.id) return none;

  const authorSteamId = message.from?.steam_id;
  const isOwn =
    Boolean(authorSteamId) &&
    viewerSteamId != null &&
    String(authorSteamId) === String(viewerSteamId);
  // Announcements are always website-authored; other rooms record the
  // source, and game-relayed or legacy lines are never self-service.
  const isWebsiteMessage =
    chatType === "announcement" || message.source === "website";
  const canSelfServe =
    isOwn &&
    isWebsiteMessage &&
    !message.blocked &&
    selfServiceTimeLeft(message.timestamp, now) !== null;

  const isEditableText =
    typeof message.message === "string" &&
    message.message.trim().length > 0 &&
    !message.media;

  return {
    // Ownership only: administrators never edit someone else's message.
    // Posting (and so editing) announcements stays administrator-only.
    canEdit:
      canSelfServe &&
      isEditableText &&
      (chatType !== "announcement" || isAdministrator),
    // Administrators keep moderation delete at any age.
    canDelete: isAdministrator || canSelfServe,
    canMute: isAdministrator && Boolean(authorSteamId) && !isOwn,
  };
}
