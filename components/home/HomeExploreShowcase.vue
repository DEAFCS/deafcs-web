<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  Activity,
  Award,
  ArrowRight,
  BarChart3,
  Calendar,
  Cast,
  Clapperboard,
  Cpu,
  HardDrive,
  History,
  Layers,
  ListOrdered,
  Medal,
  Radio,
  Server,
  Swords,
  TrendingUp,
  Trophy,
  Tv,
  Users,
  UsersRound,
  VolumeX,
} from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import HomeShowcaseMediaFrame from "~/components/home/HomeShowcaseMediaFrame.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

// Config-driven so future slides (Draft & Veto, 2D/3D visualization, Leagues)
// can be appended without touching the layout. mediaSrc/mediaPoster are left
// unset until approved assets land in public/img/home/showcase/ -- until then
// every slide falls back to the placeholder rendered by HomeShowcaseMediaFrame.
const showcaseSlides = [
  {
    key: "matchmaking",
    title: "Matchmaking",
    titleParts: ["MATCH", "MAKING"],
    description:
      "Queue solo or with your party and jump into balanced competitive matches.",
    features: [
      { icon: UsersRound, label: "Competitive 5v5" },
      { icon: Users, label: "Wingman 2v2" },
      { icon: Swords, label: "Duel 1v1" },
    ],
    cta: { label: "Join queue", to: "/play" },
    mediaIcon: Swords,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "player-stats",
    title: "Player stats",
    titleParts: ["PLAYER", "STATS"],
    description:
      "Track your performance, review recent matches, and see how you improve over time.",
    features: [
      { icon: BarChart3, label: "Detailed statistics" },
      { icon: TrendingUp, label: "Performance trends" },
      { icon: History, label: "Recent match history" },
    ],
    cta: { label: "Explore stats", to: "/players" },
    mediaIcon: BarChart3,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "live-coverage",
    title: "Live coverage",
    titleParts: ["LIVE", "COVERAGE"],
    description: "Follow DEAFCS through live streaming, highlights, and live results.",
    features: [
      { icon: Cast, label: "Live streaming" },
      { icon: Clapperboard, label: "Match highlights" },
      { icon: Radio, label: "Live score coverage" },
    ],
    cta: { label: "Watch live", to: "/watch" },
    mediaIcon: Tv,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "game-servers",
    title: "Game servers",
    titleParts: ["GAME", "SERVERS"],
    description:
      "DEAFCS game servers are built for fair, visual-first competition. Almost all in-game sounds are removed, so matches focus on visual information and game awareness instead of headset-based audio advantages.",
    features: [
      { icon: Cpu, label: "Automated match system" },
      { icon: VolumeX, label: "Sound-neutral setup" },
      { icon: HardDrive, label: "Quality game servers" },
    ],
    // No public server-status/destination page exists yet, so this slide
    // stays informational only -- no CTA button.
    cta: undefined,
    mediaIcon: Server,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "tournaments",
    title: "Tournaments",
    titleParts: ["TOUR", "NAMENTS"],
    description:
      "Join cups and events with structured brackets and competitive progression.",
    features: [
      { icon: Layers, label: "Bracket play" },
      { icon: Calendar, label: "Organized events" },
      { icon: TrendingUp, label: "Competitive progression" },
    ],
    cta: { label: "View tournaments", to: "/tournaments" },
    mediaIcon: Trophy,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "leaderboard",
    title: "Leaderboard",
    titleParts: ["LEADER", "BOARD"],
    description: "Climb the rankings, compare players, and follow the season race.",
    features: [
      { icon: ListOrdered, label: "Season ranking" },
      { icon: Activity, label: "ELO ladder" },
      { icon: Award, label: "Awards and more" },
    ],
    cta: { label: "View leaderboard", to: "/leaderboard" },
    mediaIcon: Medal,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
];

const ROTATION_MS = 5000;

const activeIndex = ref(0);
const activeSlide = computed(() => showcaseSlides[activeIndex.value]);
const prefersReducedMotion = ref(false);
let rotationTimer: ReturnType<typeof setInterval> | null = null;

function clearRotationTimer() {
  if (rotationTimer !== null) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

function startRotationTimer() {
  clearRotationTimer();
  if (prefersReducedMotion.value) return;
  rotationTimer = setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % showcaseSlides.length;
  }, ROTATION_MS);
}

