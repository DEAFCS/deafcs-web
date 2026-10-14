<script setup lang="ts">
import { computed } from "vue";
import { Check, ChevronDown, Globe, Lock, Play, Swords } from "lucide-vue-next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";
import { useQuickQueue } from "~/composables/useQuickQueue";
import { useMatchReadyModal } from "~/composables/useMatchReadyModal";
import { modeColorStyle, modeFormat } from "~/utilities/matchmakingModes";

// The queue, as one line between the seats and the chat (5Stack's
// PartyQueueLine). It changes with the party: pick-and-queue for the leader,
// read-only for everyone else, the clock while searching, check-in when a
// match is found, the match once it starts.
//
// DEAFCS: the picker offers DEAFCS's four modes through useQuickQueue, the
// same join /play uses, and only while matchmaking is open to this player;
// otherwise the leader is sent to /play, where verification and the closed
// notice live. Cancel is offered to everyone in the search, as on /play.
const props = defineProps<{ lobby: any }>();

const {
  modes,
  quickMode,
  queue,
  queueMode,
  clock,
  modeTitle,
  requirementText,
  join,
  leave,
} = useQuickQueue();
const settings = useApplicationSettingsStore();
const canPick = computed(
  () => settings.matchmakingAllowed && !!quickMode.value,
);
const matchmakingStore = useMatchmakingStore();
const { openMatchReadyModal } = useMatchReadyModal();

const me = computed(() => useAuthStore().me);
const leader = computed(
  () =>
    (props.lobby?.players ?? []).find(
      (slot: any) => slot.captain,
    ) as any,
);
const isLeader = computed(
  () => String(leader.value?.player?.steam_id) === String(me.value?.steam_id),
);

const regionLabels = computed(() => queue.value?.regions ?? []);
const preferredLabels = computed(() =>
  (
    matchmakingStore.preferredRegions as Array<{
      description?: string;
      value: string;
    }>
  ).map((region) => region.description || region.value),
);
const regionSummary = computed(() => {
  const [first, ...rest] = preferredLabels.value;
  if (!first) return null;
  return rest.length ? `${first} +${rest.length}` : first;
});
const searchInQueue = computed(
  () =>
    modes.value.find((mode) => mode.key === queueMode.value?.key)?.inQueue ?? 0,
);

const confirmation = computed(() => {
  const pending = (matchmakingStore.joinedMatchmakingQueues as any)
    ?.confirmation;
  return pending && !pending.matchId ? pending : null;
});

const liveMatch = computed(
  () => (useMatchLobbyStore().myMatches as any[])?.[0] ?? null,
);
const liveMatchLabel = computed(() => {
  const match = liveMatch.value;
  if (!match) return "";
  return (
    match.label ||
    `${match.lineup_1?.name ?? "TBD"} vs ${match.lineup_2?.name ?? "TBD"}`
  );
});

const rowClass =
  "flex min-h-[3.25rem] items-center gap-2.5 border-b border-border px-3 py-2";
</script>

