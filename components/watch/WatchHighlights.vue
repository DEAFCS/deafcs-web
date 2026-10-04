<script setup lang="ts">
// /watch highlights: kind filter (All / Aces / 4Ks), time range, and a bento
// grid with one large lead play.
//
// Structure adapted from 5Stack web (https://github.com/5stackgg/web,
// components/watch/WatchHighlights.vue), MIT License, Copyright (c) 2025
// 5Stack.gg -- see LICENSE. DEAFCS changes: every tile is the existing DEAFCS
// HighlightCard (same clip modal, share and visibility controls as
// elsewhere), and Aces/4Ks use the clip's real kills_count on single-round
// clips only -- nothing is classified that the data doesn't say.
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ArrowRight } from "lucide-vue-next";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { matchClipFields } from "~/graphql/matchClip";
import { $, order_by } from "~/generated/zeus";
import HighlightCard from "~/components/clips/HighlightCard.vue";
import WatchSegmented from "~/components/watch/WatchSegmented.vue";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import type { Clip } from "~/types/clip";
import { highlightsWhere, type HighlightKind, type HighlightRange } from "~/components/watch/watchHighlights";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const props = defineProps<{ ghost?: boolean }>();

const { t } = useI18n();

type Kind = HighlightKind;
type Range = HighlightRange;

const kind = ref<Kind>("all");
const range = ref<Range>("week");

const kindOptions = computed(() => [
  { key: "all" as Kind, label: t("pages.watch.highlights.kinds.all") },
  { key: "ace" as Kind, label: t("pages.watch.highlights.kinds.aces") },
  { key: "4k" as Kind, label: t("pages.watch.highlights.kinds.fourks") },
]);

const rangeOptions = computed(() => [
  { key: "today", label: t("pages.watch.highlights.range.today") },
  { key: "week", label: t("pages.watch.highlights.range.week") },
  { key: "all", label: t("pages.watch.highlights.range.all") },
]);

const clips = ref<Clip[]>([]);
const loading = ref(true);
// Lead play plus up to six.
const LIMIT = 7;

// Biggest round first, then most watched, then newest.
const TOP_PLAY_ORDER = [
  { kills_count: order_by.desc_nulls_last },
  { views_count: order_by.desc_nulls_last },
  { created_at: order_by.desc },
];

let requestId = 0;
async function fetchClips() {
  if (props.ghost) return;
  const id = ++requestId;
  loading.value = clips.value.length === 0;
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        match_clips: [
          {
            where: $("where", "match_clips_bool_exp!"),
            order_by: TOP_PLAY_ORDER,
            limit: $("limit", "Int!"),
          },
          matchClipFields,
        ],
      } as any),
      variables: { where: highlightsWhere(kind.value, range.value), limit: LIMIT },
      fetchPolicy: "network-only",
    });
    if (id !== requestId) return;
    clips.value = ((data as any)?.match_clips ?? []) as Clip[];
  } catch (error) {
    console.error("[watch] highlights fetch error:", error);
  } finally {
    if (id === requestId) loading.value = false;
  }
}

watch([kind, range, () => props.ghost], fetchClips, { immediate: true });

function leadTag() {
  if (range.value === "today") return t("pages.watch.highlights.tag.today");
  return range.value === "all"
    ? t("pages.watch.highlights.tag.all")
    : t("pages.watch.highlights.tag.week");
}
</script>

<template>
  <section id="watch-highlights" class="scroll-mt-20" data-testid="watch-highlights">
    <div :class="[tacticalSectionLabelClasses, '!flex w-full items-center justify-between']">
      <span class="inline-flex items-center gap-3">
        <span class="inline-flex items-center gap-2">
          <span :class="tacticalSectionTickClasses"></span>
          {{ $t("pages.watch.highlights.title") }}
        </span>
        <NuxtLink
          v-if="!ghost"
          to="/highlights"
          class="inline-flex items-center gap-1 font-mono text-[0.65rem] normal-case tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {{ $t("common.see_all") }}
          <ArrowRight class="h-3 w-3" />
        </NuxtLink>
      </span>
    </div>

    <div v-if="!ghost" class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <WatchSegmented v-model="kind" :options="kindOptions" :label="$t('pages.watch.highlights.kinds.label')" />
      <Select v-model="range">
        <SelectTrigger
          class="h-8 w-auto gap-2 text-xs"
          :aria-label="$t('pages.watch.highlights.range.label')"
          data-testid="watch-highlights-range"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem v-for="option in rangeOptions" :key="option.key" :value="option.key">
            {{ option.label }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="ghost" class="watch-bento">
      <div class="watch-bento-hero relative flex items-end rounded-lg border border-dashed border-border p-5">
        <p class="max-w-[36ch] text-sm text-muted-foreground [text-wrap:balance]">
          {{ $t("pages.watch.highlights.ghost") }}
        </p>
      </div>
      <div v-for="index in 4" :key="index" aria-hidden="true" class="aspect-video rounded-lg border border-dashed border-border/70"></div>
    </div>

    <div v-else-if="loading" class="watch-bento">
      <Skeleton class="watch-bento-hero rounded-lg" />
      <Skeleton v-for="index in 4" :key="index" class="aspect-video rounded-lg" />
    </div>

    <div
      v-else-if="clips.length === 0"
      data-testid="watch-highlights-empty"
      class="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border px-5 py-8 text-sm text-muted-foreground"
    >
      <span>{{ $t("pages.watch.highlights.empty") }}</span>
      <Button v-if="range !== 'all'" variant="outline" size="sm" class="h-8" @click="range = 'all'">
        {{ $t("pages.watch.highlights.show_all_time") }}
      </Button>
    </div>

    <div v-else class="watch-bento" data-testid="watch-highlights-grid">
      <div
        v-for="(clip, index) in clips"
        :key="clip.id"
        class="relative min-w-0"
        :class="{ 'watch-bento-hero': index === 0 }"
        :data-testid="index === 0 ? 'watch-highlight-lead' : 'watch-highlight-tile'"
      >
        <span
          v-if="index === 0"
          class="pointer-events-none absolute left-2 top-2 z-20 inline-flex items-center rounded border border-[hsl(var(--tac-amber)/0.6)] bg-black/70 px-2 py-1 font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[hsl(var(--tac-amber))]"
          >{{ leadTag() }}</span
        >
        <HighlightCard :clip="clip" />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Desktop: the lead play spans half the width and two rows; the rest fill
   the other half two by two, then whole rows. Tablet: two columns. Phone:
   one column, so no tile gets too small to read. */
.watch-bento {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-flow: row dense;
  align-items: start;
  gap: 12px;
}

.watch-bento-hero {
  grid-column: span 2;
  grid-row: span 2;
}

@media (max-width: 900px) {
  .watch-bento {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .watch-bento-hero {
    grid-row: span 1;
  }
}

@media (max-width: 600px) {
  .watch-bento {
    grid-template-columns: minmax(0, 1fr);
  }
  .watch-bento-hero {
    grid-column: span 1;
  }
}
</style>
