<script setup lang="ts">
import { ref, onBeforeUnmount, onMounted } from "vue";
import { Button } from "~/components/ui/button";
import { LucidePhoneIncoming } from "lucide-vue-next";
import socket from "~/web-sockets/Socket";

// Site-wide "Admin is calling…" popup for the verification-application
// webcam call -- mirrors GlobalLobbyCallNotifier.vue's popup UI, but
// there is no lobby/room to scope a socket event to here (the caller
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
  incomingCallTimer = setTimeout(() => {
    incomingCall.value = null;
  }, 15_000);
}

function dismiss() {
  incomingCall.value = null;
  if (incomingCallTimer) clearTimeout(incomingCallTimer);
}

function accept() {
  const applicationId = incomingCall.value?.applicationId;
  dismiss();
  if (!applicationId) return;
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
  dismiss();
});
</script>

<template>
  <Transition name="verify-call-item">
    <div
      v-if="incomingCall"
      class="fixed z-[100] top-4 left-1/2 -translate-x-1/2 w-[min(92vw,380px)] rounded-lg border border-[hsl(var(--tac-amber))]/50 bg-zinc-900/95 backdrop-blur px-4 py-3 flex items-center gap-3 shadow-2xl"
    >
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tac-amber))]/15 animate-pulse"
      >
        <LucidePhoneIncoming class="h-4.5 w-4.5 text-[hsl(var(--tac-amber))]" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold truncate">
          {{ incomingCall.adminName || "Admin" }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{
            $t(
              "verification.call.incoming",
              "Calling about your verification",
            )
          }}
        </div>
      </div>
      <Button size="sm" variant="secondary" @click="dismiss">
        {{ $t("common.decline", "Decline") }}
      </Button>
      <Button size="sm" @click="accept">
        {{ $t("common.accept", "Accept") }}
      </Button>
    </div>
  </Transition>
</template>

<style scoped>
.verify-call-item-enter-active,
.verify-call-item-leave-active {
  transition: opacity 0.2s ease;
}
.verify-call-item-enter-from,
.verify-call-item-leave-to {
  opacity: 0;
}
</style>
