import { useChatTabs } from "~/composables/useChatTabs";
import { requestChatHubFocus } from "~/composables/useChatHubContext";
import { useChatNotificationNavigation } from "~/composables/useChatNotificationNavigation";

/**
 * DEAFCS: the Announcements entry in the top menu and the sidebar. It is the
 * Chat Hub's own channel, not a page: open the Hub on that tab. Every
 * logged-in player can read it (useChatTabSetup seeds the tab for any
 * session, and the API's lobby join requires a user); the menus only show the
 * entry with a session.
 *
 * Normally the tab is already there and this is the Hub's own "focus a room
 * from outside". Clicked before the Hub has seeded it, it goes the way a chat
 * notification does, which opens the tab and the Hub together.
 */
export function openAnnouncements() {
  const id = "announcement";
  if (useChatTabs().tabs.value.some((tab) => tab.id === id)) {
    requestChatHubFocus(id);
    return;
  }
  void useChatNotificationNavigation().openChatFromNotification(
    null,
    `${id}:${id}`,
  );
}
