<!--
  Copied verbatim (class strings + structure included) from pages/players/[id].vue's
  Block action so the captured output is faithful to the real component, not a
  paraphrase.

  No tooltip wrapper: the earlier FiveStackToolTip `as-child` fix (commit
  c29015de) assumed the bug was a nested-<button> SSR/hydration mismatch
  leaving the tooltip's own default-slot text ("Block player") detached from
  its portalled position. That did not resolve the issue in production, so
  the tooltip wrapper was removed entirely -- the trigger is now a plain
  native <button> with :title/:aria-label and no default-slot text anywhere
  for a portal to mis-place.
-->
<script setup lang="ts">
import { Ban, UserCheck } from "lucide-vue-next";

defineProps<{ isBlockedByMe: boolean }>();

const playerHeroBlockButtonClasses =
  "inline-flex w-full items-center justify-center rounded border border-destructive/40 bg-card/60 text-destructive/80 transition-colors duration-150 hover:border-destructive hover:bg-destructive/20 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 disabled:cursor-not-allowed disabled:opacity-60";
const playerHeroBlockButtonActiveClasses =
  "inline-flex w-full items-center justify-center rounded border border-destructive bg-destructive/25 text-destructive transition-colors duration-150 hover:bg-destructive/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60 disabled:cursor-not-allowed disabled:opacity-60";
</script>

<template>
  <div class="flex-1 min-w-[2.75rem]" data-testid="right-col">
    <button
      type="button"
      data-testid="block-toggle"
      :class="[
        'h-full',
        isBlockedByMe
          ? playerHeroBlockButtonActiveClasses
          : playerHeroBlockButtonClasses,
      ]"
      :title="isBlockedByMe ? 'Unblock player' : 'Block player'"
      :aria-label="isBlockedByMe ? 'Unblock player' : 'Block player'"
    >
      <UserCheck v-if="isBlockedByMe" class="h-4 w-4" />
      <Ban v-else class="h-4 w-4" />
    </button>
  </div>
</template>