function selectSlide(index: number) {
  activeIndex.value = index;
  startRotationTimer();
}

function pauseRotation() {
  clearRotationTimer();
}

function resumeRotation() {
  startRotationTimer();
}

onMounted(() => {
  prefersReducedMotion.value = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  startRotationTimer();
});

onBeforeUnmount(() => {
  clearRotationTimer();
});
</script>

<template>
  <section
    aria-labelledby="explore-showcase-title"
    class="relative isolate overflow-hidden rounded-xl border border-border/70 bg-card/45 px-5 py-6 sm:px-8 sm:py-7 lg:px-10"
    @mouseenter="pauseRotation"
    @mouseleave="resumeRotation"
  >
    <div :class="tacticalSectionLabelClasses">
      <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
      Everything in one place
    </div>

    <div class="mt-4 grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-5 lg:gap-10">
      <div class="min-h-[16rem] min-w-0 lg:col-span-2">
        <Transition
          name="showcase-fade"
          mode="out-in"
          enter-active-class="transition-[opacity,transform] duration-300 motion-reduce:!duration-0"
          leave-active-class="transition-[opacity,transform] duration-300 motion-reduce:!duration-0"
          enter-from-class="opacity-0 translate-x-2 motion-reduce:!translate-x-0"
          leave-to-class="opacity-0 -translate-x-2 motion-reduce:!translate-x-0"
        >
          <div :key="activeSlide.key" class="min-w-0">
            <h2
              id="explore-showcase-title"
              class="text-3xl font-black uppercase leading-[0.95] tracking-tight sm:text-4xl lg:text-5xl"
            >
              <span class="text-foreground">{{ activeSlide.titleParts[0] }}</span
              ><span class="text-[hsl(var(--tac-amber))]">{{
                activeSlide.titleParts[1]
              }}</span>
            </h2>
            <p class="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              {{ activeSlide.description }}
            </p>
            <ul class="mt-4 space-y-2.5">
              <li
                v-for="point in activeSlide.features"
                :key="point.label"
                class="flex items-center gap-3"
              >
                <component
                  :is="point.icon"
                  class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
                  aria-hidden="true"
                />
                <span class="text-sm text-foreground">{{ point.label }}</span>
              </li>
            </ul>
            <Button
              v-if="activeSlide.cta"
              as-child
              variant="tactical"
              size="lg"
              class="mt-5 min-h-11 w-full sm:w-auto"
            >
              <NuxtLink :to="activeSlide.cta.to">
                {{ activeSlide.cta.label }}
                <ArrowRight aria-hidden="true" />
              </NuxtLink>
            </Button>
          </div>
        </Transition>
      </div>

      <div class="min-w-0 lg:col-span-3">
        <Transition
          name="showcase-fade"
          mode="out-in"
          enter-active-class="transition-opacity duration-300 motion-reduce:!duration-0"
          leave-active-class="transition-opacity duration-300 motion-reduce:!duration-0"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
        >
          <HomeShowcaseMediaFrame
            :key="activeSlide.key"
            :media-type="activeSlide.mediaType"
            :media-src="activeSlide.mediaSrc"
            :media-poster="activeSlide.mediaPoster"
            :icon="activeSlide.mediaIcon"
            :title="activeSlide.title"
          />
        </Transition>
      </div>
    </div>

    <nav
      class="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start"
      aria-label="Showcase slides"
    >
      <button
        v-for="(slide, index) in showcaseSlides"
        :key="slide.key"
        type="button"
        class="h-1.5 rounded-full outline-none transition-[width,background-color] duration-200 focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        :class="
          index === activeIndex
            ? 'w-9 bg-[hsl(var(--tac-amber))]'
            : 'w-5 bg-muted-foreground/30 hover:bg-muted-foreground/50'
        "
        :aria-label="`Show ${slide.title} slide`"
        :aria-current="index === activeIndex ? 'true' : undefined"
        @click="selectSlide(index)"
      ></button>
    </nav>
  </section>
</template>
