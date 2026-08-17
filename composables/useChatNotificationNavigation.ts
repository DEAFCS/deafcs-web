// Resolves an inbound chat notification's {type, entity_id} (see
// api-deafcs's ChatLobbyType enum for the canonical id formats this
// mirrors) back into the exact chat tab it came from and opens it --
// clicking a chat notification should land you in that conversation,
// not just the homepage. Used by both the service-worker postMessage
// path (app already open) and the ?openChat= URL fallback (app opened
// fresh from a closed/backgrounded state) -- see
// plugins/chatNotificationClick.client.ts.
import { watch } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import gql from "graphql-tag";
import { useChatTabs, type ChatTab } from "~/composables/useChatTabs";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { setActiveHub } from "~/composables/useHubState";

const PLAYER_QUERY = gql`
  query ChatNotificationPlayer($steamId: bigint!) {
    players_by_pk(steam_id: $steamId) {
      steam_id
      name
      avatar_url
      custom_avatar_url
    }
  }
`;

const CHANNEL_LABELS: Record<string, string> = {
  global: "Global chat",
  organizers: "Organizer chat",
};

const SIMPLE_LOBBY_TYPES: Array<ChatTab["type"]> = [
  "matchmaking",
  "tournament",
  "match",
  "team",
];

// Auth (me.steam_id) is needed to resolve which side of a "direct" id is
// "the other player" -- on a cold app open (notification click while the
// app wasn't running) this composable can run before auth has finished
// loading. Polls briefly rather than assuming it's already there.
async function waitForMe(timeoutMs = 8000): Promise<string | undefined> {
  const auth = useAuthStore();
  if (auth.me?.steam_id) return String(auth.me.steam_id);

  return new Promise((resolve) => {
    const stop = watch(
      () => auth.me?.steam_id,
      (steamId) => {
        if (steamId) {
          stop();
          resolve(String(steamId));
        }
      },
    );
    setTimeout(() => {
      stop();
      resolve(auth.me?.steam_id ? String(auth.me.steam_id) : undefined);
    }, timeoutMs);
  });
}

export function useChatNotificationNavigation() {
  function focusTab(id: string) {
    const { setActiveTab } = useChatTabs();
    setActiveTab(id);
    setActiveHub("chat");
    useRightSidebar().setRightSidebarOpen(true);
  }

  async function openChatFromNotification(
    _notificationType: string | undefined | null,
    entityId: string | undefined | null,
  ): Promise<boolean> {
    if (!entityId) return false;
    // entity_id is "${ChatLobbyType}:${id}" (see chat.service.ts's
    // notifyLobbyMembers) -- that's the real routing type. The
    // notification's own `type` field is a *different* enum (e.g.
    // "OrganizerChatMessage", "GlobalChatMessage", "ChatMessage") used
    // for push categories/preferences, not chat-lobby routing, and is
    // intentionally ignored here.
    const separatorIndex = entityId.indexOf(":");
    if (separatorIndex === -1) return false;
    const type = entityId.slice(0, separatorIndex);

    const { openTab } = useChatTabs();

    if (type === "direct") {
      // entity_id = "direct:<steamIdA>:<steamIdB>"
      const parts = entityId.split(":");
      if (parts.length !== 3) return false;
      const [, a, b] = parts;

      const mySteamId = await waitForMe();
      const otherSteamId = mySteamId === a ? b : mySteamId === b ? a : undefined;
      if (!otherSteamId) return false;

      let label = "Player";
      let avatarUrl: string | undefined;
      try {
        const { client } = useApolloClient();
        const { data } = await client.query({
          query: PLAYER_QUERY,
          variables: { steamId: otherSteamId },
          fetchPolicy: "cache-first",
        });
        const player = data?.players_by_pk;
        if (player) {
          label = player.name || label;
          avatarUrl = player.custom_avatar_url || player.avatar_url || undefined;
        }
      } catch {
        // Best-effort -- open with a generic label rather than fail entirely.
      }

      const lobbyId = [a, b].sort().join(":");
      const id = `direct:${lobbyId}`;
      openTab({
        id,
        label,
        instance: "direct",
        type: "direct",
        lobbyId,
        pinned: false,
        otherSteamId,
        avatarUrl,
      });
      focusTab(id);
      return true;
    }

    if (type === "global" || type === "organizers") {
      openTab({
        id: type,
        label: CHANNEL_LABELS[type] || type,
        instance: type,
        type,
        lobbyId: type,
        pinned: false,
      });
      focusTab(type);
      return true;
    }

    if (type === "match_team") {
      // Team Chat has no sidebar chat-hub tab at all -- unlike every
      // other lobby type, it's only ever rendered inline on the match
      // page itself (see pages/matches/[id]/index.vue). entity_id is
      // "match_team:<matchId>:<lineupId>", so route to that match page
      // rather than trying (and silently failing) to open a hub tab
      // that doesn't exist for this type -- this was the actual bug:
      // "match_team" wasn't in SIMPLE_LOBBY_TYPES below, so a Team Chat
      // notification click matched nothing and did nothing at all.
      const parts = entityId.split(":");
      if (parts.length !== 3) return false;
      const [, matchId] = parts;
      await navigateTo(`/matches/${matchId}`);
      return true;
    }

    if (SIMPLE_LOBBY_TYPES.includes(type as ChatTab["type"])) {
      const lobbyId = entityId.slice(type.length + 1);
      if (!lobbyId) return false;
      openTab({
        id: entityId,
        label: type.charAt(0).toUpperCase() + type.slice(1),
        instance: type,
        type: type as ChatTab["type"],
        lobbyId,
        pinned: false,
      });
      focusTab(entityId);
      return true;
    }

    return false;
  }

  return { openChatFromNotification };
}
