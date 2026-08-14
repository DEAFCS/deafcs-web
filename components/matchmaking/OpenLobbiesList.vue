<script setup lang="ts">
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { UsersRound, LogIn } from "lucide-vue-next";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import LiveAvatarImg from "~/components/LiveAvatarImg.vue";
import { Button } from "~/components/ui/button";
import { toast } from "~/components/ui/toast";
import {
  tacticalSectionDescriptionClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

// Lets a player who ISN'T friends with anyone in an Open lobby find and
// join it anyway -- the friends list's "IN A LOBBY" Join button
// (FriendListItem.vue) only ever surfaces lobbies belonging to an
// existing friend, so a stranger's Open lobby had no discovery path at
// all until this. Same MAX_LOBBY_SIZE=5 the friends-list join button
// and the backend capacity trigger both enforce.
const { t } = useI18n();
const MAX_LOBBY_SIZE = 5;

const openLobbies = computed(() => useMatchmakingStore().openLobbies ?? []);

function captainOf(lobby: any) {
  return (
    lobby.players?.find((p: any) => p.captain)?.player ??
    lobby.players?.[0]?.player
  );
}

function othersOf(lobby: any) {
  const captain = captainOf(lobby);
  return (lobby.players ?? []).filter(
    (p: any) => p.player?.steam_id !== captain?.steam_id,
  );
}

const joiningId = ref<string | null>(null);
async function join(lobbyId: string) {
  if (joiningId.value) return;
  joiningId.value = lobbyId;
  try {
    await useMatchmakingStore().joinLobby(lobbyId);
  } catch (error: any) {
    toast({
      variant: "destructive",
      title: t("common.error"),
      description: error?.message ?? t("matchmaking.open_lobbies.join_error"),
    });
  } finally {
    joiningId.value = null;
  }
}
</script>

<template>
  <div v-if="openLobbies.length" class="hidden md:block">
    <div :class="tacticalSectionLabelClasses">
      <span :class="tacticalSectionTickClasses"></span>
      {{ $t("matchmaking.open_lobbies.title", "OPEN LOBBIES") }}
    </div>
    <div :class="tacticalSectionDescriptionClasses">
      {{
        $t(
          "matchmaking.open_lobbies.description",
          "Lobbies anyone can join, no invite needed.",
        )
      }}
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="lobby in openLobbies"
        :key="lobby.id"
        class="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3"
      >
        <PlayerDisplay
          :player="captainOf(lobby)"
          :linkable="true"
          :truncate-name="true"
          compact
        />

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5">
            <div class="flex -space-x-2">
              <LiveAvatarImg
                v-for="p in othersOf(lobby).slice(0, 4)"
                :key="p.player.steam_id"
                :steam-id="p.player.steam_id"
                :fallback-url="p.player.custom_avatar_url || p.player.avatar_url"
                img-class="w-full h-full object-cover"
                class="h-6 w-6 rounded-full ring-2 ring-card overflow-hidden"
              />
            </div>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <UsersRound class="h-3.5 w-3.5" />
              {{ lobby.players?.length ?? 0 }}/{{ MAX_LOBBY_SIZE }}
            </span>
          </div>

          <Button
            size="sm"
            class="h-7 gap-1.5 text-xs"
            :disabled="(lobby.players?.length ?? 0) >= MAX_LOBBY_SIZE"
            :loading="joiningId === lobby.id"
            @click="join(lobby.id)"
          >
            <LogIn class="h-3.5 w-3.5" />
            {{ $t("matchmaking.friends.join", "Join") }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
