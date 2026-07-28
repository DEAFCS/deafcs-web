<script setup lang="ts">
import { computed, ref } from "vue";
import { RotateCcw, Trophy } from "lucide-vue-next";
import { e_tournament_status_enum, order_by } from "~/generated/zeus";
import getGraphqlClient from "~/graphql/getGraphqlClient";
import { generateQuery } from "~/graphql/graphqlGen";
import { simpleTournamentFields } from "~/graphql/simpleTournamentFields";
import { excludeLeagueTournaments } from "~/graphql/tournamentFilters";
import TournamentFeatureCard from "~/components/tournament/TournamentFeatureCard.vue";
import { Card } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

type FeaturedTournament = {
  id: string;
  status: e_tournament_status_enum;
  [key: string]: unknown;
};

type FeaturedTournamentResponse = {
  liveTournament?: FeaturedTournament[];
  upcomingTournament?: FeaturedTournament[];
};

const liveTournament = ref<FeaturedTournament | null>(null);
const upcomingTournament = ref<FeaturedTournament | null>(null);
const loading = ref(true);
const requestError = ref(false);
let fetchGeneration = 0;

const selectedTournament = computed(
  () => liveTournament.value ?? upcomingTournament.value,
);

const statusLabel = computed(() => {
  switch (selectedTournament.value?.status) {
    case e_tournament_status_enum.Live:
      return "LIVE TOURNAMENT";
    case e_tournament_status_enum.RegistrationOpen:
      return "REGISTRATION OPEN";
    case e_tournament_status_enum.RegistrationClosed:
      return "REGISTRATION CLOSED";
    case e_tournament_status_enum.Setup:
      return "COMING SOON";
    default:
      return undefined;
  }
});

const statusVariant = computed(() =>
  selectedTournament.value?.status === e_tournament_status_enum.Live
    ? "live"
    : "registration",
);

async function fetchFeaturedTournament() {
  const generation = ++fetchGeneration;
  loading.value = true;
  requestError.value = false;

  try {
    const { data } = await getGraphqlClient().query({
      query: generateQuery({
        __alias: {
          liveTournament: {
            tournaments: [
              {
                where: excludeLeagueTournaments({
                  status: { _eq: e_tournament_status_enum.Live },
                }),
                order_by: [{ start: order_by.asc }],
                limit: 1,
              },
              {
                ...simpleTournamentFields,
                status: true,
              },
            ],
          },
          upcomingTournament: {
            tournaments: [
              {
                where: excludeLeagueTournaments({
                  status: {
                    _in: [
                      e_tournament_status_enum.RegistrationOpen,
                      e_tournament_status_enum.RegistrationClosed,
                      e_tournament_status_enum.Setup,
                    ],
                  },
                }),
                order_by: [{ start: order_by.asc }],
                limit: 1,
              },
              {
                ...simpleTournamentFields,
                status: true,
              },
            ],
          },
        },
      } as any),
      fetchPolicy: "network-only",
    });

    if (generation !== fetchGeneration) return;
    const response = data as FeaturedTournamentResponse;
    liveTournament.value = response.liveTournament?.[0] ?? null;
    upcomingTournament.value = response.upcomingTournament?.[0] ?? null;
  } catch (error) {
    if (generation !== fetchGeneration) return;
    console.error(
      "[home-featured-tournament] failed to load tournament",
      error,
    );
    liveTournament.value = null;
    upcomingTournament.value = null;
    requestError.value = true;
  } finally {
    if (generation === fetchGeneration) {
      loading.value = false;
    }
  }
}

void fetchFeaturedTournament();
</script>

<template>
  <section
    v-if="loading || requestError || selectedTournament"
    aria-labelledby="featured-tournament-title"
  >
    <div :class="tacticalSectionLabelClasses">
      <span :class="tacticalSectionTickClasses" aria-hidden="true"></span>
      Tournament spotlight
    </div>
    <h2
      id="featured-tournament-title"
      class="text-2xl font-bold tracking-tight sm:text-3xl"
    >
      Featured Tournament
    </h2>

    <Card
      v-if="loading"
      class="mt-6 overflow-hidden border-border/70 bg-card/40 shadow-none"
      aria-label="Loading featured tournament"
    >
      <Skeleton class="h-[220px] w-full rounded-none sm:h-[250px] lg:h-[290px]" />
    </Card>

    <Card
      v-else-if="requestError"
      class="mt-6 flex min-h-40 flex-col items-center justify-center border-dashed border-border/60 bg-card/30 px-4 py-6 text-center shadow-none"
      role="alert"
    >
      <Trophy class="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
      <p class="mt-3 font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
        Unable to load this section
      </p>
      <button
        type="button"
        class="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md px-4 text-xs font-semibold text-[hsl(var(--tac-amber))] outline-none transition-colors hover:bg-[hsl(var(--tac-amber)/0.08)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber)/0.55)]"
        @click="fetchFeaturedTournament"
      >
        <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
        Try again
      </button>
    </Card>

    <TournamentFeatureCard
      v-else-if="selectedTournament"
      class="mt-6"
      :tournament="selectedTournament"
      :status-label="statusLabel"
      :status-variant="statusVariant"
    />
  </section>
</template>
