// A DM room only gets a live chat.service.ts "to()" delivery for
// participants who've already joined it via a socket (i.e. already have
// the tab open) -- fine for channels everyone's always a member of
// (Global, Organizer), but a DM has no such standing membership. Without
// this, a first-ever message to someone who has never opened that
// specific conversation is delivered nowhere: no tab exists client-side
// to receive it, and it doesn't surface anywhere else since ChatMessage
// notifications are deliberately excluded from the alert bell (see
// NotificationStore.ts). This subscribes to the current player's own
// ChatMessage notifications for `direct:` entities and auto-opens
// (or just bumps unread on) the matching tab so the conversation exists
// once a first message has actually arrived.
import socket from "~/web-sockets/Socket";
import { useMessageRequests } from "~/composables/useMessageRequests";
import { useBlockActions } from "~/composables/useBlockActions";
import { watch, watchEffect, getCurrentScope, onScopeDispose } from "vue";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, order_by } from "~/generated/zeus";
import { generateMutation, generateQuery } from "~/graphql/graphqlGen";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { useSubscriptionManager } from "~/composables/useSubscriptionManager";
import { useChatTabs } from "~/composables/useChatTabs";
import {
  directChatId,
  directPeerSteamId,
} from "~/composables/useDirectMessage";
import { useAuthStore } from "~/stores/AuthStore";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { useHubState } from "~/composables/useHubState";

let requestsListener: ReturnType<typeof socket.listen> | undefined;

let reconnectListener: ReturnType<typeof socket.listen> | undefined;
const readRequests = new Map<string, Promise<unknown>>();
const seenNotificationIds = new Set<string>();

// Persists "I've read this DM" server-side so a reload doesn't undo it.
// Previously the only place "read" existed was the client-only
// unreadCounts ref reset by ChatPanel.vue's resetUnread() -- a full page
// reload rebuilds chat-tab state from scratch, and this composable's own
// subscription re-delivers every still-unread-in-the-database ChatMessage
// notification row for this player, so an already-read badge popped right
// back after F5 (reported: TricoN reads a DM, badge clears, hits F5, badge
// is back). Marking the row read here is what makes the clear stick.
export async function markDirectMessagesRead(lobbyId: string) {
  const me = useAuthStore().me;
  if (!me?.steam_id) return;
  if (typeof $fetch === "function") {
    const key = String(me.steam_id) + ":" + lobbyId;
    if (!readRequests.has(key)) {
      const pending = $fetch(
        `https://${useRuntimeConfig().public.apiDomain}/chat/direct/conversations/${encodeURIComponent(lobbyId)}/read`,
        { method: "POST", credentials: "include" },
      )
        .catch(() => undefined)
        .finally(() => readRequests.delete(key));
      readRequests.set(key, pending);
    }
    await readRequests.get(key);
    if (useAuthStore().me?.steam_id !== me.steam_id) return;
  }
  try {
    await getGraphqlClient().mutate({
      mutation: generateMutation({
        update_notifications: [
          {
            where: {
              type: { _eq: "ChatMessage" },
              entity_id: { _eq: `direct:${lobbyId}` },
              steam_id: { _eq: $("steamId", "bigint!") },
              is_read: { _eq: false },
            },
            _set: { is_read: true },
          },
          { __typename: true },
        ],
      }),
      variables: { steamId: me.steam_id },
    });
  } catch (error) {
    console.error("failed to mark direct messages as read", error);
  }
}

async function fetchAvatarUrl(steamId: string): Promise<string | undefined> {
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        players_by_pk: [
          { steam_id: steamId },
          { avatar_url: true, custom_avatar_url: true },
        ],
      }),
      fetchPolicy: "cache-first",
    });
    const player = data?.players_by_pk;
    return player?.custom_avatar_url || player?.avatar_url || undefined;
  } catch (error) {
    console.error("failed to fetch avatar for incoming DM tab", error);
    return undefined;
  }
}

