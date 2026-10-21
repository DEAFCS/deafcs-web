<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import gql from "graphql-tag";
import {
  ChevronDown,
  History,
  RotateCcw,
  TriangleAlert,
  Wrench,
} from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Spinner } from "~/components/ui/spinner";
import MatchRestoreRoundDialog from "~/components/match/MatchRestoreRoundDialog.vue";
import MatchRestartMapDialog from "~/components/match/MatchRestartMapDialog.vue";
import { e_sides_enum, e_winning_reasons_enum } from "~/generated/zeus";

// DEAFCS Rounds tab: the rounds of the map being played, where an organizer
// picks the round to go back to by clicking it, plus a Fix a Problem menu
// (Restore Round, Restart Map). Built on the same getMatchRestoreRounds data
// and the same selection rules as MatchRestoreRoundDialog (5stackgg/web #895,
// #900); clicking a round opens that dialog on it. Restart Match stays off.
type RoundRow = {
  round: number;
  lineup_1_score: number;
  lineup_2_score: number;
  lineup_1_side: string | null;
  lineup_2_side: string | null;
  winning_side: string | null;
  winning_reason: string | null;
  has_backup: boolean;
  undone: boolean;
};

type RoundsData = {
  map_name: string | null;
  restorable: boolean;
  blocked_reason: string | null;
  live_round: number | null;
  connected_players: number;
  expected_players: number;
  disconnected: string[];
  rounds: RoundRow[];
};

const props = defineProps<{
  match: Record<string, any>;
  canRestartMap: boolean;
}>();

const { t } = useI18n();
const nuxtApp = useNuxtApp();

const MATCH_ROUNDS = gql`
  query GetMatchRounds($matchId: uuid!) {
    getMatchRestoreRounds(match_id: $matchId) {
      map_name
      restorable
      blocked_reason
      live_round
      connected_players
      expected_players
      disconnected
      rounds {
        round
        lineup_1_score
        lineup_2_score
        lineup_1_side
        lineup_2_side
        winning_side
        winning_reason
        has_backup
        undone
      }
    }
  }
`;

const data = ref<RoundsData | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const restoreOpen = ref(false);
const restartOpen = ref(false);
const picked = ref<number | null>(null);

async function load() {
  loading.value = true;
  try {
    const { data: result } = await nuxtApp.$apollo.defaultClient.query({
      query: MATCH_ROUNDS,
      variables: { matchId: props.match.id },
      fetchPolicy: "network-only",
    });
    data.value = result?.getMatchRestoreRounds ?? null;
    loadError.value = null;
  } catch (error: any) {
    if (!data.value) {
      loadError.value =
        error?.graphQLErrors?.[0]?.message ||
        error?.message ||
        t("common.error");
    }
  } finally {
    loading.value = false;
  }
}

// Rounds keep finishing while the tab is open.
let poll: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void load();
  poll = setInterval(() => {
    if (!restoreOpen.value) {
      void load();
    }
  }, 10_000);
});
onBeforeUnmount(() => clearInterval(poll));

const roundsByNumber = computed(
  () => new Map((data.value?.rounds ?? []).map((row) => [row.round, row])),
);

const liveRound = computed(() => data.value?.live_round ?? null);

// Same rules as MatchRestoreRoundDialog: going back to round N loads the
// backup taken after round N - 1; rounds a restore undid stay selectable
// until the next round is played.
function backupFor(round: number) {
  const row = roundsByNumber.value.get(round - 1);
  return row?.has_backup ? row : null;
}

const lastUndone = computed(
  () => data.value?.rounds.filter((row) => row.undone).at(-1)?.round ?? 0,
);

const selectable = computed(() => {
  const rounds = new Set<number>();
  if (
    !liveRound.value ||
    !data.value?.restorable ||
    data.value.blocked_reason
  ) {
    return rounds;
  }
  const last = Math.max(liveRound.value, lastUndone.value + 1);
  for (let round = 2; round <= last; round++) {
    if (backupFor(round)) {
      rounds.add(round);
    }
  }
  return rounds;
});

const playedRows = computed(() =>
  (data.value?.rounds ?? []).filter(
    (row) =>
      !row.undone && row.round > 0 && row.round < (liveRound.value ?? Infinity),
  ),
);

const undoneRows = computed(() =>
  (data.value?.rounds ?? []).filter((row) => row.undone),
);

