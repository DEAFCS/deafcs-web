<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  Activity,
  ArrowRight,
  Medal,
  Play,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-vue-next";
import { useAuthStore } from "~/stores/AuthStore";
import { useMatchmakingStore } from "~/stores/MatchmakingStore";
import HomeLatestHighlights from "~/components/home/HomeLatestHighlights.vue";
import HomeLatestNewsPreview from "~/components/home/HomeLatestNewsPreview.vue";
import HomeLatestResultsPreview from "~/components/home/HomeLatestResultsPreview.vue";
import HomeLiveMatchesPreview from "~/components/home/HomeLiveMatchesPreview.vue";
import HomeTopPlayersPreview from "~/components/home/HomeTopPlayersPreview.vue";
import { Button } from "~/components/ui/button";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import {
  tacticalCardHeadingClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

type PreviewPlayer = {
  steam_id: string;
  name: string;
};

const props = defineProps<{
  previewPlayer?: PreviewPlayer;
}>();

const destinations = [
  {
    label: "PLAY",
    to: "/play",
    icon: Play,
    iconClass: "bottom-8 right-4 size-20",
    description:
      "Join matchmaking, climb the rankings, create or join draft matches, and keep track of your schedule.",
    comingSoon: false,
    comingSoonLabel: "",
  },
  {
    label: "TOURNAMENTS",
    to: "/tournaments",
    icon: Medal,
    iconClass: "bottom-8 right-4 size-20",
    description:
      "Join cups and tournaments, defeat the competition, and earn recognition and awards.",
    comingSoon: false,
    comingSoonLabel: "",
  },
  {
    label: "LEAGUE",
    to: "/league",
    icon: Trophy,
    iconClass: "bottom-8 right-4 size-20",
    description:
      "Compete across divisions, rise through the standings, and fight for the championship.",
    comingSoon: true,
    comingSoonLabel: "Coming Q1–Q2 2027",
  },
] as const;

// Shared by every feature card. Interactive-only classes (hover/active/focus
// affordances) are kept separate so the League "coming soon" card can render
// without them -- same base shape, but nothing that implies it's clickable.
const featureCardBaseClasses =
  "relative isolate flex min-h-52 flex-col overflow-hidden rounded-lg border border-border px-5 pb-5 pt-4 text-left text-foreground outline-none [background:linear-gradient(135deg,hsl(var(--card)/0.7)_0%,hsl(var(--card)/0.35)_60%,hsl(var(--tac-amber)/0.05)_100%)]";
const featureCardInteractiveClasses =
  "group/feature cursor-pointer transition-[border-color,background,box-shadow,transform] duration-200 hover:scale-[1.01] hover:border-[hsl(var(--tac-amber)/0.55)] hover:[background:linear-gradient(135deg,hsl(var(--card)/0.8)_0%,hsl(var(--card)/0.45)_55%,hsl(var(--tac-amber)/0.10)_100%)] hover:shadow-[0_0_24px_hsl(var(--tac-amber)/0.12)] active:scale-[0.995] focus-visible:border-[hsl(var(--tac-amber))] focus-visible:shadow-[0_0_0_2px_hsl(var(--tac-amber)/0.35)]";

const authStore = useAuthStore();
const matchmakingStore = useMatchmakingStore();
const player = computed(() => props.previewPlayer ?? authStore.me);
const steamId = computed(() => String(player.value?.steam_id ?? ""));
const playerName = computed(() => player.value?.name?.trim() || "");
const totalPlayers = ref<number | null>(null);
const onlinePlayers = computed<number | null>(() =>
  matchmakingStore.hasOnlinePlayerSnapshot
    ? matchmakingStore.onlinePlayerSteamIds.length
    : null,
);
const profilePath = computed(() => ({
  name: "players-id",
  params: { id: steamId.value },
}));

function formatStat(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat().format(value);
}

async function loadTotalPlayers() {
  if (props.previewPlayer) {
    return;
  }

  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        players_aggregate: [
          { where: { last_sign_in_at: { _is_null: false } } },
          { aggregate: { count: true } },
        ],
      }),
      fetchPolicy: "network-only",
    });
    const count = data?.players_aggregate?.aggregate?.count;
    totalPlayers.value = typeof count === "number" ? count : null;
  } catch (error) {
    console.error("Failed to load homepage player count", error);
  }
}

onMounted(() => {
  void loadTotalPlayers();
});
</script>

