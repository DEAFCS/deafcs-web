<script setup lang="ts">
import { useI18n } from "vue-i18n";
import DraftGames from "~/components/draft-games/DraftGames.vue";
import MyUpcoming from "~/components/MyUpcoming.vue";
import OpenLobbiesList from "~/components/matchmaking/OpenLobbiesList.vue";
import PlayMatchmaking from "~/components/play/PlayMatchmaking.vue";
import TournamentFeatureCard from "~/components/tournament/TournamentFeatureCard.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import {
  tacticalSectionDescriptionClasses,
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

// 5Stack's play page opens on one matchmaking hero (PlayMatchmaking): the
// mode picker, Find Match, the search and the match it makes, with the
// matchmaking settings behind its gear. DEAFCS keeps its own sections below
// it (open lobbies, draft games, upcoming matches, open tournaments).
const { t } = useI18n();

useHead({
  title: () => t("pages.play.title"),
});
</script>

<template>
  <PageTransition>
    <TacticalPageHeader inline-actions>
      <template #title>{{ $t("pages.play.title") }}</template>
    </TacticalPageHeader>
  </PageTransition>

  <PageTransition :delay="50" class="mt-6">
    <div>
      <PlayMatchmaking />
      <OpenLobbiesList class="mt-6" />
    </div>
  </PageTransition>

  <PageTransition :delay="75" class="mt-6">
    <DraftGames />
  </PageTransition>

  <PageTransition :delay="100" class="mt-6">
    <MyUpcoming></MyUpcoming>
  </PageTransition>

  <PageTransition
    v-if="openRegistrationTournaments?.length > 0"
    :delay="200"
    class="mt-6"
  >
    <div>
      <div :class="tacticalSectionLabelClasses">
        <span :class="tacticalSectionTickClasses"></span>
        {{ $t("pages.play.open_registration_tournaments.section_label") }}
      </div>
      <div :class="tacticalSectionDescriptionClasses">
        {{ $t("pages.play.open_registration_tournaments.description") }}
      </div>
      <div class="space-y-4">
        <TournamentFeatureCard
          v-for="tournament of openRegistrationTournaments"
          :key="tournament.id"
          :tournament="tournament"
          status-variant="registration"
        />
      </div>
    </div>
  </PageTransition>
</template>

<script lang="ts">
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, e_tournament_status_enum, order_by } from "~/generated/zeus";
import { simpleTournamentFields } from "~/graphql/simpleTournamentFields";
import { NOT_LEAGUE_TOURNAMENT } from "~/graphql/tournamentFilters";

export default {
  data() {
    return {
      openRegistrationTournaments: [],
    };
  },
  apollo: {
    $subscribe: {
      openRegistrationTournaments: {
        query: typedGql("subscription")({
          tournaments: [
            {
              where: {
                status: {
                  _eq: e_tournament_status_enum.RegistrationOpen,
                },
                _not: {
                  rosters: {
                    player_steam_id: {
                      _eq: $("steam_id", "bigint!"),
                    },
                  },
                },
                _and: [NOT_LEAGUE_TOURNAMENT],
              },
              order_by: [
                {},
                {
                  start: order_by.asc,
                },
              ],
            },
            simpleTournamentFields,
          ],
        }),
        variables: function () {
          return {
            steam_id: useAuthStore().me?.steam_id,
          };
        },
        result({ data }: { data: { tournaments: any[] } }) {
          this.openRegistrationTournaments = data.tournaments;
        },
        skip: function () {
          return !useAuthStore().me?.steam_id;
        },
      },
    },
  },
};
</script>
