<script setup lang="ts">
import MessageRequestsSetting from "~/components/settings/MessageRequestsSetting.vue";
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import { Spinner } from "~/components/ui/spinner";
import { UserX } from "lucide-vue-next";

const { t } = useI18n();
const blockStore = useBlockStore();
const { unblockPlayer, isBusy } = useBlockActions();

const blocked = computed(() => blockStore.blocked);

async function handleUnblock(steamId: string) {
  try {
    await unblockPlayer(steamId);
    toast({ title: t("pages.settings.blocked_players.toast_unblocked", "Player unblocked") });
  } catch (error) {
    toast({
      variant: "destructive",
      title: t("common.error"),
      description:
        (error as Error)?.message ||
        t("pages.settings.blocked_players.toast_unblock_error", "Could not unblock this player."),
    });
  }
}
</script>

<template>
  <PageTransition :delay="0">
    <div class="max-w-xl space-y-5">
      <MessageRequestsSetting />
      <p class="max-w-prose text-sm text-muted-foreground">
        {{
          $t(
            "pages.settings.blocked_players.description",
            "Blocked players cannot send you friend requests, direct messages or invitations, and their messages are hidden from your chat.",
          )
        }}
      </p>

      <div
        v-if="blocked.length === 0"
        class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-border/60 bg-card/20 px-4 py-14 text-center"
      >
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">
            {{
              $t(
                "pages.settings.blocked_players.empty_title",
                "No blocked players",
              )
            }}
          </p>
          <p class="mx-auto max-w-sm text-xs text-muted-foreground">
            {{
              $t(
                "pages.settings.blocked_players.empty_description",
                "Players you block will appear here.",
              )
            }}
          </p>
        </div>
      </div>

      <ul v-else class="space-y-3">
        <li
          v-for="entry in blocked"
          :key="entry.steam_id"
          class="group flex items-center gap-4 rounded-lg border border-border/60 bg-card/40 p-4 transition-colors hover:border-[hsl(var(--tac-amber))]/40"
        >
          <PlayerDisplay
            class="min-w-0 flex-1"
            :player="entry"
            :show-role="false"
            :show-flag="false"
            size="sm"
          />
          <Button
            size="sm"
            variant="outline"
            class="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            :disabled="isBusy(entry.steam_id)"
            @click="handleUnblock(entry.steam_id)"
          >
            <Spinner v-if="isBusy(entry.steam_id)" class="h-3.5 w-3.5" />
            <UserX v-else class="h-3.5 w-3.5" />
            {{ $t("pages.settings.blocked_players.unblock", "Unblock") }}
          </Button>
        </li>
      </ul>
    </div>
  </PageTransition>
</template>
