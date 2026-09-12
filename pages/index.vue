<script setup lang="ts">
import { computed } from "vue";
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  Gamepad2,
  ShieldCheck,
  Trophy,
  UserRoundCheck,
} from "lucide-vue-next";
import { useAuthStore } from "~/stores/AuthStore";
import LoadingScreen from "~/components/LoadingScreen.vue";
import HomeLatestNewsPreview from "~/components/home/HomeLatestNewsPreview.vue";
import HomeLatestResultsPreview from "~/components/home/HomeLatestResultsPreview.vue";
import HomeTopPlayersPreview from "~/components/home/HomeTopPlayersPreview.vue";
import HomeLatestHighlights from "~/components/home/HomeLatestHighlights.vue";
import HomeFeaturedTournament from "~/components/home/HomeFeaturedTournament.vue";
import HomeExploreShowcase from "~/components/home/HomeExploreShowcase.vue";
import HomePlayerOverview from "~/components/home/HomePlayerOverview.vue";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { loginLinks } from "~/utilities/loginLinks";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";
import {
  HOMEPAGE_DESCRIPTION,
  HOMEPAGE_STRUCTURED_DATA,
  HOMEPAGE_TITLE,
  HOMEPAGE_URL,
  SITE_LOGO_URL,
  SITE_NAME,
} from "~/utilities/seo";

definePageMeta({
  layout: "default",
  pageTransition: { name: "page", mode: "out-in" },
});

useSeoMeta({
  title: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
  ogTitle: HOMEPAGE_TITLE,
  ogDescription: HOMEPAGE_DESCRIPTION,
  ogSiteName: SITE_NAME,
  ogUrl: HOMEPAGE_URL,
  ogImage: SITE_LOGO_URL,
  ogImageAlt: SITE_NAME,
  twitterCard: "summary",
  twitterTitle: HOMEPAGE_TITLE,
  twitterDescription: HOMEPAGE_DESCRIPTION,
  twitterImage: SITE_LOGO_URL,
});

useHead({
  titleTemplate: null,
  link: [{ rel: "canonical", href: HOMEPAGE_URL }],
  script: [
    {
      type: "application/ld+json",
      innerHTML: JSON.stringify(HOMEPAGE_STRUCTURED_DATA),
    },
  ],
});

const authStore = useAuthStore();
const route = useRoute();

const isLoggedIn = computed(
  () => authStore.hasCheckedSession && !!authStore.me?.steam_id,
);

const previewHomeState = computed(() => {
  if (!import.meta.dev || isLoggedIn.value) return null;
  const value = Array.isArray(route.query.previewHome)
    ? route.query.previewHome[0]
    : route.query.previewHome;
  return value === "logged-in" || value === "logged-out" ? value : null;
});

const previewPlayer = {
  name: "TricoN",
  steam_id: "76561198029293543",
} as const;

const showLoggedInHome = computed(
  () => isLoggedIn.value || previewHomeState.value === "logged-in",
);

const howItWorksSteps = [
  {
    title: "Sign in with Steam",
    description: "Connect the Steam account you use to play Counter-Strike.",
    icon: UserRoundCheck,
  },
  {
    title: "Complete your player profile",
    description: "Set up your DEAFCS identity and community profile.",
    icon: ShieldCheck,
  },
  {
    title: "Get verified",
    description:
      "Complete the required verification so you can join DEAFCS matchmaking and competitions.",
    icon: BadgeCheck,
  },
  {
    title: "Choose your mode",
    description: "Choose Competitive, Wingman, or Duel on the Play page.",
    icon: Gamepad2,
  },
  {
    title: "Play and climb",
    description:
      "Play matches, climb the DEAFCS leaderboard, and compete to win tournaments and leagues.",
    icon: Trophy,
  },
];
</script>

