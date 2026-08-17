<script setup lang="ts">
import TacticalPageHeader from "~/components/TacticalPageHeader.vue";
import PageTransition from "~/components/ui/transitions/PageTransition.vue";
import { Card, CardContent } from "~/components/ui/card";

defineProps<{
  title: string;
  intro: string;
}>();
</script>

<template>
  <PageTransition>
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-12">
      <TacticalPageHeader>
        <template #title>{{ title }}</template>
      </TacticalPageHeader>

      <Card class="bg-card/20">
        <CardContent class="flex flex-col gap-3 p-4 sm:p-6">
          <div class="flex max-w-3xl flex-col gap-3">
            <p class="text-sm leading-relaxed text-foreground/90">
              {{ intro }}
            </p>
            <slot />
          </div>
        </CardContent>
      </Card>
    </div>
  </PageTransition>
</template>
