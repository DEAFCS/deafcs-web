<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { Video } from "lucide-vue-next";
import socket from "~/web-sockets/Socket";
import { respondToVerificationRing } from "~/composables/useVerificationCallApi";

// Full-screen "Admin is calling…" overlay for the verification-application
// webcam call -- deliberately not a small corner popup like the other
// call notifiers (GlobalLobbyCallNotifier.vue, GlobalAdminCallNotifier.vue):
// verification calls are a one-off, time-sensitive prompt the applicant
// needs to actually notice, so this blurs/dims the whole page behind it
// instead of something easy to miss or accidentally click through.
//
// There is no lobby/room to scope a socket event to here (the caller
// could be any admin, ringing any one applicant anywhere on the site),
// so this listens to the direct-to-user "verification-call:ring" event
// instead (see VerificationCallService.ring, which publishes it via
// send-message-to-steam-id -- already scoped server-side to just the
// applicant being rung, not broadcast to a room).
type RingPayload = {
  applicationId: string;
  adminName: string | null;
  adminAvatarUrl: string | null;
};

const incomingCall = ref<RingPayload | null>(null);
let incomingCallTimer: ReturnType<typeof setTimeout> | null = null;

function showIncomingCall(data: RingPayload) {
  incomingCall.value = data;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
  // Auto-decline rather than just auto-dismiss -- letting it silently
  // vanish left the calling admin's own popup stuck on "Calling…"
  // forever with no way to know the applicant never even answered.
  // Matches VerificationCallService.RINGING_TTL_SECONDS on the backend
  // (the ring itself expires at the same point, so there's no reason
  // for this to outlast or fall short of that window).
  incomingCallTimer = setTimeout(() => decline(), 60_000);
}

function closeOverlay() {
  incomingCall.value = null;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
}

function decline() {
  const applicationId = incomingCall.value?.applicationId;
  closeOverlay();
  if (!applicationId) return;
  void respondToVerificationRing(applicationId, false);
}

function accept() {
  const applicationId = incomingCall.value?.applicationId;
  closeOverlay();
  if (!applicationId) return;
  void respondToVerificationRing(applicationId, true);

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
  window.open(
    `/verification-applications/call/${applicationId}`,
    "verification-call",
    features,
  );
}

let unlisten: (() => void) | null = null;

onMounted(() => {
  const listener = socket.listen("verification-call:ring", (data: RingPayload) => {
    showIncomingCall(data);
  });
  unlisten = () => listener?.stop();
});

onBeforeUnmount(() => {
  unlisten?.();
  closeOverlay();
});
</script>

<template>
  <Transition name="verify-call-overlay">
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
          {{
            $t(
              "verification.call.incoming",
              "Calling about your verification",
            )
          }}
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
.verify-call-overlay-enter-active,
.verify-call-overlay-leave-active {
  transition: opacity 0.2s ease;
}
.verify-call-overlay-enter-from,
.verify-call-overlay-leave-to {
  opacity: 0;
}
</style>
