<script setup lang="ts">
import { computed } from "vue";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Gamepad2,
  Medal,
  MessageSquareText,
  Newspaper,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRoundCheck,
  UsersRound,
  VolumeX,
} from "lucide-vue-next";
import { useAuthStore } from "~/stores/AuthStore";
import LoadingScreen from "~/components/LoadingScreen.vue";
import HomeLatestNewsPreview from "~/components/home/HomeLatestNewsPreview.vue";
import HomeLatestResultsPreview from "~/components/home/HomeLatestResultsPreview.vue";
import HomeTopPlayersPreview from "~/components/home/HomeTopPlayersPreview.vue";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { loginLinks } from "~/utilities/loginLinks";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

definePageMeta({
  layout: "default",
});

const authStore = useAuthStore();

if (!authStore.hasCheckedSession) {
  void authStore.getMe();
}

const isLoggedIn = computed(
  () => authStore.hasCheckedSession && !!authStore.me?.steam_id,
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
    description: "Play matches and climb the DEAFCS leaderboard.",
    icon: Trophy,
  },
];

const communityPreviews = [
  { title: "Live Match", icon: Radio },
  { title: "Latest Results", icon: CalendarDays },
  { title: "Top Players", icon: Medal },
  { title: "Latest News", icon: Newspaper },
  { title: "Latest Highlights", icon: Play },
];

const whyDeafcsFeatures = [
  {
    title: "Built for our community",
    description: "Built for deaf and hard-of-hearing Counter-Strike players.",
    icon: UsersRound,
  },
  {
    title: "Sound-neutral game servers",
    description:
      "DEAFCS servers remove almost all in-game sounds so matches are focused on visual information and game awareness instead of headset-based audio advantages.",
    icon: VolumeX,
  },
  {
    title: "Accessible communication",
    description:
      "Tournament experiences designed around accessible communication.",
    icon: MessageSquareText,
  },
  {
    title: "Ways to compete",
    description: "Matchmaking, cups, leagues, and community events.",
    icon: Trophy,
  },
  {
    title: "Your competitive home",
    description: "Profiles, rankings, results, news, and highlights in one place.",
    icon: Sparkles,
  },
];
</script>

<template>
  <LoadingScreen
    v-if="!authStore.hasCheckedSession"
    class="min-h-[60vh]"
  />

  <section
    v-else-if="isLoggedIn"
    class="relative flex min-h-[60vh] items-center justify-center overflow-hidden rounded-lg border border-border/70 bg-card/40 px-6 py-16 text-center [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_12px,hsl(var(--muted-foreground)/0.025)_12px,hsl(var(--muted-foreground)/0.025)_13px)]"
  >
    <div
      class="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-[hsl(var(--tac-amber)/0.7)]"
      aria-hidden="true"
    ></div>
    <div
      class="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-[hsl(var(--tac-amber)/0.7)]"
      aria-hidden="true"
    ></div>

    <div class="relative max-w-xl">
      <div
        class="mb-4 inline-flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--tac-amber))]"
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--tac-amber))]"
          aria-hidden="true"
        ></span>
        Temporary homepage shell
      </div>

      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
        Logged-in dashboard placeholder
      </h1>
      <p class="mt-3 text-sm leading-6 text-muted-foreground">
        Your authenticated DEAFCS homepage will be built here in the next
        implementation steps.
      </p>
    </div>
  </section>

  <main v-else class="min-w-0 space-y-16 pb-12 sm:space-y-20">
    <section
      aria-labelledby="home-hero-title"
      class="relative isolate overflow-hidden rounded-xl border border-border/70 bg-card/45 px-5 py-14 sm:px-10 sm:py-20 lg:px-16"
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
          <Button
            as-child
            variant="outline"
            size="lg"
            class="min-h-11 w-full border-border/80 bg-background/40 hover:border-[hsl(var(--tac-amber)/0.5)] sm:w-auto"
          >
            <a
              :href="loginLinks.discordInvite"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Join the DEAFCS Discord community"
            >
              Join Discord
              <ArrowRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>

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
      <div class="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card
          v-for="(step, index) in howItWorksSteps"
          :key="step.title"
          class="relative min-w-0 overflow-hidden border-border/70 bg-card/45 p-5 shadow-none lg:col-span-2"
          :class="{
            'lg:col-start-2': index === 3,
            'lg:col-start-4': index === 4,
          }"
        >
          <span
            class="absolute right-4 top-3 font-mono text-3xl font-black tabular-nums text-muted-foreground/10"
            aria-hidden="true"
          >
            {{ String(index + 1).padStart(2, "0") }}
          </span>
          <div
            class="flex h-9 w-9 items-center justify-center rounded-md border border-[hsl(var(--tac-amber)/0.3)] bg-[hsl(var(--tac-amber)/0.08)] text-[hsl(var(--tac-amber))]"
          >
            <component :is="step.icon" class="h-4 w-4" aria-hidden="true" />
          </div>
          <h3 class="mt-5 font-semibold text-foreground">{{ step.title }}</h3>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            {{ step.description }}
          </p>
        </Card>
      </div>
    </section>

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
        <template v-for="preview in communityPreviews" :key="preview.title">
          <HomeLatestNewsPreview v-if="preview.title === 'Latest News'" />
          <HomeLatestResultsPreview
            v-else-if="preview.title === 'Latest Results'"
          />
          <HomeTopPlayersPreview v-else-if="preview.title === 'Top Players'" />
          <Card
            v-else
            class="min-w-0 overflow-hidden border-border/70 bg-card/40 p-5 shadow-none"
          >
            <div class="flex items-center gap-3">
              <component
                :is="preview.icon"
                class="h-4 w-4 shrink-0 text-[hsl(var(--tac-amber))]"
                aria-hidden="true"
              />
              <h3
                class="font-mono text-xs font-bold uppercase tracking-[0.16em] text-foreground"
              >
                {{ preview.title }}
              </h3>
            </div>
            <div
              class="mt-5 space-y-3"
              role="status"
              :aria-label="`${preview.title} data will be added in a later task`"
            >
              <div class="h-3 w-3/4 animate-pulse rounded bg-muted/70"></div>
              <div class="h-3 w-full animate-pulse rounded bg-muted/50"></div>
              <div class="h-3 w-2/3 animate-pulse rounded bg-muted/40"></div>
              <p class="pt-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-muted-foreground/70">
                Data preview coming next
              </p>
            </div>
          </Card>
        </template>
      </div>
    </section>

    <section aria-labelledby="why-deafcs-title">
      <div :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
        Built with purpose
      </div>
      <h2
        id="why-deafcs-title"
        class="text-2xl font-bold tracking-tight sm:text-3xl"
      >
        Why DEAFCS
      </h2>
      <div class="mt-6 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Card
          v-for="(feature, index) in whyDeafcsFeatures"
          :key="feature.title"
          class="min-w-0 border-border/60 bg-card/35 p-5 shadow-none lg:col-span-2"
          :class="{
            'lg:col-start-2': index === 3,
            'lg:col-start-4': index === 4,
          }"
        >
          <component
            :is="feature.icon"
            class="h-5 w-5 text-[hsl(var(--tac-amber))]"
            aria-hidden="true"
          />
          <h3 class="mt-4 font-semibold text-foreground">{{ feature.title }}</h3>
          <p class="mt-2 text-sm leading-6 text-muted-foreground">
            {{ feature.description }}
          </p>
        </Card>
      </div>
    </section>
  </main>
</template>