<template>
  <!-- In a match: the match, one click away. -->
  <NuxtLink
    v-if="liveMatch"
    :to="{ name: 'matches-id', params: { id: liveMatch.id } }"
    :class="[rowClass, 'transition-colors hover:bg-white/[0.03]']"
  >
    <span
      class="grid size-8 shrink-0 place-items-center rounded-md border border-red-500/30 bg-red-500/10 text-red-300"
    >
      <Swords class="size-3.5" />
    </span>
    <div class="min-w-0 flex-1">
      <div class="truncate text-xs font-medium text-foreground">
        {{ liveMatchLabel }}
      </div>
      <div class="text-[0.7rem] text-muted-foreground">
        {{
          liveMatch.status === "WaitingForCheckIn"
            ? $t("match.check_in.check_in")
            : liveMatch.e_match_status?.description || liveMatch.status
        }}
      </div>
    </div>
    <span class="text-xs font-medium text-[hsl(var(--tac-amber))]">
      {{ $t("layouts.party_room.open_match") }}
    </span>
  </NuxtLink>

  <!-- A match was found: check in from here or from the header. -->
  <div
    v-else-if="confirmation"
    :class="[rowClass, 'bg-[hsl(var(--tac-amber)/0.07)]']"
  >
    <div class="min-w-0 flex-1">
      <div class="text-xs font-semibold text-[hsl(var(--tac-amber))]">
        {{ $t("matchmaking.match_found") }}
      </div>
      <div class="text-[0.7rem] text-muted-foreground tabular-nums">
        {{
          $t("layouts.party_room.ready_count", {
            confirmed: confirmation.confirmed ?? 0,
            players: confirmation.players ?? 0,
          })
        }}
      </div>
    </div>
    <button
      type="button"
      class="tac-amber-cta inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold"
      @click="openMatchReadyModal()"
    >
      {{ $t("matchmaking.check_in") }}
    </button>
  </div>

  <!-- Searching: the clock, where, and the way out. -->
  <div
    v-else-if="queue"
    data-party-queue-searching
    :class="[rowClass, 'bg-[rgb(var(--mode-rgb)/0.06)]']"
    :style="modeColorStyle(queueMode ?? queue)"
  >
    <span class="relative flex size-2 shrink-0" aria-hidden="true">
      <span
        class="absolute inline-flex size-full animate-ping rounded-full bg-[rgb(var(--mode-rgb))] opacity-75 motion-reduce:animate-none"
      />
      <span
        class="relative inline-flex size-2 rounded-full bg-[rgb(var(--mode-rgb))]"
      />
    </span>
    <div class="min-w-0 flex-1">
      <div class="text-xs text-foreground">
        {{ $t("layouts.party_room.searching", { mode: modeTitle(queue) }) }}
        <span
          v-if="clock"
          class="font-semibold tabular-nums text-[hsl(var(--tac-amber))]"
        >
          {{ clock }}
        </span>
      </div>
      <div class="truncate text-[0.7rem] text-muted-foreground">
        <template v-if="regionLabels.length"
          >{{ regionLabels.join(", ") }} · </template
        >{{ $t("layouts.queue.in_queue", { count: searchInQueue }) }}
      </div>
    </div>
    <button
      type="button"
      class="inline-flex h-7 items-center rounded-md border border-border bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
      @click="leave"
    >
      {{ $t("layouts.party_room.cancel") }}
    </button>
  </div>

  <!-- Idle, leader: pick a mode and queue. -->
  <div v-else-if="isLeader && canPick && quickMode" :class="rowClass">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          data-party-mode-picker
          class="inline-flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-md border border-[rgb(var(--mode-rgb)/0.5)] bg-zinc-900/60 px-2.5 text-xs font-medium text-foreground transition-colors hover:border-[rgb(var(--mode-rgb))]"
          :style="modeColorStyle(quickMode)"
          :aria-label="$t('layouts.queue.pick_mode')"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span
              class="size-2 shrink-0 rounded-full bg-[rgb(var(--mode-rgb))]"
              aria-hidden="true"
            />
            <span class="truncate">{{ modeTitle(quickMode) }}</span>
            <span class="shrink-0 text-muted-foreground">{{
              modeFormat(quickMode)
            }}</span>
          </span>
          <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-64">
        <DropdownMenuItem
          v-for="mode in modes"
          :key="mode.key"
          :data-mode-key="mode.key"
          :disabled="!mode.canQueue"
          :style="modeColorStyle(mode)"
          @select="join(mode)"
        >
          <span
            class="size-2 shrink-0 rounded-full bg-[rgb(var(--mode-rgb))]"
            aria-hidden="true"
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="text-sm">
              {{ modeTitle(mode) }}
              <span class="text-muted-foreground">{{ modeFormat(mode) }}</span>
            </span>
            <span class="text-[0.7rem] text-muted-foreground">
              {{
                mode.canQueue
                  ? $t("layouts.queue.in_queue", { count: mode.inQueue })
                  : requirementText(mode)
              }}
            </span>
          </div>
          <Check
            v-if="quickMode.key === mode.key"
            class="text-[rgb(var(--mode-rgb))]"
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem @select="navigateTo('/play')">
          {{ $t("layouts.queue.all_modes") }}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <NuxtLink
      to="/settings/matchmaking"
      class="inline-flex h-8 max-w-[7.5rem] items-center gap-1.5 rounded-md border border-border px-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      :title="preferredLabels.join(', ')"
      :aria-label="$t('layouts.party_room.regions')"
    >
      <Globe class="size-3.5 shrink-0" />
      <span class="truncate max-[374px]:hidden">
        {{ regionSummary ?? $t("layouts.party_room.pick_regions") }}
      </span>
    </NuxtLink>
    <button
      type="button"
      data-party-queue
      class="tac-amber-cta inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold"
      @click="join(quickMode)"
    >
      <Play class="size-3 fill-current" />
      {{ $t("layouts.party_room.queue") }}
    </button>
  </div>

  <!-- Idle, leader who can't pick here: the search starts on /play. -->
  <div v-else-if="isLeader" :class="rowClass">
    <NuxtLink
      to="/play"
      class="tac-amber-cta ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold"
    >
      <Play class="size-3 fill-current" />
      {{ $t("layouts.lobby_panel.find_match") }}
    </NuxtLink>
  </div>

  <!-- Idle, member: the leader picks. -->
  <div v-else :class="rowClass">
    <Lock class="size-3.5 shrink-0 text-zinc-500" />
    <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">
      {{
        $t("layouts.party_room.leader_picks", {
          name: leader?.player?.name ?? "",
        })
      }}
    </span>
  </div>
</template>
