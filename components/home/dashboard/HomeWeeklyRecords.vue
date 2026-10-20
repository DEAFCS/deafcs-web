<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { $, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import {
  homePanelClasses,
  homePanelPaddingClasses,
  whenNearViewport,
} from "~/components/home/dashboard/homeDashboard";
import { weeklyRecords, type WeeklyRecord } from "~/components/home/dashboard/weeklyRecords";

// "Last 7 Days": HLTV-style rotating stat leader cards from finished DEAFCS
// Competitive matches. Loads once, only when the section scrolls near the
// viewport (one match list + one stats request + the leaders' names).
// Records are informational; nothing is awarded for them.

const root = ref<HTMLElement | null>(null);
const state = ref<"idle" | "loading" | "ready" | "error">("idle");
const records = ref<WeeklyRecord[]>([]);
const players = ref<Record<string, { name: string; avatar_url: string | null }>>({});
const matchCount = ref(0);
const active = ref(0);

const matchesQuery = generateQuery({
  matches: [
    {
      where: {
        status: { _eq: "Finished" },
        source: { _eq: "5stack" },
        ended_at: { _gte: $("since", "timestamptz!") },
        options: { type: { _eq: "Competitive" } },
      },
      order_by: [{ ended_at: order_by.desc }],
      limit: 500,
    },
    { id: true, options: { mr: true } },
  ],
} as any);

const statsQuery = generateQuery({
  v_player_match_rating: [
    { where: { match_id: { _in: $("ids", "[uuid!]!") } } },
    { steam_id: true, match_id: true, adr: true, hltv_rating: true, rounds_played: true },
  ],
  player_match_stats_v: [
    { where: { match_id: { _in: $("ids", "[uuid!]!") } } },
    { steam_id: true, match_id: true, kills: true, hs_kills: true },
  ],
} as any);

const playersQuery = generateQuery({
  players: [
    { where: { steam_id: { _in: $("steam_ids", "[bigint!]!") } } },
    { steam_id: true, name: true, avatar_url: true },
  ],
} as any);

async function load() {
  state.value = "loading";
  try {
    const client = getGraphqlClient();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: matchData } = await client.query({ query: matchesQuery, variables: { since } });
    const matches: any[] = (matchData as any)?.matches ?? [];
    matchCount.value = matches.length;
    if (!matches.length) {
      records.value = [];
      state.value = "ready";
      return;
    }
    const ids = matches.map((m) => m.id);
    const { data } = await client.query({ query: statsQuery, variables: { ids } });
    const mr = Object.fromEntries(matches.map((m) => [m.id, m.options?.mr]));
    records.value = weeklyRecords(
      (data as any)?.v_player_match_rating ?? [],
      (data as any)?.player_match_stats_v ?? [],
      mr,
    );
    const steamIds = [...new Set(records.value.flatMap((r) => r.entries.map((e) => e.steamId)))];
    if (steamIds.length) {
      const { data: playerData } = await client.query({
        query: playersQuery,
        variables: { steam_ids: steamIds },
      });
      players.value = Object.fromEntries(
        ((playerData as any)?.players ?? []).map((p: any) => [String(p.steam_id), p]),
      );
    }
    state.value = "ready";
  } catch (error) {
    console.error("[home] last 7 days records:", error);
    state.value = "error";
  }
}

let stopObserving = () => {};
onMounted(() => {
  stopObserving = whenNearViewport(root.value, () => void load());
});

// Rotation: every 7 s, paused while hovered/focused, off for reduced motion.
const paused = ref(false);
const reducedMotion = ref(false);
let rotation: ReturnType<typeof setInterval> | null = null;
function startRotation() {
  stopRotation();
  if (reducedMotion.value || records.value.length < 2) return;
  rotation = setInterval(() => {
    if (!paused.value && document.visibilityState === "visible") {
      active.value = (active.value + 1) % records.value.length;
    }
  }, 7000);
}
function stopRotation() {
  if (rotation) clearInterval(rotation);
  rotation = null;
}
onMounted(() => {
  reducedMotion.value = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
});
watch(records, () => {
  active.value = 0;
  startRotation();
});
onBeforeUnmount(() => {
  stopObserving();
  stopRotation();
});

function go(step: number) {
  const n = records.value.length;
  if (!n) return;
  active.value = (active.value + step + n) % n;
  startRotation();
}

const current = computed(() => records.value[active.value] ?? null);
const leader = computed(() => current.value?.entries[0] ?? null);
const nameOf = (steamId: string) => players.value[steamId]?.name ?? "Player";
const avatarOf = (steamId: string) => players.value[steamId]?.avatar_url ?? null;
</script>

