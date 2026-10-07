<script setup lang="ts">
import { ref } from "vue";
import { useMediaQuery } from "@vueuse/core";
import PlayerMatchScoreboard from "../../../../components/player/PlayerMatchScoreboard.vue";
import PlayerMatchesTable from "../../../../components/player/PlayerMatchesTable.vue";
import { scoreboardFixture } from "../matchScoreboard";
const compact = useMediaQuery("(max-width: 767px)");
const params = new URLSearchParams(location.search);
const focus = params.get("focus") === "1" ? "22" : null;
const stats = params.get("stats") !== "0";
const match = scoreboardFixture(stats, Number(params.get("bo") || 1));
const row = params.get("row") === "1";
const tab = ref("overview");
const map = ref<string | null>(null);
</script>
<template>
  <TooltipProvider>
  <main class="mx-auto max-w-6xl min-w-0 p-3 sm:p-6">
    <h1 class="mb-4 text-xl">Local fixture: {{ focus ? 'Profile' : 'Tournament' }} / {{ stats ? 'Full stats' : 'No stats' }}</h1>
    <!-- TournamentMatches uses a grid; exercise its intrinsic-width constraint,
         not just an isolated row in normal block flow. -->
    <div v-if="row" :class="!focus ? 'grid gap-3' : ''">
      <PlayerMatchesTable :matches="[match]" :neutral="!focus" :player="focus ? { steam_id: focus } : null" :compact="compact" />
    </div>
    <PlayerMatchScoreboard v-else :match="match" :focus-steam-id="focus" :compact="compact" :loading="false" v-model:active-tab="tab" v-model:selected-map-id="map" :clips-count="0" type-label="Competitive" source-label="DEAFCS" />
  </main>
  </TooltipProvider>
</template>
