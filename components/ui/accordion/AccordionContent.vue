<script setup lang="ts">
import type { AccordionContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { AccordionContent } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<AccordionContentProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <AccordionContent
    v-bind="props"
    class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
  >
    <div :class="cn('pb-3 pt-0', props.class)">
      <slot />
    </div>
  </AccordionContent>
</template>
