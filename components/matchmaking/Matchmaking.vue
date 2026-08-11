<script setup lang="ts">
import { useMediaQuery } from "@vueuse/core";
import type { Component } from "vue";
import {
  AlertTriangle,
  ArrowRight,
  UserRound,
  UsersRound,
} from "lucide-vue-next";
import QuickMatchConnect from "~/components/match/QuickMatchConnect.vue";
import MatchStatus from "~/components/match/MatchStatus.vue";
import TimeAgo from "../TimeAgo.vue";
import { matchTypeColorStyle } from "~/utilities/matchTypeColors";
import { tacticalCtaButtonClasses } from "~/utilities/tacticalClasses";

const isMobile = useMediaQuery("(max-width: 768px)");

const matchTypeIcons: Record<string, Component> = {
  Wingman: UsersRound,
  Duel: UserRound,
};

const matchTypeIcon = (type: string) => matchTypeIcons[type] ?? UserRound;

const mmCardBase =
  "group/mmc relative flex min-h-[176px] flex-1 flex-col overflow-hidden isolate rounded-lg border border-[rgb(var(--mode-rgb)/0.28)] px-5 pb-4 pt-5 text-left text-foreground cursor-pointer [background:linear-gradient(135deg,hsl(var(--card)/0.7)_0%,hsl(var(--card)/0.35)_60%,rgb(var(--mode-rgb)/0.05)_100%)] [transition:border-color_180ms_ease,background_220ms_ease,box-shadow_220ms_ease,transform_180ms_ease] hover:border-[rgb(var(--mode-rgb)/0.55)] hover:shadow-[0_0_24px_rgb(var(--mode-rgb)/0.12)] focus-visible:outline-none focus-visible:border-[rgb(var(--mode-rgb))] focus-visible:shadow-[0_0_0_2px_rgb(var(--mode-rgb)/0.35)]";

</script>

