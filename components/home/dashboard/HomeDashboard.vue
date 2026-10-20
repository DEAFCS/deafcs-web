<script setup lang="ts">
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

// The signed-in homepage: a glass dashboard in the /play visual language.
// Sections, in order: welcome + stats, your scheduled matches, your
// tournament, live Twitch streamers, Player of the Month, last 7 days,
// ELO leaderboard, your recent matches, highlights, latest news.
//
// Pairs sit side by side from xl up; a section with nothing to show renders
// nothing, so its partner takes the full row and an empty pair collapses.
defineProps<{ viewer: HomeViewer }>();
</script>

<template>
  <main class="home-dashboard min-w-0 space-y-5 pb-12" data-testid="home-dashboard">
    <HomeDashboardHero :viewer="viewer" />

    <div class="home-pair homepage-entry homepage-entry--delay-100">
      <HomeScheduledMatches :viewer="viewer" class="xl:flex-[3_1_0%]" />
      <HomeYourTournament :viewer="viewer" class="xl:flex-[2_1_0%]" />
    </div>

    <HomeLiveStreamers :viewer="viewer" />

    <div class="home-pair">
      <HomePlayerOfMonth :viewer="viewer" class="xl:flex-[2_1_0%]" />
      <HomeWeeklyRecords class="xl:flex-[3_1_0%]" />
    </div>

    <div class="home-pair">
      <section
        aria-labelledby="home-elo-title"
        :class="[homePanelClasses, homePanelPaddingClasses, 'flex flex-col xl:flex-[2_1_0%]']"
      >
        <HomeSectionHeader id="home-elo-title" title="ELO Leaderboard" />
        <HomeTopPlayersPreview variant="glass" />
      </section>
      <HomeRecentMatches :viewer="viewer" class="xl:flex-[3_1_0%]" />
    </div>

    <div :class="[homePanelClasses, homePanelPaddingClasses]" data-testid="home-highlights">
      <WatchHighlights compact />
    </div>

    <HomeNewsFeed />
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
