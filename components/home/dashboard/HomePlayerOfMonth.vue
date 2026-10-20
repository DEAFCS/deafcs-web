<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { ArrowRight, Crown, ShieldCheck } from "lucide-vue-next";
import { order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import AwardArtwork from "~/components/award/AwardArtwork.vue";
import { dateLocale } from "~/utilities/dateLocale";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import {
  homePanelClasses,
  homePanelPaddingClasses,
  whenNearViewport,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

// Player of the Month: the latest award of the system award
// "player_of_the_month" (awards system, staff-approved, permanent history).
// The homepage only displays a winner; it never picks one. Until the first
// award exists it shows how the award works.
//
// The month's numbers under the winner are read live from their DEAFCS
// matches in that calendar month (finished DEAFCS matches only).
const POTM_SYSTEM_KEY = "player_of_the_month";

const props = defineProps<{ viewer: HomeViewer }>();

const root = ref<HTMLElement | null>(null);
const loaded = ref(false);
const winner = ref<any | null>(null);
const monthStats = ref<{ matches: number; rating: number | null; adr: number | null } | null>(null);
const sample = ref(false);

function monthRange(iso: string) {
  const d = new Date(iso);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

async function loadMonthStats(steamId: string, effectiveAt: string) {
  const { start, end } = monthRange(effectiveAt);
  const { data } = await getGraphqlClient().query({
    query: generateQuery({
      v_player_match_rating: [
        {
          where: {
            steam_id: { _eq: steamId },
            match: {
              status: { _eq: "Finished" },
              source: { _eq: "5stack" },
              ended_at: { _gte: start, _lt: end },
            },
          },
        },
        { match_id: true, adr: true, hltv_rating: true, rounds_played: true },
      ],
    } as any),
  });
  const rows: any[] = (data as any)?.v_player_match_rating ?? [];
  const rounds = rows.reduce((sum, row) => sum + (row.rounds_played ?? 0), 0);
  const weighted = (field: string) =>
    rounds
      ? rows.reduce((sum, row) => sum + Number(row[field] ?? 0) * (row.rounds_played ?? 0), 0) / rounds
      : null;
  monthStats.value = {
    matches: new Set(rows.map((row) => row.match_id)).size,
    rating: weighted("hltv_rating"),
    adr: weighted("adr"),
  };
}

async function load() {
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        award_occurrences: [
          {
            where: {
              award: { system_key: { _eq: POTM_SYSTEM_KEY }, archived_at: { _is_null: true } },
              recipients: { revoked_at: { _is_null: true }, player_steam_id: { _is_null: false } },
            },
            order_by: [{ effective_at: order_by.desc_nulls_last }],
            limit: 1,
          },
          {
            id: true,
            effective_at: true,
            created_at: true,
            award: {
              id: true,
              name: true,
              tier: true,
              silhouette: true,
              image_url: true,
              system_key: true,
            },
            recipients: [
              { where: { revoked_at: { _is_null: true } }, limit: 1 },
              {
                recipient_note: true,
                player: { steam_id: true, name: true, avatar_url: true, country: true },
              },
            ],
          },
        ],
      } as any),
    });
    const occurrence = (data as any)?.award_occurrences?.[0];
    const recipient = occurrence?.recipients?.[0];
    if (occurrence && recipient?.player) {
      winner.value = { occurrence, recipient };
      const at = occurrence.effective_at ?? occurrence.created_at;
      if (at) void loadMonthStats(recipient.player.steam_id, at).catch(() => {});
    } else if (import.meta.dev && props.viewer.samples) {
      const { samplePlayerOfMonth } = await import("~/components/home/dashboard/homePreviewSamples");
      const s = samplePlayerOfMonth();
      winner.value = s.winner;
      monthStats.value = s.stats;
      sample.value = true;
    }
  } catch (error) {
    console.error("[home] player of the month:", error);
  } finally {
    loaded.value = true;
  }
}

let stopObserving = () => {};
onMounted(() => {
  stopObserving = whenNearViewport(root.value, () => void load());
});
onBeforeUnmount(() => stopObserving());

