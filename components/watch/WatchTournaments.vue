<script setup lang="ts">
// /watch tournaments, at the bottom of the page like 5Stack's Watch:
// upcoming and recent ones. A live tournament is featured higher up, right
// under the match rail (WatchFeaturedTournament), not repeated here. Uses
// the existing DEAFCS tournament cards unchanged (the tournament card/page
// redesign is a separate task).
import { ArrowRight } from "lucide-vue-next";
import { e_tournament_status_enum } from "~/generated/zeus";
import RecentTournaments from "~/components/tournament/RecentTournaments.vue";
import {
  tacticalSectionLabelClasses,
  tacticalSectionTickClasses,
} from "~/utilities/tacticalClasses";
</script>

<template>
  <section data-testid="watch-tournaments">
    <div :class="[tacticalSectionLabelClasses, '!flex w-full items-center justify-between']">
      <span class="inline-flex items-center gap-3">
        <span class="inline-flex items-center gap-2">
          <span :class="tacticalSectionTickClasses"></span>
          {{ $t("pages.watch.tournaments.title") }}
        </span>
        <NuxtLink
          to="/tournaments"
          class="inline-flex items-center gap-1 font-mono text-[0.65rem] normal-case tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {{ $t("common.see_all") }}
          <ArrowRight class="h-3 w-3" />
        </NuxtLink>
      </span>
    </div>

    <div class="space-y-6">
      <RecentTournaments
        :section-label="$t('pages.watch.tournaments.upcoming')"
        :statuses="[
          e_tournament_status_enum.RegistrationOpen,
          e_tournament_status_enum.RegistrationClosed,
          e_tournament_status_enum.Setup,
        ]"
        status-variant="registration"
        order-direction="asc"
        :see-all-to="null"
        horizontal
        hide-when-empty
        :limit="6"
      />
      <RecentTournaments
        :section-label="$t('pages.watch.tournaments.recent')"
        :statuses="[e_tournament_status_enum.Finished]"
        status-variant="finished"
        :status-label="$t('common.finished')"
        order-direction="desc"
        :see-all-to="null"
        horizontal
        hide-when-empty
        :limit="8"
      />
    </div>
  </section>
</template>