const blockedMessage = computed(() => {
  const value = data.value;
  if (!value) {
    return null;
  }
  switch (value.blocked_reason) {
    case null:
    case undefined:
      return value.rounds.length === 0
        ? t("match.recovery.restore.nothing_yet")
        : null;
    case "rush":
      return t("match.recovery.restore.rush");
    case "team_member":
      return t("match.recovery.restore.team_member");
    case "not_live_yet":
      return value.rounds.length > 0
        ? t("match.recovery.restore.not_live_yet")
        : t("match.recovery.restore.nothing_yet");
    default:
      return t("match.recovery.restore.not_in_progress");
  }
});

const waiting = computed(
  () =>
    !!data.value &&
    !data.value.blocked_reason &&
    data.value.connected_players < data.value.expected_players,
);

function teamName(lineup: 1 | 2) {
  return lineup === 1 ? props.match.lineup_1?.name : props.match.lineup_2?.name;
}

function winner(row: RoundRow): 1 | 2 | null {
  if (!row.winning_side) {
    return null;
  }
  if (row.winning_side === row.lineup_1_side) {
    return 1;
  }
  return row.winning_side === row.lineup_2_side ? 2 : null;
}

function sideLabel(side?: string | null) {
  if (side === e_sides_enum.CT) {
    return "CT";
  }
  return side === e_sides_enum.TERRORIST ? "T" : "";
}

function reasonLabel(reason?: string | null) {
  switch (reason) {
    case e_winning_reasons_enum.BombExploded:
      return t("round_history.bomb_exploded");
    case e_winning_reasons_enum.BombDefused:
      return t("round_history.bomb_defused");
    case e_winning_reasons_enum.TimeRanOut:
      return t("round_history.time_ran_out");
    case e_winning_reasons_enum.CTsWin:
      return t("round_history.cts_eliminated_ts");
    case e_winning_reasons_enum.TerroristsWin:
      return t("round_history.ts_eliminated_cts");
    default:
      return t("round_history.unknown");
  }
}

function actionLabel(round: number) {
  if (round === liveRound.value) {
    return t("match.recovery.restore.headline_live", { round });
  }
  if (liveRound.value && round > liveRound.value) {
    return t("match.recovery.restore.headline_forward", { round });
  }
  return t("match.recovery.restore.headline", { round });
}

function openRestore(round: number | null) {
  picked.value = round;
  restoreOpen.value = true;
}

function onRestoreOpen(open: boolean) {
  restoreOpen.value = open;
  if (!open) {
    void load();
  }
}
</script>

