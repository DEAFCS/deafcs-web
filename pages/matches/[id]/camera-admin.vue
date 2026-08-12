<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount } from "vue";
import WhepPlayer from "~/components/match/WhepPlayer.vue";
import { Video, VideoOff } from "lucide-vue-next";
import {
  cameraAdminWhepUrl,
  cameraAdminTalkWhipUrl,
  cameraAdminTalkHangupUrl,
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

// --- Video call ("talk") state, keyed by steamId ---
type CallState = {
  talking: boolean;
  connecting: boolean;
  pc: RTCPeerConnection | null;
  stream: MediaStream | null;
};
const calls = reactive<Record<string, CallState>>({});

function callState(steamId: string): CallState {
  if (!calls[steamId]) {
    calls[steamId] = { talking: false, connecting: false, pc: null, stream: null };
  }
  return calls[steamId];
}

async function startCall(steamId: string) {
  const state = callState(steamId);
  if (state.talking || state.connecting) return;
  state.connecting = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    state.stream = stream;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    state.pc = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") resolve();
      });
      setTimeout(resolve, 1500);
    });

    const res = await fetch(cameraAdminTalkWhipUrl(matchId.value, steamId), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp ?? "",
    });
    if (!res.ok) throw new Error(await res.text());
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });

    state.talking = true;
  } catch (err) {
    alert(
      `Could not start call: ${err instanceof Error ? err.message : err}`,
    );
    endCall(steamId, { notifyServer: false });
  } finally {
    state.connecting = false;
  }
}

async function endCall(
  steamId: string,
  opts: { notifyServer?: boolean } = { notifyServer: true },
) {
  const state = callState(steamId);
  if (state.pc) {
    state.pc.close();
    state.pc = null;
  }
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  state.talking = false;
  if (opts.notifyServer !== false) {
    try {
      await fetch(cameraAdminTalkHangupUrl(matchId.value, steamId), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* best-effort */
    }
  }
}

onBeforeUnmount(() => {
  for (const steamId of Object.keys(calls)) {
    if (calls[steamId].talking) endCall(steamId);
  }
});
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
            :class="{ 'border-green-500': callState(player.steamId).talking }"
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
              <span class="truncate flex-1">{{ player.name || player.steamId }}</span>
            </div>
            <!-- Call button lives below the video, not overlaid on top
                 of it — a small corner icon on the picture itself was
                 easy to miss entirely. Same "controls below the frame,
                 not on it" layout as the player's own join page. -->
            <button
              type="button"
              :disabled="callState(player.steamId).connecting"
              class="flex items-center justify-center gap-2 w-full py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
              :class="callState(player.steamId).talking ? 'bg-red-600 hover:bg-red-500' : 'bg-primary hover:opacity-90'"
              @click="
                callState(player.steamId).talking
                  ? endCall(player.steamId)
                  : startCall(player.steamId)
              "
            >
              <VideoOff v-if="callState(player.steamId).talking" class="w-4 h-4" />
              <Video v-else class="w-4 h-4" />
              {{ callState(player.steamId).talking ? "End call" : "Video call" }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