<template>
  <section
    ref="root"
    aria-labelledby="home-week-title"
    :class="[homePanelClasses, homePanelPaddingClasses, 'flex flex-col']"
    data-testid="home-weekly-records"
  >
    <HomeSectionHeader id="home-week-title" title="Last 7 Days" />

    <div v-if="state === 'idle' || state === 'loading'" class="grid flex-1 gap-3">
      <div class="h-40 animate-pulse rounded-lg bg-muted/30"></div>
      <div class="flex gap-2">
        <div v-for="i in 4" :key="i" class="h-7 w-24 animate-pulse rounded-full bg-muted/30"></div>
      </div>
    </div>

    <div v-else-if="state === 'error'" class="flex flex-1 items-center gap-3 rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
      Could not load this week's records.
      <button type="button" class="font-semibold text-[hsl(var(--tac-amber))] hover:underline" @click="load">Try again</button>
    </div>

    <div v-else-if="!current" class="flex flex-1 items-center rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
      No Competitive matches finished in the last 7 days yet.
    </div>

    <div
      v-else
      class="flex flex-1 flex-col gap-3"
      @mouseenter="paused = true"
      @mouseleave="paused = false"
      @focusin="paused = true"
      @focusout="paused = false"
    >
      <div
        class="relative flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-[radial-gradient(110%_100%_at_100%_0%,hsl(var(--tac-amber)/0.14),transparent_55%),linear-gradient(180deg,hsl(var(--muted)/0.3),hsl(var(--muted)/0.08))]"
        role="group"
        aria-roledescription="slide"
        :aria-label="`${current.title}, ${active + 1} of ${records.length}`"
        aria-live="polite"
      >
        <Transition
          mode="out-in"
          enter-active-class="transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none"
          enter-from-class="translate-x-3 opacity-0"
          leave-active-class="transition-opacity duration-150 ease-in motion-reduce:transition-none"
          leave-to-class="opacity-0"
        >
          <div :key="current.key" class="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-stretch sm:gap-5">
            <div v-if="leader" class="flex min-w-0 flex-1 items-center gap-4">
              <img
                v-if="avatarOf(leader.steamId)"
                :src="avatarOf(leader.steamId)!"
                alt=""
                loading="lazy"
                class="size-16 shrink-0 rounded-lg object-cover ring-1 ring-[hsl(var(--tac-amber)/0.6)] sm:size-20"
              />
              <span v-else class="grid size-16 shrink-0 place-items-center rounded-lg bg-muted text-xl font-black sm:size-20">
                {{ nameOf(leader.steamId).slice(0, 1) }}
              </span>
              <div class="min-w-0">
                <p class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))]">
                  {{ current.title }}
                </p>
                <NuxtLink
                  :to="{ name: 'players-id', params: { id: leader.steamId } }"
                  class="block truncate text-lg font-black tracking-tight hover:text-[hsl(var(--tac-amber))]"
                >
                  {{ nameOf(leader.steamId) }}
                </NuxtLink>
                <p class="flex items-baseline gap-2">
                  <span class="font-mono text-4xl font-black tabular-nums leading-none">{{ leader.display }}</span>
                  <span class="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{{ current.unit }}</span>
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  <NuxtLink
                    v-if="leader.matchId"
                    :to="{ name: 'matches-id', params: { id: leader.matchId } }"
                    class="underline-offset-2 hover:underline"
                  >{{ leader.detail }}</NuxtLink>
                  <template v-else>{{ leader.detail }}</template>
                </p>
              </div>
            </div>

            <ol v-if="current.entries.length > 1" class="grid content-center gap-1.5 sm:w-48 sm:border-l sm:border-border/60 sm:pl-4">
              <li
                v-for="(entry, index) in current.entries.slice(1)"
                :key="`${entry.steamId}-${index}`"
                class="flex min-w-0 items-center gap-2 text-sm"
              >
                <span class="w-4 shrink-0 text-center font-mono text-xs font-bold text-muted-foreground">{{ index + 2 }}</span>
                <NuxtLink
                  :to="{ name: 'players-id', params: { id: entry.steamId } }"
                  class="min-w-0 flex-1 truncate hover:text-[hsl(var(--tac-amber))]"
                >{{ nameOf(entry.steamId) }}</NuxtLink>
                <span class="shrink-0 font-mono text-sm font-bold tabular-nums">{{ entry.display }}</span>
              </li>
            </ol>
          </div>
        </Transition>
        <p v-if="current.rule" class="border-t border-border/50 px-4 py-1.5 text-[11px] text-muted-foreground">
          {{ current.rule }}
        </p>
      </div>

      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60"
          aria-label="Previous record"
          @click="go(-1)"
        >
          <ChevronLeft class="size-4" />
        </button>
        <div class="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]" role="tablist" aria-label="Records">
          <button
            v-for="(record, index) in records"
            :key="record.key"
            type="button"
            role="tab"
            :aria-selected="index === active"
            class="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
            :class="
              index === active
                ? 'border-[hsl(var(--tac-amber)/0.6)] bg-[hsl(var(--tac-amber)/0.14)] text-foreground'
                : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
            "
            @click="active = index; startRotation()"
          >
            {{ record.title }}
          </button>
        </div>
        <button
          type="button"
          class="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 hover:bg-muted/60"
          aria-label="Next record"
          @click="go(1)"
        >
          <ChevronRight class="size-4" />
        </button>
      </div>

      <p class="text-[11px] text-muted-foreground">
        From {{ matchCount }} Competitive DEAFCS matches finished in the last 7 days. Weekly records are not awards.
      </p>
    </div>
  </section>
</template>
