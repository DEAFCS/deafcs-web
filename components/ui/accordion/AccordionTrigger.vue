<script setup lang="ts">
import type { AccordionTriggerProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { ChevronDown } from "lucide-vue-next"
import { AccordionHeader, AccordionTrigger } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<AccordionTriggerProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <AccordionHeader class="flex">
    <AccordionTrigger
      v-bind="props"
      :class="
        cn(
          'flex flex-1 items-center justify-between gap-3 py-3 text-left text-sm font-medium transition-colors hover:text-[hsl(var(--tac-amber))] [&[data-state=open]>svg]:rotate-180',
          props.class,
        )
      "
    >
      <slot />
      <ChevronDown
        class="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200"
      />
    </AccordionTrigger>
  </AccordionHeader>
</template>