export function useIncomingDirectMessages() {
  const authStore = useAuthStore();
  const messageRequests = useMessageRequests();
  let hydrationVersion = 0;
  let disposed = false;
  const changedRooms = new Set<string>();
  async function hydrateRequests() {
    const steamId = authStore.me?.steam_id;
    const version = ++hydrationVersion;
    changedRooms.clear();
    if (!steamId) return;
    try {
      const { conversations } = await $fetch<{ conversations: Array<any> }>(
        `https://${useRuntimeConfig().public.apiDomain}/chat/direct/conversations`,
        { credentials: "include" },
      );
      if (
        disposed ||
        version !== hydrationVersion ||
        authStore.me?.steam_id !== steamId
      )
        return;
      const valid = conversations.filter(
        (row) =>
          directPeerSteamId(row.roomId, steamId) === String(row.peer?.steam_id),
      );
      messageRequests.setRequests([
        ...messageRequests.requests.value.filter((row) =>
          changedRooms.has(row.roomId),
        ),
        ...valid
          .filter(
            (row) =>
              row.request &&
              !changedRooms.has(row.roomId) &&
              !useBlockActions().isBlocked(row.peer.steam_id),
          )
          .map((row) => ({
            roomId: row.roomId,
            peer: row.peer,
            unread: row.unread,
          })),
      ]);
      for (const row of valid)
        if (!row.request && !changedRooms.has(row.roomId))
          messageRequests.setAwaitingReply(row.roomId, !!row.awaitingReply);
    } catch {
      /* An API not yet migrated must not break legacy friend DMs. */
    }
  }
  requestsListener?.stop();
  requestsListener = socket.listen("direct:incoming", (data: any) => {
    const me = authStore.me?.steam_id;
    const peer = directPeerSteamId(data?.roomId, me);
    if (
      disposed ||
      !peer ||
      peer !== String(data.from?.steam_id) ||
      useBlockActions().isBlocked(peer)
    )
      return;
    changedRooms.add(data.roomId);
    if (data.request === true) {
      messageRequests.addRequest({
        roomId: data.roomId,
        peer: data.from,
        unread: 1,
      });
    } else if (
      data.request === false &&
      typeof data.awaitingReply === "boolean"
    ) {
      // State only: normal DM badges remain owned by the durable notification
      // subscription, so these events never double-count or steal focus.
      messageRequests.setAwaitingReply(data.roomId, data.awaitingReply);
    }
  });
  reconnectListener?.stop();
  reconnectListener = socket.listen("online", () => {
    void hydrateRequests();
  });
  const ownedListener = requestsListener,
    ownedReconnect = reconnectListener;
  if (getCurrentScope())
    onScopeDispose(() => {
      disposed = true;
      hydrationVersion++;
      ownedListener.stop();
      ownedReconnect.stop();
    });
  const { subscribe } = useSubscriptionManager();
  const {
    tabs,
    registerTabIfMissing,
    setAvatarUrl,
    incrementUnread,
    activeTabId,
  } = useChatTabs();
  const { rightSidebarOpen } = useRightSidebar();
  const { activeHub } = useHubState();

  // Remove an explicitly opened request preview when its author is blocked.
  // The API still owns delivery authorization; this also hides cached content.
  watchEffect(() => {
    for (const tab of [...tabs.value]) {
      if (
        tab.requestPreview &&
        tab.otherSteamId &&
        useBlockActions().isBlocked(tab.otherSteamId)
      )
        useChatTabs().closeTab(tab.id);
    }
  });

  function handleRow(row: {
    id: string;
    title: string;
    entity_id: string;
    steam_id: string;
  }) {
    if (seenNotificationIds.has(row.id)) return;
    seenNotificationIds.add(row.id);

    const me = authStore.me;
    if (!me?.steam_id) return;

    if (String(row.steam_id) !== String(me.steam_id)) return;
    const otherSteamId = directPeerSteamId(
      (row.entity_id || "").replace(/^direct:/, ""),
      me.steam_id,
    );
    if (!otherSteamId || useBlockActions().isBlocked(otherSteamId)) return;

    const lobbyId = directChatId(me.steam_id, otherSteamId);
    if (messageRequests.isRequest(lobbyId)) return;
    const tabId = `direct:${lobbyId}`;

    const existing = tabs.value.find((t) => t.id === tabId);
    if (!existing) {
      // registerTabIfMissing (not openTab) -- a background arrival must
      // not steal focus/mark itself active, same reasoning as the
      // chat:new-message handler in web-sockets/Socket.ts. openTab used
      // to be called here, which made a brand-new conversation's very
      // first message active immediately (openTab sets activeTabIdRef),
      // so the isVisible check right below always saw it as "already
      // being looked at" and skipped incrementUnread for it.
      registerTabIfMissing({
        id: tabId,
        label: row.title || "Player",
        instance: "direct",
        type: "direct",
        lobbyId,
        pinned: false,
        otherSteamId,
      });

      // Reported bug: a DM arriving from someone with no conversation
      // open yet showed the fallback initial instead of their avatar.
      // The ChatMessage notification row (above) carries no avatar at
      // all -- unlike openDirectMessage's "Message" button, which gets
      // it straight from the profile already loaded in memory -- so it
      // has to be fetched here once the tab is registered.
      fetchAvatarUrl(otherSteamId).then((avatarUrl) => {
        if (authStore.me?.steam_id === me.steam_id && avatarUrl)
          setAvatarUrl(tabId, avatarUrl);
      });
    }

    // Reported bug: the unread badge never appeared for a DM that arrived
    // while the sidebar was closed, if that same conversation happened to
    // be the last one open before closing it. Root cause -- activeTabId
    // alone doesn't mean "currently visible": closing the sidebar (see
    // useHubState.ts) doesn't clear it, it only stops rendering the
    // panel, so a stale activeTabId match wrongly looked like "user is
    // looking at this right now" and skipped the increment. Mirrors the
    // isVisible check already used by Socket.ts's chat:new-message
    // handler and ChatPanel.vue's own per-message handler.
    const isVisible =
      rightSidebarOpen.value &&
      activeHub.value === "chat" &&
      activeTabId.value === tabId;

    if (!isVisible) {
      incrementUnread(tabId);
    } else {
      void markDirectMessagesRead(lobbyId);
    }
  }

  watch(
    () => authStore.me?.steam_id,
    (steamId, previous) => {
      seenNotificationIds.clear();
      hydrationVersion++;
      changedRooms.clear();
      messageRequests.reset();
      if (previous && steamId !== previous) {
        for (const tab of [...tabs.value])
          if (tab.type === "direct") useChatTabs().closeTab(tab.id);
      }
      if (!steamId) {
        hydrationVersion++;
        messageRequests.reset();
        const { unsubscribe } = useSubscriptionManager();
        unsubscribe("incoming-direct-messages");
        return;
      }

      void hydrateRequests();
      subscribe(
        "incoming-direct-messages",
        getGraphqlClient()
          .subscribe({
            query: typedGql("subscription")({
              notifications: [
                {
                  where: {
                    type: { _eq: "ChatMessage" },
                    steam_id: { _eq: steamId },
                    entity_id: { _like: "direct:%" },
                    // Already-read rows must not re-open a tab or bump
                    // unread again -- without this, the fix only kept a
                    // read DM cleared until this subscription's next full
                    // re-delivery (e.g. every reload), since it had no
                    // opinion on read state at all.
                    is_read: { _eq: false },
                  },
                  order_by: [{ created_at: order_by.desc }],
                  limit: 20,
                },
                {
                  id: true,
                  title: true,
                  entity_id: true,
                  steam_id: true,
                  created_at: true,
                },
              ],
            }),
          })
          .subscribe({
            next: ({ data }: any) => {
              for (const row of data?.notifications ?? []) {
                handleRow(row);
              }
            },
          }),
      );
    },
    { immediate: true },
  );
}
