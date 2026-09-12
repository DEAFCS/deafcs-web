<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  Activity,
  Award,
  ArrowRight,
  BarChart3,
  Gamepad2,
  History,
  Layers,
  ListOrdered,
  Map,
  Medal,
  Radio,
  Scale,
  Shuffle,
  Star,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import HomeShowcaseMediaFrame from "~/components/home/HomeShowcaseMediaFrame.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

// Config-driven so future slides (Draft & Veto, Live Streams, Highlights,
// 2D/3D visualization, Leagues, Awards) can be appended without touching the
// layout. mediaSrc/mediaPoster are left unset until approved assets land in
// public/img/home/showcase/ -- until then every slide falls back to the
// placeholder rendered by HomeShowcaseMediaFrame.
const showcaseSlides = [
  {
    key: "matchmaking",
    title: "Matchmaking",
    description:
      "Play competitive Counter-Strike with fair and balanced matchmaking.",
    features: [
      { icon: Gamepad2, label: "Competitive, Wingman and Duel" },
      { icon: Scale, label: "Balanced teams and ELO" },
      { icon: UsersRound, label: "Party support" },
      { icon: Shuffle, label: "Draft and open matches" },
    ],
    cta: { label: "Explore matchmaking", to: "/play" },
    mediaIcon: Swords,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "player-stats",
    title: "Player stats",
    description:
      "Track your performance, discover insights, and see how you improve over time.",
    features: [
      { icon: BarChart3, label: "Detailed statistics" },
      { icon: History, label: "Recent match history" },
      { icon: Activity, label: "Performance trends" },
      { icon: Map, label: "Map performance" },
    ],
    cta: { label: "Explore stats", to: "/players" },
    mediaIcon: BarChart3,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "tournaments",
    title: "Tournaments",
    description:
      "Join cups and tournaments, compete through stages, and fight for prizes and recognition.",
    features: [
      { icon: Layers, label: "Brackets and stages" },
      { icon: Award, label: "Prize distribution" },
      { icon: Radio, label: "Live match pages" },
      { icon: ListOrdered, label: "Results and standings" },
    ],
    cta: { label: "Explore tournaments", to: "/tournaments" },
    mediaIcon: Trophy,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
  {
    key: "leaderboard",
    title: "Leaderboard",
    description: "See the top players, compare rankings, and follow ELO progress.",
    features: [
      { icon: ListOrdered, label: "Season rankings" },
      { icon: Activity, label: "ELO ladder" },
      { icon: Star, label: "Top performers" },
      { icon: Award, label: "Awards and more" },
    ],
    cta: { label: "View leaderboard", to: "/leaderboard" },
    mediaIcon: Medal,
    mediaType: "placeholder" as const,
    mediaSrc: undefined,
    mediaPoster: undefined,
  },
];

const ROTATION_MS = 3000;

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
    class="relative isolate overflow-hidden rounded-xl border border-border/70 bg-card/45 px-5 py-10 sm:px-8 sm:py-12 lg:px-10"
    @mouseenter="pauseRotation"
    @mouseleave="resumeRotation"
  >
    <div :class="tacticalSectionLabelClasses">
      <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
      Everything in one place
    </div>
    <h2
      id="explore-showcase-title"
      class="text-2xl font-bold tracking-tight sm:text-3xl"
    >
      Explore DEAFCS
    </h2>

    <div class="mt-8 grid min-w-0 grid-cols-1 items-center gap-8 lg:grid-cols-5 lg:gap-10">
      <div class="min-h-[19rem] min-w-0 lg:col-span-2">
        <Transition
          name="showcase-fade"
          mode="out-in"
          enter-active-class="transition-[opacity,transform] duration-300 motion-reduce:!duration-0"
          leave-active-class="transition-[opacity,transform] duration-300 motion-reduce:!duration-0"
          enter-from-class="opacity-0 translate-x-2 motion-reduce:!translate-x-0"
          leave-to-class="opacity-0 -translate-x-2 motion-reduce:!translate-x-0"
        >
          <div :key="activeSlide.key" class="min-w-0">
            <h3 class="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              {{ activeSlide.title }}
            </h3>
            <p class="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              {{ activeSlide.description }}
            </p>
            <ul class="mt-5 space-y-2.5">
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
              class="mt-6 min-h-11 w-full sm:w-auto"
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
      class="mt-8 flex items-center justify-center gap-2 lg:justify-start"
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
