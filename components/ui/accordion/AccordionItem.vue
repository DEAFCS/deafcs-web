<script setup lang="ts">
import type { AccordionItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { AccordionItem } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<AccordionItemProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <AccordionItem
    v-bind="props"
    :class="cn('border-b border-border last:border-b-0', props.class)"
  >
    <slot />
  </AccordionItem>
</template>
