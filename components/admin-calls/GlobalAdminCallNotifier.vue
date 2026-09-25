<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { Video } from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import {
  respondToAdminCallRing,
  fetchActiveAdminCallRing,
} from "~/composables/useAdminCallApi";

// Full-screen "Admin is calling…" overlay for the general admin<->player
// webcam call (camera icon on every player profile page) -- direct
// copy of GlobalVerificationCallNotifier.vue's full-screen treatment,
// listening to the direct-to-user "admin-call:ring" event instead (see
// AdminCallService.ring, published via send-message-to-steam-id --
// already scoped server-side to just the player being rung).
type RingPayload = {
  targetSteamId: string;
  adminName: string | null;
  adminAvatarUrl: string | null;
};

const incomingCall = ref<RingPayload | null>(null);
let incomingCallTimer: ReturnType<typeof setTimeout> | null = null;

function showIncomingCall(data: RingPayload, autoDeclineMs = 60_000) {
  incomingCall.value = data;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
  // Auto-decline rather than just auto-dismiss -- letting it silently
  // vanish left the calling admin's own popup stuck on "Calling…"
  // forever with no way to know the player never even answered.
  // Matches AdminCallService.RINGING_TTL_SECONDS on the backend, or
  // whatever's actually left of it when catching up on an already
  // in-flight ring (see the active-ring check in onMounted below).
  incomingCallTimer = setTimeout(() => decline(), autoDeclineMs);
}

function closeOverlay() {
  incomingCall.value = null;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
}

function decline() {
  const targetSteamId = incomingCall.value?.targetSteamId;
  closeOverlay();
  if (!targetSteamId) return;
  void respondToAdminCallRing(targetSteamId, false);
}

function accept() {
  const targetSteamId = incomingCall.value?.targetSteamId;
  closeOverlay();
  if (!targetSteamId) return;
  void respondToAdminCallRing(targetSteamId, true);

  const w = 960;
  const h = 720;
  const left = Math.max(0, (window.screen.width - w) / 2);
  const top = Math.max(0, (window.screen.height - h) / 2);
  const features = [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    "scrollbars=yes",
    "location=no",
    "menubar=no",
    "toolbar=no",
    "status=no",
  ].join(",");
  window.open(`/players/call/${targetSteamId}`, "admin-call", features);
}

let unlisten: (() => void) | null = null;
let unlistenResolved: (() => void) | null = null;

onMounted(() => {
  const listener = socket.listen("admin-call:ring", (data: RingPayload) => {
    showIncomingCall(data);
  });
  unlisten = () => listener?.stop();

  // The same ring goes to every connected device/session for this
  // steamId (see AdminCallService.ring), so if the player answers on
  // another device, this device's overlay needs to be told to close
  // itself rather than sitting there until its own auto-decline timer
  // fires or the page is refreshed.
  const resolvedListener = socket.listen(
    "admin-call:ring-resolved",
    (data: { targetSteamId: string }) => {
      if (incomingCall.value?.targetSteamId === data.targetSteamId) {
        closeOverlay();
      }
    },
  );
  unlistenResolved = () => resolvedListener?.stop();

  // Catches a ring that fired before this page connected its socket at
  // all -- e.g. the OS had fully evicted the app from memory when the
  // ring went out (reported: worked fine from a locked lock screen,
  // where the page just stayed suspended in the background and had
  // already received the live event, but not after tapping the push
  // notification from a cold start triggered by actively using
  // something else on the phone). See AdminCallService.getActiveRing.
  fetchActiveAdminCallRing().then((ring) => {
    if (ring && !incomingCall.value) {
      showIncomingCall(
        {
          targetSteamId: ring.targetSteamId,
          adminName: ring.adminName,
          adminAvatarUrl: ring.adminAvatarUrl,
        },
        ring.remainingMs,
      );
    }
  });
});

onBeforeUnmount(() => {
  unlisten?.();
  unlistenResolved?.();
  closeOverlay();
});
</script>

<template>
  <Transition name="admin-call-overlay">
    <div
      v-if="incomingCall"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
    >
      <div
        class="w-full max-w-sm rounded-2xl border border-[hsl(var(--tac-amber))]/40 bg-zinc-900 p-8 text-center shadow-2xl"
      >
        <div
          class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--tac-amber))]/15 animate-pulse"
        >
          <Video class="h-7 w-7 text-[hsl(var(--tac-amber))]" />
        </div>
        <div class="text-lg font-semibold">
          {{ incomingCall.adminName || "Admin" }}
        </div>
        <div class="mt-1 text-sm text-muted-foreground">
          {{ $t("admin_calls.incoming", "Admin is calling") }}
        </div>
        <div class="mt-6 flex gap-3">
          <Button
            size="lg"
            variant="secondary"
            class="flex-1"
            @click="decline"
          >
            {{ $t("common.decline", "Decline") }}
          </Button>
          <Button size="lg" class="flex-1" @click="accept">
            {{ $t("common.accept", "Accept") }}
          </Button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.admin-call-overlay-enter-active,
.admin-call-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.admin-call-overlay-enter-from,
.admin-call-overlay-leave-to {
  opacity: 0;
}
</style>
