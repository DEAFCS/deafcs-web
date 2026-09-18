<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayerDisplay from "~/components/PlayerDisplay.vue";
import Empty from "~/components/ui/empty/Empty.vue";
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
    <div class="grid gap-4 max-w-xl">
      <p class="text-sm text-muted-foreground">
        {{
          $t(
            "pages.settings.blocked_players.description",
            "Blocked players cannot send you friend requests, direct messages or invitations, and their messages are hidden from your chat.",
          )
        }}
      </p>

      <Empty v-if="blocked.length === 0" class="text-muted-foreground">
        <div class="space-y-1">
          <p class="text-sm font-medium text-foreground">
            {{ $t("pages.settings.blocked_players.empty_title", "No blocked players") }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{
              $t(
                "pages.settings.blocked_players.empty_description",
                "Players you block will appear here.",
              )
            }}
          </p>
        </div>
      </Empty>

      <ul v-else class="divide-y divide-border/60 rounded-lg border border-border bg-card/40">
        <li
          v-for="entry in blocked"
          :key="entry.steam_id"
          class="flex items-center justify-between gap-3 px-4 py-3"
        >
          <PlayerDisplay
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
