<script setup lang="ts">
import { ref } from "vue";
import HomeDashboardHero from "~/components/home/dashboard/HomeDashboardHero.vue";
import HomeScheduledMatches from "~/components/home/dashboard/HomeScheduledMatches.vue";
import HomeYourTournament from "~/components/home/dashboard/HomeYourTournament.vue";
import HomeLiveStreamers from "~/components/home/dashboard/HomeLiveStreamers.vue";
import HomePlayerOfMonth from "~/components/home/dashboard/HomePlayerOfMonth.vue";
import HomeWeeklyRecords from "~/components/home/dashboard/HomeWeeklyRecords.vue";
import HomeRecentMatches from "~/components/home/dashboard/HomeRecentMatches.vue";
import HomeNewsFeed from "~/components/home/dashboard/HomeNewsFeed.vue";
import HomeSectionHeader from "~/components/home/dashboard/HomeSectionHeader.vue";
import HomeTopPlayersPreview from "~/components/home/HomeTopPlayersPreview.vue";
import WatchHighlights from "~/components/watch/WatchHighlights.vue";
import {
  homePanelClasses,
  homePanelPaddingClasses,
  type HomeViewer,
} from "~/components/home/dashboard/homeDashboard";

// The signed-in homepage: a glass dashboard in the /play visual language, in
// two areas.
//
// Your DEAFCS: welcome + Play Now + community totals, your scheduled matches,
// your tournament, your recent matches, your highlights.
// DEAFCS Community: live Twitch streamers, Player of the Month beside the
// last 7 days, the ELO leaderboard, latest news.
//
// A section with nothing to show renders nothing, so its partner takes the
// full row and an empty pair collapses.
defineProps<{ viewer: HomeViewer }>();

const highlightsHidden = ref(false);
</script>

<template>
  <main class="home-dashboard min-w-0 pb-12" data-testid="home-dashboard">
    <div class="space-y-5" data-testid="home-area-personal">
      <HomeDashboardHero :viewer="viewer" />
      <HomeScheduledMatches :viewer="viewer" class="homepage-entry homepage-entry--delay-100" />
      <HomeYourTournament :viewer="viewer" class="homepage-entry homepage-entry--delay-100" />
      <HomeRecentMatches :viewer="viewer" />
      <div
        v-if="!highlightsHidden"
        :class="[homePanelClasses, homePanelPaddingClasses]"
        data-testid="home-highlights"
      >
        <WatchHighlights
          compact
          :steam-id="viewer.steamId"
          title="Your Highlights"
          @hidden="highlightsHidden = $event"
        />
      </div>
    </div>

    <!-- The community area starts here: a quiet labelled rule, no big heading. -->
    <div class="my-7 flex items-center gap-3" role="presentation" data-testid="home-area-divider">
      <span class="h-px flex-1 bg-gradient-to-r from-transparent to-border"></span>
      <span class="inline-flex items-center gap-2 font-mono text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
        <span class="inline-block h-[2px] w-2.5 bg-[hsl(var(--tac-amber))]" aria-hidden="true"></span>
        DEAFCS Community
      </span>
      <span class="h-px flex-1 bg-gradient-to-l from-transparent to-border"></span>
    </div>

    <div class="space-y-5" data-testid="home-area-community">
      <HomeLiveStreamers :viewer="viewer" />

      <div class="home-pair">
        <HomePlayerOfMonth :viewer="viewer" class="xl:flex-[2_1_0%]" />
        <HomeWeeklyRecords class="xl:flex-[3_1_0%]" />
      </div>

      <section
        aria-labelledby="home-elo-title"
        :class="[homePanelClasses, homePanelPaddingClasses]"
      >
        <HomeSectionHeader id="home-elo-title" title="ELO Leaderboard" />
        <HomeTopPlayersPreview variant="glass" :viewer-steam-id="viewer.steamId" />
        <p class="mt-2 text-[11px] text-muted-foreground">Current ELO, current season. Tied players share a rank.</p>
      </section>

      <HomeNewsFeed />
    </div>
  </main>
</template>

<style scoped>
.home-pair {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

/* Both sections of a pair hidden: no empty gap in the page rhythm. */
.home-pair:empty {
  display: none;
}

@media (min-width: 1280px) {
  .home-pair {
    flex-direction: row;
    align-items: stretch;
  }
}
</style>
