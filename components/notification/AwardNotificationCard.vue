<script setup lang="ts">
import { Trophy } from "lucide-vue-next";

// The preview inside an Award Received notification, laid out like the
// verification notification's applicant card: one bordered row with a
// trophy tile the size of that card's avatar, and the award's name beside
// it. Long names wrap to two lines instead of widening the panel.
defineProps<{
  name: string;
  to?: string | null;
}>();
</script>

<template>
  <component
    :is="to ? 'NuxtLink' : 'div'"
    :to="to || undefined"
    class="flex items-center gap-3 rounded border border-border bg-background/40 px-2 py-1.5 transition-colors hover:border-[hsl(var(--tac-amber)/0.6)]"
    data-award-notification-card
  >
    <span
      class="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-[hsl(var(--tac-amber)/0.45)] bg-[hsl(var(--tac-amber)/0.12)]"
      aria-hidden="true"
    >
      <Trophy class="h-6 w-6 text-[hsl(var(--tac-amber))]" stroke-width="2" />
    </span>
    <span
      class="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground line-clamp-2 break-words"
    >
      {{ name }}
    </span>
  </component>
</template>
