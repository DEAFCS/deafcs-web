// Team Chat: one private Chat Hub room per team. Like the tournament page's
// Chat Room button (useTournamentChatRoom), the team page's Chat entry is not a
// page of its own: it opens this team's existing Chat Hub room and shows the
// Chat Hub's own unread count, so there is exactly one team chat and one unread
// number.
//
// Eligibility comes from MatchLobbyStore.chatTeams (teams the viewer is on now).
// When someone leaves a team the room disappears from the hub as well. The API's
// canAccessTeamChat stays the real gate for joining, reading and sending.
//
// A room the player closed stays closed: the hidden set below is what keeps
// useChatTabSetup from opening it again on the next load. Only the team page's
// Chat entry (openTeamChatRoom) brings it back.
import { ref } from "vue";
import { useAuthStore } from "~/stores/AuthStore";
import { useChatTabs } from "~/composables/useChatTabs";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { setActiveHub } from "~/composables/useHubState";
import { formatChatRoomUnread } from "~/composables/useTournamentChatRoom";
import teamAvatar from "~/utilities/teamAvatar";

export type ChatTeam = {
  id: string;
  name?: string | null;
  short_name?: string | null;
  avatar_url?: string | null;
};

export function teamChatTabId(teamId: string): string {
  return `team:${teamId}`;
}

export function findChatTeam(
  chatTeams: ChatTeam[] | null | undefined,
  teamId: string | null | undefined,
): ChatTeam | null {
  if (!teamId) return null;
  return (
    (chatTeams ?? []).find((team) => String(team?.id) === String(teamId)) ??
    null
  );
}

// Same cap and same empty-when-zero rule as the tournament Chat Room.
export const formatTeamChatUnread = formatChatRoomUnread;

// The tab a team's room is shown as: the team's own name and logo, from the
// same list the hub uses, so a renamed team or a new logo follows through.
// Not "pinned" in the hub sense: that flag means "cannot be closed".
export function teamChatTab(team: ChatTeam) {
  return {
    id: teamChatTabId(team.id),
    label: team.name || team.short_name || "Team",
    instance: "team",
    type: "team" as const,
    lobbyId: team.id,
    avatarUrl: teamAvatar(team) ?? undefined,
    pinned: false,
  };
}

const HIDDEN_STORAGE_KEY = "chat-hidden-team-rooms";

function storageKey(): string | null {
  const steamId = useAuthStore().me?.steam_id;
  return steamId ? `${HIDDEN_STORAGE_KEY}:${steamId}` : null;
}

function loadHidden(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

// Per browser and per account, like the dock's shortcut choices.
const hiddenByAccount = ref<Record<string, string[]>>({});

function hiddenIds(): string[] {
  const key = storageKey();
  if (!key) return [];
  if (!(key in hiddenByAccount.value)) {
    hiddenByAccount.value[key] = loadHidden(key);
  }
  return hiddenByAccount.value[key];
}

function saveHidden(ids: string[]) {
  const key = storageKey();
  if (!key) return;
  hiddenByAccount.value[key] = ids;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // A blocked store only means the choice lasts for this visit.
  }
}

export function isTeamChatHidden(teamId: string): boolean {
  return hiddenIds().includes(String(teamId));
}

// The player closed this room: keep it closed until they open it again.
export function hideTeamChat(teamId: string) {
  const id = String(teamId);
  if (!hiddenIds().includes(id)) saveHidden([...hiddenIds(), id]);
}

export function unhideTeamChat(teamId: string) {
  const id = String(teamId);
  if (hiddenIds().includes(id)) {
    saveHidden(hiddenIds().filter((hidden) => hidden !== id));
  }
}

export function openTeamChatRoom(team: ChatTeam) {
  const tab = teamChatTab(team);
  const { openTab, setActiveTab } = useChatTabs();
  // An explicit open from the team page overrides an earlier close.
  unhideTeamChat(team.id);
  // Same payload useChatTabSetup registers, so if the tab is not there yet
  // this creates the identical tab rather than a copy.
  openTab(tab, { setActive: false });
  // Order matters: switch the hub to chat first, then select the room, so
  // ChatPanel.vue's hub-activated watcher sees this pending selection and
  // opens it instead of auto-jumping to another room with unread. Selecting
  // the room is what clears its unread, exactly like clicking it in the hub.
  setActiveHub("chat");
  useRightSidebar().setRightSidebarOpen(true);
  setActiveTab(tab.id);
}
