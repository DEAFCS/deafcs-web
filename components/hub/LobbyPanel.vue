<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Merge, LogOut, Video } from "lucide-vue-next";
import HubEmptyState from "~/components/hub/HubEmptyState.vue";
import HeightSwap from "~/components/ui/transitions/HeightSwap.vue";
import LobbyInvites from "~/components/matchmaking-lobby/LobbyInvites.vue";
import MatchLobbyExpanded from "~/components/matchmaking-lobby/MatchLobbyExpanded.vue";
import MatchmakingLobbyAccess from "~/components/matchmaking-lobby/MatchmakingLobbyAccess.vue";
import LobbyCallPanel from "~/components/matchmaking-lobby/LobbyCallPanel.vue";
import ChatLobby from "~/components/chat/ChatLobby.vue";
import PartyQueueLine from "~/components/hub/PartyQueueLine.vue";
import { Button } from "~/components/ui/button";
import { useInvites } from "@/composables/useInvites";
import { useRightSidebar } from "~/composables/useRightSidebar";
import { currentHub } from "~/composables/useHubState";
import { useChatTabs } from "~/composables/useChatTabs";
import { openLobbyCallWindow } from "~/composables/useLobbyCallApi";

// 5Stack's party room: invites, the squad, the queue line, then the lobby
// chat. DEAFCS keeps its own squad list (MatchLobbyExpanded, with the
// captain's invite and remove), the lobby access setting, and the lobby's
// webcam call; upstream's voice channel is not part of DEAFCS.
const { hasLobbyInvites } = useInvites();
const { rightSidebarOpen } = useRightSidebar();

const lobbyId = computed(
  () => ((useMatchmakingStore().currentLobby as any)?.id as string) ?? null,
);

const lobbyCallStatus = ref<{ count: number; isInCall: boolean }>({
  count: 0,
  isInCall: false,
});

// Reading the lobby chat here is reading it: the same room is a tab in Chat,
// and its badge must not keep counting what is already on screen.
const onScreen = computed(
  () => rightSidebarOpen.value && currentHub() === "lobby",
);
watch(
  [onScreen, lobbyId],
  ([visible, id]) => {
    if (visible && id) useChatTabs().resetUnread(`matchmaking:${id}`);
  },
  { immediate: true },
);
</script>

