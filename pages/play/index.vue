<script setup lang="ts">
import { useI18n } from "vue-i18n";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import PlayMatchmaking from "~/components/play/PlayMatchmaking.vue";
import PlaySchedule from "~/components/play/PlaySchedule.vue";
import PlayDraftRooms from "~/components/play/PlayDraftRooms.vue";
import PlayMoreWays from "~/components/play/PlayMoreWays.vue";
import OpenLobbiesList from "~/components/matchmaking/OpenLobbiesList.vue";
import { tacticalSectionSeparatorClasses } from "~/utilities/tacticalClasses";

// 5Stack's play page (5stackgg/web d12ef01b): no page banner, the
// matchmaking hero first, then your schedule, draft rooms and more ways to
// play. Each section renders nothing when it has nothing to offer, so the
// separator rule only ever sits between sections that are actually shown.
//
// DEAFCS: the open matchmaking lobbies list (self-join for Open/Friends
// lobbies) stays directly under the hero; upstream has no equivalent.
const { t } = useI18n();

useHead({
  title: () => t("pages.play.title"),
});

const sectionClasses = ["mt-8", tacticalSectionSeparatorClasses];
</script>

<template>
  <PageTransition>
    <div>
      <!-- No banner (5Stack); the title stays for assistive tech, as on /watch. -->
      <h1 class="sr-only">{{ $t("pages.play.title") }}</h1>
      <PlayMatchmaking />
      <OpenLobbiesList class="mt-6" />
    </div>
  </PageTransition>

  <PageTransition :delay="50">
    <PlaySchedule :class="sectionClasses" />
  </PageTransition>

  <PageTransition :delay="100">
    <PlayDraftRooms :class="sectionClasses" />
  </PageTransition>

  <PageTransition :delay="150">
    <PlayMoreWays :class="sectionClasses" />
  </PageTransition>
</template>
