// The tournament page's "Chat Room" tab. It is not a page of its own: it
// opens this tournament's existing Chat Hub room and reuses the Chat Hub's
// own eligibility list, tab and unread count, so there is exactly one
// tournament chat and one unread number.
//
// Eligibility comes from MatchLobbyStore.chatTournaments, the same list
// useChatTabSetup's ensureTournamentChatTabs uses to create the pinned
// tournament tab (joined_tournament || is_organizer, including the 24h
// grace window after Finished). When a tournament drops out of that list
// the tab disappears too, so there is never a broken navigation target.
// The API's canAccessTournamentChat stays the real gate for joining and
// sending.
import { useChatTabs } from "~/composables/useChatTabs";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { setActiveHub } from "~/composables/useHubState";

export function tournamentChatTabId(tournamentId: string): string {
  return `tournament:${tournamentId}`;
}

type ChatTournament = { id: string; name?: string | null };

export function findChatTournament(
  chatTournaments: ChatTournament[] | null | undefined,
  tournamentId: string | null | undefined,
): ChatTournament | null {
  if (!tournamentId) return null;
  return (
    (chatTournaments ?? []).find(
      (t) => String(t?.id) === String(tournamentId),
    ) ?? null
  );
}

// Same cap as the Chat Hub icon badge (RightHub.vue's formatBadgeCount).
// Empty when there is nothing unread, so the tab reads just "Chat Room".
export function formatChatRoomUnread(count: number | null | undefined): string {
  const n = Number(count) || 0;
  if (n <= 0) return "";
  return n > 100 ? "100+" : String(n);
}

export function openTournamentChatRoom(tournament: ChatTournament) {
  const id = tournamentChatTabId(tournament.id);
  const { openTab, setActiveTab } = useChatTabs();
  // Same payload ensureTournamentChatTabs registers, so if the tab is not
  // there yet this creates the identical pinned tab rather than a copy.
  // setActive: false here; the explicit setActiveTab below does it.
  openTab(
    {
      id,
      label: tournament.name || "Tournament",
      instance: "tournament",
      type: "tournament",
      lobbyId: tournament.id,
      pinned: true,
    },
    { setActive: false },
  );
  // Order matters: switch the hub to chat first, then select the room, so
  // ChatPanel.vue's hub-activated watcher sees this pending selection and
  // opens it instead of auto-jumping to another room with unread.
  // Selecting the room is what clears its unread (ChatPanel's
  // handleSelectRoom -> resetUnread), exactly like clicking it in the hub.
  setActiveHub("chat");
  useRightSidebar().setRightSidebarOpen(true);
  setActiveTab(id);
}
