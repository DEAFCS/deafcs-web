<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, Medal, Play, Trophy, UserRound } from "lucide-vue-next";
import { useAuthStore } from "~/stores/AuthStore";
import HomeLatestHighlights from "~/components/home/HomeLatestHighlights.vue";
import HomeLatestNewsPreview from "~/components/home/HomeLatestNewsPreview.vue";
import HomeLatestResultsPreview from "~/components/home/HomeLatestResultsPreview.vue";
import HomeLiveMatchesPreview from "~/components/home/HomeLiveMatchesPreview.vue";
import HomeTopPlayersPreview from "~/components/home/HomeTopPlayersPreview.vue";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import { Button } from "~/components/ui/button";

type PreviewPlayer = {
  steam_id: string;
  name: string;
};

const props = defineProps<{
  previewPlayer?: PreviewPlayer;
}>();

const destinations = [
  {
    label: "MATCHMAKING",
    to: "/play",
    icon: Play,
    iconClass: "bottom-8 right-4 size-20",
    description:
      "Join Competitive, Wingman, or Duel matchmaking and climb the rankings.",
  },
  {
    label: "LEAGUE",
    to: "/league",
    icon: Trophy,
    iconClass: "bottom-8 right-4 size-20",
    description:
      "Compete across divisions, rise through the standings, and fight for the championship.",
  },
  {
    label: "TOURNAMENTS",
    to: "/tournaments",
    icon: Medal,
    iconClass: "bottom-8 right-4 size-20",
    description:
      "Join cups and tournaments, defeat the competition, and earn recognition and awards.",
  },
] as const;

const authStore = useAuthStore();
const player = computed(() => props.previewPlayer ?? authStore.me);
const steamId = computed(() => String(player.value?.steam_id ?? ""));
const playerName = computed(() => player.value?.name?.trim() || "");
const profilePath = computed(() => ({
  name: "players-id",
  params: { id: steamId.value },
}));
</script>

