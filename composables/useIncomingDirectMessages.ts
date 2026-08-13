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
import { watch } from "vue";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { useSubscriptionManager } from "~/composables/useSubscriptionManager";
import { useChatTabs } from "~/composables/useChatTabs";
import { directChatId } from "~/composables/useDirectMessage";
import { useAuthStore } from "~/stores/AuthStore";

const seenNotificationIds = new Set<string>();

export function useIncomingDirectMessages() {
  const authStore = useAuthStore();
  const { subscribe } = useSubscriptionManager();
  const { tabs, openTab, incrementUnread, activeTabId } = useChatTabs();

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

    const parties = (row.entity_id || "").replace(/^direct:/, "").split(":");
    if (parties.length !== 2) return;
    const otherSteamId = parties.find((p) => p !== String(me.steam_id));
    if (!otherSteamId) return;

    const lobbyId = directChatId(me.steam_id, otherSteamId);
    const tabId = `direct:${lobbyId}`;

    const existing = tabs.value.find((t) => t.id === tabId);
    if (!existing) {
      openTab({
        id: tabId,
        label: row.title || "Player",
        instance: "direct",
        type: "direct",
        lobbyId,
        pinned: false,
        otherSteamId,
      });
    }

    if (activeTabId.value !== tabId) {
      incrementUnread(tabId);
    }
  }

  watch(
    () => authStore.me?.steam_id,
    (steamId) => {
      if (!steamId) {
        const { unsubscribe } = useSubscriptionManager();
        unsubscribe("incoming-direct-messages");
        return;
      }

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