<template>
  <!-- The party room: seats on top, the queue line, party chat below. The
       dock's Lobby icon opens it. -->
  <div class="flex h-full flex-col">
    <!-- Lobby invites. Folds its height shut instead of vanishing with a
         one-frame gap collapse. -->
    <Transition
      enter-active-class="lobby-fold"
      enter-from-class="lobby-fold-collapsed"
      leave-active-class="lobby-fold"
      leave-to-class="lobby-fold-collapsed"
    >
      <div v-if="hasLobbyInvites" class="grid shrink-0 grid-rows-[1fr]">
        <div class="min-h-0">
          <div class="flex flex-col gap-3 border-b border-border p-3">
            <div
              class="inline-flex items-center gap-[0.35rem] text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              <Merge class="h-3 w-3" />
              <span>{{ $t("layouts.lobby_panel.lobby_invites") }}</span>
            </div>
            <LobbyInvites />
          </div>
        </div>
      </div>
    </Transition>

    <!-- The squad folds open in a measured motion when a party forms. -->
    <HeightSwap class="shrink-0" @settled="onSquadEntered">
      <div v-if="currentLobby" key="squad" class="flex flex-col">
        <div
          class="max-h-[45vh] overflow-y-auto border-b border-border bg-[linear-gradient(180deg,hsl(var(--tac-amber)/0.06),transparent_70%)] px-3 pb-3.5 pt-3"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div
              class="inline-flex items-center gap-[0.35rem] text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              {{ $t("layouts.lobby_panel.your_squad") }}
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                data-lobby-call
                class="relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors"
                :class="
                  lobbyCallStatus.count
                    ? 'border-[hsl(var(--tac-amber))]/50 bg-[hsl(var(--tac-amber))]/10 text-[hsl(var(--tac-amber))] motion-safe:animate-pulse'
                    : 'border-border bg-card/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                "
                :aria-label="
                  lobbyCallStatus.count
                    ? $t('matchmaking.lobby_call.join', 'Join call')
                    : $t('matchmaking.lobby_call.tooltip', 'Webcam call')
                "
                :title="
                  lobbyCallStatus.count
                    ? $t('matchmaking.lobby_call.join', 'Join call')
                    : $t('matchmaking.lobby_call.tooltip', 'Webcam call')
                "
                @click="openCall"
              >
                <Video class="h-3.5 w-3.5" />
                <span
                  v-if="lobbyCallStatus.count"
                  class="absolute -right-1 -top-1 inline-flex h-4 min-w-[1.05rem] items-center justify-center rounded-full bg-[hsl(var(--tac-amber))] px-1 text-[9px] font-bold leading-none text-black"
                >
                  {{ lobbyCallStatus.count }}
                </span>
              </button>
              <div class="flex items-center gap-2 md:hidden">
                <MatchmakingLobbyAccess :lobby="currentLobby" />
                <Button
                  size="icon"
                  variant="destructive"
                  class="h-7 w-7 rounded-full transition-colors duration-200"
                  :title="$t('matchmaking.lobby.leave')"
                  :aria-label="$t('matchmaking.lobby.leave')"
                  @click="leaveCurrentLobby"
                >
                  <LogOut class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
          <MatchLobbyExpanded :lobby="currentLobby" />
        </div>
        <LobbyCallPanel
          v-if="lobbyId"
          :lobby-id="lobbyId"
          :show-bar="true"
          @open-call="openCall"
          @status="lobbyCallStatus = $event"
        />
        <PartyQueueLine :lobby="currentLobby" />
      </div>
    </HeightSwap>

    <!-- No party: the same centred empty state as every other tab. -->
    <Transition
      enter-active-class="transition-opacity [transition-duration:240ms] motion-reduce:![transition-duration:1ms]"
      leave-active-class="transition-opacity [transition-duration:110ms] ease-in motion-reduce:![transition-duration:1ms]"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <HubEmptyState
        v-if="!currentLobby"
        :title="$t('layouts.hub.empty.party_title')"
        :description="$t('layouts.lobby_panel.create_lobby_description')"
      >
        <div
          class="relative inline-flex rounded-md shadow-[0_4px_14px_-8px_hsl(var(--tac-amber)/0.3)] transition-shadow duration-300 hover:shadow-[0_6px_18px_-8px_hsl(var(--tac-amber)/0.4)]"
        >
          <span
            aria-hidden="true"
            class="tac-amber-frame pointer-events-none absolute inset-0 rounded-md"
          ></span>
          <Button
            variant="ghost"
            @click="createLobby"
            :loading="creatingLobby"
            size="default"
            class="rounded-md border-0 bg-transparent px-7 py-2 text-[hsl(var(--tac-amber))] transition-colors duration-300 hover:bg-[hsl(var(--tac-amber)/0.12)] hover:text-[hsl(var(--tac-amber))] focus-visible:ring-[hsl(var(--tac-amber))]"
          >
            <Merge class="h-5 w-5" />
            <span class="font-semibold">
              {{ $t("layouts.lobby_panel.create_lobby_button") }}
            </span>
          </Button>
        </div>
      </HubEmptyState>
    </Transition>

    <!-- Party chat takes the rest. A flex-sized dock, so its reveal animates
         flex-basis/grow rather than content height. -->
    <Transition
      enter-active-class="lobby-dock"
      enter-from-class="lobby-dock-collapsed"
      leave-active-class="lobby-dock"
      leave-to-class="lobby-dock-collapsed"
    >
      <div
        v-if="currentLobby && squadReady"
        class="flex min-h-0 flex-1 flex-col"
      >
        <ChatLobby
          v-if="(currentLobby as any)?.id"
          instance="matchmaking"
          type="matchmaking"
          :lobby-id="(currentLobby as any).id"
          :frameless="true"
          :hide-participants-summary="true"
          class="min-h-0 flex-1"
        />
      </div>
    </Transition>
  </div>
</template>

<script lang="ts">
import { e_match_status_enum, e_player_roles_enum } from "~/generated/zeus";
import { generateMutation } from "~/graphql/graphqlGen";

