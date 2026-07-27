<script setup lang="ts">
import { onBeforeUnmount, ref, watchEffect } from "vue";
import { ArrowRight, Film } from "lucide-vue-next";
import { order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { matchClipFields } from "~/graphql/matchClip";
import HighlightCard from "~/components/clips/HighlightCard.vue";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  useClipModal,
  type ClipQueueItem,
} from "~/composables/useClipModal";
import type { Clip } from "~/types/clip";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

const clips = ref<Clip[]>([]);
const loading = ref(true);
const requestError = ref(false);
let fetchGeneration = 0;

const clipQueueScope = "home-latest-highlights";
const { clearClipQueue, setClipQueue } = useClipModal();

function clipQueueItem(clip: Clip): ClipQueueItem {
  return {
    id: clip.id,
    title: clip.title,
    playerName: clip.target?.name ?? null,
    teamName: null,
    durationMs: clip.duration_ms,
    thumbnailUrl: clip.thumbnail_download_url,
    posterUrl: clip.match_map?.map?.poster ?? null,
  };
}

watchEffect(() => {
  setClipQueue(clips.value.map(clipQueueItem), clipQueueScope);
});

onBeforeUnmount(() => {
  clearClipQueue(clipQueueScope);
});

async function fetchLatestHighlights() {
  const generation = ++fetchGeneration;
  loading.value = true;
  requestError.value = false;

  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        match_clips: [
          {
            where: { visibility: { _eq: "public" } },
            order_by: [{ created_at: order_by.desc }],
            limit: 3,
          },
          matchClipFields,
        ],
      } as any),
      fetchPolicy: "network-only",
    });

    if (generation !== fetchGeneration) return;
    clips.value = ((data as { match_clips?: Clip[] }).match_clips ?? []).slice(
      0,
      3,
    );
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error("[home-latest-highlights] failed to load highlights", error);
    clips.value = [];
    requestError.value = true;
  } finally {
    if (generation === fetchGeneration) {
      loading.value = false;
    }
  }
}

void fetchLatestHighlights();
</script>

<template>
  <section aria-labelledby="latest-highlights-title">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
          Community highlights
        </div>
        <h2
          id="latest-highlights-title"
          class="text-2xl font-bold tracking-tight sm:text-3xl"
        >
          Latest Highlights
        </h2>
      </div>

      <NuxtLink
        to="/highlights"
        class="inline-flex min-h-10 items-center gap-1 self-start rounded-md font-mono text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)] sm:self-auto"
      >
        View all highlights
        <ArrowRight class="h-3 w-3" aria-hidden="true" />
      </NuxtLink>
    </div>

    <div v-if="loading" class="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading latest highlights">
      <Card
        v-for="index in 3"
        :key="index"
        class="min-w-0 overflow-hidden border-border/70 bg-card/40 shadow-none"
      >
        <Skeleton class="aspect-video w-full rounded-none" />
      </Card>
    </div>

    <Card
      v-else-if="requestError"
      class="mt-6 flex min-h-40 flex-col items-center justify-center border-dashed border-border/60 bg-card/30 px-4 py-6 text-center shadow-none"
      role="alert"
    >
      <Film class="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
      <p class="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        Unable to load this section
      </p>
      <button
        type="button"
        class="mt-3 min-h-10 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
        @click="fetchLatestHighlights"
      >
        Try again
      </button>
    </Card>

    <Card
      v-else-if="clips.length === 0"
      class="mt-6 flex min-h-40 items-center justify-center border-dashed border-border/60 bg-card/30 px-4 py-6 text-center shadow-none"
    >
      <p class="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        No public highlights yet
      </p>
    </Card>

    <div
      v-else
      class="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
    >
      <HighlightCard
        v-for="clip in clips"
        :key="clip.id"
        :clip="clip"
        class="min-w-0"
      />
    </div>
  </section>
</template>