<template>
  <main class="min-w-0 space-y-8 pb-12">
    <section
      aria-labelledby="authenticated-home-hero-title"
      class="homepage-entry relative isolate min-h-[23rem] overflow-hidden rounded-xl border border-border/70 bg-card/45 sm:min-h-[24rem]"
    >
      <NuxtImg
        src="/img/home/deafcs-banner.png"
        width="2160"
        height="728"
        sizes="100vw lg:78vw"
        alt=""
        class="home-auth-hero__art pointer-events-none absolute inset-y-0 right-0 h-full w-full object-cover object-[74%_center] opacity-50 sm:object-[78%_center] sm:opacity-65 lg:w-[78%] lg:object-right lg:opacity-95"
        aria-hidden="true"
      />
      <div
        class="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--background)/0.98)_0%,hsl(var(--background)/0.9)_58%,hsl(var(--background)/0.4)_100%)] lg:bg-[linear-gradient(90deg,hsl(var(--background)/0.98)_0%,hsl(var(--background)/0.94)_38%,hsl(var(--background)/0.45)_66%,transparent_100%)]"
        aria-hidden="true"
      ></div>
      <div
        class="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(135deg,transparent_0,transparent_15px,hsl(var(--muted-foreground)/0.035)_15px,hsl(var(--muted-foreground)/0.035)_16px)]"
        aria-hidden="true"
      ></div>
      <span
        class="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l-2 border-t-2 border-[hsl(var(--tac-amber)/0.78)]"
        aria-hidden="true"
      ></span>
      <span
        class="pointer-events-none absolute bottom-3 right-3 h-5 w-5 border-b-2 border-r-2 border-[hsl(var(--tac-amber)/0.78)]"
        aria-hidden="true"
      ></span>

      <div class="relative z-10 flex min-h-[23rem] max-w-2xl flex-col px-5 py-6 sm:min-h-[24rem] sm:px-8 sm:py-7 lg:px-10">
        <div class="flex max-w-lg items-center justify-between gap-4">
          <p
            class="min-w-0 truncate font-mono text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))] sm:text-xs"
          >
            <template v-if="playerName">Welcome back, {{ playerName }}</template>
            <template v-else>Welcome back</template>
          </p>
          <Button
            as-child
            variant="outline"
            class="h-9 shrink-0 gap-2 border-border/80 bg-background/55 px-3 backdrop-blur transition-[border-color,color,background-color,transform] hover:border-[hsl(var(--tac-amber)/0.55)] hover:bg-[hsl(var(--tac-amber)/0.08)] hover:text-[hsl(var(--tac-amber))] active:scale-[0.98]"
          >
            <NuxtLink :to="profilePath" aria-label="View my profile">
              <UserRound class="size-4" aria-hidden="true" />
              <span class="hidden sm:inline">MY STATS</span>
            </NuxtLink>
          </Button>
        </div>

        <div class="mt-7">
          <h1
            id="authenticated-home-hero-title"
            class="text-[2.35rem] font-black uppercase leading-[0.9] tracking-[-0.045em] text-foreground sm:text-5xl lg:text-[3.55rem]"
          >
            Play.<br />
            Compete.<br />
            <span class="text-[hsl(var(--tac-amber))]">Together.</span>
          </h1>
          <p class="mb-4 mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
            The home of competitive Counter-Strike for the deaf community.
          </p>
        </div>

        <dl
          aria-label="DEAFCS community statistics"
          class="mt-auto grid w-full max-w-lg grid-cols-2 divide-x divide-border/70 overflow-hidden rounded-md border border-border/70 bg-background/60 shadow-[0_10px_30px_hsl(0_0%_0%/0.16)] backdrop-blur-md"
        >
          <div class="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4">
            <UsersRound
              class="size-5 shrink-0 text-[hsl(var(--tac-amber))]"
              aria-hidden="true"
            />
            <div class="min-w-0">
              <dd class="font-mono text-xl font-black tabular-nums text-foreground sm:text-2xl">
                {{ formatStat(totalPlayers) }}
              </dd>
              <dt class="truncate text-[0.62rem] font-bold uppercase tracking-[0.13em] text-muted-foreground sm:text-[0.68rem]">
                Total Players
              </dt>
            </div>
          </div>
          <div class="flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4">
            <Activity class="size-5 shrink-0 text-emerald-400" aria-hidden="true" />
            <div class="min-w-0">
              <dd class="font-mono text-xl font-black tabular-nums text-foreground sm:text-2xl">
                {{ formatStat(onlinePlayers) }}
              </dd>
              <dt class="truncate text-[0.62rem] font-bold uppercase tracking-[0.13em] text-muted-foreground sm:text-[0.68rem]">
                Online Now
              </dt>
            </div>
          </div>
        </dl>
      </div>
    </section>

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
            <template
              v-for="(destination, index) in destinations"
              :key="destination.to"
            >
              <NuxtLink
                v-if="!destination.comingSoon"
                :to="destination.to"
                :class="[
                  featureCardBaseClasses,
                  featureCardInteractiveClasses,
                  { 'sm:col-span-2 lg:col-span-1': index === 2 },
                ]"
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
                      :class="[
                        'inline-flex items-center gap-2',
                        tacticalCardHeadingClasses,
                        'transition-colors duration-200 group-hover/feature:text-[hsl(var(--tac-amber))]',
                      ]"
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

              <div
                v-else
                aria-disabled="true"
                :class="[
                  featureCardBaseClasses,
                  { 'sm:col-span-2 lg:col-span-1': index === 2 },
                ]"
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
                      :class="[
                        'inline-flex items-center gap-2',
                        tacticalCardHeadingClasses,
                      ]"
                    >
                      <span
                        class="inline-block h-0.5 w-2.5 bg-[hsl(var(--tac-amber))]"
                        aria-hidden="true"
                      ></span>
                      {{ destination.label }}
                    </div>
                    <span
                      class="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted-foreground"
                    >
                      Coming Soon
                    </span>
                  </div>
                  <p
                    class="mt-3 max-w-xl text-[0.8rem] leading-5 text-muted-foreground"
                  >
                    {{ destination.description }}
                  </p>
                  <span
                    class="mt-auto pt-3 font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground"
                  >
                    {{ destination.comingSoonLabel }}
                  </span>
                </div>
              </div>
            </template>
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
              :class="tacticalSectionLabelClasses"
            >
              <span
                :class="tacticalSectionTickClasses"
                aria-hidden="true"
              ></span>
              Top 5 Leaderboards
            </h2>

            <HomeTopPlayersPreview variant="all" />
          </section>

          <HomeLatestHighlights />
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.home-auth-hero__art {
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 20%, black 100%);
  mask-image: linear-gradient(to right, transparent 0%, black 20%, black 100%);
}
</style>