<template>
  <div v-if="matchmakingAllowed || (isGuest && matchmakingEnabled)">
    <template v-if="me?.is_banned">
      <Alert class="my-3">
        <AlertDescription class="flex items-center gap-2">
          <AlertTriangle class="h-4 w-4" />
          {{
            bannedUntilDisplay
              ? $t("matchmaking.banned_until", { date: bannedUntilDisplay })
              : $t("matchmaking.banned")
          }}
        </AlertDescription>
      </Alert>
    </template>
    <template v-else-if="me?.matchmaking_cooldown">
      <Alert class="my-3">
        <AlertDescription class="flex items-center gap-2">
          <AlertTriangle class="h-4 w-4" />
          {{
            $t("matchmaking.temp_banned", {
              time: me.matchmaking_cooldown,
            })
          }}
        </AlertDescription>
      </Alert>
    </template>
    <template v-else-if="!confirmationDetails">
      <div
        v-if="isInQueue && matchMakingQueueDetails"
        class="search-ring relative mb-4 overflow-hidden rounded-lg border border-[rgb(var(--mode-rgb)/0.28)] px-6 py-10 sm:px-10 sm:py-12 [backdrop-filter:blur(6px)] [background:linear-gradient(180deg,hsl(var(--card)/0.7)_0%,hsl(var(--card)/0.3)_100%)] animate-fade-in"
        :style="matchTypeColorStyle(matchMakingQueueDetails.type)"
      >
        <span
          aria-hidden="true"
          class="pointer-events-none absolute left-2 top-2 h-[14px] w-[14px] border-l-2 border-t-2 border-[rgb(var(--mode-rgb))]"
        ></span>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute bottom-2 right-2 h-[14px] w-[14px] border-b-2 border-r-2 border-[rgb(var(--mode-rgb))]"
        ></span>

        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 opacity-40 [background-image:repeating-linear-gradient(180deg,transparent_0,transparent_3px,rgb(var(--mode-rgb)/0.04)_3px,rgb(var(--mode-rgb)/0.04)_4px)]"
        ></span>

        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_55%,rgb(var(--mode-rgb)/0.12),transparent_65%)] animate-soft-pulse"
        ></span>

        <div class="relative z-10 flex flex-col items-center gap-6 text-center">
          <div
            class="inline-flex items-center gap-2 font-mono text-[0.72rem] font-bold uppercase tracking-[0.28em] text-[rgb(var(--mode-rgb))]"
          >
            <span
              class="inline-block h-[2px] w-[10px] bg-[rgb(var(--mode-rgb))]"
            ></span>
            {{ $t("matchmaking.in_queue_label") }}
            <span
              class="h-1 w-1 rounded-full bg-[rgb(var(--mode-rgb))] animate-soft-pulse"
            ></span>
          </div>

          <div class="flex flex-col items-center gap-1">
            <div
              class="font-sans text-2xl font-bold uppercase leading-none tracking-[0.08em] text-foreground sm:text-3xl [font-stretch:80%]"
            >
              {{ matchMakingQueueDetails.type }}
            </div>
            <div
              class="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground/80"
            >
              {{ $t("matchmaking.searching") }}
            </div>
          </div>

          <div class="flex flex-col items-center gap-1">
            <div
              class="font-mono font-bold leading-none tracking-[0.06em] text-foreground text-[clamp(2.75rem,7vw,4rem)] tabular-nums [text-shadow:0_0_24px_rgb(var(--mode-rgb)/0.3)]"
            >
              <TimeAgo
                v-if="matchMakingQueueDetails.joinedAt"
                :date="
                  Math.min(
                    new Date().getTime(),
                    new Date(matchMakingQueueDetails.joinedAt).getTime(),
                  )
                "
                :seconds="true"
              />
            </div>
            <div
              class="font-mono text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground/70"
            >
              {{ $t("matchmaking.elapsed") }}
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-center gap-2">
            <span
              v-for="region in matchMakingQueueDetails.regions"
              :key="region"
              class="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--mode-rgb)/0.35)] bg-[rgb(var(--mode-rgb)/0.08)] px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-[rgb(var(--mode-rgb))]"
            >
              <span
                class="h-1 w-1 rounded-full bg-[rgb(var(--mode-rgb))]"
              ></span>
              {{ region }}
            </span>
            <span
              v-if="
                distinctInQueue(
                  matchMakingQueueDetails.type,
                  matchMakingQueueDetails.regions,
                ) > 0
              "
              class="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground"
            >
              {{
                distinctInQueue(
                  matchMakingQueueDetails.type,
                  matchMakingQueueDetails.regions,
                )
              }}
              {{ $t("matchmaking.in_queue") }}
            </span>
          </div>

          <button
            type="button"
            class="group/cancel mt-2 inline-flex w-full max-w-md items-center justify-center gap-2 overflow-hidden rounded-md border border-[hsl(var(--destructive)/0.5)] bg-[hsl(var(--destructive)/0.1)] px-5 py-3 font-sans text-xs font-bold uppercase leading-none tracking-[0.2em] text-destructive transition-[background-color,border-color,box-shadow] duration-150 hover:border-[hsl(var(--destructive)/0.8)] hover:bg-[hsl(var(--destructive)/0.18)] hover:shadow-[0_0_18px_hsl(var(--destructive)/0.3)]"
            @click="leaveMatchmaking"
          >
            <span
              class="inline-block h-[2px] w-[10px] bg-destructive transition-transform group-hover/cancel:translate-x-[-2px]"
            ></span>
            {{ $t("matchmaking.cancel_matchmaking") }}
            <span
              class="inline-block h-[2px] w-[10px] bg-destructive transition-transform group-hover/cancel:translate-x-[2px]"
            ></span>
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-4" v-else>
        <div
          v-if="
            !isGuest &&
            !isMobile &&
            availableRegionsWithNodes.length > 0 &&
            !preferredRegions.length
          "
        >
          <Alert class="w-fit p-2" variant="destructive">
            <AlertDescription class="flex items-center gap-2">
              <AlertTriangle class="h-4 w-4" />
              {{ $t("matchmaking.high_latency_warning") }}
            </AlertDescription>
          </Alert>
        </div>

        <div v-if="!isMobile" class="flex flex-row gap-4">
          <button
            v-for="type in allowedMatchTypes"
            :key="type.value"
            type="button"
            :disabled="!canQueueType(type.value)"
            :style="matchTypeColorStyle(type.value)"
            :class="[
              mmCardBase,
              canQueueType(type.value) &&
                'group/mmc-enabled hover:scale-[1.01] active:scale-[0.995]',
              !canQueueType(type.value) &&
                '!cursor-not-allowed opacity-45 grayscale hover:!border-border hover:!shadow-none',
            ]"
            @click="handleMatchTypeClick(type.value)"
          >
            <span
              class="pointer-events-none absolute inset-0 z-0 opacity-0 [background:linear-gradient(135deg,hsl(var(--card)/0.8)_0%,hsl(var(--card)/0.45)_55%,rgb(var(--mode-rgb)/0.10)_100%)] transition-opacity [transition-duration:220ms] [transition-timing-function:ease] group-hover/mmc-enabled:opacity-100 group-focus-visible/mmc-enabled:opacity-100"
              aria-hidden="true"
            ></span>
            <span
              class="pointer-events-none absolute inset-0 z-0 opacity-0 [background-image:repeating-linear-gradient(180deg,transparent_0,transparent_3px,rgb(var(--mode-rgb)/0.03)_3px,rgb(var(--mode-rgb)/0.03)_4px)] transition-opacity [transition-duration:220ms] [transition-timing-function:ease] group-hover/mmc-enabled:opacity-100 group-focus-visible/mmc-enabled:opacity-100"
              aria-hidden="true"
            ></span>
            <span
              class="pointer-events-none absolute right-2 top-2 z-[1] h-3.5 w-3.5 border-r-2 border-t-2 border-[rgb(var(--mode-rgb)/0.55)] transition-colors duration-200 group-hover/mmc-enabled:border-[rgb(var(--mode-rgb))] group-focus-visible/mmc-enabled:border-[rgb(var(--mode-rgb))]"
              aria-hidden="true"
            ></span>
            <svg
              v-if="type.value === 'Competitive'"
              class="pointer-events-none absolute bottom-4 right-4 z-0 size-16 text-[rgb(var(--mode-rgb))] opacity-[0.18] transition-[color,filter,opacity,transform] duration-300 group-hover/mmc-enabled:scale-105 group-hover/mmc-enabled:opacity-[0.3] group-hover/mmc-enabled:drop-shadow-[0_0_10px_rgb(var(--mode-rgb)/0.2)] group-focus-visible/mmc-enabled:scale-105 group-focus-visible/mmc-enabled:opacity-[0.3] group-focus-visible/mmc-enabled:drop-shadow-[0_0_10px_rgb(var(--mode-rgb)/0.2)] sm:size-20"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <use href="/img/icons/competitive-team.svg#competitive-team" />
            </svg>
            <component
              v-else
              :is="matchTypeIcon(type.value)"
              class="pointer-events-none absolute bottom-4 right-4 z-0 size-16 text-[rgb(var(--mode-rgb))] opacity-[0.18] transition-[color,filter,opacity,transform] duration-300 group-hover/mmc-enabled:scale-105 group-hover/mmc-enabled:opacity-[0.3] group-hover/mmc-enabled:drop-shadow-[0_0_10px_rgb(var(--mode-rgb)/0.2)] group-focus-visible/mmc-enabled:scale-105 group-focus-visible/mmc-enabled:opacity-[0.3] group-focus-visible/mmc-enabled:drop-shadow-[0_0_10px_rgb(var(--mode-rgb)/0.2)] sm:size-20"
              aria-hidden="true"
            />

            <Badge
              variant="secondary"
              class="absolute right-2 top-2 z-[2] px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.12em] transition-opacity duration-200"
              v-if="
                distinctInQueue(
                  type.value,
                  preferredRegions.map((region) => region.value),
                ) > 0
              "
            >
              {{
                distinctInQueue(
                  type.value,
                  preferredRegions.map((region) => region.value),
                )
              }}
              {{ $t("matchmaking.in_queue") }}
            </Badge>

            <div
              class="relative z-[1] flex min-w-0 flex-1 flex-col gap-3"
            >
              <div
                class="inline-flex min-w-0 items-center gap-[0.55rem] pt-1 font-mono text-[0.72rem] font-bold uppercase tracking-[0.24em] text-muted-foreground transition-colors duration-200 group-hover/mmc-enabled:text-[rgb(var(--mode-rgb))] group-focus-visible/mmc-enabled:text-[rgb(var(--mode-rgb))]"
              >
                <span
                  class="inline-block h-[2px] w-[10px] shrink-0 bg-[rgb(var(--mode-rgb))]"
                  aria-hidden="true"
                ></span>
                <span class="min-w-0 break-words">{{ type.value }}</span>
              </div>
              <p class="m-0 text-[0.78rem] leading-[1.5] text-muted-foreground">
                <template v-if="canQueueType(type.value)">
                  {{
                    $t(
                      `matchmaking.match_types.${type.value.toLowerCase()}.description`,
                    )
                  }}
                </template>
                <template v-else>
                  <span class="block font-medium text-destructive">
                    {{
                      $t("matchmaking.party_size.unavailable", {
                        size: partySize,
                      })
                    }}
                  </span>
                  {{ partySizeRequirementText(type.value) }}
                </template>
              </p>
              <span
                class="mt-auto inline-flex items-center gap-1 self-start pt-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.16em] text-[rgb(var(--mode-rgb)/0.72)] transition-colors duration-200 group-hover/mmc-enabled:text-[rgb(var(--mode-rgb))] group-focus-visible/mmc-enabled:text-[rgb(var(--mode-rgb))]"
              >
                {{ $t("matchmaking.confirm_selection") }}
                <ArrowRight
                  class="size-3 transition-transform duration-200 group-hover/mmc-enabled:translate-x-1 group-focus-visible/mmc-enabled:translate-x-1"
                  aria-hidden="true"
                />
              </span>
            </div>
          </button>
        </div>
      </div>
    </template>
    <template v-else-if="match">
      <div
        class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
      >
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <MatchStatus :match="match" />
          <QuickMatchConnect :match="match" bare />
        </div>

        <NuxtLink
          :to="{ name: 'matches-id', params: { id: match.id } }"
          :class="[tacticalCtaButtonClasses, 'shrink-0']"
        >
          {{ $t("matchmaking.go_to_match") }}
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { $ } from "~/generated/zeus";
import socket from "~/web-sockets/Socket";
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { generateQuery } from "~/graphql/graphqlGen";
import { e_match_types_enum, e_match_status_enum } from "~/generated/zeus";
import { toast } from "@/components/ui/toast";
import {
  EXPECTED_PLAYERS,
  canPartyQueue,
} from "~/utilities/matchmakingPartySize";

