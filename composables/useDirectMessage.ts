// Opens (or focuses) a 1:1 DM tab in the Chat hub panel and switches the
// right sidebar there -- the single entry point both FriendListItem.vue's
// message button and the player profile page's message button call.
import { useChatTabs } from "~/composables/useChatTabs";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { setActiveHub } from "~/composables/useHubState";
import { useMessageRequests } from "~/composables/useMessageRequests";

// Canonical, order-independent room id -- both participants derive the
// exact same id without a lookup. Must match api-deafcs's
// ChatLobbyType.Direct id format exactly (chat.service.ts parses it the
// same way to check the requester is one of the two parties).
export function directChatId(steamIdA: string, steamIdB: string): string {
  return [String(steamIdA), String(steamIdB)]
    .sort((a, b) =>
      BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0,
    )
    .join(":");
}

export function openDirectMessage(
  otherPlayer: {
    steam_id: string;
    name?: string;
    avatar_url?: string;
    custom_avatar_url?: string;
  },
  options: { requestPreview?: boolean } = {},
) {
  const me = useAuthStore().me;
  if (!me?.steam_id || !otherPlayer?.steam_id) return;
  if (String(me.steam_id) === String(otherPlayer.steam_id)) return;

  const lobbyId = directChatId(me.steam_id, otherPlayer.steam_id);
  const id = `direct:${lobbyId}`;
  const requestPreview = options.requestPreview === true || useMessageRequests().isRequest(lobbyId);

  const { openTab, setActiveTab } = useChatTabs();
  openTab({
    id,
    label: otherPlayer.name || "Player",
    instance: "direct",
    type: "direct",
    lobbyId,
    pinned: false,
    requestPreview,
    otherSteamId: String(otherPlayer.steam_id),
    avatarUrl: otherPlayer.custom_avatar_url || otherPlayer.avatar_url,
  });
  useChatTabs().setRequestPreview(id, requestPreview);
  setActiveTab(id);

  setActiveHub("chat");
  useRightSidebar().setRightSidebarOpen(true);
}

export interface DirectMessagePeer {
  steam_id: string;
  name?: string;
  avatar_url?: string;
  custom_avatar_url?: string;
}
export const directTabId = (roomId: string) => `direct:${roomId}`;

export function directPeerSteamId(room: unknown, me: unknown): string | null {
  if (typeof room !== "string") return null;
  const parties = room.split(":");
  if (
    parties.length !== 2 ||
    parties.some((id) => !/^[1-9][0-9]{0,18}$/.test(id))
  )
    return null;
  if (
    parties.some((id) => BigInt(id) > 9223372036854775807n) ||
    BigInt(parties[0]) >= BigInt(parties[1]) ||
    !parties.includes(String(me))
  )
    return null;
  return parties.find((id) => id !== String(me)) ?? null;
}
