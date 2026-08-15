<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from "vue";
import gql from "graphql-tag";
import { useQuery } from "@vue/apollo-composable";
import QRCode from "qrcode";
import { Button } from "~/components/ui/button";
import {
  LucideSmartphone,
  LucideMonitor,
  LucideArrowLeft,
  LucideLoader2,
} from "lucide-vue-next";
import { cameraPlayerJoinUrl, fetchCameraStatus } from "~/composables/useCameraApi";

const props = defineProps<{
  matchId: string;
}>();

// Fires every time the player's own camera's live status changes, in
// either direction — not just once. The match page keeps this
// component mounted the whole time the match is active (see usage
// site); it never tells it to unmount, so this event is the only way
// the parent finds out about a mid-match disconnect too, not just the
// initial connect.
const emit = defineEmits<{ (e: "update:ready", value: boolean): void }>();

const MY_TOKEN_QUERY = gql`
  query MyCameraToken($matchId: uuid!) {
    match_camera_tokens(where: { match_id: { _eq: $matchId } }, limit: 1) {
      token
    }
  }
`;

const { result: tokenResult, refetch: refetchToken } = useQuery<{
  match_camera_tokens: Array<{ token: string }>;
}>(MY_TOKEN_QUERY, { matchId: props.matchId }, { fetchPolicy: "network-only" });

const token = computed(() => tokenResult.value?.match_camera_tokens?.[0]?.token ?? null);

// The token row is minted server-side the moment the match goes Live
// (see MatchesController.generateCameraTokensIfRequired), via a
// Hasura event trigger -> NestJS webhook -> insert — a real, sometimes
// multi-second gap after the match row itself already reads status
// Live over the subscription. This overlay can easily mount before
// that insert lands.
//
// IMPORTANT: this is a plain self-rescheduling setTimeout loop, not a
// `watch(token, ...)`. A `watch` only re-fires on a *value change* —
// if the token is still missing after a retry, `token` goes from
// undefined to undefined again, which Vue does not consider a change,
// so the watch callback silently never fires a second time and the
// overlay is stuck forever (until a full reload re-runs everything
// fresh, which is exactly why F5 "fixed" it). Polling unconditionally
// here sidesteps that pitfall entirely.
let tokenPollTimer: ReturnType<typeof setTimeout> | null = null;
function pollForToken() {
  if (token.value) return;
  tokenPollTimer = setTimeout(async () => {
    await refetchToken();
    pollForToken();
  }, 1500);
}
pollForToken();

type Step = "choose" | "mobile" | "pc";
const step = ref<Step>("choose");
const qrDataUrl = ref<string | null>(null);

const joinUrl = computed(() =>
  token.value ? cameraPlayerJoinUrl(props.matchId, token.value) : null,
);

watch(
  joinUrl,
  async (url) => {
    if (!url) {
      qrDataUrl.value = null;
      return;
    }
    qrDataUrl.value = await QRCode.toDataURL(url, { width: 260, margin: 1 });
  },
  { immediate: true },
);

// Deliberately not keeping a reference to the opened window — this
// overlay must never be the one deciding when that window closes (see
// the onBeforeUnmount comment below). The join page manages its own
// lifecycle entirely on its own.
function connectOnThisComputer() {
  step.value = "pc";
  if (!joinUrl.value) return;
  // Landscape shape on purpose: the join page decides whether to
  // request portrait or landscape camera resolution by checking the
  // *window's* orientation (matchMedia "orientation: portrait") —
  // that's correct for a phone (viewport orientation always matches
  // the physical device), but a narrow/tall popup used to make that
  // same check misfire on a PC with a normal landscape webcam,
  // requesting portrait video and letterboxing it with black bars.
  window.open(joinUrl.value, "camera-connect", "width=900,height=700");
}

// Gate on an initial status check before ever painting the overlay —
// otherwise a player who already connected earlier (and just
// reloaded/re-entered the match page) would see a one-frame flash of
// the blocking overlay before it caught up and disappeared again.
const initialCheckDone = ref(false);
const ready = ref(false);

// Keeps polling for as long as this component stays mounted, not just
// until the first successful connect. It used to stop dead after
// emitting "ready" once, which meant a mid-match disconnect (unplugged
// webcam, closed tab, dropped network) left the match page thinking
// the camera was still live until a full page reload re-ran everything
// fresh. Polling continuously and re-emitting on every change (both
// directions) is what lets the overlay reappear on its own now.
let statusTimer: ReturnType<typeof setTimeout> | null = null;
async function checkStatus() {
  const currentToken = token.value;
  if (!currentToken) {
    statusTimer = setTimeout(checkStatus, 1500);
    return;
  }
  const { ready: isReady } = await fetchCameraStatus(currentToken);
  initialCheckDone.value = true;
  if (isReady !== ready.value) {
    ready.value = isReady;
    emit("update:ready", isReady);
  }
  // Once connected, a dropped camera doesn't need to be caught within
  // 1.5s the way "just scanned the QR code" does — ease off the poll
  // rate so a steady connection isn't hammering the status endpoint.
  statusTimer = setTimeout(checkStatus, isReady ? 5000 : 1500);
}
checkStatus();

onBeforeUnmount(() => {
  if (statusTimer) clearTimeout(statusTimer);
  if (tokenPollTimer) clearTimeout(tokenPollTimer);
});
</script>

<template>
  <div
    v-if="initialCheckDone && !ready"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4"
  >
    <div
      class="w-full max-w-md rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-5 text-center"
    >
      <h2 class="text-lg font-semibold">Camera required for this match</h2>

      <!-- Step 1: pick a device -->
      <template v-if="step === 'choose'">
        <p class="text-sm text-muted-foreground">
          Connect a webcam to continue. Choose how you'd like to connect:
        </p>
        <div class="grid grid-cols-2 gap-3 w-full">
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-accent transition-colors"
            @click="step = 'mobile'"
          >
            <LucideSmartphone class="w-7 h-7" />
            <span class="text-sm font-medium">Mobile</span>
          </button>
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-accent transition-colors"
            @click="connectOnThisComputer"
          >
            <LucideMonitor class="w-7 h-7" />
            <span class="text-sm font-medium">This computer</span>
          </button>
        </div>
      </template>

      <!-- Step 2a: QR code for mobile -->
      <template v-else-if="step === 'mobile'">
        <button
          type="button"
          class="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          @click="step = 'choose'"
        >
          <LucideArrowLeft class="w-4 h-4" /> Back
        </button>
        <p class="text-sm text-muted-foreground">
          Scan this with your phone's camera:
        </p>
        <img
          v-if="qrDataUrl"
          :src="qrDataUrl"
          alt="QR code to connect your camera"
          width="220"
          height="220"
          class="rounded-lg border border-border bg-white p-2"
        />
        <div v-else class="w-[220px] h-[220px] flex items-center justify-center">
          <LucideLoader2 class="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
        <div
          class="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LucideLoader2 class="w-4 h-4 animate-spin" />
          Waiting for your camera…
        </div>
      </template>

      <!-- Step 2b: popup on this computer -->
      <template v-else>
        <button
          type="button"
          class="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          @click="step = 'choose'"
        >
          <LucideArrowLeft class="w-4 h-4" /> Back
        </button>
        <p class="text-sm text-muted-foreground">
          A window opened to connect your camera on this computer. If it
          didn't, click below.
        </p>
        <Button variant="secondary" @click="connectOnThisComputer">
          Open camera window
        </Button>
        <div
          class="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LucideLoader2 class="w-4 h-4 animate-spin" />
          Waiting for your camera…
        </div>
      </template>
    </div>
  </div>
</template>