export default {
  data() {
    return {
      playMatchFoundSound: useSound().playMatchFoundSound,
      // Gates the bottom sections (voice/chat) so they only render once the
      // squad has finished animating in — otherwise they mount immediately and
      // reserve their layout space before the top, causing a jarring jump.
      squadReady: false,
    };
  },
  mounted() {
    // Panel re-opened while already in a lobby: no enter transition fires, so
    // mark ready up front.
    if (this.currentLobby) this.squadReady = true;
  },
  watch: {
    currentLobby(newLobby: any, oldLobby: any) {
      // Reset only when entering a lobby (wait for the squad transition) or
      // leaving one — NOT on plain lobby-data updates (e.g. a player joining),
      // which would otherwise make voice/chat flicker out and back.
      if (!newLobby || !oldLobby) {
        this.squadReady = false;
      }
    },
    myMatches: {
      immediate: true,
      handler() {
        if (this.myMatches.length === 0) return;
        const match = this.myMatches
          .sort((a: any, b: any) => {
            if (a.started_at && !b.started_at) return -1;
            if (!a.started_at && b.started_at) return 1;
            if (a.started_at && b.started_at) {
              const diff =
                new Date(a.started_at).getTime() -
                new Date(b.started_at).getTime();
              if (diff !== 0) return diff;
            }
            return (
              this.getStatusPriority(a.status) -
              this.getStatusPriority(b.status)
            );
          })
          .at(0);
        if (match) this.selectLobby((match as any).id);
      },
    },
    currentMatch: {
      immediate: true,
      handler(currentMatch: any, oldMatch: any) {
        if (!currentMatch || currentMatch?.id === oldMatch?.id) return;
        const current = this.currentMatch as any;
        switch (current?.status) {
          case e_match_status_enum.Veto:
          case e_match_status_enum.Live:
            if (oldMatch && currentMatch.status !== oldMatch.status) {
              this.playMatchFoundSound();
            }
            break;
          case e_match_status_enum.WaitingForCheckIn: {
            const lineupPlayers = current.lineup_1.lineup_players.concat(
              current.lineup_2.lineup_players,
            );
            const me = lineupPlayers.find(
              (p: any) => p.player.steam_id === this.me.steam_id,
            );
            if (me?.checked_in === false) this.playMatchFoundSound();
            break;
          }
        }
        this.joinGlobalMatchChat(currentMatch);
      },
    },
  },
  computed: {
    me() {
      return useAuthStore().me;
    },
    myMatches() {
      return useMatchLobbyStore().myMatches;
    },
    currentLobby() {
      return useMatchmakingStore().currentLobby;
    },
    currentMatch() {
      return (this.myMatches as any[]).find(
        (m) => m.id === useMatchmakingStore().viewingMatchId,
      );
    },
    isElevatedUser() {
      return useAuthStore().isRoleAbove(e_player_roles_enum.match_organizer);
    },
    creatingLobby() {
      return useMatchmakingStore().creatingLobby;
    },
  },
  methods: {
    onSquadEntered() {
      // Fires for whichever element finished entering the swap; only the squad
      // (currentLobby set) should unlock the bottom sections.
      if (this.currentLobby) this.squadReady = true;
    },
    openCall() {
      const id = (this.currentLobby as any)?.id;
      if (id) openLobbyCallWindow(id);
    },
    getStatusPriority(status: e_match_status_enum): number {
      switch (status) {
        case e_match_status_enum.Live:
          return 1;
        case e_match_status_enum.WaitingForServer:
          return 2;
        case e_match_status_enum.Veto:
          return 3;
        case e_match_status_enum.WaitingForCheckIn:
          return 4;
        default:
          return 999;
      }
    },
    selectLobby(matchId: string) {
      useMatchmakingStore().viewingMatchId = matchId;
    },
    joinGlobalMatchChat(match: any) {
      if (!match) return;
      const { openTab, setActiveTab } = useChatTabs();
      const id = `match:${match.id}`;
      openTab({
        id,
        label:
          match.label ||
          `${match.lineup_1?.name ?? this.$t("common.tbd")} vs ${match.lineup_2?.name ?? this.$t("common.tbd")}`,
        instance: "match",
        type: "match",
        lobbyId: match.id,
        pinned: true,
      });
      setActiveTab(id);
    },
    createLobby() {
      return useMatchmakingStore().createLobby();
    },
    async leaveCurrentLobby() {
      const lobby = this.currentLobby as any;
      if (!lobby || !this.me?.steam_id) return;

      await (this.$apollo as any).mutate({
        mutation: generateMutation({
          delete_lobby_players_by_pk: [
            {
              lobby_id: lobby.id,
              steam_id: this.me.steam_id,
            },
            {
              __typename: true,
            },
          ],
        }),
      });
    },
  },
};
</script>

<style scoped>
/* One clock for every fold in this column. Content-sized sections (invites)
   collapse their grid row; spacing rides inside the clipped cell so no flex
   gap is left to snap when an element unmounts. Chat stays gated on
   `squadReady` so it reveals after the squad has landed. */
.lobby-fold {
  transition:
    grid-template-rows 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.18s ease;
}
.lobby-fold > * {
  overflow: hidden;
}
.lobby-fold-collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}

/* The chat dock is sized by flex, not by its content, so its reveal animates
   the flex sizing itself -- the squad area above shrinks continuously into
   the new distribution instead of losing the dock's share in one frame. */
.lobby-dock {
  transition:
    flex-basis 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    flex-grow 0.24s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.18s ease;
  overflow: hidden;
}
.lobby-dock-collapsed {
  flex-basis: 0px;
  flex-grow: 0;
  min-height: 0;
  max-height: none;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .lobby-fold,
  .lobby-dock {
    transition-duration: 1ms;
  }
}
</style>
