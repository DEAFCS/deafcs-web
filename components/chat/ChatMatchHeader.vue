<script setup lang="ts">
import MatchTableRow from "~/components/MatchTableRow.vue";
import { useRouter } from "#app";

const router = useRouter();

const props = defineProps<{
  match: any | null;
}>();
</script>

<template>
  <div
    v-if="match"
    class="mb-2 shrink-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    role="link"
    tabindex="0"
    :aria-label="`${match.lineup_1?.name || ''} vs ${match.lineup_2?.name || ''}`"
    @keydown.enter.self="router.push(`/matches/${match.id}`)"
  >
    <MatchTableRow :match="match" :player="null" compact always-show hide-overview />
  </div>
</template>
