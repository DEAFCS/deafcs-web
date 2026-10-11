<script setup lang="ts">
import { computed } from "vue";
import { Lock, Play, Swords } from "lucide-vue-next";
import { useQuickQueue } from "~/composables/useQuickQueue";
import { useMatchReadyModal } from "~/composables/useMatchReadyModal";

// The queue, as one line between the seats and the chat (5Stack's
// PartyQueueLine). It changes with the party: the clock while searching,
// check-in when a match is found, the match once it starts.
//
// DEAFCS: the search itself starts on /play, where Captain Pick and every
// matchmaking rule live (see useQuickQueue), so the idle leader's line leads
// there instead of upstream's mode picker. Cancel is offered to everyone in
// the search, the same as /play offers it.
const props = defineProps<{ lobby: any }>();

const { queue, clock, modeTitle, leave } = useQuickQueue();
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
    :class="[rowClass, 'bg-[hsl(var(--tac-amber)/0.05)]']"
  >
    <span class="relative flex size-2 shrink-0" aria-hidden="true">
      <span
        class="absolute inline-flex size-full animate-ping rounded-full bg-[hsl(var(--tac-amber))] opacity-75 motion-reduce:animate-none"
      />
      <span
        class="relative inline-flex size-2 rounded-full bg-[hsl(var(--tac-amber))]"
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
      <div
        v-if="regionLabels.length"
        class="truncate text-[0.7rem] text-muted-foreground"
      >
        {{ regionLabels.join(", ") }}
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

  <!-- Idle, leader: the search starts on /play. -->
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
