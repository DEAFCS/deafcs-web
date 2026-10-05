<!-- Adapted from 5Stack WEB d18c33db; MIT Copyright (c) 2025 5Stack.gg; see LICENSE. -->
<script setup lang="ts">
import { ArrowRight } from "lucide-vue-next";
import WatchTournamentCard from "~/components/watch/WatchTournamentCard.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";

withDefaults(defineProps<{
  excludeIds?: string[];
}>(), { excludeIds: () => [] });
</script>

<template>
  <section v-if="cards.length">
    <div
      :class="[
        tacticalSectionLabelClasses,
        '!flex w-full items-center justify-between',
      ]"
    >
      <span class="inline-flex items-center gap-3">
        <span class="inline-flex items-center gap-2">
          <span :class="tacticalSectionTickClasses"></span>
          {{ $t("pages.watch.tournaments.title") }}
        </span>

      </span>
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <WatchTournamentCard
        v-for="tournament in cards"
        :key="tournament.id"
        :tournament="tournament"
      />
    </div>
  </section>
</template>

<script lang="ts">
import { typedGql } from "~/generated/zeus/typedDocumentNode";
import { $, e_tournament_status_enum, order_by } from "~/generated/zeus";
import { excludeLeagueTournaments } from "~/graphql/tournamentFilters";
import { tournamentCardFields } from "~/graphql/tournamentCardFields";

const MAX_CARDS = 4;
const MAX_FINISHED = 2;

const UPCOMING_STATUSES = [
  e_tournament_status_enum.RegistrationOpen,
  e_tournament_status_enum.RegistrationClosed,
  e_tournament_status_enum.Setup,
  "CheckInReview",
];

function tournamentsDocument(
  operation: "query" | "subscription",
  direction: order_by,
) {
  return typedGql(operation)({
    tournaments: [
      {
        where: $("where", "tournaments_bool_exp!"),
        order_by: [{ start: direction }],
        limit: $("limit", "Int!"),
      },
      tournamentCardFields,
    ],
  } as any);
}

const liveSubscription = tournamentsDocument("subscription", order_by.asc);
const upcomingQuery = tournamentsDocument("query", order_by.asc);
const finishedQuery = tournamentsDocument("query", order_by.desc);

function where(this: any, statuses: string[]) {
  return excludeLeagueTournaments({
    status: { _in: statuses },
    ...(this.excludeIds.length ? { id: { _nin: this.excludeIds } } : {}),
  });
}

export default {
  data() {
    return {
      live: [] as any[],
      upcoming: [] as any[],
      finished: [] as any[],
    };
  },
  apollo: {
    upcoming: {
      query: upcomingQuery,
      fetchPolicy: "network-only",
      variables(this: any) {
        return {
          where: where.call(this, UPCOMING_STATUSES),
          limit: MAX_CARDS,
        };
      },
      update(data: any) {
        return data?.tournaments ?? [];
      },
    },
    finished: {
      query: finishedQuery,
      fetchPolicy: "network-only",
      variables(this: any) {
        return {
          where: where.call(this, [e_tournament_status_enum.Finished]),
          limit: MAX_FINISHED,
        };
      },
      update(data: any) {
        return data?.tournaments ?? [];
      },
    },
    $subscribe: {
      live: {
        query: () => liveSubscription,
        variables(this: any) {
          return {
            where: where.call(this, [
              e_tournament_status_enum.Live,
              e_tournament_status_enum.Paused,
            ]),
            limit: MAX_CARDS,
          };
        },
        result(this: any, { data }: any) {
          this.live = data?.tournaments ?? [];
        },
        error(error: any) {
          console.error("[watch] live tournaments subscription error:", error);
        },
      },
    },
  },
  computed: {
    cards(): any[] {
      return [...this.live, ...this.upcoming, ...this.finished].filter(t => !this.excludeIds.includes(t.id)).slice(
        0,
        MAX_CARDS,
      );
    },
  },
};
</script>
