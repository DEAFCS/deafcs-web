<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Activity, ArrowRight, BadgeCheck, Swords, UsersRound } from "lucide-vue-next";
import { Button } from "~/components/ui/button";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { e_player_roles_enum } from "~/generated/zeus";
import { useAuthStore } from "~/stores/AuthStore";
import { useMatchmakingStore } from "~/stores/MatchmakingStore";
import {
  formatCount,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

const props = defineProps<{ viewer: HomeViewer }>();

const authStore = useAuthStore();
const matchmakingStore = useMatchmakingStore();

const totalPlayers = ref<number | null>(null);
const completedMatches = ref<number | null>(null);
const onlinePlayers = computed<number | null>(() =>
  matchmakingStore.hasOnlinePlayerSnapshot
    ? matchmakingStore.onlinePlayerSteamIds.length
    : null,
);

// Signed in but not verified yet: Play Now still opens /play (its
// VerifyGate explains the rest), plus a direct way to get verified.
const needsVerification = computed(
  () =>
    !props.viewer.preview && authStore.me?.role === e_player_roles_enum.user,
);

// Same source as before (Typesense count of registered players). The
// server route is skipped in the local preview, which has no search key.
async function loadTotalPlayers() {
  if (props.viewer.preview) return;
  try {
    const response = await $fetch<{ found?: number }>("/api/players-search", {
      method: "POST",
      body: { registeredOnly: true, per_page: 0 },
    });
    totalPlayers.value =
      typeof response?.found === "number" ? response.found : null;
  } catch (error) {
    console.error("[home] failed to load the registered player count", error);
  }
}

// Finished DEAFCS matches (imported third-party matches are not counted,
// same rule as the /watch results).
async function loadCompletedMatches() {
  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        matches_aggregate: [
          { where: { status: { _eq: "Finished" }, source: { _eq: "5stack" } } },
          { aggregate: { count: true } },
        ],
      } as any),
      fetchPolicy: "network-only",
    });
    completedMatches.value =
      (data as any)?.matches_aggregate?.aggregate?.count ?? null;
  } catch (error) {
    console.error("[home] failed to load the completed match count", error);
  }
}

onMounted(() => {
  void loadTotalPlayers();
  void loadCompletedMatches();
});

const stats = computed(() => [
  {
    key: "players",
    label: "Registered players",
    value: formatCount(totalPlayers.value),
    icon: UsersRound,
    iconClass: "text-[hsl(var(--tac-amber))]",
  },
  {
    key: "matches",
    label: "Matches played",
    value: formatCount(completedMatches.value),
    icon: Swords,
    iconClass: "text-[hsl(var(--tac-amber))]",
  },
  {
    key: "online",
    label: "Online now",
    value: formatCount(onlinePlayers.value),
    icon: Activity,
    iconClass: "text-emerald-400",
  },
]);
</script>

<template>
  <section
    aria-labelledby="home-dashboard-title"
    class="homepage-entry relative isolate overflow-hidden rounded-xl border border-border/70 bg-card/45"
    data-testid="home-dashboard-hero"
  >
    <!-- Decorative artwork: pre-sized WebP (43 KB / 100 KB) served as a static
         file, instead of the 1.9 MB PNG resized by IPX on every request. -->
    <picture aria-hidden="true">
      <source
        type="image/webp"
        srcset="/img/home/deafcs-banner-800.webp 800w, /img/home/deafcs-banner-1400.webp 1400w"
        sizes="(min-width: 1024px) 62vw, 100vw"
      />
      <img
        src="/img/home/deafcs-banner-800.webp"
        alt=""
        width="1400"
        height="472"
        decoding="async"
        class="home-hero-art pointer-events-none absolute inset-y-0 right-0 -z-10 h-full w-full object-cover object-[72%_center] opacity-40 sm:opacity-55 lg:w-[68%] lg:object-right lg:opacity-90"
      />
    </picture>
    <div
      class="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,hsl(var(--background)/0.97)_0%,hsl(var(--background)/0.88)_55%,hsl(var(--background)/0.45)_100%)] lg:bg-[linear-gradient(90deg,hsl(var(--background)/0.97)_0%,hsl(var(--background)/0.9)_36%,hsl(var(--background)/0.35)_70%,transparent_100%)]"
      aria-hidden="true"
    ></div>
    <span
      class="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-[hsl(var(--tac-amber)/0.75)]"
      aria-hidden="true"
    ></span>
    <span
      class="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-[hsl(var(--tac-amber)/0.75)]"
      aria-hidden="true"
    ></span>

    <div class="flex flex-col gap-6 px-5 py-6 sm:px-8 sm:py-7 lg:px-10">
      <div class="max-w-xl">
        <p
          class="truncate font-mono text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--tac-amber))] sm:text-xs"
        >
          <template v-if="viewer.name">Welcome back, {{ viewer.name }}</template>
          <template v-else>Welcome back</template>
        </p>
        <h1
          id="home-dashboard-title"
          class="mt-3 text-[2rem] font-black uppercase leading-[0.92] tracking-[-0.04em] text-foreground sm:text-[2.6rem]"
        >
          Play. Compete.
          <span class="text-[hsl(var(--tac-amber))]">Together.</span>
        </h1>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          The home of competitive Counter-Strike for the deaf community.
        </p>

        <div class="mt-5 flex flex-wrap items-center gap-3">
          <Button as-child variant="tactical" size="lg" class="min-h-11">
            <NuxtLink to="/play" data-testid="home-play-now">
              Play Now
              <ArrowRight class="size-4" aria-hidden="true" />
            </NuxtLink>
          </Button>
          <NuxtLink
            v-if="needsVerification"
            to="/verify"
            class="inline-flex min-h-11 items-center gap-2 rounded-md border border-border/70 bg-background/50 px-4 text-sm font-semibold text-foreground backdrop-blur-sm transition-colors hover:border-[hsl(var(--tac-amber)/0.6)]"
          >
            <BadgeCheck class="size-4 text-[hsl(var(--tac-amber))]" aria-hidden="true" />
            Get verified to play
          </NuxtLink>
        </div>
      </div>

      <dl
        aria-label="DEAFCS community statistics"
        class="grid w-full max-w-2xl grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-background/55 backdrop-blur-md"
      >
        <div
          v-for="stat in stats"
          :key="stat.key"
          class="flex min-w-0 flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
          :data-testid="`home-stat-${stat.key}`"
        >
          <component
            :is="stat.icon"
            class="size-4 shrink-0 sm:size-5"
            :class="stat.iconClass"
            aria-hidden="true"
          />
          <div class="flex min-w-0 flex-col-reverse">
            <dt
              class="text-[0.58rem] font-bold uppercase leading-tight tracking-[0.08em] text-muted-foreground sm:truncate sm:text-[0.66rem] sm:tracking-[0.12em]"
            >
              {{ stat.label }}
            </dt>
            <dd
              class="font-mono text-lg font-black tabular-nums text-foreground sm:text-2xl"
            >
              {{ stat.value }}
            </dd>
          </div>
        </div>
      </dl>
    </div>
  </section>
</template>

<style scoped>
.home-hero-art {
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 22%, black 100%);
  mask-image: linear-gradient(to right, transparent 0%, black 22%, black 100%);
}
</style>