const monthLabel = computed(() => {
  const at = winner.value?.occurrence?.effective_at ?? winner.value?.occurrence?.created_at;
  if (!at) return "";
  return new Date(at).toLocaleDateString(dateLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
});

const rules = [
  "Based on real DEAFCS matches played that month",
  "Fair play required, no active sanctions",
  "Reviewed and approved by DEAFCS staff",
  "A player can win once every 12 months",
];
</script>

<template>
  <section
    ref="root"
    aria-labelledby="home-potm-title"
    :class="[homePanelClasses, homePanelPaddingClasses, 'flex flex-col']"
    data-testid="home-player-of-month"
  >
    <HomeSectionHeader id="home-potm-title" title="Player of the Month" :sample="sample" />

    <div v-if="!loaded" class="h-36 animate-pulse rounded-lg bg-muted/30"></div>

    <div
      v-else-if="winner"
      class="relative flex flex-1 flex-col gap-4 overflow-hidden rounded-lg border border-[hsl(var(--tac-amber)/0.35)] bg-[radial-gradient(120%_90%_at_0%_0%,hsl(var(--tac-amber)/0.16),transparent_60%)] p-4"
    >
      <div class="flex min-w-0 items-center gap-4">
        <div class="relative shrink-0">
          <img
            v-if="winner.recipient.player.avatar_url"
            :src="winner.recipient.player.avatar_url"
            alt=""
            loading="lazy"
            class="size-16 rounded-full object-cover ring-2 ring-[hsl(var(--tac-amber))] ring-offset-2 ring-offset-background sm:size-20"
          />
          <span
            v-else
            class="grid size-16 place-items-center rounded-full bg-muted text-xl font-black ring-2 ring-[hsl(var(--tac-amber))] ring-offset-2 ring-offset-background sm:size-20"
          >{{ winner.recipient.player.name?.slice(0, 1) }}</span>
          <Crown
            class="absolute -top-3 left-1/2 size-5 -translate-x-1/2 fill-[hsl(var(--tac-amber))] text-[hsl(var(--tac-amber))]"
            aria-hidden="true"
          />
        </div>
        <div class="min-w-0">
          <p class="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))]">
            {{ monthLabel }}
          </p>
          <span v-if="sample" class="block truncate text-xl font-black tracking-tight sm:text-2xl">
            {{ winner.recipient.player.name }}
          </span>
          <NuxtLink
            v-else
            :to="{ name: 'players-id', params: { id: winner.recipient.player.steam_id } }"
            class="block truncate text-xl font-black tracking-tight hover:text-[hsl(var(--tac-amber))] sm:text-2xl"
          >
            {{ winner.recipient.player.name }}
          </NuxtLink>
          <p v-if="winner.recipient.recipient_note" class="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {{ winner.recipient.recipient_note }}
          </p>
        </div>
        <AwardArtwork
          v-if="!sample && winner.occurrence.award"
          :award="winner.occurrence.award"
          size="sm"
          decorative
          class="ml-auto hidden shrink-0 sm:block"
        />
      </div>

      <dl v-if="monthStats" class="grid grid-cols-3 gap-2">
        <div class="rounded-md border border-border/60 bg-background/45 px-2.5 py-2">
          <dt class="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Matches</dt>
          <dd class="font-mono text-lg font-black tabular-nums">{{ monthStats.matches }}</dd>
        </div>
        <div class="rounded-md border border-border/60 bg-background/45 px-2.5 py-2">
          <dt class="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Rating</dt>
          <dd class="font-mono text-lg font-black tabular-nums">{{ monthStats.rating?.toFixed(2) ?? "-" }}</dd>
        </div>
        <div class="rounded-md border border-border/60 bg-background/45 px-2.5 py-2">
          <dt class="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">ADR</dt>
          <dd class="font-mono text-lg font-black tabular-nums">{{ monthStats.adr?.toFixed(1) ?? "-" }}</dd>
        </div>
      </dl>
      <p class="mt-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck class="size-3.5 text-emerald-400" aria-hidden="true" />
        Approved by DEAFCS staff. Stats from DEAFCS matches that month.
      </p>
    </div>

    <div v-else class="flex flex-1 flex-col gap-3 rounded-lg border border-dashed border-border/70 p-4">
      <div class="flex items-center gap-3">
        <span class="grid size-10 shrink-0 place-items-center rounded-full border border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.1)]">
          <Crown class="size-5 text-[hsl(var(--tac-amber))]" aria-hidden="true" />
        </span>
        <p class="text-sm font-semibold">The first Player of the Month will be announced soon.</p>
      </div>
      <ul class="grid gap-1.5 text-[13px] text-muted-foreground">
        <li v-for="rule in rules" :key="rule" class="flex items-start gap-2">
          <span class="mt-[0.45rem] size-1 shrink-0 rounded-full bg-[hsl(var(--tac-amber))]" aria-hidden="true"></span>
          {{ rule }}
        </li>
      </ul>
      <NuxtLink to="/awards" class="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--tac-amber))] hover:underline">
        See all awards
        <ArrowRight class="size-3" aria-hidden="true" />
      </NuxtLink>
    </div>
  </section>
</template>
