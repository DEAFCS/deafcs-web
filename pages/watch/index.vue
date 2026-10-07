<script setup lang="ts">
const featuredTournamentIds = ref<string[]>([]);
import { useI18n } from "vue-i18n";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import WatchColdStart from "~/components/watch/WatchColdStart.vue";
import WatchMatchRail from "~/components/watch/WatchMatchRail.vue";
import WatchHighlights from "~/components/watch/WatchHighlights.vue";
import WatchTournaments from "~/components/watch/WatchTournaments.vue";
import WatchFeaturedTournament from "~/components/watch/WatchFeaturedTournament.vue";

// /watch follows the 5Stack Watch structure (https://5stack.gg/watch):
// a compact match rail with All / Live / Upcoming / Results, a featured
// live tournament when one is running, then the highlights, then upcoming
// and recent tournaments at the bottom -- in DEAFCS's own styling.
// It is discovery only: cards say a match has streams; the streams
// themselves (manual casts, the game streamer, players' Twitch POVs) play
// on the match page.
const { t } = useI18n();

useHead({
  title: () => t("pages.watch.title"),
});
</script>

<template>
  <h1 class="sr-only">{{ $t("pages.watch.title") }}</h1>

  <PageTransition>
    <WatchMatchRail :ghost="feedIsEmpty" />
  </PageTransition>

  <PageTransition v-if="feedIsEmpty" :delay="75" class="mt-8">
    <WatchColdStart />
  </PageTransition>

  <!-- Only while a tournament is live; renders nothing (and no spacing)
       otherwise, so the component owns its own top margin. -->
  <PageTransition v-if="!feedIsEmpty" :delay="75">
    <WatchFeaturedTournament @ids="featuredTournamentIds = $event" />
  </PageTransition>

  <PageTransition :delay="100" class="mt-8">
    <WatchHighlights :ghost="feedIsEmpty" />
  </PageTransition>

  <PageTransition v-if="!feedIsEmpty" :delay="150" class="mt-8">
    <WatchTournaments :exclude-ids="featuredTournamentIds" />
  </PageTransition>
</template>

<script lang="ts">
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { NOT_LEAGUE_TOURNAMENT } from "~/graphql/tournamentFilters";

export default {
  data() {
    return {
      // null until the first result lands -- the cold start must not flash
      // in front of a feed that is about to render.
      matchesCount: null as number | null,
      tournamentsCount: null as number | null,
    };
  },
  apollo: {
    $subscribe: {
      // A fresh install has no matches or tournaments at all; these two
      // counts detect that so the page can show its cold start. They're
      // subscriptions so it clears itself the moment the first match lands.
      matchesCount: {
        query: typedGql("subscription")({
          matches_aggregate: [{}, { aggregate: { count: true } }],
        }),
        result({ data }: any) {
          this.matchesCount = data?.matches_aggregate?.aggregate?.count ?? 0;
        },
        error(error: any) {
          console.error("[watch] matches count subscription error:", error);
        },
      },
      tournamentsCount: {
        query: typedGql("subscription")({
          tournaments_aggregate: [
            { where: { _and: [NOT_LEAGUE_TOURNAMENT] } },
            { aggregate: { count: true } },
          ],
        }),
        result({ data }: any) {
          this.tournamentsCount = data?.tournaments_aggregate?.aggregate?.count ?? 0;
        },
        error(error: any) {
          console.error("[watch] tournaments count subscription error:", error);
        },
      },
    },
  },
  computed: {
    feedIsEmpty(): boolean {
      return this.matchesCount === 0 && this.tournamentsCount === 0;
    },
  },
};
</script>
