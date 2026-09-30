// Makes the right-side Chat Hub the main chat while the player is in an
// active match-related flow (match page, Captain Pick, Draft room).
//
// A page describes its current chat context -- which rooms belong to it
// and which one to focus -- and this composable is the single place that:
//   - adds those rooms to the Hub while the page is mounted,
//   - opens the Hub on Chat once per newly entered context (a manual close,
//     a hub switch or a room switch afterwards is never undone by reactive
//     updates of the same context; a reload or a different context opens it
//     again),
//   - removes the rooms again when the context ends, unless the player is
//     a real participant (see isPersistentChatTab), so an administrator
//     observing someone else's match does not keep a room, a subscription
//     or an unread count for it after leaving the page.
//
// Which room a player may actually read or post in is always decided by the
// API when the room is joined; this only decides which rooms to offer.
import { getCurrentInstance, onBeforeUnmount, watch } from "vue";
import { useChatTabs, type ChatTab } from "~/composables/useChatTabs";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { setActiveHub } from "~/composables/useHubState";
import { useMatchLobbyStore } from "~/stores/MatchLobbyStore";
import {
  captainPickParticipant,
  captainPickTeamChatId,
  myCaptainPickLineup,
  type CaptainPickDraftState,
} from "~/utilities/captainPickDraft";

export interface ChatHubContextRoom {
  type: ChatTab["type"];
  lobbyId: string;
  label: string;
}

