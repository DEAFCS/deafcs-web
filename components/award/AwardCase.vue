<script setup lang="ts">
import { dateLocale } from "~/utilities/dateLocale";
import { computed, ref } from "vue";
import AwardArtwork from "./AwardArtwork.vue";
import AwardModal from "./AwardModal.vue";
import type { AwardArtworkDefinition } from "~/utilities/awardArtwork";
import { resolveAwardTier, type AwardTier } from "~/utilities/awardSeed";

interface Award {
  id: string;
  // null for a Special award (Player of the Month, ...).
  placement: number | null;
  placement_tier?: string | null;
  tournament_id?: string | null;
  awarded_at?: string | null;
  team_id?: string | null;
  tournament?: {
    name: string;
    start?: string | null;
    stages?: Array<{ type: string }> | null;
  } | null;
  tournament_team?: {
    name?: string | null;
    team_id?: string | null;
    team?: {
      id: string;
      name?: string | null;
      short_name?: string | null;
    } | null;
  } | null;
  team?: {
    id: string;
    name?: string | null;
    short_name?: string | null;
  } | null;
  // Artwork definition resolved by mapAwardRecipientToTrophy: the real award
  // behind this grant (or its per-tournament slot override), rendered through
  // AwardArtwork. `trophy_config` stays for the nameplate text below.
  award?: AwardArtworkDefinition | null;
  trophy_config?: {
    custom_name?: string | null;
    silhouette?: number | null;
    image_url?: string | null;
  } | null;
}

interface Props {
  trophies?: Award[] | null;
  emptyState?: boolean;
  hideMvp?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  trophies: null,
  emptyState: true,
  hideMvp: false,
});

const selected = ref<Award | null>(null);
const modalOpen = ref(false);

function trophyTier(trophy: Award): AwardTier {
  return resolveAwardTier(trophy.placement, trophy.award?.tier);
}

function trophyDate(trophy: Award): string | null {
  return trophy.tournament?.start || trophy.awarded_at || null;
}

// Placement medals lead, ordered mvp -> bronze; Special awards trail them,
// newest first within each (5Stack AwardCase).
const TIER_ORDER: Record<AwardTier, number> = {
  mvp: 0,
  gold: 1,
  silver: 2,
  bronze: 3,
  special: 4,
};

const sorted = computed(() => {
  if (!props.trophies) return [];
  return [...props.trophies].sort((a, b) => {
    const ta = TIER_ORDER[trophyTier(a)];
    const tb = TIER_ORDER[trophyTier(b)];
    if (ta !== tb) return ta - tb;
    const da = new Date(trophyDate(a) || 0).getTime();
    const db = new Date(trophyDate(b) || 0).getTime();
    return db - da;
  });
});

const counts = computed(() => {
  const c: Record<AwardTier, number> = {
    mvp: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    special: 0,
  };
  for (const t of sorted.value) {
    c[trophyTier(t)]++;
  }
  return c;
});

function openAward(trophy: Award) {
  selected.value = trophy;
  modalOpen.value = true;
}

function formatAwardDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString(dateLocale(), {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();
}

const frameClasses =
  "relative overflow-hidden rounded-lg border border-border px-6 py-6 [background:linear-gradient(180deg,hsl(var(--card)_/_0.7)_0%,hsl(var(--card)_/_0.35)_100%)] [backdrop-filter:blur(6px)] before:pointer-events-none before:absolute before:left-2 before:top-2 before:h-[14px] before:w-[14px] before:border-l-2 before:border-t-2 before:border-[hsl(var(--tac-amber))] before:content-[''] after:pointer-events-none after:absolute after:bottom-2 after:right-2 after:h-[14px] after:w-[14px] after:border-b-2 after:border-r-2 after:border-[hsl(var(--tac-amber))] after:content-['']";

const scanlineClasses =
  "pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(3deg,transparent_0,transparent_3px,hsl(var(--tac-amber)_/_0.025)_3px,hsl(var(--tac-amber)_/_0.025)_4px)]";

import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const eyebrowClasses = `${tacticalSectionLabelClasses} mb-0`;

const tierColors: Record<AwardTier, string> = {
  mvp: "hsl(195 85% 60%)",
  gold: "hsl(45 95% 60%)",
  silver: "hsl(0 0% 78%)",
  bronze: "hsl(28 70% 52%)",
  special: "hsl(258 90% 74%)",
};

const tierRack = computed(() => {
  const tiers = [
    { key: "mvp" as const, label: "MVP", full: "Most Valuable Player" },
    { key: "gold" as const, label: "1ST", full: "1st Place" },
    { key: "silver" as const, label: "2ND", full: "2nd Place" },
    { key: "bronze" as const, label: "3RD", full: "3rd Place" },
    { key: "special" as const, label: "AWD", full: "Awards" },
  ];
  return props.hideMvp ? tiers.filter((t) => t.key !== "mvp") : tiers;
});

function trophyUplight(trophy: Award) {
  return tierColors[trophyTier(trophy)];
}
</script>

<template>
  <section :class="frameClasses">
    <!-- scanline overlay -->
    <div :class="scanlineClasses" aria-hidden="true"></div>

    <!-- Header: eyebrow + rack counters -->
    <header
      class="relative mb-5 flex flex-wrap items-start justify-between gap-4"
    >
      <div class="flex flex-col gap-1.5">
        <div :class="eyebrowClasses">
          <span :class="tacticalSectionTickClasses"></span>
          {{ $t("awards.title") }}
          <span
            v-if="sorted.length"
            class="rounded-sm border border-[hsl(var(--tac-amber)_/_0.35)] bg-[hsl(var(--tac-amber)_/_0.12)] px-[0.4rem] py-[0.02rem] text-[0.62rem] tracking-[0.12em] text-[hsl(var(--tac-amber))]"
          >
            {{ sorted.length.toString().padStart(2, "0") }}
          </span>
        </div>
        <div
          class="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-muted-foreground/70"
        >
          ▚ AWARDS ON FILE
        </div>
      </div>

      <!-- Tier rack -->
      <div
        class="flex items-stretch gap-0 divide-x divide-border/80 overflow-hidden rounded border border-border/80 bg-background/60 [backdrop-filter:blur(4px)]"
      >
        <div
          v-for="tier in tierRack"
          :key="tier.key"
          class="flex items-center gap-2 px-3 py-2"
          :style="{ color: tierColors[tier.key] }"
          :title="`${counts[tier.key]} × ${tier.full}`"
        >
          <span
            class="inline-block h-2 w-2 rounded-full"
            :style="{
              background: tierColors[tier.key],
              boxShadow: `0 0 6px ${tierColors[tier.key]}`,
            }"
          ></span>
          <span
            class="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground"
          >
            {{ tier.label }}
          </span>
          <span class="font-mono text-base font-bold leading-none tabular-nums">
            {{ String(counts[tier.key]).padStart(2, "0") }}
          </span>
        </div>
      </div>
    </header>

    <!-- Trophy grid -->
    <div
      v-if="sorted.length"
      class="relative grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      <button
        v-for="trophy in sorted"
        :key="trophy.id"
        type="button"
        class="group/pedestal relative flex flex-col items-center gap-2 rounded-sm px-2 pb-3 pt-4 transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))]"
        @click="openAward(trophy)"
      >
        <!-- Uplight -->
        <div
          class="pointer-events-none absolute inset-x-3 bottom-8 top-2 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover/pedestal:opacity-80"
          :style="{
            background: `radial-gradient(ellipse at center bottom, ${trophyUplight(trophy)} 0%, transparent 65%)`,
          }"
        ></div>

        <AwardArtwork
          v-if="trophy.award"
          :award="trophy.award"
          size="md"
          class="relative z-[1]"
        />

        <!-- Stenciled nameplate -->
        <div class="relative z-[1] mt-1 w-full">
          <div
            class="truncate text-center text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-foreground group-hover/pedestal:text-[hsl(var(--tac-amber))]"
            :title="
              trophy.trophy_config?.custom_name ||
              trophy.tournament?.name ||
              trophy.award?.name
            "
          >
            {{
              trophy.trophy_config?.custom_name ||
              trophy.tournament?.name ||
              trophy.award?.name
            }}
          </div>
          <div
            v-if="trophyDate(trophy)"
            class="mt-0.5 flex items-center justify-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-muted-foreground/80"
          >
            <span class="h-[1px] w-2 bg-border"></span>
            {{ formatAwardDate(trophyDate(trophy)) }}
            <span class="h-[1px] w-2 bg-border"></span>
          </div>
        </div>
      </button>
    </div>

    <!-- Classified-stamp empty state -->
    <div
      v-else-if="emptyState"
      class="relative flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-border bg-background/30 py-8"
    >
      <div
        class="rotate-[-4deg] rounded-sm border-2 border-[hsl(var(--tac-amber)_/_0.5)] px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-[0.3em] text-[hsl(var(--tac-amber)_/_0.7)]"
      >
        ▚ NO AWARDS ON FILE
      </div>
      <div
        class="max-w-sm text-center text-[0.72rem] uppercase tracking-[0.15em] text-muted-foreground"
      >
        {{ $t("awards.no_awards_description") }}
      </div>
    </div>

    <AwardModal
      v-if="selected"
      :open="modalOpen"
      :trophy="selected"
      @update:open="(v) => (modalOpen = v)"
    />
  </section>
</template>
