<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
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
import {
  weeklyRecords,
  type ClutchRow,
  type OpeningRow,
  type RatingRow,
  type StatsRow,
  type WeeklyRecord,
} from "~/components/home/dashboard/weeklyRecords";

// "Last 7 Days": HLTV-style rotating stat leader cards (top 5) from finished
// DEAFCS Competitive 5v5 matches. Loads only when the section scrolls near
// the viewport:
//   1. the week's matches, then one request for ratings + kills/deaths, and
//      the leaders' names: every record but clutches and opening kills;
//   2. in parallel, won clutches and opening kills (database-computed views,
//      about a second each), added as their cards when they arrive.
// The result is kept in this browser for 10 minutes so moving around the
// site does not recompute it. Records are informational, never awarded.

const CACHE_KEY = "deafcs:home:last7days:v2";
const CACHE_MS = 10 * 60_000;

type PlayerInfo = { name: string; avatar_url: string | null };

const root = ref<HTMLElement | null>(null);
const state = ref<"idle" | "loading" | "ready" | "unavailable" | "error">("idle");
const records = ref<WeeklyRecord[]>([]);
const players = ref<Record<string, PlayerInfo>>({});
const matchCount = ref(0);
const active = ref(0);
const pillRow = ref<HTMLElement | null>(null);

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
    {
      id: true,
      options: { mr: true },
      // Lineup sizes: clutches are only counted in true 5v5 matches.
      lineup_1: { lineup_players: [{}, { steam_id: true }] },
      lineup_2: { lineup_players: [{}, { steam_id: true }] },
    },
  ],
} as any);

const statsQuery = generateQuery({
  v_player_match_rating: [
    { where: { match_id: { _in: $("ids", "[uuid!]!") } } },
    { steam_id: true, match_id: true, adr: true, hltv_rating: true, rounds_played: true },
  ],
  player_match_stats_v: [
    { where: { match_id: { _in: $("ids", "[uuid!]!") } } },
    { steam_id: true, match_id: true, kills: true, hs_kills: true, deaths: true },
  ],
} as any);

const eventsQuery = generateQuery({
  v_match_clutches: [
    { where: { match_id: { _in: $("clutch_ids", "[uuid!]!") }, outcome: { _eq: "won" } } },
    { match_id: true, clutcher_steam_id: true },
  ],
  v_match_player_opening_duels: [
    { where: { match_id: { _in: $("ids", "[uuid!]!") }, wins: { _gt: 0 } } },
    { match_id: true, steam_id: true, wins: true },
  ],
} as any);

const playersQuery = generateQuery({
  players: [
    { where: { steam_id: { _in: $("steam_ids", "[bigint!]!") } } },
    { steam_id: true, name: true, avatar_url: true },
  ],
} as any);

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    return cached && Date.now() - cached.at < CACHE_MS ? cached : null;
  } catch {
    return null;
  }
}

function writeCache() {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ at: Date.now(), records: records.value, players: players.value, matchCount: matchCount.value }),
    );
  } catch {
    // storage full or blocked: the page simply recomputes next time
  }
}

// Keep the card the viewer is on when more records arrive.
function setRecords(next: WeeklyRecord[]) {
  const key = records.value[active.value]?.key;
  records.value = next;
  const index = key ? next.findIndex((r) => r.key === key) : -1;
  active.value = index >= 0 ? index : 0;
}

async function loadPlayers(list: WeeklyRecord[]) {
  const missing = [...new Set(list.flatMap((r) => r.entries.map((e) => e.steamId)))].filter(
    (id) => !players.value[id],
  );
  if (!missing.length) return;
  const { data } = await getGraphqlClient().query({ query: playersQuery, variables: { steam_ids: missing } });
  players.value = {
    ...players.value,
    ...Object.fromEntries(((data as any)?.players ?? []).map((p: any) => [String(p.steam_id), p])),
  };
}

