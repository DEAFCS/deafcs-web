import { watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { useChatTabs } from "~/composables/useChatTabs";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";
import { useAuthStore } from "~/stores/AuthStore";
import { e_player_roles_enum } from "~/generated/zeus";
import socket, { type ChatType, type Lobby } from "~/web-sockets/Socket";
import { isChatTabHeldByContext } from "~/composables/useChatHubContext";
import {
  isTeamChatHidden,
  teamChatTab,
  teamChatTabId,
} from "~/composables/useTeamChatRoom";

export function useChatTabSetup() {
  const { t } = useI18n();
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTab,
    setPinned,
    patchTab,
    unreadCounts,
    clearUnread,
    noteActivity,
  } = useChatTabs();

  const matchLobbyStore = useMatchLobbyStore();
  const authStore = useAuthStore();

  // Moderators join the organizers and administrators in Organizer Chat. The
  // API (ChatService.ORGANIZER_CHAT_MIN_ROLE) is the real gate.
  const isOrganizer = computed(() =>
    authStore.isRoleAbove(e_player_roles_enum.moderator),
  );
  const canUseGlobalChat = computed(() =>
    authStore.isRoleAbove(e_player_roles_enum.verified_user),
  );
  const persistentLobbies = new Map<string, Lobby>();

  // The player's own lineup chat for a match they are actually playing in,
  // shown below that match's Match Chat. Only is_on_lineup: the
  // opponent's lineup is never offered, and the API decides who may join.
  function ensureMatchTeamTab(match: any) {
    const lineup = [match?.lineup_1, match?.lineup_2].find(
      (l: any) => l?.is_on_lineup && l?.id,
    );
    for (const tab of [...tabs.value]) {
      if (tab.type === "match_team" && tab.lobbyId.startsWith(`${match.id}:`) &&
        tab.lobbyId !== `${match.id}:${lineup?.id}`) closeTab(tab.id);
    }
    if (!lineup) return;
    const lobbyId = `${match.id}:${lineup.id}`;
    const id = `match_team:${lobbyId}`;
    if (tabs.value.some((tab) => tab.id === id)) return;
    openTab(
      {
        id,
        label: lineup.name || t("chat_tab_labels.match_team"),
        instance: "match_team",
        type: "match_team",
        lobbyId,
        pinned: true,
      },
      { setActive: false },
    );
  }

  function syncPersistentChatJoins() {
    const activeIds = new Set(tabs.value.map((tab) => tab.id));

    for (const tab of tabs.value) {
      if (persistentLobbies.has(tab.id)) {
        continue;
      }

      const lobby = socket.joinLobby(
        `chat-tab-setup:${tab.id}`,
        tab.type as ChatType,
        tab.lobbyId,
      );
      // The room's history marks when it was last active, so a conversation
      // that was busy before a reload keeps its place on the hub dock
      // (5Stack's useChatTabSetup does the same).
      lobby.on("lobby:messages", (messages: Array<{ timestamp?: string }>) => {
        const newest = Math.max(
          0,
          ...(messages ?? []).map((message) =>
            Date.parse(message?.timestamp ?? ""),
          ).filter(Number.isFinite),
        );
        if (newest > 0) {
          noteActivity(tab.id, newest);
        }
      });
      persistentLobbies.set(tab.id, lobby);
    }

    for (const [tabId, lobby] of persistentLobbies.entries()) {
      if (activeIds.has(tabId)) {
        continue;
      }

      lobby.leave();
      persistentLobbies.delete(tabId);
    }
  }

  function ensureTournamentChatTabs() {
    const tournaments = matchLobbyStore.chatTournaments as any[];

    // Ensure a pinned chat tab for every chat-eligible tournament.
    for (const t of tournaments) {
      const tabId = `tournament:${t.id}`;
      const existing = tabs.value.find((tab) => tab.id === tabId);
      if (!existing) {
        openTab(
          {
            id: tabId,
            label: t.name,
            instance: "tournament",
            type: "tournament",
            lobbyId: t.id, // pass tournament ID as lobby id
            pinned: true,
          },
          { setActive: false },
        );
      } else if (!existing.pinned) {
        setPinned(tabId, true);
      }
    }

    // Remove tournament chat tabs that are no longer eligible.
    const activeIds = new Set(
      tournaments.map((t: any) => `tournament:${t.id}`),
    );
    for (const tab of [...tabs.value]) {
      if (tab.type === "tournament" && !activeIds.has(tab.id)) {
        closeTab(tab.id);
      }
    }

    // Reported bug: a tournament chat's unread badge (sometimes 100+)
    // stayed forever after the tournament finished and its chat
    // disappeared. closeTab above only cleans up a tab that's still
    // open THIS session -- if the tournament finished while the player
    // was offline, no tab for it was ever (re)created here to begin
    // with, so its old unread count from before it finished was never
    // touched and just sat in localStorage, permanently inflating the
    // total unread badge. Only runs once the subscription has actually
    // reported back at least once (see chatTournamentsLoaded) so this
    // doesn't wipe legitimate counts against the empty initial value.
    if (matchLobbyStore.chatTournamentsLoaded) {
      for (const id of Object.keys(unreadCounts.value)) {
        if (id.startsWith("tournament:") && !activeIds.has(id)) {
          clearUnread(id);
        }
      }
    }
  }

  // One private room per team the player is on. A new team (or a room the
  // player never closed) appears on its own; a room they closed stays closed
  // until they open it from the team page, and a team they left disappears.
  function ensureTeamChatTabs() {
    const teams = (matchLobbyStore.chatTeams ?? []) as any[];

    for (const team of teams) {
      const tab = teamChatTab(team);
      const existing = tabs.value.find((candidate) => candidate.id === tab.id);
      if (existing) {
        patchTab(tab.id, { label: tab.label, avatarUrl: tab.avatarUrl });
        continue;
      }
      if (isTeamChatHidden(team.id)) continue;
      openTab(tab, { setActive: false });
    }

    const eligibleIds = new Set(teams.map((team: any) => teamChatTabId(team.id)));

    // Only once the subscription has actually reported (chatTeamsLoaded), so
    // the empty initial value never closes a room or wipes a real count.
    if (!matchLobbyStore.chatTeamsLoaded) return;

    for (const tab of [...tabs.value]) {
      if (tab.type === "team" && !eligibleIds.has(tab.id)) {
        closeTab(tab.id);
      }
    }
    for (const id of Object.keys(unreadCounts.value)) {
      if (id.startsWith("team:") && !eligibleIds.has(id)) {
        clearUnread(id);
      }
    }
  }

  function ensureDefaultTabs() {
    const previousActiveId = activeTabId.value;

    const me = authStore.me;
    if (me?.current_lobby_id) {
      const lobbyTabId = `matchmaking:${me.current_lobby_id}`;
      const existingLobby = tabs.value.find((t) => t.id === lobbyTabId);
      if (!existingLobby) {
        openTab(
          {
            id: lobbyTabId,
            label: t("chat_tab_labels.lobby_default"),
            instance: "matchmaking",
            type: "matchmaking",
            lobbyId: me.current_lobby_id,
            pinned: true,
          },
          { setActive: false },
        );
      }
    }

    const currentMatch = matchLobbyStore.currentMatch;
    if (currentMatch) {
      const matchTabId = `match:${currentMatch.id}`;
      const existingMatch = tabs.value.find((t) => t.id === matchTabId);
      if (!existingMatch) {
        openTab(
          {
            id: matchTabId,
            label:
              currentMatch.label ||
              `${currentMatch.lineup_1?.name ?? t("common.tbd")} vs ${currentMatch.lineup_2?.name ?? t("common.tbd")}`,
            instance: "match",
            type: "match",
            lobbyId: currentMatch.id,
            pinned: true,
          },
          { setActive: false },
        );
      }
      ensureMatchTeamTab(currentMatch);
    }

    const globalId = "global";
    const existingGlobal = tabs.value.find((t) => t.id === globalId);
    if (canUseGlobalChat.value) {
      if (!existingGlobal) {
        openTab(
          {
            id: globalId,
            label: t("chat_tab_labels.global_default"),
            instance: "global",
            type: "global",
            lobbyId: globalId,
            pinned: true,
          },
          { setActive: false },
        );
      } else if (!existingGlobal.pinned) {
        setPinned(globalId, true);
      }
    } else if (existingGlobal) {
      closeTab(globalId);
    }

    const announcementId = "announcement";
    const existingAnnouncement = tabs.value.find(
      (t) => t.id === announcementId,
    );
    // Narrower gate than Global Chat on purpose -- Announcements is
    // readable by every logged-in player, including the base "user"
    // role, not just verified_user+ (per explicit request), so this
    // seeds for anyone with a session at all rather than reusing
    // canUseGlobalChat.
    if (Boolean(me)) {
      if (!existingAnnouncement) {
        openTab(
          {
            id: announcementId,
            label: t("chat_tab_labels.announcement_default"),
            instance: "announcement",
            type: "announcement",
            lobbyId: announcementId,
            pinned: true,
          },
          { setActive: false },
        );
      } else if (!existingAnnouncement.pinned) {
        setPinned(announcementId, true);
      }
    } else if (existingAnnouncement) {
      closeTab(announcementId);
    }

    const organizerId = "organizers";
    const existingOrganizer = tabs.value.find((t) => t.id === organizerId);
    if (isOrganizer.value) {
      const existing = existingOrganizer;
      if (!existing) {
        openTab(
          {
            id: organizerId,
            label: t("chat_tab_labels.organizers_default"),
            instance: "organizers",
            type: "organizers",
            lobbyId: organizerId,
            pinned: true,
          },
          { setActive: false },
        );
      } else if (!existing.pinned) {
        setPinned(organizerId, true);
      }
    } else if (existingOrganizer) {
      closeTab(organizerId);
    }

    // Restore previously active tab so adding defaults doesn't steal focus.
    if (previousActiveId) {
      const stillExists = tabs.value.find((t) => t.id === previousActiveId);
      if (stillExists) {
        setActiveTab(previousActiveId);
      }
    }
  }

  watch(
    () => authStore.me,
    (me) => {
      // Close stale matchmaking tabs
      const activeLobbyId = me?.current_lobby_id ?? null;
      for (const tab of tabs.value) {
        if (tab.type === "matchmaking" && tab.lobbyId !== activeLobbyId) {
          closeTab(tab.id);
        }
      }

      // Same orphaned-unread-count sweep as tournaments (see
      // ensureTournamentChatTabs) -- a matchmaking lobby's tab only gets
      // closed above if it still exists this session. A lobby that
      // dissolved while the player was offline never got a tab
      // (re)created here to trigger that at all, so its leftover unread
      // count sat in localStorage forever. Reported: an admin who
      // organizes/plays a lot of matches accumulated a large, permanently
      // stuck total unread count that never matched what any single
      // device actually had open. authStore.me being loaded at all is
      // guard enough here (unlike tournaments' chatTournaments, there's
      // no separate "still loading" state to worry about).
      if (me) {
        for (const id of Object.keys(unreadCounts.value)) {
          if (
            id.startsWith("matchmaking:") &&
            id !== `matchmaking:${activeLobbyId}`
          ) {
            clearUnread(id);
          }
        }
      }

      ensureDefaultTabs();
    },
    { immediate: true },
  );

  watch(
    () => matchLobbyStore.chatTournaments,
    () => {
      ensureTournamentChatTabs();
    },
    { immediate: true, deep: true },
  );

  watch(
    () => [matchLobbyStore.chatTeams, authStore.me?.steam_id],
    () => {
      ensureTeamChatTabs();
    },
    { immediate: true, deep: true },
  );

  watch(
    () => matchLobbyStore.currentMatch,
    (match) => {
      if (!match) {
        return;
      }
      const id = `match:${match.id}`;
      const existing = tabs.value.find((t) => t.id === id);
      if (!existing) {
        openTab(
          {
            id,
            label:
              match.label ||
              `${match.lineup_1?.name ?? t("common.tbd")} vs ${match.lineup_2?.name ?? t("common.tbd")}`,
            instance: "match",
            type: "match",
            lobbyId: match.id,
          },
          { setActive: false },
        );
      }
      ensureMatchTeamTab(match);
    },
  );

  watch(
    () => matchLobbyStore.myMatches,
    () => {
      const matches = matchLobbyStore.myMatches as any[];
      const activeMatchTabIds = new Set(matches.map((m) => `match:${m.id}`));
      const ownTeamIds = new Set(matches.flatMap((match) =>
        [match.lineup_1, match.lineup_2]
          .filter((lineup) => lineup?.is_on_lineup && lineup.id)
          .map((lineup) => `${match.id}:${lineup.id}`),
      ));

      for (const tab of [...tabs.value]) {
        // A room a page is showing right now (e.g. an admin watching a
        // match they are not in) is removed by that page when it leaves.
        if (isChatTabHeldByContext(tab.id)) continue;
        if (tab.type === "match" && !activeMatchTabIds.has(tab.id)) {
          closeTab(tab.id);
        }
        if (
          tab.type === "match_team" &&
          !ownTeamIds.has(tab.lobbyId)
        ) {
          closeTab(tab.id);
        }
      }

      // Same orphaned-unread-count sweep as tournaments/matchmaking above
      // -- a finished match's chat that the player never reopened this
      // session left its unread count stuck in localStorage forever,
      // since closeTab only cleans up a tab that still exists. Not
      // gated on an extra "loaded" flag: this watcher (no immediate:
      // true) only ever runs after myMatches has actually changed from
      // its initial empty value, i.e. once real data has arrived.
      for (const id of Object.keys(unreadCounts.value)) {
        if (id.startsWith("match:") && !activeMatchTabIds.has(id)) {
          clearUnread(id);
        }
      }
    },
    { deep: true },
  );

  watch(tabs, syncPersistentChatJoins, { immediate: true, deep: true });
}
