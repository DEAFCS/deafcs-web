<script setup lang="ts">
definePageMeta({
  layout: "default",
  middleware: ["admin"],
});
</script>

<template>
  <PageTransition :delay="0">
    <div v-if="match" class="space-y-6">
      <div class="flex flex-col gap-1">
        <NuxtLink
          :to="`/matches/${match.id}`"
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit"
        >
          <ChevronLeft class="h-3.5 w-3.5" />
          {{ $t("match.chat_log.back_to_match", "Back to match") }}
        </NuxtLink>
        <h1 class="text-lg font-semibold">
          {{ $t("match.chat_log.title", "Chat Log") }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{
            $t(
              "match.chat_log.description",
              "Read-only. Retained for 7 days after the match ends.",
            )
          }}
        </p>
      </div>

      <div v-if="!matchHasEnded" class="rounded-lg border border-border/60 bg-card/40 p-4 text-sm text-muted-foreground">
        {{
          $t(
            "match.chat_log.not_ended",
            "The chat log becomes available once this match has finished.",
          )
        }}
      </div>

      <template v-else>
        <div v-if="mapOptions.length > 1" class="flex flex-wrap gap-2">
          <Button
            v-for="option in mapOptions"
            :key="option.key"
            size="sm"
            :variant="selectedMapKey === option.key ? 'default' : 'outline'"
            @click="selectedMapKey = option.key"
          >
            {{ option.label }}
          </Button>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-muted-foreground">
              {{ $t("chat.global_chat") }}
            </span>
            <ChatLobby
              instance="matches/id/chat-log"
              type="match"
              :lobby-id="match.id"
              :can-send="false"
              :readonly-hint="readonlyHint"
              :history-range="selectedRange"
              :play-notification-sound="false"
              absolute-timestamps
              hide-participants-summary
            />
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-muted-foreground">
              {{ match.lineup_1?.name || $t("match.lineup.lineup_1") }}
            </span>
            <ChatLobby
              instance="matches/id/chat-log"
              type="match_team"
              :lobby-id="`${match.id}:${match.lineup_1_id}`"
              :can-send="false"
              :readonly-hint="readonlyHint"
              :history-range="selectedRange"
              :play-notification-sound="false"
              absolute-timestamps
              hide-participants-summary
            />
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium text-muted-foreground">
              {{ match.lineup_2?.name || $t("match.lineup.lineup_2") }}
            </span>
            <ChatLobby
              instance="matches/id/chat-log"
              type="match_team"
              :lobby-id="`${match.id}:${match.lineup_2_id}`"
              :can-send="false"
              :readonly-hint="readonlyHint"
              :history-range="selectedRange"
              :play-notification-sound="false"
              absolute-timestamps
              hide-participants-summary
            />
          </div>
        </div>
      </template>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import { ChevronLeft } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import ChatLobby from "~/components/chat/ChatLobby.vue";
import { generateQuery } from "~/graphql/graphqlGen";
import { $, order_by } from "~/generated/zeus";

// Same terminal-status set used server-side (chat.service.ts's
// MATCH_ENDED_STATUSES) and elsewhere on the match page itself
// (MatchActions.vue's canDeleteMatch, index.vue's mapSlots) -- the chat
// log only exists once the match is actually over.
const MATCH_ENDED_STATUSES = [
  "Finished",
  "Forfeit",
  "Surrendered",
  "Tie",
  "Canceled",
];

export default {
  components: { ChevronLeft, Button, PageTransition, ChatLobby },
  data() {
    return {
      selectedMapKey: "all",
    };
  },
  computed: {
    matchHasEnded() {
      return MATCH_ENDED_STATUSES.includes(this.match?.status);
    },
    readonlyHint() {
      return this.$t(
        "match.chat_log.readonly_hint",
        "This match has ended. Chat is read-only.",
      );
    },
    mapOptions() {
      const maps = this.match?.match_maps ?? [];
      if (maps.length <= 1) return [];
      const options = [
        { key: "all", label: this.$t("match.chat_log.full_match", "Full Match") },
      ];
      maps.forEach((map: any, index: number) => {
        options.push({
          key: map.id,
          label: this.$t("match.chat_log.map_label", "Map {number}: {name}", {
            number: index + 1,
            name: map.map?.name || map.map?.label || "",
          }),
        });
      });
      return options;
    },
    selectedRange() {
      if (this.selectedMapKey === "all") return null;
      const map = (this.match?.match_maps ?? []).find(
        (m: any) => m.id === this.selectedMapKey,
      );
      if (!map?.started_at) return null;
      return { start: map.started_at, end: map.ended_at || null };
    },
  },
  apollo: {
    match: {
      query: generateQuery({
        matches_by_pk: [
          { id: $("matchId", "uuid!") },
          {
            id: true,
            status: true,
            lineup_1_id: true,
            lineup_2_id: true,
            lineup_1: { id: true, name: true },
            lineup_2: { id: true, name: true },
            options: { best_of: true },
            match_maps: [
              { order_by: { order: order_by.asc } },
              {
                id: true,
                order: true,
                started_at: true,
                ended_at: true,
                map: { name: true, label: true },
              },
            ],
          },
        ],
      }),
      variables() {
        return { matchId: this.$route.params.id };
      },
      update: (data: any) => data.matches_by_pk,
    },
  },
};
</script>
