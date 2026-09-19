<script setup lang="ts">
import FiveStackToolTip from "~/components/FiveStackToolTip.vue";
import { Ban } from "lucide-vue-next";

// Copied verbatim (class strings included) from pages/players/[id].vue's
// Block action so the captured SSR HTML is faithful to the real component,
// not a paraphrase.
const playerHeroBlockButtonClasses =
  "inline-flex w-full items-center justify-center rounded border border-destructive/40 bg-card/60 text-destructive/80 transition-colors duration-150 hover:border-destructive hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 disabled:cursor-not-allowed disabled:opacity-60";
const isBlockedByMe = false;
</script>

<template>
  <div :class="'flex-1 min-w-[2.75rem]'" data-testid="right-col">
    <FiveStackToolTip side="bottom" as-child>
      <template #trigger>
        <button
          type="button"
          :class="['h-full', playerHeroBlockButtonClasses]"
          :aria-label="isBlockedByMe ? 'Unblock player' : 'Block player'"
        >
          <Ban class="h-4 w-4" />
        </button>
      </template>
      {{ isBlockedByMe ? "Unblock player" : "Block player" }}
    </FiveStackToolTip>
  </div>
</template>