<template>
  <div class="flex max-w-[1500px] flex-col gap-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
        >
          {{ data?.map_name ?? "" }}
          <template v-if="liveRound">
            · {{ $t("match.recovery.rounds.live_round", { round: liveRound }) }}
          </template>
        </p>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ $t("match.recovery.rounds.hint") }}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm" class="gap-2">
            <Wrench class="h-4 w-4" />
            {{ $t("match.recovery.rounds.fix_a_problem") }}
            <ChevronDown class="h-3.5 w-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem @click="openRestore(null)">
            <History class="h-4 w-4" />
            {{ $t("match.recovery.restore.title") }}
          </DropdownMenuItem>
          <DropdownMenuItem
            :disabled="!canRestartMap"
            @click="canRestartMap && (restartOpen = true)"
          >
            <RotateCcw class="h-4 w-4" />
            {{ $t("match.recovery.restart_map.title") }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div
      v-if="loading && !data"
      class="flex items-center justify-center py-10 text-muted-foreground"
    >
      <Spinner class="h-5 w-5" />
    </div>

    <div
      v-else-if="loadError"
      class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground"
    >
      <p class="font-semibold text-foreground">
        {{ $t("match.recovery.restore.load_failed") }}
      </p>
      <p class="mt-1">{{ loadError }}</p>
    </div>

    <template v-else-if="data">
      <div
        v-if="blockedMessage"
        class="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground"
      >
        <History class="h-4 w-4 shrink-0" />
        <span>{{ blockedMessage }}</span>
      </div>

      <div
        v-if="waiting"
        class="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200"
      >
        <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {{
            $t("match.recovery.restore.waiting", {
              connected: data.connected_players,
              expected: data.expected_players,
              names: data.disconnected.join(", "),
            })
          }}
        </span>
      </div>

      <ol
        v-if="playedRows.length || liveRound"
        class="flex flex-col overflow-hidden rounded-lg border border-border/60"
      >
        <li
          v-for="row in playedRows"
          :key="row.round"
          class="border-b border-border/40 last:border-b-0"
        >
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm transition-colors"
            :class="
              selectable.has(row.round)
                ? 'hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:outline-none'
                : 'cursor-default opacity-70'
            "
            :disabled="!selectable.has(row.round)"
            :title="
              selectable.has(row.round) ? actionLabel(row.round) : undefined
            "
            @click="openRestore(row.round)"
          >
            <span
              class="w-20 shrink-0 font-mono text-xs uppercase tracking-wider"
            >
              {{ $t("match.recovery.rounds.round", { round: row.round }) }}
            </span>
            <span class="w-14 shrink-0 font-mono tabular-nums sm:w-24">
              {{ row.lineup_1_score }} : {{ row.lineup_2_score }}
            </span>
            <span class="min-w-0 basis-full truncate sm:basis-auto sm:flex-1">
              <template v-if="winner(row)">
                {{ teamName(winner(row)!) }}
                <span
                  class="ml-1 rounded px-1 font-mono text-[0.65rem]"
                  :class="
                    row.winning_side === e_sides_enum.CT
                      ? 'bg-sky-500/15 text-sky-300'
                      : 'bg-amber-500/15 text-amber-300'
                  "
                  >{{ sideLabel(row.winning_side) }}</span
                >
                <span class="ml-2 text-muted-foreground">
                  {{ reasonLabel(row.winning_reason) }}
                </span>
              </template>
            </span>
            <span
              v-if="selectable.has(row.round)"
              class="shrink-0 text-xs text-[hsl(var(--tac-amber))]"
            >
              {{ actionLabel(row.round) }}
            </span>
            <span
              v-else-if="row.round === 1"
              class="shrink-0 text-xs text-muted-foreground"
            >
              {{ $t("match.recovery.restore.round_one") }}
            </span>
          </button>
        </li>
        <li v-if="liveRound">
          <button
            type="button"
            class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 bg-[hsl(var(--tac-amber)/0.06)] px-3 py-2 text-left text-sm transition-colors"
            :class="
              selectable.has(liveRound)
                ? 'hover:bg-[hsl(var(--tac-amber)/0.12)] focus-visible:outline-none'
                : 'cursor-default'
            "
            :disabled="!selectable.has(liveRound)"
            @click="openRestore(liveRound)"
          >
            <span
              class="w-20 shrink-0 font-mono text-xs uppercase tracking-wider"
            >
              {{ $t("match.recovery.rounds.round", { round: liveRound }) }}
            </span>
            <span
              class="shrink-0 rounded bg-[hsl(var(--tac-amber)/0.15)] px-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-[hsl(var(--tac-amber))]"
            >
              {{ $t("match.recovery.restore.now") }}
            </span>
            <span class="min-w-0 flex-1" />
            <span
              v-if="selectable.has(liveRound)"
              class="shrink-0 text-xs text-[hsl(var(--tac-amber))]"
            >
              {{ actionLabel(liveRound) }}
            </span>
          </button>
        </li>
      </ol>

      <section v-if="undoneRows.length" class="flex flex-col gap-2">
        <div>
          <h3
            class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            {{ $t("match.recovery.rounds.undone_title") }}
          </h3>
          <p class="text-xs text-muted-foreground">
            {{ $t("match.recovery.rounds.undone_hint") }}
          </p>
        </div>
        <ol
          class="flex flex-col overflow-hidden rounded-lg border border-dashed border-border/60"
        >
          <li
            v-for="row in undoneRows"
            :key="row.round"
            class="border-b border-border/30 last:border-b-0"
          >
            <button
              type="button"
              class="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm text-muted-foreground transition-colors"
              :class="
                selectable.has(row.round + 1)
                  ? 'hover:bg-muted/30 focus-visible:outline-none'
                  : 'cursor-default'
              "
              :disabled="!selectable.has(row.round + 1)"
              @click="openRestore(row.round + 1)"
            >
              <span
                class="w-20 shrink-0 font-mono text-xs uppercase tracking-wider line-through"
              >
                {{ $t("match.recovery.rounds.round", { round: row.round }) }}
              </span>
              <span class="w-14 shrink-0 font-mono tabular-nums sm:w-24">
                {{ row.lineup_1_score }} : {{ row.lineup_2_score }}
              </span>
              <span class="min-w-0 basis-full truncate sm:basis-auto sm:flex-1">
                <template v-if="winner(row)">
                  {{ teamName(winner(row)!) }} ·
                  {{ reasonLabel(row.winning_reason) }}
                </template>
              </span>
              <span
                v-if="selectable.has(row.round + 1)"
                class="shrink-0 text-xs"
              >
                {{
                  $t("match.recovery.rounds.bring_back", { round: row.round })
                }}
              </span>
            </button>
          </li>
        </ol>
      </section>
    </template>

    <MatchRestoreRoundDialog
      :open="restoreOpen"
      :match="match"
      :initial-round="picked"
      @update:open="onRestoreOpen"
    />
    <MatchRestartMapDialog v-model:open="restartOpen" :match="match" />
  </div>
</template>
