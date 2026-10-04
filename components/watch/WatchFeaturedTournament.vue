<script setup lang="ts">
// /watch featured live tournament: the large TournamentFeatureCard, right
// under the match rail, only while a tournament is actually Live. Nothing
// at all renders otherwise (no heading, no placeholder). The bottom
// Tournaments section keeps Upcoming + Recent, so a live tournament is
// never shown twice.
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useApolloClient } from "@vue/apollo-composable";
import { e_tournament_status_enum, order_by } from "~/generated/zeus";
import { generateSubscription } from "~/graphql/graphqlGen";
import { NOT_LEAGUE_TOURNAMENT } from "~/graphql/tournamentFilters";
import { simpleTournamentFields } from "~/graphql/simpleTournamentFields";
import { seededSubscribe } from "~/utilities/seededSubscribe";
import TournamentFeatureCard from "~/components/tournament/TournamentFeatureCard.vue";

const { client } = useApolloClient();
const liveTournaments = ref<any[]>([]);
let liveSub: { unsubscribe: () => void } | undefined;

onMounted(() => {
  liveSub = seededSubscribe(
    client,
    {
      query: generateSubscription({
        tournaments: [
          {
            where: {
              status: { _eq: e_tournament_status_enum.Live },
              _and: [NOT_LEAGUE_TOURNAMENT],
            },
            order_by: [{ start: order_by.asc }],
          },
          simpleTournamentFields,
        ],
      } as any),
    },
    {
      next: ({ data }: any) => {
        liveTournaments.value = data?.tournaments ?? [];
      },
      error: (err: any) => console.error("[watch] live tournaments error", err),
    },
  );
});
onBeforeUnmount(() => liveSub?.unsubscribe());
</script>

<template>
  <section
    v-if="liveTournaments.length"
    class="mt-8 space-y-3"
    data-testid="watch-featured-tournament"
  >
    <TournamentFeatureCard
      v-for="tournament in liveTournaments"
      :key="tournament.id"
      :tournament="tournament"
      status-variant="live"
      :status-label="$t('common.live')"
    />
  </section>
</template>
