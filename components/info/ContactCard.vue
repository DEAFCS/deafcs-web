<script setup lang="ts">
import type { Component } from "vue";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";

// Shared shape for the Contact page's routing cards: an icon + purpose text,
// plus either an internal link (via the default slot, when a real
// destination exists) or a status badge (when it doesn't yet) — never both
// invented at once.
defineProps<{
  icon: Component;
  title: string;
  description?: string;
  status?: string;
  highlight?: boolean;
}>();
</script>

<template>
  <Card
    class="bg-card/20"
    :class="highlight && 'border-[hsl(var(--tac-amber)/0.45)]'"
  >
    <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
      <div class="flex items-center gap-2.5">
        <span
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          :class="
            highlight
              ? 'bg-[hsl(var(--tac-amber)/0.15)] text-[hsl(var(--tac-amber))]'
              : 'bg-muted/40 text-muted-foreground'
          "
        >
          <component :is="icon" class="h-4 w-4" />
        </span>
        <span class="text-sm font-bold uppercase tracking-[0.06em]">{{
          title
        }}</span>
      </div>

      <p
        v-if="description"
        class="text-sm leading-relaxed text-foreground/90"
      >
        {{ description }}
      </p>

      <slot />

      <Badge v-if="status" variant="secondary" class="w-fit font-normal">
        {{ status }}
      </Badge>
    </CardContent>
  </Card>
</template>