// The API's shared result (GET /stats/weekly-records, same calculation,
// computed once per 5 minutes for everyone). null: the route is missing or
// unreachable (an API without it), so this browser computes as before.
type ServerResult = { available: boolean; matchCount?: number; records?: WeeklyRecord[]; players?: Record<string, PlayerInfo> };
async function fetchServerRecords(): Promise<ServerResult | null> {
  try {
    const apiDomain = useRuntimeConfig().public.apiDomain;
    const res = await fetch(`https://${apiDomain}/stats/weekly-records?mode=Competitive`);
    if (!res.ok) return null;
    const data = (await res.json()) as ServerResult;
    return typeof data?.available === "boolean" ? data : null;
  } catch {
    return null;
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

async function load() {
  const server = await fetchServerRecords();
  if (server?.available) {
    players.value = server.players ?? {};
    matchCount.value = server.matchCount ?? 0;
    setRecords(server.records ?? []);
    state.value = "ready";
    return;
  }
  if (server && !server.available) {
    // Another request is computing the shared result: never recompute here,
    // show a short notice and ask again in a moment.
    state.value = "unavailable";
    if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; void load(); }, 15_000);
    return;
  }
  await loadInBrowser();
}

// Fallback when the API has no /stats route: the original in-browser
// calculation (same rules), kept for 10 minutes in this browser.
async function loadInBrowser() {
  const cached = readCache();
  if (cached) {
    players.value = cached.players ?? {};
    matchCount.value = cached.matchCount ?? 0;
    setRecords(cached.records ?? []);
    state.value = "ready";
    return;
  }

  state.value = "loading";
  try {
    const client = getGraphqlClient();
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const { data: matchData } = await client.query({ query: matchesQuery, variables: { since } });
    const matches: any[] = (matchData as any)?.matches ?? [];
    matchCount.value = matches.length;
    if (!matches.length) {
      setRecords([]);
      state.value = "ready";
      return;
    }

    const ids = matches.map((m) => m.id);
    const seated = (lineup: any) => (lineup?.lineup_players ?? []).filter((p: any) => p.steam_id).length;
    const clutchIds = matches
      .filter((m) => seated(m.lineup_1) === 5 && seated(m.lineup_2) === 5)
      .map((m) => m.id);
    const mr = Object.fromEntries(matches.map((m) => [m.id, m.options?.mr]));

    const events = client
      .query({ query: eventsQuery, variables: { ids, clutch_ids: clutchIds } })
      .then(({ data }) => ({
        clutches: ((data as any)?.v_match_clutches ?? []) as ClutchRow[],
        openings: ((data as any)?.v_match_player_opening_duels ?? []) as OpeningRow[],
      }));

    const { data } = await client.query({ query: statsQuery, variables: { ids } });
    const ratings = ((data as any)?.v_player_match_rating ?? []) as RatingRow[];
    const stats = ((data as any)?.player_match_stats_v ?? []) as StatsRow[];

    const base = weeklyRecords(ratings, stats, mr);
    await loadPlayers(base);
    setRecords(base);
    state.value = "ready";

    try {
      const extra = await events;
      const full = weeklyRecords(ratings, stats, mr, extra);
      await loadPlayers(full);
      setRecords(full);
      writeCache();
    } catch (error) {
      // Clutches and opening kills stay out; the other records still show.
      console.error("[home] last 7 days clutches/opening kills:", error);
    }
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
watch(
  () => records.value.length,
  () => startRotation(),
);
onBeforeUnmount(() => {
  stopObserving();
  stopRotation();
  if (retryTimer) clearTimeout(retryTimer);
});

// The pill row scrolls sideways; keep the active category in view.
watch(active, async (index) => {
  await nextTick();
  const pill = pillRow.value?.children[index] as HTMLElement | undefined;
  const row = pillRow.value;
  if (!pill || !row) return;
  const left = pill.offsetLeft - row.offsetLeft;
  if (left < row.scrollLeft || left + pill.offsetWidth > row.scrollLeft + row.clientWidth) {
    row.scrollTo({ left: Math.max(0, left - 8), behavior: reducedMotion.value ? "auto" : "smooth" });
  }
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
const scoreboard = (matchId: string) => ({
  name: "matches-id",
  params: { id: matchId },
  query: { tab: "scoreboard" },
});
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

    <div v-else-if="state === 'unavailable'" class="flex flex-1 items-center gap-3 rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground" data-testid="home-week-unavailable">
      This week's records are being prepared. They will appear in a moment.
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
        <!-- The outgoing record fades out on top of the incoming one (no
             out-in gap), so the card never collapses between records. -->
        <Transition
          enter-active-class="transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none"
          enter-from-class="translate-x-3 opacity-0"
          leave-active-class="pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-150 ease-in motion-reduce:transition-none"
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
                <p class="truncate font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))]">
                  {{ current.title }}
                </p>
                <NuxtLink
                  :to="{ name: 'players-id', params: { id: leader.steamId } }"
                  class="block truncate text-lg font-black tracking-tight hover:text-[hsl(var(--tac-amber))]"
                >
                  {{ nameOf(leader.steamId) }}
                </NuxtLink>
                <!-- Single-match records: the value opens that match's scoreboard. -->
                <p class="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
                  <NuxtLink
                    v-if="leader.matchId"
                    :to="scoreboard(leader.matchId)"
                    class="font-mono text-4xl font-black tabular-nums leading-none hover:text-[hsl(var(--tac-amber))]"
                    :aria-label="`${leader.display} ${current.unit}, open the match scoreboard`"
                  >{{ leader.display }}</NuxtLink>
                  <span v-else class="font-mono text-4xl font-black tabular-nums leading-none">{{ leader.display }}</span>
                  <span class="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{{ current.unit }}</span>
                </p>
                <p class="mt-1 truncate text-xs text-muted-foreground">
                  <NuxtLink
                    v-if="leader.matchId"
                    :to="scoreboard(leader.matchId)"
                    class="underline-offset-2 hover:underline"
                  >{{ leader.detail }} · Scoreboard</NuxtLink>
                  <template v-else>{{ leader.detail }}</template>
                </p>
              </div>
            </div>

            <!-- #2 to #5: compact rows; four rows are always reserved (empty
                 places show a dash) so the card keeps its height. -->
            <ol class="grid content-center gap-0.5 sm:w-52 sm:border-l sm:border-border/60 sm:pl-4">
              <li
                v-for="(entry, index) in current.entries.slice(1)"
                :key="`${entry.steamId}-${entry.matchId ?? ''}-${index}`"
                class="flex min-w-0 items-center gap-2 text-[13px] leading-6"
              >
                <span class="w-4 shrink-0 text-center font-mono text-xs font-bold text-muted-foreground">{{ entry.place }}</span>
                <NuxtLink
                  :to="{ name: 'players-id', params: { id: entry.steamId } }"
                  class="min-w-0 flex-1 truncate hover:text-[hsl(var(--tac-amber))]"
                >{{ nameOf(entry.steamId) }}</NuxtLink>
                <NuxtLink
                  v-if="entry.matchId"
                  :to="scoreboard(entry.matchId)"
                  class="shrink-0 font-mono text-[13px] font-bold tabular-nums hover:text-[hsl(var(--tac-amber))]"
                >{{ entry.display }}</NuxtLink>
                <span v-else class="shrink-0 font-mono text-[13px] font-bold tabular-nums">{{ entry.display }}</span>
              </li>
              <li
                v-for="pad in Math.max(0, 4 - Math.max(0, current.entries.length - 1))"
                :key="`pad-${pad}`"
                class="flex min-w-0 items-center gap-2 text-[13px] leading-6 text-muted-foreground/40"
                aria-hidden="true"
              >
                <span class="w-4 shrink-0 text-center font-mono text-xs font-bold">{{ current.entries.length + pad }}</span>
                <span class="flex-1">-</span>
              </li>
            </ol>
          </div>
        </Transition>
        <!-- Every record has a footer; two lines are reserved on phones (where
             the longer ones wrap) and one from sm up, so it never shifts. -->
        <p
          class="line-clamp-2 h-[calc(2rem+0.75rem+1px)] border-t border-border/50 px-4 py-1.5 text-[11px] leading-4 text-muted-foreground sm:line-clamp-1 sm:h-[calc(1rem+0.75rem+1px)]"
          data-testid="home-week-rule"
        >
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
        <div
          ref="pillRow"
          class="flex min-w-0 flex-1 snap-x gap-1.5 overflow-x-auto [scrollbar-width:none]"
          role="tablist"
          aria-label="Records"
        >
          <button
            v-for="(record, index) in records"
            :key="record.key"
            type="button"
            role="tab"
            :aria-selected="index === active"
            class="shrink-0 snap-start whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
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
        From {{ matchCount }} Competitive 5v5 DEAFCS matches finished in the last 7 days. Weekly records are not awards.
      </p>
    </div>
  </section>
</template>
