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
import {
  streamerCameraPlayerJoinUrl,
  fetchStreamerCameraStatus,
} from "~/composables/useStreamerCameraApi";

// Mirrors CameraRequirementOverlay.vue exactly (same choose-device /
// QR / popup shape) -- deliberately, per explicit request: this is the
// public-stream camera overlay, not the admin-only anti-cheat one, but
// the player-facing UX should feel identical. See DEAFCS/deafcs-web#91.

const props = defineProps<{
  matchId: string;
}>();

const emit = defineEmits<{ (e: "update:ready", value: boolean): void }>();

const MY_TOKEN_QUERY = gql`
  query MyStreamerCameraToken($matchId: uuid!) {
    match_streamer_camera_tokens(
      where: { match_id: { _eq: $matchId } }
      limit: 1
    ) {
      token
    }
  }
`;

const { result: tokenResult, refetch: refetchToken } = useQuery<{
  match_streamer_camera_tokens: Array<{ token: string }>;
}>(MY_TOKEN_QUERY, { matchId: props.matchId }, { fetchPolicy: "network-only" });

const token = computed(
  () => tokenResult.value?.match_streamer_camera_tokens?.[0]?.token ?? null,
);

// Same reasoning as CameraRequirementOverlay: the token row is minted
// server-side on the veto->Live transition, a real (sometimes
// multi-second) gap after the match row itself already reads status
// Live over the subscription -- plain self-rescheduling poll, not a
// `watch(token, ...)`, so a still-missing token after a retry doesn't
// get stuck (undefined -> undefined isn't a "change" Vue would re-fire
// a watch on).
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
  token.value ? streamerCameraPlayerJoinUrl(props.matchId, token.value) : null,
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

// Deliberately not keeping a reference to the opened window -- this
// overlay must never be the one deciding when that window closes, same
// as CameraRequirementOverlay. The join page manages its own lifecycle.
function connectOnThisComputer() {
  step.value = "pc";
  if (!joinUrl.value) return;
  window.open(joinUrl.value, "streamer-camera-connect", "width=900,height=700");
}

// Gate on an initial status check before ever painting the overlay,
// same reasoning as CameraRequirementOverlay.
const initialCheckDone = ref(false);
const ready = ref(false);

let statusTimer: ReturnType<typeof setTimeout> | null = null;
async function checkStatus() {
  const currentToken = token.value;
  if (!currentToken) {
    statusTimer = setTimeout(checkStatus, 1500);
    return;
  }
  const { ready: isReady } = await fetchStreamerCameraStatus(currentToken);
  initialCheckDone.value = true;
  if (isReady !== ready.value) {
    ready.value = isReady;
    emit("update:ready", isReady);
  }
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
      <h2 class="text-lg font-semibold">
        {{ $t("match.streamer_camera.title") }}
      </h2>

      <!-- Step 1: pick a device -->
      <template v-if="step === 'choose'">
        <p class="text-sm text-muted-foreground">
          {{ $t("match.streamer_camera.choose_device") }}
        </p>
        <div class="grid grid-cols-2 gap-3 w-full">
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-accent transition-colors"
            @click="step = 'mobile'"
          >
            <LucideSmartphone class="w-7 h-7" />
            <span class="text-sm font-medium">{{ $t("match.streamer_camera.mobile") }}</span>
          </button>
          <button
            type="button"
            class="flex flex-col items-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-accent transition-colors"
            @click="connectOnThisComputer"
          >
            <LucideMonitor class="w-7 h-7" />
            <span class="text-sm font-medium">{{ $t("match.streamer_camera.this_computer") }}</span>
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
          <LucideArrowLeft class="w-4 h-4" /> {{ $t("common.back") }}
        </button>
        <p class="text-sm text-muted-foreground">
          {{ $t("match.streamer_camera.scan_hint") }}
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
        <div class="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LucideLoader2 class="w-4 h-4 animate-spin" />
          {{ $t("match.streamer_camera.waiting") }}
        </div>
      </template>

      <!-- Step 2b: popup on this computer -->
      <template v-else>
        <button
          type="button"
          class="self-start inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          @click="step = 'choose'"
        >
          <LucideArrowLeft class="w-4 h-4" /> {{ $t("common.back") }}
        </button>
        <p class="text-sm text-muted-foreground">
          {{ $t("match.streamer_camera.popup_hint") }}
        </p>
        <Button variant="secondary" @click="connectOnThisComputer">
          {{ $t("match.streamer_camera.open_window") }}
        </Button>
        <div class="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LucideLoader2 class="w-4 h-4 animate-spin" />
          {{ $t("match.streamer_camera.waiting") }}
        </div>
      </template>
    </div>
  </div>
</template>
