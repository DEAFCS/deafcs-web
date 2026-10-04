<script setup lang="ts">
import {
  LucideArrowLeft,
  LucideChevronRight,
  LucideSmartphone,
} from "lucide-vue-next";

// Phone-first device picker for the two fixed-party popout calls only:
// the verification application call
// (pages/verification-applications/call/[applicationId].vue) and the
// admin call started from a player profile
// (pages/players/call/[targetSteamId].vue). Too many players struggled
// with desktop webcam permissions, so the QR/phone path is the dominant
// option and "this computer" is a small secondary link into the same
// existing webcam preview flow. Purely presentational: the pages keep
// all token/QR/webcam/call-state logic. The Chat Hub Live Video chooser
// (components/chat/ChatVideoComposer.vue) is deliberately separate.
defineProps<{
  mode: "choose" | "mobile";
  qrDataUrl?: string | null;
}>();

const emit = defineEmits<{
  (e: "use-phone"): void;
  (e: "use-computer"): void;
  (e: "back"): void;
}>();
</script>

<template>
  <div
    class="mx-auto w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-4 shadow-xl space-y-4"
    data-testid="call-device-picker"
    :data-mode="mode"
  >
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Back"
        data-testid="call-device-back"
        @click="emit('back')"
      >
        <LucideArrowLeft class="w-4 h-4" />
      </button>
      <h2 class="text-base font-semibold">
        {{ mode === "mobile" ? "Scan with your phone" : "Join the call" }}
      </h2>
    </div>

    <button
      v-if="mode === 'choose'"
      type="button"
      class="flex w-full items-center gap-3 rounded-lg border border-[hsl(var(--tac-amber)/0.5)] bg-[hsl(var(--tac-amber)/0.08)] p-4 text-left transition-colors hover:bg-[hsl(var(--tac-amber)/0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--tac-amber))]"
      data-testid="call-device-phone"
      @click="emit('use-phone')"
    >
      <span
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--tac-amber)/0.15)] text-[hsl(var(--tac-amber))]"
      >
        <LucideSmartphone class="w-5 h-5" />
      </span>
      <span class="min-w-0 flex-1">
        <strong class="block text-sm">Use phone</strong>
        <small class="block text-xs text-muted-foreground">
          Scan a QR code and continue on your phone
        </small>
      </span>
      <LucideChevronRight class="w-4 h-4 shrink-0 text-muted-foreground" />
    </button>

    <div
      v-else
      class="flex flex-col items-center gap-3 text-center"
      data-testid="call-device-qr"
    >
      <img
        v-if="qrDataUrl"
        :src="qrDataUrl"
        alt="QR code"
        width="200"
        height="200"
        class="rounded-lg border border-border bg-white p-2"
      />
      <p class="text-xs text-muted-foreground">
        Open your phone's camera and scan this code to join the call.
      </p>
    </div>

    <p class="text-center text-xs text-muted-foreground">
      Prefer to use your webcam?
      <button
        type="button"
        class="font-medium text-[hsl(var(--tac-amber))] hover:underline focus-visible:outline-none focus-visible:underline"
        data-testid="call-device-computer"
        @click="emit('use-computer')"
      >
        Use this computer instead
      </button>
    </p>
  </div>
</template>