<template>
  <LoadingScreen
    v-if="!authStore.hasCheckedSession && !previewHomeState"
    class="min-h-[60vh]"
  />

  <HomePlayerOverview
    v-else-if="showLoggedInHome"
    :preview-player="
      !isLoggedIn && previewHomeState === 'logged-in'
        ? previewPlayer
        : undefined
    "
  />

  <main v-else class="min-w-0 space-y-16 pb-12 sm:space-y-20">
    <section
      aria-labelledby="home-hero-title"
      class="homepage-entry relative isolate overflow-hidden rounded-xl border border-border/70 bg-card/45 px-5 py-14 sm:px-10 sm:py-20 lg:px-16"
    >
      <div
        class="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_14px,hsl(var(--muted-foreground)/0.025)_14px,hsl(var(--muted-foreground)/0.025)_15px)]"
        aria-hidden="true"
      ></div>
      <div
        class="pointer-events-none absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-[hsl(var(--tac-amber)/0.08)] blur-3xl"
        aria-hidden="true"
      ></div>
      <span
        class="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-[hsl(var(--tac-amber)/0.75)]"
        aria-hidden="true"
      ></span>
      <span
        class="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-[hsl(var(--tac-amber)/0.75)]"
        aria-hidden="true"
      ></span>

      <div class="max-w-3xl">
        <div
          class="mb-5 inline-flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--tac-amber))]"
        >
          <span
            class="inline-block h-[2px] w-3 bg-[hsl(var(--tac-amber))]"
            aria-hidden="true"
          ></span>
          Competitive Counter-Strike community
        </div>
        <h1
          id="home-hero-title"
          class="text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl"
        >
          Welcome to DEAFCS
        </h1>
        <p
          class="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8"
        >
          DEAFCS is the home of competitive Counter-Strike for the deaf and
          hard-of-hearing community.
        </p>
        <div class="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            as-child
            variant="tactical"
            size="lg"
            class="min-h-11 w-full sm:w-auto"
          >
            <a :href="loginLinks.steam" aria-label="Sign in to DEAFCS with Steam">
              Sign in with Steam
              <ArrowRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>

    <div
      class="homepage-entry homepage-entry--delay-100 space-y-16 sm:space-y-20"
    >
      <HomeExploreShowcase />

      <section aria-labelledby="how-it-works-title">
        <div :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
          Getting started
        </div>
      <h2
        id="how-it-works-title"
        class="text-2xl font-bold tracking-tight sm:text-3xl"
      >
        How It Works
      </h2>
      <div
        class="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:flex lg:flex-row lg:items-stretch lg:gap-3"
      >
        <template v-for="(step, index) in howItWorksSteps" :key="step.title">
          <Card
            class="relative min-w-0 overflow-hidden border-border/70 bg-card/45 p-5 shadow-none lg:flex-1 lg:p-4"
          >
            <div class="flex items-center gap-2">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--tac-amber)/0.4)] bg-[hsl(var(--tac-amber)/0.1)] font-mono text-xs font-bold tabular-nums text-[hsl(var(--tac-amber))] shadow-[0_0_10px_-2px_hsl(var(--tac-amber)/0.5)]"
                aria-hidden="true"
              >
                {{ String(index + 1).padStart(2, "0") }}
              </span>
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--tac-amber)/0.3)] bg-[hsl(var(--tac-amber)/0.08)] text-[hsl(var(--tac-amber))]"
              >
                <component :is="step.icon" class="h-4 w-4" aria-hidden="true" />
              </div>
            </div>
            <h3 class="mt-3 font-semibold text-foreground">{{ step.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">
              {{ step.description }}
            </p>
          </Card>
          <div
            v-if="index < howItWorksSteps.length - 1"
            class="hidden shrink-0 items-center justify-center text-muted-foreground/30 lg:flex"
            aria-hidden="true"
          >
            <ChevronRight class="h-5 w-5" />
          </div>
        </template>
      </div>
      </section>
    </div>

    <div
      class="homepage-entry homepage-entry--delay-200 space-y-16 sm:space-y-20"
    >
      <HomeFeaturedTournament />

      <section aria-labelledby="community-title">
        <div :class="tacticalSectionLabelClasses">
          <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
          Community activity
        </div>
      <h2
        id="community-title"
        class="text-2xl font-bold tracking-tight sm:text-3xl"
      >
        The DEAFCS Community
      </h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Live community data will be connected in the next homepage tasks.
      </p>
      <div class="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <HomeLatestNewsPreview />
        <HomeLatestResultsPreview />
        <HomeTopPlayersPreview />
      </div>
      </section>

      <HomeLatestHighlights />
    </div>
  </main>
</template>

<style>
@keyframes homepage-entry {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes homepage-entry-reduced {
  from,
  to {
    opacity: 1;
    transform: none;
  }
}

.homepage-entry {
  animation: homepage-entry 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.homepage-entry--delay-100 {
  animation-delay: 100ms;
}

.homepage-entry--delay-200 {
  animation-delay: 200ms;
}

@media (prefers-reduced-motion: reduce) {
  .homepage-entry {
    animation-name: homepage-entry-reduced;
    animation-duration: 1ms;
    animation-delay: 0ms;
  }
}
</style>