<template>
  <main class="min-w-0 space-y-8 pb-12">
    <div class="homepage-entry space-y-8">
      <TacticalPageHeader inline-actions>
        <template #title>DEAFCS</template>
        <template #actions>
          <Button
            as-child
            variant="outline"
            class="h-[clamp(1.75rem,4.2vw,3rem)] gap-2 bg-card/60 px-4 !py-0 backdrop-blur transition-[border-color,color,background-color,transform] hover:border-[hsl(var(--tac-amber)/0.55)] hover:bg-[hsl(var(--tac-amber)/0.08)] hover:text-[hsl(var(--tac-amber))] active:scale-[0.98] max-sm:aspect-square max-sm:!px-0"
          >
            <NuxtLink :to="profilePath" aria-label="View my profile">
              <UserRound class="size-4" aria-hidden="true" />
              <span class="hidden sm:inline">VIEW MY PROFILE</span>
            </NuxtLink>
          </Button>
        </template>
      </TacticalPageHeader>

      <header>
        <h2 class="text-xl font-black tracking-tight sm:text-2xl">
          <template v-if="playerName"
            >Welcome back, {{ playerName }}</template
          >
          <template v-else>Welcome back</template>
        </h2>
      </header>
    </div>

    <section
      aria-label="Player overview"
      class="min-w-0"
    >
      <div class="min-w-0 space-y-5">
        <div
          class="homepage-entry homepage-entry--delay-100 space-y-8 sm:space-y-10"
        >
          <section aria-labelledby="features-title">
          <h2
            id="features-title"
            class="mb-3 inline-flex items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
          >
            <span
              class="inline-block h-0.5 w-2.5 bg-[hsl(var(--tac-amber))]"
              aria-hidden="true"
            ></span>
            FEATURES
          </h2>

          <nav
            aria-label="Main platform destinations"
            class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <NuxtLink
              v-for="(destination, index) in destinations"
              :key="destination.to"
              :to="destination.to"
              class="group/feature relative isolate flex min-h-52 flex-col overflow-hidden rounded-lg border border-border px-5 pb-5 pt-4 text-left text-foreground outline-none [background:linear-gradient(135deg,hsl(var(--card)/0.7)_0%,hsl(var(--card)/0.35)_60%,hsl(var(--tac-amber)/0.05)_100%)] transition-[border-color,background,box-shadow,transform] duration-200 hover:scale-[1.01] hover:border-[hsl(var(--tac-amber)/0.55)] hover:[background:linear-gradient(135deg,hsl(var(--card)/0.8)_0%,hsl(var(--card)/0.45)_55%,hsl(var(--tac-amber)/0.10)_100%)] hover:shadow-[0_0_24px_hsl(var(--tac-amber)/0.12)] active:scale-[0.995] focus-visible:border-[hsl(var(--tac-amber))] focus-visible:shadow-[0_0_0_2px_hsl(var(--tac-amber)/0.35)]"
              :class="{ 'sm:col-span-2 lg:col-span-1': index === 2 }"
              active-class="!border-[hsl(var(--tac-amber)/0.75)]"
            >
              <span
                class="pointer-events-none absolute inset-0 z-0 opacity-0 [background-image:repeating-linear-gradient(180deg,transparent_0,transparent_3px,hsl(var(--tac-amber)/0.03)_3px,hsl(var(--tac-amber)/0.03)_4px)] transition-opacity duration-200 group-hover/feature:opacity-100"
                aria-hidden="true"
              ></span>
              <span
                class="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 border-r-2 border-t-2 border-[hsl(var(--tac-amber)/0.55)] transition-colors group-hover/feature:border-[hsl(var(--tac-amber))]"
                aria-hidden="true"
              ></span>
              <component
                :is="destination.icon"
                class="pointer-events-none absolute z-0 text-[hsl(31_72%_40%)] drop-shadow-[0_0_6px_hsl(var(--tac-amber)/0.18)] transition-[color,filter,transform] duration-300 group-hover/feature:scale-105 group-hover/feature:text-[hsl(var(--tac-amber))] group-hover/feature:drop-shadow-[0_0_8px_hsl(var(--tac-amber)/0.28)]"
                :class="destination.iconClass"
                aria-hidden="true"
              />

              <div class="relative z-[1] flex min-w-0 flex-1 flex-col">
                <div class="flex items-start justify-between gap-4">
                  <div
                    class="inline-flex items-center gap-2 font-mono text-[0.72rem] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors duration-200 group-hover/feature:text-[hsl(var(--tac-amber))]"
                  >
                    <span
                      class="inline-block h-0.5 w-2.5 bg-[hsl(var(--tac-amber))]"
                      aria-hidden="true"
                    ></span>
                    {{ destination.label }}
                  </div>
                </div>
                <p
                  class="mt-3 max-w-xl text-[0.8rem] leading-5 text-muted-foreground"
                >
                  {{ destination.description }}
                </p>
                <span
                  class="mt-auto pt-3 font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber)/0.72)] transition-colors group-hover/feature:text-[hsl(var(--tac-amber))]"
                >
                  OPEN
                  <ArrowRight
                    class="ml-1 inline size-3 transition-transform group-hover/feature:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </NuxtLink>
          </nav>
          </section>

          <section aria-labelledby="community-title">
            <h2
              id="community-title"
              class="mb-3 inline-flex items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
            >
              <span
                class="inline-block h-0.5 w-2.5 bg-[hsl(var(--tac-amber))]"
                aria-hidden="true"
              ></span>
              COMMUNITY
            </h2>

            <div
              class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] gap-4"
            >
              <HomeLatestNewsPreview hide-when-empty />
              <HomeLiveMatchesPreview />
              <HomeLatestResultsPreview />
            </div>
          </section>

          <section aria-labelledby="top-leaderboards-title">
            <h2
              id="top-leaderboards-title"
              class="mb-3 inline-flex items-center gap-2 font-sans text-[0.72rem] uppercase tracking-[0.24em] text-muted-foreground"
            >
              <span
                class="inline-block h-0.5 w-2.5 bg-[hsl(var(--tac-amber))]"
                aria-hidden="true"
              ></span>
              TOP 5 LEADERBOARDS
            </h2>

            <HomeTopPlayersPreview variant="all" />
          </section>

          <HomeLatestHighlights />
        </div>
      </div>
    </section>
  </main>
</template>
