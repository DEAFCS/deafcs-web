<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ChatLobby from "~/components/chat/ChatLobby.vue";
import AnimatedFilters from "~/components/common/AnimatedFilters.vue";
import {
  captainPickTeamChatId,
  type CaptainPickLineup,
} from "~/utilities/captainPickDraft";

/**
 * The Captain Pick right sidebar: DEAFCS Global Chat (the one site-wide
 * room, same as everywhere else) and the viewer's own private team chat.
 * The Team tab opens as soon as the server has the viewer on a side
 * (captains immediately, others when picked). Which room they may read or
 * post in is always decided by the server; this only offers the tab.
 */
const props = defineProps<{
  draftId: string;
  // The viewer's side in the server's lineups, null while unpicked.
  myLineup: CaptainPickLineup | null;
}>();

const { t } = useI18n();

const tab = ref<"global" | "team">("global");

const tabs = computed(() => [
  { key: "global", label: t("chat.global_chat") },
  {
    key: "team",
    label: t("chat.team_chat"),
    disabled: props.myLineup === null,
    title:
      props.myLineup === null
        ? t("matchmaking.captain_pick.team_chat_locked")
        : undefined,
  },
]);

const teamLobbyId = computed(() =>
  props.myLineup === null
    ? null
    : captainPickTeamChatId(props.draftId, props.myLineup),
);

// Never leave the Team tab selected without a team.
watch(
  () => props.myLineup,
  (lineup) => {
    if (lineup === null && tab.value === "team") {
      tab.value = "global";
    }
  },
);
</script>

<template>
  <div
    class="flex min-h-[440px] flex-col overflow-hidden rounded-xl border border-border bg-card/40 xl:min-h-0 xl:flex-1"
    data-testid="captain-pick-chat"
  >
    <div class="flex flex-col gap-3 p-4">
      <AnimatedFilters
        v-model="tab"
        :options="tabs"
        square
        block
        fill
        data-testid="captain-pick-chat-tabs"
      />

      <p
        v-if="myLineup === null"
        class="text-xs text-muted-foreground"
        data-testid="captain-pick-team-locked"
      >
        {{ $t("matchmaking.captain_pick.team_chat_locked") }}
      </p>

      <div v-show="tab === 'global'" data-testid="captain-pick-global-chat">
        <ChatLobby instance="captain-pick" type="global" lobby-id="global" />
      </div>

      <div
        v-if="teamLobbyId"
        v-show="tab === 'team'"
        data-testid="captain-pick-team-chat"
      >
        <ChatLobby
          instance="captain-pick"
          type="captain_pick_team"
          :lobby-id="teamLobbyId"
        />
      </div>
    </div>
  </div>
</template>
