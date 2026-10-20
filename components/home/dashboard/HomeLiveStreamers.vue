<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { ExternalLink, Users } from "lucide-vue-next";
import TwitchIcon from "~/components/icons/TwitchIcon.vue";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import { fetchLiveStreamers, type LiveStreamer } from "~/composables/useTwitchApi";
import { formatCount, homePanelClasses, homePanelPaddingClasses, type HomeViewer } from "~/components/home/dashboard/homeDashboard";

// DEAFCS players live on their linked Twitch channel in Counter-Strike. The
// list comes from the API (it holds the Twitch credentials and checks the
// category); no admin approval. Nothing from Twitch loads in the page: no
// embed, no autoplay, no Twitch-hosted thumbnails. A card only links out.
// Hidden while nobody is live.
const props = defineProps<{ viewer: HomeViewer }>();

const streamers = ref<LiveStreamer[]>([]);
const sample = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  const fetched = await fetchLiveStreamers();
  if (fetched === null && timer) {
    // The API has no /twitch/live route (yet): stop polling a 404.
    clearInterval(timer);
    timer = null;
  }
  const live = fetched ?? [];
  if (live.length || !import.meta.dev || !props.viewer.samples) {
    streamers.value = live;
    sample.value = false;
    return;
  }
  const { sampleStreamers } = await import("~/components/home/dashboard/homePreviewSamples");
  streamers.value = sampleStreamers();
  sample.value = true;
}

onMounted(() => {
  void load();
  // The API caches Twitch status; two minutes is plenty for a list.
  timer = setInterval(load, 120_000);
});
onBeforeUnmount(() => timer && clearInterval(timer));

function liveFor(startedAt: string | null) {
  if (!startedAt) return null;
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000));
  if (!Number.isFinite(minutes)) return null;
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
</script>

<template>
  <section
    v-if="streamers.length"
    aria-labelledby="home-streamers-title"
    :class="[homePanelClasses, homePanelPaddingClasses]"
    data-testid="home-live-streamers"
  >
    <HomeSectionHeader id="home-streamers-title" title="Live on Twitch" :sample="sample" />
    <!-- Phones: one swipeable row instead of a tall stack. -->
    <ul
      class="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] sm:overflow-visible sm:px-0 sm:pb-0"
    >
      <li
        v-for="streamer in streamers"
        :key="streamer.steamId"
        class="flex w-[82%] min-w-0 shrink-0 snap-start flex-col gap-2.5 rounded-lg border border-border bg-muted/20 p-3 sm:w-auto"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="relative shrink-0">
            <img
              v-if="streamer.avatarUrl"
              :src="streamer.avatarUrl"
              alt=""
              loading="lazy"
              class="size-11 rounded-full object-cover ring-2 ring-destructive ring-offset-2 ring-offset-background"
            />
            <span
              v-else
              class="grid size-11 place-items-center rounded-full bg-muted text-sm font-bold ring-2 ring-destructive ring-offset-2 ring-offset-background"
            >{{ streamer.playerName.slice(0, 1) }}</span>
            <span
              class="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-destructive px-1 font-mono text-[0.55rem] font-bold uppercase leading-4 text-white"
            >Live</span>
          </span>
          <div class="min-w-0">
            <span v-if="sample" class="block truncate text-sm font-bold">{{ streamer.playerName }}</span>
            <NuxtLink
              v-else
              :to="{ name: 'players-id', params: { id: streamer.steamId } }"
              class="block truncate text-sm font-bold hover:text-[hsl(var(--tac-amber))]"
            >{{ streamer.playerName }}</NuxtLink>
            <p class="flex items-center gap-2 text-xs text-muted-foreground">
              <span v-if="streamer.viewerCount !== null" class="inline-flex items-center gap-1 tabular-nums">
                <Users class="size-3" aria-hidden="true" />
                {{ formatCount(streamer.viewerCount) }}
              </span>
              <span v-if="liveFor(streamer.startedAt)">Live {{ liveFor(streamer.startedAt) }}</span>
            </p>
          </div>
        </div>
        <p v-if="streamer.title" class="line-clamp-2 text-[13px] leading-snug text-foreground/85" :title="streamer.title">
          {{ streamer.title }}
        </p>
        <a
          :href="sample ? undefined : streamer.link"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-auto inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#9146ff]/50 bg-[#9146ff]/15 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-[#9146ff]/25"
        >
          <TwitchIcon class="size-3.5" aria-hidden="true" />
          Watch on Twitch
          <ExternalLink class="size-3 text-muted-foreground" aria-hidden="true" />
        </a>
      </li>
    </ul>
  </section>
</template>
