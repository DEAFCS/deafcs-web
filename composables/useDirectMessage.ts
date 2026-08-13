// Opens (or focuses) a 1:1 DM tab in the Chat hub panel and switches the
// right sidebar there -- the single entry point both FriendListItem.vue's
// message button and the player profile page's message button call.
import { useChatTabs } from "~/composables/useChatTabs";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { setActiveHub } from "~/composables/useHubState";

// Canonical, order-independent room id -- both participants derive the
// exact same id without a lookup. Must match api-deafcs's
// ChatLobbyType.Direct id format exactly (chat.service.ts parses it the
// same way to check the requester is one of the two parties).
export function directChatId(steamIdA: string, steamIdB: string): string {
  return [String(steamIdA), String(steamIdB)].sort().join(":");
}

export function openDirectMessage(otherPlayer: {
  steam_id: string;
  name?: string;
  avatar_url?: string;
  custom_avatar_url?: string;
}) {
  const me = useAuthStore().me;
  if (!me?.steam_id || !otherPlayer?.steam_id) return;
  if (String(me.steam_id) === String(otherPlayer.steam_id)) return;

  const lobbyId = directChatId(me.steam_id, otherPlayer.steam_id);
  const id = `direct:${lobbyId}`;

  const { openTab, setActiveTab } = useChatTabs();
  openTab({
    id,
    label: otherPlayer.name || "Player",
    instance: "direct",
    type: "direct",
    lobbyId,
    pinned: false,
    otherSteamId: String(otherPlayer.steam_id),
    avatarUrl: otherPlayer.custom_avatar_url || otherPlayer.avatar_url,
  });
  setActiveTab(id);

  setActiveHub("chat");
  useRightSidebar().setRightSidebarOpen(true);
}