interface Region {
  value: string;
  description: string;
  status: string;
  is_lan: boolean;
}

interface QueueDetails {
  totalInQueue: number;
  type: e_match_types_enum;
  regions: string[];
  joinedAt?: string;
}

interface ConfirmationDetails {
  matchId: string;
  isReady: boolean;
  expiresAt: string;
  confirmed: number;
  confirmationId: string;
  type: e_match_types_enum;
  region: string;
}

// Development-only presentation fixture for /play?previewQueue=1.
// It stays local to this component and never touches auth, matchmaking, or
// socket state.
const DEV_QUEUE_PREVIEW_USER = {
  steam_id: "dev-queue-preview",
  is_banned: false,
  matchmaking_cooldown: null,
};

const DEV_QUEUE_PREVIEW_DETAILS: QueueDetails = {
  totalInQueue: 3,
  type: e_match_types_enum.Competitive,
  regions: ["DEAFCS Preview"],
  joinedAt: new Date(Date.now() - 45_000).toISOString(),
};

interface Match {
  id: string;
  status: e_match_status_enum;
  region?: string;
  server_type?: string;
  is_server_online?: boolean;
  connection_string?: string;
}

export default {
  apollo: {
    e_match_types: {
      fetchPolicy: "cache-first",
      query: generateQuery({
        e_match_types: [
          {
            where: {
              value: {
                _in: [
                  e_match_types_enum.Competitive,
                  e_match_types_enum.Wingman,
                  e_match_types_enum.Duel,
                ],
              },
            },
          },
          {
            value: true,
            description: true,
          },
        ],
      }),
    },
    $subscribe: {
      matches_by_pk: {
        variables(): { matchId: string | undefined } {
          return {
            matchId: (this as any).confirmationDetails?.matchId,
          };
        },
        skip(): boolean {
          return !(this as any).confirmationDetails?.matchId;
        },
        query: typedGql("subscription")({
          matches_by_pk: [
            {
              id: $("matchId", "uuid!"),
            },
            {
              id: true,
              status: true,
              server_type: true,
              is_in_lineup: true,
              is_organizer: true,
              is_server_online: true,
              connection_string: true,
              connection_link: true,
              tv_connection_string: true,
              options: {
                tv_delay: true,
              },
              // For MatchStatus's dynamic status label/styling (VETO, LIVE,
              // PAUSED, etc.) -- see components/match/MatchStatus.vue.
              e_match_status: {
                description: true,
              },
              winning_lineup_id: true,
              scheduled_at: true,
              is_match_server_available: true,
              match_maps: [{}, { status: true }],
            },
          ],
        }),
        result({ data }: { data: { matches_by_pk: Match } }): void {
          (this as any).match = data.matches_by_pk;
        },
      },
    },
  },
  data() {
    return {
      match: undefined as Match | undefined,
      playerSanctions: [] as any[],
      showConfirmation: false,
      e_match_types: [] as {
        value: e_match_types_enum;
        description: string;
      }[],
    };
  },
  methods: {
    isMatchmakingTypeEnabled(matchType: string): boolean {
      return useApplicationSettingsStore().isMatchmakingTypeEnabled(matchType);
    },
    expectedPlayers(type: e_match_types_enum): number {
      return EXPECTED_PLAYERS[type] ?? 0;
    },
    canQueueType(type: e_match_types_enum): boolean {
      return canPartyQueue(
        type,
        this.partySize,
        useApplicationSettingsStore().maxCompetitivePartySize,
      );
    },
    partySizeLimit(type: e_match_types_enum): number {
      if (type === e_match_types_enum.Competitive) {
        return Math.min(
          this.expectedPlayers(type) / 2,
          useApplicationSettingsStore().maxCompetitivePartySize,
        );
      }
      return this.expectedPlayers(type) / 2;
    },
    partySizeRequirementText(type: e_match_types_enum): string {
      if (type === e_match_types_enum.Duel) {
        return this.$t("matchmaking.party_size.duel_requirement");
      }
      return this.$t("matchmaking.party_size.requirement", {
        half: this.partySizeLimit(type),
      });
    },
    distinctInQueue(type: e_match_types_enum, regionValues: string[]): number {
      const lobbyIndexes = new Set<number>();
      for (const regionValue of regionValues) {
        const indexes = this.regionStats[regionValue]?.[type];
        if (!indexes) {
          continue;
        }
        for (const index of indexes) {
          lobbyIndexes.add(index);
        }
      }
      return lobbyIndexes.size;
    },
    getRegionlatencyResult(region: string):
      | {
          isLan: boolean;
          latency: string;
        }
      | undefined {
      return useMatchmakingStore().getRegionlatencyResult(region);
    },
    handleMatchTypeClick(matchType: e_match_types_enum): void {
      if (!this.me?.steam_id) {
        navigateTo("/login?redirect=/play");
        return;
      }
      if (!this.canQueueType(matchType)) {
        toast({
          title: this.partySizeRequirementText(matchType),
          variant: "destructive",
        });
        return;
      }
      if (this.preferredRegions.length === 0) {
        toast({
          title: this.$t("matchmaking.no_preferred_regions") as string,
          variant: "destructive",
        });
        return;
      }
      this.joinMatchmaking(matchType);
    },
    joinMatchmaking(matchType: e_match_types_enum): void {
      if (this.isQueuePreview) {
        return;
      }
      socket.event("matchmaking:join-queue", {
        type: matchType,
        regions: this.preferredRegions.map((region: Region) => {
          return region.value;
        }),
      });
    },
    leaveMatchmaking(): void {
      if (this.isQueuePreview) {
        return;
      }
      socket.event("matchmaking:leave");
    },
  },
  computed: {
    isQueuePreview(): boolean {
      return import.meta.dev && this.$route.query.previewQueue === "1";
    },
    previewQueueMode(): e_match_types_enum {
      if (this.isQueuePreview) {
        const mode = this.$route.query.mode;
        if (
          mode === e_match_types_enum.Competitive ||
          mode === e_match_types_enum.Wingman ||
          mode === e_match_types_enum.Duel
        ) {
          return mode;
        }
      }
      return e_match_types_enum.Competitive;
    },
    showSeparators() {
      return useApplicationSettingsStore().showSeparators;
    },
    allowedMatchTypes(): {
      value: e_match_types_enum;
      description: string;
    }[] {
      return this.e_match_types.filter(
        (type) =>
          type.value !== e_match_types_enum.Premier &&
          type.value !== e_match_types_enum.Faceit &&
          this.isMatchmakingTypeEnabled(type.value.toLowerCase()),
      );
    },
    isInQueue(): boolean {
      return !!this.matchMakingQueueDetails;
    },
    // Only accepted lobby members queue — pending invites don't count, which is
    // how the api sizes the lobby too.
    partySize(): number {
      const lobby = useMatchmakingStore().currentLobby as any;
      const accepted = lobby?.players?.filter(
        (player: { status: string }) => player.status === "Accepted",
      );
      return accepted?.length || 1;
    },
    preferredRegions(): Region[] {
      return useMatchmakingStore().preferredRegions;
    },
    availableRegionsWithNodes(): Region[] {
      return useApplicationSettingsStore().availableRegions.filter(
        (region: { has_node: boolean }) => region.has_node,
      );
    },
    regionStats() {
      return useMatchmakingStore().regionStats;
    },
    matchMakingQueueDetails(): QueueDetails | undefined {
      if (this.isQueuePreview) {
        return {
          ...DEV_QUEUE_PREVIEW_DETAILS,
          type: this.previewQueueMode,
        };
      }
      return useMatchmakingStore().joinedMatchmakingQueues.details;
    },
    confirmationDetails(): ConfirmationDetails | undefined {
      if (this.isQueuePreview) {
        return undefined;
      }
      return useMatchmakingStore().joinedMatchmakingQueues.confirmation;
    },
    matchmakingAllowed(): boolean {
      if (this.isQueuePreview) {
        return true;
      }
      return useApplicationSettingsStore().matchmakingAllowed;
    },
    matchmakingEnabled(): boolean {
      return useApplicationSettingsStore().matchmakingEnabled;
    },
    me() {
      if (this.isQueuePreview) {
        return DEV_QUEUE_PREVIEW_USER;
      }
      return useAuthStore().me;
    },
    // null here means either "not banned" (irrelevant, this is only shown
    // when me.is_banned is already true) or "banned with no end date" --
    // a permanent Sanction -- in which case the generic "banned" message
    // (no date) is still correct, so no message is dropped either way.
    bannedUntilDisplay(): string | null {
      const bannedUntil = (this.me as any)?.banned_until;
      if (!bannedUntil) return null;
      const d = new Date(bannedUntil);
      if (Number.isNaN(d.getTime())) return null;
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    },
    isGuest(): boolean {
      if (this.isQueuePreview) {
        return false;
      }
      return !useAuthStore().me?.steam_id;
    },
    queueWaitTime(): string {
      if (!this.matchMakingQueueDetails?.joinedAt)
        return this.$t("matchmaking.queue_wait.zero");

      const joinedAt = new Date(this.matchMakingQueueDetails.joinedAt);
      const now = new Date();
      const diffInSeconds = Math.floor(
        (now.getTime() - joinedAt.getTime()) / 1000,
      );

      if (diffInSeconds < 60) {
        return this.$t("matchmaking.queue_wait.seconds", {
          count: diffInSeconds,
        });
      }

      const minutes = Math.floor(diffInSeconds / 60);
      const seconds = diffInSeconds % 60;
      return this.$t("matchmaking.queue_wait.minutes_seconds", {
        minutes,
        seconds,
      });
    },
  },
};
</script>

<style scoped>
/* A single glowing arc that continuously rotates around the panel's border —
   replaces the old left-to-right sweep, which had to snap back to its start
   position every 2s. A closed loop has no "start" to snap back to, so this
   never jitters. */
.search-ring::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  border-radius: inherit;
  padding: 1.5px;
  background: conic-gradient(
    from var(--ring-angle, 0deg),
    transparent 0deg,
    transparent 265deg,
    rgb(var(--mode-rgb) / 0.7) 300deg,
    rgb(var(--mode-rgb)) 320deg,
    rgb(var(--mode-rgb) / 0.7) 340deg,
    transparent 360deg
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  animation: search-ring-spin 3s linear infinite;
}

@keyframes search-ring-spin {
  to {
    --ring-angle: 360deg;
  }
}

@media (prefers-reduced-motion: reduce) {
  .search-ring::after {
    animation: none;
  }
}
</style>

<style>
@property --ring-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
</style>