export interface ChatHubContext {
  // Identity of the context (e.g. "match:<id>"). The Hub auto-opens once
  // per key.
  key: string;
  // Rooms this context adds to the Hub while it is active.
  rooms: ChatHubContextRoom[];
  // Tab to select when the context is entered. Defaults to the first room.
  // May name a tab the context does not own (e.g. "global").
  focus?: string | null;
  // Set to false to offer the rooms without opening the Hub. The Hub still
  // opens once if this later turns true for the same key.
  autoOpen?: boolean;
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

function matchLabel(match: any, t: Translate) {
  return (
    match?.label ||
    `${match?.lineup_1?.name ?? t("common.tbd")} vs ${match?.lineup_2?.name ?? t("common.tbd")}`
  );
}

// Match page. `canJoin` is the page's own "may use the match chat" check
// (active match + lineup player, coach or organizer/admin); `myLineup` is
// the viewer's own lineup as player or coach, never the opponent's. An
// admin watching a match they are not in gets Match Chat only.
export function matchChatHubContext(
  match: any,
  canJoin: boolean,
  myLineup: { id: string; name?: string | null } | null | undefined,
  t: Translate,
): ChatHubContext | null {
  if (!match?.id || !canJoin) return null;
  const rooms: ChatHubContextRoom[] = [
    { type: "match", lobbyId: match.id, label: matchLabel(match, t) },
  ];
  if (myLineup?.id) {
    rooms.push({
      type: "match_team",
      lobbyId: `${match.id}:${myLineup.id}`,
      label: myLineup.name || t("chat_tab_labels.match_team"),
    });
  }
  return { key: `match:${match.id}`, rooms };
}

// Captain Pick. Opens on the draft's own Match Chat (captain_pick_match, id
// = draftId: only the ten players in this draft, never the site-wide Global
// Chat). The player's Team Chat is added once the server has them on a side,
// without taking focus.
export function captainPickChatHubContext(
  draft: CaptainPickDraftState | null | undefined,
  steamId: string | null | undefined,
  t: Translate,
): ChatHubContext | null {
  if (!draft) return null;
  const rooms: ChatHubContextRoom[] = [
    {
      type: "captain_pick_match",
      lobbyId: draft.draftId,
      label: t("chat.match_chat"),
    },
  ];
  const lineup = myCaptainPickLineup(draft, steamId);
  if (lineup !== null) {
    rooms.push({
      type: "captain_pick_team",
      lobbyId: captainPickTeamChatId(draft.draftId, lineup),
      label: t("matchmaking.captain_pick.team_of", {
        name: captainPickParticipant(draft, draft.captains[lineup])?.name ?? "",
      }),
    });
  }
  return { key: `captain_pick:${draft.draftId}`, rooms };
}

// Draft room. The Draft chat while there is no match yet, then the match's
// Match Chat plus the viewer's own Team Chat once its lineups exist
// (organizers get Match Chat only). Rooms are only offered to viewers who
// can post in them; the Hub only opens by itself for the room's players,
// its host and organizers.
export function draftChatHubContext(input: {
  room: any;
  match: any;
  matchChatReady: boolean;
  signedIn: boolean;
  canChat: boolean;
  inLineup: boolean;
  isOrganizer: boolean;
  isParticipant: boolean;
  myLineupNumber: number | null | undefined;
  t: Translate;
}): ChatHubContext {
  const { room, match, t } = input;
  const rooms: ChatHubContextRoom[] = [];
  if (input.matchChatReady) {
    if (input.inLineup || input.isOrganizer) {
      rooms.push({
        type: "match",
        lobbyId: room.match_id,
        label: matchLabel(match, t),
      });
    }
    const lineupId =
      input.myLineupNumber === 1
        ? match?.lineup_1_id
        : input.myLineupNumber === 2
          ? match?.lineup_2_id
          : null;
    if (input.inLineup && lineupId) {
      const lineup =
        input.myLineupNumber === 1 ? match?.lineup_1 : match?.lineup_2;
      rooms.push({
        type: "match_team",
        lobbyId: `${match.id}:${lineupId}`,
        label: lineup?.name || t("chat_tab_labels.match_team"),
      });
    }
  } else if (input.signedIn && input.canChat) {
    rooms.push({
      type: "draft",
      lobbyId: room.id,
      label: room.host?.name
        ? t("draft_games.room.host_room", { name: room.host.name })
        : t("chat_tab_labels.draft"),
    });
  }
  return {
    key: `draft:${room.id}`,
    rooms,
    autoOpen: input.isParticipant || input.isOrganizer,
  };
}

// Mirrors useChatNotificationNavigation / Socket.ts: the fixed channels use
// their type as id, every other room is "${type}:${lobbyId}".
export function chatHubTabId(type: ChatTab["type"], lobbyId: string) {
  if (type === "global" || type === "organizers" || type === "announcement") {
    return type;
  }
  return `${type}:${lobbyId}`;
}

// Tab ids currently held per mounted context owner.
const heldByOwner = new Map<number, Set<string>>();
let nextOwnerId = 1;
// A tab a notification click asked for, applied once a context offers it.
let pendingFocusId: string | null = null;

export function isChatTabHeldByContext(id: string) {
  for (const held of heldByOwner.values()) {
    if (held.has(id)) return true;
  }
  return false;
}

// Rooms that exist because the player is actually playing in that match
// (derived from myMatches in useChatTabSetup), so leaving a page must not
// remove them.
export function isPersistentChatTab(id: string) {
  const matches = (useMatchLobbyStore().myMatches ?? []) as any[];
  if (id.startsWith("match:")) {
    const matchId = id.slice("match:".length);
    return matches.some((m) => String(m.id) === matchId);
  }
  if (id.startsWith("match_team:")) {
    const [, matchId, lineupId] = id.split(":");
    const match = matches.find((m) => String(m.id) === matchId);
    if (!match) return false;
    return [match.lineup_1, match.lineup_2].some(
      (lineup: any) => lineup?.is_on_lineup && String(lineup.id) === lineupId,
    );
  }
  return false;
}

function openHubOn(tabId: string | null) {
  const { setRightSidebarOpen, setPinned } = useRightSidebar();
  setActiveHub("chat");
  // Pinned like a hub icon click, so moving the pointer off the panel does
  // not close it again. A manual close unpins it as usual.
  setPinned(true);
  setRightSidebarOpen(true);
  if (tabId) {
    useChatTabs().setActiveTab(tabId);
  }
}

// Focus a context room from outside (a chat notification click). Applied
// right away when the room is already in the Hub, otherwise as soon as a
// context offers it.
export function requestChatHubFocus(tabId: string) {
  const { tabs } = useChatTabs();
  if (tabs.value.some((t) => t.id === tabId)) {
    pendingFocusId = null;
    openHubOn(tabId);
    return;
  }
  pendingFocusId = tabId;
}

export function useChatHubContext(
  source: () => ChatHubContext | null | undefined,
) {
  const ownerId = nextOwnerId++;
  const held = new Set<string>();
  heldByOwner.set(ownerId, held);
  let lastOpenedKey: string | null = null;

  const { tabs, activeTabId, openTab, closeTab, setActiveTab } = useChatTabs();

  function release(ids: string[], replacementFocus: string | null) {
    for (const id of ids) {
      held.delete(id);
      if (activeTabId.value === id && replacementFocus) {
        setActiveTab(replacementFocus);
      }
      if (isChatTabHeldByContext(id) || isPersistentChatTab(id)) continue;
      closeTab(id);
    }
  }

  function apply(context: ChatHubContext | null | undefined) {
    const rooms = context?.rooms ?? [];
    const nextIds = rooms.map((room) => chatHubTabId(room.type, room.lobbyId));

    for (const [index, room] of rooms.entries()) {
      const id = nextIds[index];
      held.add(id);
      if (!tabs.value.some((t) => t.id === id)) {
        openTab(
          {
            id,
            label: room.label,
            instance: room.type,
            type: room.type,
            lobbyId: room.lobbyId,
            pinned: true,
          },
          { setActive: false },
        );
      }
    }

    const focus =
      context?.focus && tabs.value.some((t) => t.id === context.focus)
        ? context.focus
        : (nextIds[0] ?? null);

    // e.g. Draft chat handing over to the match's own chat, or Captain Pick
    // team chat going away: whoever was reading the old room lands on this
    // context's main room instead of an unrelated one.
    release(
      [...held].filter((id) => !nextIds.includes(id)),
      focus,
    );

    if (!context) return;

    if (pendingFocusId && tabs.value.some((t) => t.id === pendingFocusId)) {
      const requested = pendingFocusId;
      pendingFocusId = null;
      lastOpenedKey = context.key;
      openHubOn(requested);
      return;
    }

    if (context.key !== lastOpenedKey && context.autoOpen !== false) {
      lastOpenedKey = context.key;
      openHubOn(focus);
    }
  }

  const stop = watch(source, apply, { immediate: true, deep: true });

  function dispose() {
    stop();
    release([...held], null);
    heldByOwner.delete(ownerId);
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose);
  }

  return { dispose };
}
