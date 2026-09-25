<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "#app";
import { useI18n } from "vue-i18n";
import ChatLobby from "~/components/chat/ChatLobby.vue";
import { useChatTabs, type ChatTab } from "~/composables/useChatTabs";
import { e_player_roles_enum } from "~/generated/zeus";

definePageMeta({
  layout: "chat",
});

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const { tabs } = useChatTabs();

const tabId = computed(() => route.params.tabId as string);

const tabFromSession = computed<ChatTab | null>(() => {
  return (
    (tabs.value.find((t) => t.id === tabId.value) as ChatTab | undefined) ||
    null
  );
});

const tabFromQuery = computed<ChatTab | null>(() => {
  const q = route.query;
  const type = q.type as string;
  const lobbyId = q.lobbyId as string;
  const instance = q.instance as string;
  const label = q.label as string;
  if (!type || !lobbyId || !instance) return null;
  return {
    id: tabId.value,
    label: label || t("chat_page.fallback_title"),
    instance,
    type: type as
      | "match"
      | "team"
      | "matchmaking"
      | "organizers"
      | "tournament"
      | "announcement",
    lobbyId,
    pinned: false,
  };
});

const currentTab = computed<ChatTab | null>(() => {
  return tabFromSession.value ?? tabFromQuery.value;
});

const hasTab = computed(() => currentTab.value !== null);

const windowTitle = computed(
  () => currentTab.value?.label ?? t("chat_page.fallback_title"),
);

const tabTypeLabel = computed(() => {
  if (!currentTab.value) return "";
  return t(`chat_tab_labels.${currentTab.value.type}`);
});

// Same restriction as the sidebar (ChatPanel.vue's canSendToTab) --
// missed here originally, so a regular user popping Announcements out
// into its own window still saw a working-looking input box that
// silently failed to send (ChatService.sendMessageToChat rejects it
// server-side), which is confusing rather than just not showing it.
const isAdmin = computed(() =>
  useAuthStore().isRoleAbove(e_player_roles_enum.administrator),
);
const canSend = computed(() => {
  if (currentTab.value?.type === "announcement") return isAdmin.value;
  return true;
});
const readonlyHint = computed(() => {
  if (currentTab.value?.type === "announcement") {
    return t("chat.announcement_readonly");
  }
  return undefined;
});

useHead({
  title: windowTitle,
});

function handleBackToHub() {
  if (import.meta.client && window.opener) {
    window.opener.focus();
    window.close();
  } else {
    router.push("/");
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div
      class="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/30"
    >
      <div class="min-w-0">
        <h1 class="text-sm font-semibold truncate">
          {{ currentTab?.label || $t("chat_page.fallback_title") }}
        </h1>
        <p class="text-[11px] text-muted-foreground truncate">
          <span v-if="currentTab">{{ tabTypeLabel }}</span>
          <span v-else>{{ $t("chat_page.not_found") }}</span>
        </p>
      </div>
      <a
        :href="'/'"
        class="inline-flex items-center justify-center h-7 px-2 rounded-md border border-border bg-background text-xs hover:bg-accent shrink-0"
        @click.prevent="handleBackToHub"
      >
        {{ $t("chat_page.back_to_hub") }}
      </a>
    </div>

    <div class="flex-1 min-h-0 flex flex-col p-2">
      <div
        v-if="!hasTab"
        class="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-4"
      >
        <div class="space-y-1.5">
          <p>{{ $t("chat_page.not_open_title") }}</p>
          <p class="text-xs">
            {{ $t("chat_page.not_open_description") }}
          </p>
        </div>
      </div>
      <div
        v-else
        class="flex-1 min-h-0 flex flex-col rounded-lg bg-muted/30 overflow-hidden"
      >
        <ChatLobby
          :instance="currentTab!.instance"
          :type="currentTab!.type"
          :lobby-id="currentTab!.lobbyId"
          :tab-id="currentTab!.id"
          :frameless="true"
          :is-global-context="true"
          :reactions-enabled="true"
          :is-active-tab="true"
          :can-send="canSend"
          :readonly-hint="readonlyHint"
        />
      </div>
    </div>
  </div>
</template>
