<script setup lang="ts">
import type { AccordionContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { AccordionContent } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<AccordionContentProps & { class?: HTMLAttributes["class"] }>()

// v-bind="props" would otherwise forward `class` onto this same element,
// merging the consumer's classes (e.g. flex flex-col) into the animated
// root and making it a flex container -- which breaks the CSS height
// keyframe animation. The consumer's class belongs on the inner wrapper
// below instead.
const forwarded = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})
</script>

<template>
  <AccordionContent
    v-bind="forwarded"
    class="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
  >
    <div :class="cn('pb-3 pt-0', props.class)">
      <slot />
    </div>
  </AccordionContent>
</template>
