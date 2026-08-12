<script setup lang="ts">
import { ref, onMounted } from "vue";
import WhepPlayer from "~/components/match/WhepPlayer.vue";
import {
  cameraAdminWhepUrl,
  fetchCameraPlayers,
  type CameraPlayerStatus,
} from "~/composables/useCameraApi";

// Opened via window.open() from MatchActions.vue's "Watch Camera" menu
// item — a real popup window showing the whole team's cameras in a
// grid at once, not an in-page overlay/dialog one player at a time.
definePageMeta({
  layout: false,
});

const route = useRoute();
const matchId = computed(() => String(route.params.id));

const loading = ref(true);
const error = ref<string | null>(null);
const data = ref<{
  lineup_1: { id: string; name: string; players: CameraPlayerStatus[] };
  lineup_2: { id: string; name: string; players: CameraPlayerStatus[] };
} | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchCameraPlayers(matchId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="min-h-screen w-full bg-background text-foreground p-4">
    <div v-if="loading" class="flex items-center justify-center h-[60vh]">
      <p class="text-muted-foreground">Loading cameras…</p>
    </div>

    <div
      v-else-if="error"
      class="flex items-center justify-center h-[60vh] text-center"
    >
      <p class="text-destructive max-w-sm">{{ error }}</p>
    </div>

    <template v-else-if="data">
      <div
        v-for="lineup in [data.lineup_1, data.lineup_2]"
        :key="lineup.id"
        class="mb-6"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          {{ lineup.name }}
        </h2>
        <div
          class="grid gap-3"
          style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr))"
        >
          <div
            v-for="player in lineup.players"
            :key="player.steamId"
            class="rounded-lg border border-border bg-card overflow-hidden"
          >
            <div class="aspect-video bg-black relative">
              <WhepPlayer
                v-if="player.ready"
                :whep-url="cameraAdminWhepUrl(matchId, player.steamId)"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center text-xs text-muted-foreground"
              >
                Not connected
              </div>
            </div>
            <div class="px-2 py-1.5 flex items-center gap-2 text-sm">
              <span
                class="w-2 h-2 rounded-full flex-shrink-0"
                :class="player.ready ? 'bg-green-500' : 'bg-muted-foreground/40'"
              />
              <span class="truncate">{{ player.name || player.steamId }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
