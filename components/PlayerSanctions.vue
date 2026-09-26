<script lang="ts" setup>
import { Ban, AlertTriangle } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "~/components/ui/sheet";
import { Badge } from "~/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import SanctionsHistoryPanel from "~/components/SanctionsHistoryPanel.vue";
</script>

<template>
  <div
    v-if="shouldRender"
    :class="{ 'inline-flex items-center': variant === 'panel' }"
  >
    <TooltipProvider v-if="variant === 'panel'">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            v-if="sanctionCount > 0"
            type="button"
            @click="sheetOpen = true"
            class="inline-flex h-9 min-w-9 items-center justify-center rounded border px-2 font-mono text-sm font-bold tabular-nums transition-colors duration-150"
            :class="
              hasActiveSanctions
                ? 'border-destructive/55 bg-destructive/10 text-destructive hover:bg-destructive/20'
                : 'border-border bg-card/60 text-muted-foreground hover:border-[hsl(var(--tac-amber)/0.6)] hover:text-foreground'
            "
          >
            {{ sanctionCount }}
          </button>
          <button
            v-else-if="canManageSanctions"
            type="button"
            @click="sheetOpen = true"
            class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-red-500/45 bg-red-500/10 text-red-400 transition-[border-color,background-color,color] duration-150 hover:border-red-500/80 hover:bg-red-500/20 hover:text-red-200"
          >
            <Ban class="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ $t("player.sanctions.title") }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>

    <Sheet :open="sheetOpen" @update:open="sheetOpen = $event">
      <SheetTrigger v-if="variant === 'default'" as-child>
        <Button
          variant="ghost"
          size="sm"
          class="flex items-center gap-1.5 h-auto py-1 px-2 text-sm"
          :class="{
            'text-destructive hover:text-destructive': activeSanctions > 0,
          }"
        >
          <AlertTriangle class="h-3.5 w-3.5" />
          <span>{{ $t("player.sanctions.title") }}</span>
          <Badge
            v-if="activeSanctions > 0"
            variant="destructive"
            class="ml-0.5 h-4 px-1.5 text-xs"
          >
            {{ activeSanctions }}
          </Badge>
          <Badge
            v-else-if="sanctions.length > 0 || abandonedMatchesCount > 0"
            variant="secondary"
            class="ml-0.5 h-4 px-1.5 text-xs"
          >
            {{ totalCount }}
          </Badge>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" class="w-full sm:max-w-lg overflow-y-auto">
        <SanctionsHistoryPanel
          :player-id="playerId"
          :player="player"
          :server-id="serverId"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>

<script lang="ts">
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, e_player_roles_enum } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";

export default {
  props: {
    playerId: {
      type: String,
      required: true,
    },
    serverId: {
      type: String,
      required: false,
      default: undefined,
    },
    variant: {
      type: String as () => "default" | "panel",
      required: false,
      default: "default",
    },
    player: {
      type: Object,
      required: false,
      default: undefined,
    },
  },
  data() {
    return {
      sanctions: [] as any[],
      abandonedMatches: [] as any[],
      sheetOpen: false,
    };
  },
  apollo: {
    $subscribe: {
      // Duplicates SanctionsHistoryPanel's own subscription (mounted only
      // once the Sheet is opened) -- this one exists purely to drive the
      // always-visible trigger button/badge counts before the sheet is
      // ever opened. Both are cheap, small-row-count subscriptions.
      player_sanctions: {
        query: typedGql("subscription")({
          player_sanctions: [
            {
              where: {
                player_steam_id: {
                  _eq: $("playerId", "bigint!"),
                },
                _or: [
                  { sanctioned_by_steam_id: { _is_null: true } },
                  { sanctioned_by_steam_id: { _neq: "0" } },
                ],
              },
            },
            {
              id: true,
              deleted_at: true,
              remove_sanction_date: true,
            },
          ],
        }),
        variables: function (): { playerId: string } {
          return {
            playerId: (this as any).playerId,
          };
        },
        result: function ({ data }: { data: any }) {
          (this as any).sanctions = data?.player_sanctions ?? [];
        },
      },
      abandoned_matches: {
        query: typedGql("subscription")({
          abandoned_matches: [
            {
              where: {
                steam_id: {
                  _eq: $("playerId", "bigint!"),
                },
              },
            },
            {
              id: true,
            },
          ],
        }),
        variables: function (): { playerId: string } {
          return {
            playerId: (this as any).playerId,
          };
        },
        skip: function (): boolean {
          return !useAuthStore().isRoleAbove(e_player_roles_enum.match_organizer);
        },
        result: function ({ data }: { data: any }) {
          (this as any).abandonedMatches = data?.abandoned_matches ?? [];
        },
      },
    },
  },
  computed: {
    activeSanctions() {
      return this.sanctions.filter((sanction: any) => {
        if (sanction.deleted_at) {
          return false;
        }
        if (sanction.remove_sanction_date) {
          return new Date(sanction.remove_sanction_date) > new Date();
        }
        return true;
      }).length;
    },
    sanctionCount(): number {
      return this.sanctions?.length ?? 0;
    },
    hasActiveSanctions(): boolean {
      return this.activeSanctions > 0;
    },
    shouldRender(): boolean {
      if (this.variant === "panel") {
        return (
          this.sanctionCount > 0 ||
          this.abandonedMatchesCount > 0 ||
          this.canManageSanctions
        );
      }
      return this.hasAnyData;
    },
    canManageSanctions() {
      return useAuthStore().isRoleAbove(e_player_roles_enum.moderator);
    },
    abandonedMatchesCount() {
      return this.abandonedMatches?.length || 0;
    },
    hasAnyData() {
      return (
        (this.sanctions && this.sanctions.length > 0) ||
        (this.abandonedMatches && this.abandonedMatches.length > 0)
      );
    },
    totalCount() {
      return this.sanctions.length + this.abandonedMatchesCount;
    },
  },
};
</script>
